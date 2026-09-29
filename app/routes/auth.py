from datetime import datetime, timezone

from flask import Blueprint, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from ..enums import UserRole
from ..extensions import db
from ..models import AccountSettings, RevokedToken, StudentProfile, User
from ..utils import (
    active_user_required,
    audit,
    clean_text,
    current_user,
    error,
    json_body,
    validate_email,
    validate_password,
)

auth_bp = Blueprint("auth", __name__)


def token_pair(user):
    settings = db.session.get(AccountSettings, user.id)
    claims = {"role": user.role.value, "session_version": settings.session_version if settings else 0}
    return {
        "access_token": create_access_token(identity=str(user.id), additional_claims=claims),
        "refresh_token": create_refresh_token(identity=str(user.id), additional_claims=claims),
        "token_type": "Bearer",
    }


@auth_bp.post("/auth/register")
def register_student():
    data, failure = json_body(
        ["email", "password", "student_number", "first_name", "last_name", "program", "year_level"]
    )
    if failure:
        return failure
    email = str(data["email"]).strip().lower()
    if not validate_email(email):
        return error("A valid email address is required.")
    password_error = validate_password(data["password"])
    if password_error:
        return error(password_error)
    try:
        year_level = int(data["year_level"])
    except (TypeError, ValueError):
        return error("year_level must be a number from 1 to 8.")
    if not 1 <= year_level <= 8:
        return error("year_level must be a number from 1 to 8.")
    cleaned_fields = {}
    for field, max_length in (
        ("student_number", 50),
        ("first_name", 100),
        ("last_name", 100),
        ("program", 150),
    ):
        value, problem = clean_text(data[field], field, max_length=max_length)
        if problem:
            return error(problem)
        cleaned_fields[field] = value
    student_number = cleaned_fields["student_number"].upper()
    contact_number, problem = clean_text(
        data.get("contact_number"), "contact_number", max_length=30, required=False
    )
    if problem:
        return error(problem)
    if db.session.scalar(db.select(User).filter_by(email=email)):
        return error("Email is already registered.", 409, "duplicate_email")
    if db.session.scalar(db.select(StudentProfile).filter_by(student_number=student_number)):
        return error("Student number is already registered.", 409, "duplicate_student_number")

    user = User(email=email, role=UserRole.STUDENT)
    user.set_password(data["password"])
    db.session.add(user)
    db.session.flush()
    profile = StudentProfile(
        user_id=user.id,
        student_number=student_number,
        first_name=cleaned_fields["first_name"],
        last_name=cleaned_fields["last_name"],
        program=cleaned_fields["program"],
        year_level=year_level,
        contact_number=contact_number,
    )
    db.session.add(profile)
    audit("ACCOUNT_REGISTERED", "user", user.id, user.id, {"role": UserRole.STUDENT.value})
    db.session.commit()
    return jsonify(user=user.public_dict(), profile=profile.to_dict(), **token_pair(user)), 201


@auth_bp.post("/auth/login")
def login():
    data, failure = json_body(["email", "password"])
    if failure:
        return failure
    if not isinstance(data["email"], str) or not isinstance(data["password"], str):
        return error("Email and password must be text.")
    email = data["email"].strip().lower()
    user = db.session.scalar(db.select(User).filter_by(email=email))
    if not user or not user.verify_password(data["password"]):
        return error("Invalid email or password.", 401, "invalid_credentials")
    if not user.is_active:
        return error("Account is inactive.", 403, "account_inactive")
    user.last_login_at = datetime.now(timezone.utc)
    audit("LOGIN", "user", user.id, user.id)
    db.session.commit()
    profile = user.student_profile.to_dict() if user.student_profile else (
        user.counselor_profile.to_dict() if user.counselor_profile else (
            user.staff_profile.to_dict() if user.staff_profile else None
        )
    )
    return jsonify(user=user.public_dict(), profile=profile, **token_pair(user))


@auth_bp.post("/auth/refresh")
@jwt_required(refresh=True)
def refresh():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return error("Account is inactive or unavailable.", 403, "account_inactive")
    return jsonify(access_token=token_pair(user)["access_token"])


@auth_bp.post("/auth/logout")
@jwt_required(verify_type=False)
def logout():
    payload = get_jwt()
    if not db.session.scalar(db.select(RevokedToken).filter_by(jti=payload["jti"])):
        db.session.add(
            RevokedToken(
                jti=payload["jti"],
                expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            )
        )
    user = current_user()
    audit("LOGOUT", "user", user.id if user else None, user.id if user else None)
    db.session.commit()
    return jsonify(message="Token revoked.")


@auth_bp.get("/auth/me")
@active_user_required
def me():
    user = current_user()
    if not user:
        return error("Account not found.", 404, "not_found")
    profile = user.student_profile.to_dict() if user.student_profile else (
        user.counselor_profile.to_dict() if user.counselor_profile else (
            user.staff_profile.to_dict() if user.staff_profile else None
        )
    )
    return jsonify(user=user.public_dict(), profile=profile)
