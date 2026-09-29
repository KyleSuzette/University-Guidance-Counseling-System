from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from ..enums import UserRole
from ..extensions import db
from ..models import (
    AuditLog,
    CounselorProfile,
    Room,
    StaffProfile,
    User,
)
from ..utils import (
    audit,
    clean_text,
    current_user,
    error,
    json_body,
    paginated,
    parse_boolean,
    roles_required,
    validate_email,
    validate_password,
)

admin_bp = Blueprint("admin", __name__)


# =========================================================
# CREATE PERSONNEL ACCOUNT
# =========================================================

@admin_bp.post("/admin/accounts")
@roles_required(UserRole.ADMIN)
def create_staff_account():
    data, failure = json_body(
        ["email", "password", "role"]
    )

    if failure:
        return failure

    email = str(
        data["email"]
    ).strip().lower()

    if not validate_email(email):
        return error(
            "A valid email address is required."
        )

    password_error = validate_password(
        data["password"]
    )

    if password_error:
        return error(password_error)

    try:
        role = UserRole(
            str(data["role"]).lower()
        )

    except (TypeError, ValueError):
        return error(
            "role must be counselor, "
            "head_counselor, admin, or staff."
        )

    if role == UserRole.STUDENT:
        return error(
            "Student accounts must use "
            "the registration endpoint."
        )

    existing_user = db.session.scalar(
        db.select(User).filter_by(
            email=email
        )
    )

    if existing_user:
        return error(
            "Email is already registered.",
            409,
            "duplicate_email"
        )

    # -----------------------------------------------------
    # PROFILE VALIDATION
    # -----------------------------------------------------

    required_profile_fields = (
        "employee_number",
        "first_name",
        "last_name",
    )

    missing_fields = [
        field
        for field in required_profile_fields
        if not str(
            data.get(field, "")
        ).strip()
    ]

    if missing_fields:
        return error(
            "Employee number, first name, "
            "and last name are required.",
            details={
                "missing": missing_fields
            }
        )

    profile_values = {}
    for field, max_length in (
        ("employee_number", 50),
        ("first_name", 100),
        ("last_name", 100),
    ):
        value, problem = clean_text(data[field], field, max_length=max_length)
        if problem:
            return error(problem)
        profile_values[field] = value

    employee_number = profile_values["employee_number"].upper()
    first_name = profile_values["first_name"]
    last_name = profile_values["last_name"]

    # -----------------------------------------------------
    # CHECK EMPLOYEE NUMBER
    # -----------------------------------------------------

    existing_counselor_number = db.session.scalar(
        db.select(CounselorProfile).filter_by(
            employee_number=employee_number
        )
    )

    existing_staff_number = db.session.scalar(
        db.select(StaffProfile).filter_by(
            employee_number=employee_number
        )
    )

    if (
        existing_counselor_number
        or existing_staff_number
    ):
        return error(
            "Employee number is already registered.",
            409,
            "duplicate_employee_number"
        )

    # -----------------------------------------------------
    # CREATE USER
    # -----------------------------------------------------

    user = User(
        email=email,
        role=role
    )

    user.set_password(
        data["password"]
    )

    db.session.add(user)

    try:
        db.session.flush()

        profile = None

        # -------------------------------------------------
        # COUNSELOR / HEAD COUNSELOR PROFILE
        # -------------------------------------------------

        if role in {
            UserRole.COUNSELOR,
            UserRole.HEAD_COUNSELOR,
        }:

            specialization, problem = clean_text(
                data.get("specialization"),
                "specialization",
                max_length=150,
                required=False,
            )
            if problem:
                db.session.rollback()
                return error(problem)

            profile = CounselorProfile(
                user_id=user.id,
                employee_number=employee_number,
                first_name=first_name,
                last_name=last_name,
                specialization=specialization,
            )

            db.session.add(profile)

        # -------------------------------------------------
        # STAFF / ADMIN PROFILE
        # -------------------------------------------------

        elif role in {
            UserRole.STAFF,
            UserRole.ADMIN,
        }:

            profile = StaffProfile(
                user_id=user.id,
                employee_number=employee_number,
                first_name=first_name,
                last_name=last_name,
            )

            db.session.add(profile)

        db.session.flush()

        # -------------------------------------------------
        # AUDIT
        # -------------------------------------------------

        actor = current_user()

        audit(
            "ACCOUNT_CREATED",
            "user",
            user.id,
            actor.id,
            {
                "role": role.value
            }
        )

        db.session.commit()

    except IntegrityError:
        db.session.rollback()

        return error(
            "An account with the same email "
            "or employee number already exists.",
            409,
            "duplicate_account"
        )

    return jsonify(
        user=user.public_dict(),
        profile=(
            profile.to_dict()
            if profile
            else None
        )
    ), 201


# =========================================================
# LIST ACCOUNTS
# =========================================================

@admin_bp.get("/admin/accounts")
@roles_required(UserRole.ADMIN)
def list_accounts():
    stmt = db.select(
        User
    ).order_by(
        User.created_at.desc()
    )

    role = request.args.get(
        "role"
    )

    if role:
        try:
            parsed_role = UserRole(
                str(role).lower()
            )

        except ValueError:
            return error(
                "role must be student, counselor, "
                "head_counselor, admin, or staff."
            )

        stmt = stmt.where(
            User.role == parsed_role
        )

    users = db.session.scalars(
        stmt
    ).all()

    items = []

    for user in users:
        item = user.public_dict()

        # -------------------------------------------------
        # COUNSELOR PROFILE
        # -------------------------------------------------

        if user.role in {
            UserRole.COUNSELOR,
            UserRole.HEAD_COUNSELOR,
        }:

            item["profile"] = (
                user.counselor_profile.to_dict()
                if user.counselor_profile
                else None
            )

        # -------------------------------------------------
        # STUDENT PROFILE
        # -------------------------------------------------

        elif user.role == UserRole.STUDENT:

            item["profile"] = (
                user.student_profile.to_dict()
                if user.student_profile
                else None
            )

        # -------------------------------------------------
        # STAFF / ADMIN PROFILE
        # -------------------------------------------------

        elif user.role in {
            UserRole.STAFF,
            UserRole.ADMIN
        }:
            item["profile"] = (
                user.staff_profile.to_dict()
                if user.staff_profile
                else None
            )

        else:
            item["profile"] = None

        items.append(item)

    return jsonify(
        items=items
    )


# =========================================================
# ACTIVATE / DEACTIVATE ACCOUNT
# =========================================================

@admin_bp.patch(
    "/admin/accounts/<int:user_id>/active"
)
@roles_required(UserRole.ADMIN)
def set_account_active(user_id):
    target = db.session.get(
        User,
        user_id
    )

    if not target:
        return error(
            "Account not found.",
            404,
            "not_found"
        )

    data, failure = json_body(
        ["is_active"]
    )

    if failure:
        return failure

    actor = current_user()

    is_active, problem = parse_boolean(
        data["is_active"],
        "is_active"
    )

    if problem:
        return error(problem)

    if target.id == actor.id and not is_active:
        return error(
            "You cannot deactivate your own account.",
            409,
            "self_deactivation"
        )

    target.is_active = is_active

    audit(
        "ACCOUNT_STATUS_CHANGED",
        "user",
        target.id,
        actor.id,
        {
            "is_active": target.is_active
        }
    )

    db.session.commit()

    return jsonify(
        user=target.public_dict()
    )


# =========================================================
# CREATE GUIDANCE ROOM
# =========================================================

@admin_bp.post("/rooms")
@roles_required(
    UserRole.ADMIN,
    UserRole.HEAD_COUNSELOR
)
def create_room():
    data, failure = json_body(
        ["name"]
    )

    if failure:
        return failure

    name, problem = clean_text(
        data["name"],
        "name",
        max_length=100,
    )

    if problem:
        return error(problem)

    location, problem = clean_text(
        data.get("location"),
        "location",
        max_length=200,
        required=False,
    )

    if problem:
        return error(problem)

    existing_room = db.session.scalar(
        db.select(Room).filter_by(
            name=name
        )
    )

    if existing_room:
        return error(
            "Room already exists.",
            409,
            "duplicate_room"
        )

    room = Room(
        name=name,
        location=location
    )

    db.session.add(room)
    db.session.flush()

    actor = current_user()

    audit(
        "ROOM_CREATED",
        "room",
        room.id,
        actor.id
    )

    db.session.commit()

    return jsonify(
        room=room.to_dict()
    ), 201


# =========================================================
# LIST GUIDANCE ROOMS
# =========================================================

@admin_bp.get("/rooms")
@roles_required(
    UserRole.STUDENT,
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN,
    UserRole.STAFF
)
def list_rooms():
    rooms = db.session.scalars(
        db.select(Room)
        .where(
            Room.is_active.is_(True)
        )
        .order_by(
            Room.name
        )
    ).all()

    return jsonify(
        items=[
            room.to_dict()
            for room in rooms
        ]
    )


# =========================================================
# AUDIT LOGS
# =========================================================

@admin_bp.get("/audit-logs")
@roles_required(
    UserRole.ADMIN,
    UserRole.HEAD_COUNSELOR
)
def list_audit_logs():
    stmt = db.select(
        AuditLog
    ).order_by(
        AuditLog.created_at.desc()
    )

    action = request.args.get(
        "action"
    )

    entity_type = request.args.get(
        "entity_type"
    )

    if action:
        stmt = stmt.where(
            AuditLog.action == action
        )

    if entity_type:
        stmt = stmt.where(
            AuditLog.entity_type == entity_type
        )

    return jsonify(
        paginated(
            stmt,
            lambda item: item.to_dict()
        )
    )
    
