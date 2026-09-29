from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from ..enums import Priority, ReferralStatus, UserRole
from ..extensions import db
from ..models import CounselorProfile, Referral, StudentProfile
from ..utils import (
    audit,
    clean_text,
    current_user,
    enum_value,
    error,
    json_body,
    paginated,
    parse_iso_datetime,
    parse_positive_int,
    roles_required,
    tracking_code,
)

referrals_bp = Blueprint("referrals", __name__)


# =========================================================
# CREATE ANONYMOUS REFERRAL
# =========================================================

@referrals_bp.post("/referrals/anonymous")
def create_anonymous_referral():
    data, failure = json_body(
        ["subject_name", "concern_category", "concern_details"]
    )

    if failure:
        return failure

    subject_name, problem = clean_text(
        data["subject_name"], "subject_name", max_length=200
    )
    if problem:
        return error(problem)

    category, problem = clean_text(
        data["concern_category"], "concern_category", max_length=100
    )
    if problem:
        return error(problem)

    details, problem = clean_text(
        data["concern_details"], "concern_details", min_length=20, max_length=10000
    )
    if problem:
        return error(problem)

    program_year, problem = clean_text(
        data.get("subject_program_year"),
        "subject_program_year",
        max_length=200,
        required=False,
    )
    if problem:
        return error(problem)

    observed_at = None

    if data.get("observed_at"):
        observed_at, parse_error = parse_iso_datetime(
            data["observed_at"],
            "observed_at"
        )

        if parse_error:
            return error(parse_error)

    subject_student_id = data.get("subject_student_id")

    if subject_student_id not in (None, ""):
        subject_student_id, problem = parse_positive_int(
            subject_student_id, "subject_student_id"
        )
        if problem:
            return error(problem)
    else:
        subject_student_id = None

    if (
        subject_student_id
        and not db.session.get(
            StudentProfile,
            subject_student_id
        )
    ):
        return error(
            "Target student was not found.",
            404,
            "not_found"
        )

    referral = Referral(
        tracking_code=tracking_code("REF"),
        subject_student_id=subject_student_id,
        subject_name=subject_name,
        subject_program_year=program_year,
        concern_category=category,
        concern_details=details,
        observed_at=observed_at,
    )

    db.session.add(referral)
    db.session.flush()

    # Anonymous referral:
    # No referrer ID, IP address, user agent,
    # or actor-linked audit information is stored.
    audit(
        "ANONYMOUS_REFERRAL_CREATED",
        "referral",
        referral.id,
        actor_user_id=None
    )

    db.session.commit()

    return jsonify(
        message="Referral submitted anonymously.",
        tracking_code=referral.tracking_code,
        status=referral.status.value,
    ), 201


# =========================================================
# CHECK REFERRAL STATUS
# =========================================================

@referrals_bp.get("/referrals/status/<tracking_code_value>")
def referral_status(tracking_code_value):
    referral = db.session.scalar(
        db.select(Referral).filter_by(
            tracking_code=tracking_code_value.strip().upper()
        )
    )

    if not referral:
        return error(
            "Referral not found.",
            404,
            "not_found"
        )

    return jsonify(
        tracking_code=referral.tracking_code,
        status=referral.status.value,
        updated_at=referral.updated_at.isoformat()
    )


# =========================================================
# LIST REFERRALS
# =========================================================

@referrals_bp.get("/referrals")
@roles_required(
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN
)
def list_referrals():
    stmt = db.select(Referral).order_by(
        Referral.created_at.desc()
    )

    status = request.args.get("status")

    if status:
        parsed, problem = enum_value(
            ReferralStatus,
            status,
            "status"
        )

        if problem:
            return error(problem)

        stmt = stmt.where(
            Referral.status == parsed
        )

    user = current_user()

    # Regular counselors only see referrals
    # assigned specifically to them.
    if user.role == UserRole.COUNSELOR:
        if not user.counselor_profile:
            return error("Counselor profile not found.", 403, "profile_missing")
        stmt = stmt.where(
            Referral.assigned_counselor_id
            == user.counselor_profile.id
        )

    return jsonify(
        paginated(
            stmt,
            lambda item: item.to_dict()
        )
    )


# =========================================================
# GET REFERRAL
# =========================================================

@referrals_bp.get("/referrals/<int:referral_id>")
@roles_required(
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN
)
def get_referral(referral_id):
    referral = db.session.get(
        Referral,
        referral_id
    )

    if not referral:
        return error(
            "Referral not found.",
            404,
            "not_found"
        )

    user = current_user()

    if (
        user.role == UserRole.COUNSELOR
        and not user.counselor_profile
    ):
        return error("Counselor profile not found.", 403, "profile_missing")

    if (
        user.role == UserRole.COUNSELOR
        and referral.assigned_counselor_id
        != user.counselor_profile.id
    ):
        return error(
            "You are not assigned to this referral.",
            403,
            "forbidden"
        )

    audit(
        "REFERRAL_VIEWED",
        "referral",
        referral.id,
        user.id
    )

    db.session.commit()

    return jsonify(
        referral=referral.to_dict()
    )


# =========================================================
# TRIAGE REFERRAL
# NEW → TRIAGED
# =========================================================

@referrals_bp.patch("/referrals/<int:referral_id>/triage")
@roles_required(
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN
)
def triage_referral(referral_id):
    referral = db.session.get(
        Referral,
        referral_id
    )

    if not referral:
        return error(
            "Referral not found.",
            404,
            "not_found"
        )

    # -----------------------------------------------------
    # LIFECYCLE VALIDATION
    # Only NEW referrals may be triaged.
    # -----------------------------------------------------

    if referral.status != ReferralStatus.NEW:
        return error(
            (
                "Only NEW referrals may be triaged. "
                f"Current status is {referral.status.value}."
            ),
            409,
            "invalid_referral_status"
        )

    data, failure = json_body(["priority"])

    if failure:
        return failure

    priority, problem = enum_value(
        Priority,
        data["priority"],
        "priority"
    )

    if problem:
        return error(problem)

    user = current_user()

    referral.priority = priority

    triage_notes, problem = clean_text(
        data.get("triage_notes"),
        "triage_notes",
        max_length=5000,
        required=False,
    )
    if problem:
        return error(problem)

    referral.triage_notes = triage_notes

    referral.status = ReferralStatus.TRIAGED
    referral.triaged_by_user_id = user.id
    referral.triaged_at = datetime.now(timezone.utc)

    audit(
        "REFERRAL_TRIAGED",
        "referral",
        referral.id,
        user.id,
        {
            "priority": priority.value,
            "from": ReferralStatus.NEW.value,
            "to": ReferralStatus.TRIAGED.value,
        }
    )

    db.session.commit()

    return jsonify(
        referral=referral.to_dict()
    )


# =========================================================
# ASSIGN REFERRAL
# TRIAGED → ASSIGNED
# =========================================================

@referrals_bp.patch("/referrals/<int:referral_id>/assign")
@roles_required(
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN
)
def assign_referral(referral_id):
    referral = db.session.get(
        Referral,
        referral_id
    )

    if not referral:
        return error(
            "Referral not found.",
            404,
            "not_found"
        )

    # -----------------------------------------------------
    # LIFECYCLE VALIDATION
    # A referral must be triaged before assignment.
    # -----------------------------------------------------

    if referral.status != ReferralStatus.TRIAGED:
        return error(
            (
                "Only TRIAGED referrals may be assigned. "
                f"Current status is {referral.status.value}."
            ),
            409,
            "invalid_referral_status"
        )

    data, failure = json_body(
        ["counselor_id"]
    )

    if failure:
        return failure

    counselor_id, problem = parse_positive_int(
        data["counselor_id"], "counselor_id"
    )
    if problem:
        return error(problem)

    counselor = db.session.get(
        CounselorProfile,
        counselor_id
    )

    if (
        not counselor
        or not counselor.user.is_active
    ):
        return error(
            "Active counselor not found.",
            404,
            "not_found"
        )

    user = current_user()

    referral.assigned_counselor_id = counselor.id
    referral.assigned_at = datetime.now(timezone.utc)
    referral.status = ReferralStatus.ASSIGNED

    audit(
        "REFERRAL_ASSIGNED",
        "referral",
        referral.id,
        user.id,
        {
            "counselor_id": counselor.id,
            "from": ReferralStatus.TRIAGED.value,
            "to": ReferralStatus.ASSIGNED.value,
        }
    )

    db.session.commit()

    return jsonify(
        referral=referral.to_dict()
    )
