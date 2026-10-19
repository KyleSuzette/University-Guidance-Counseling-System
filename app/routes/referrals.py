import re
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from ..enums import Priority, ReferralStatus, UserRole
from ..extensions import db
from ..models import CounselorProfile, Referral, ReferralIdentity, StudentProfile
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
    referral_identity_hash,
    generate_anonymous_reporter_reference,
    encrypt_referral_identity,
    decrypt_referral_identity,
)

referrals_bp = Blueprint("referrals", __name__)

# =========================================================
# ANONYMOUS REFERRAL — FREE-TEXT PRIVACY VALIDATION
# =========================================================

def validate_anonymous_concern_privacy(details):
    """
    Detect obvious contact information that may compromise
    the reporting person's anonymity.

    Reject and request revision instead of silently
    modifying the original concern.
    """

    # Detect common email addresses.
    email_pattern = (
        r"\b[A-Za-z0-9._%+-]+@"
        r"[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
    )

    if re.search(email_pattern, details):
        return (
            "Please remove email addresses from the concern "
            "description to help protect anonymity."
        )

    # Detect common Philippine mobile numbers:
    # 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX,
    # with optional spaces or hyphens.
    mobile_pattern = (
        r"(?<!\d)"
        r"(?:\+?63[\s-]?|0)"
        r"9(?:[\s-]?\d){9}"
        r"(?!\d)"
    )

    if re.search(mobile_pattern, details):
        return (
            "Please remove phone numbers from the concern "
            "description to help protect anonymity."
        )

    # Detect explicit self-identification phrases.
    self_identification_pattern = (
        r"\b(?:my name is|"
        r"i am named|"
        r"my student number is|"
        r"my student id is|"
        r"my email is|"
        r"my phone number is)\b"
    )

    if re.search(
        self_identification_pattern,
        details,
        flags=re.IGNORECASE
    ):
        return (
            "Your description appears to contain personal "
            "identifying information. Please revise it "
            "without identifying yourself."
        )

    return None


def referral_staff_dict(referral):
    """
    Return referral details for an already-authorized
    staff member.
    """
    result = referral.to_dict()

    identity = db.session.scalar(
        db.select(ReferralIdentity).filter_by(
            referral_id=referral.id
        )
    )

    if identity:
        result["subject_name"] = decrypt_referral_identity(
            identity.encrypted_subject_name
        )

        result["subject_program_year"] = decrypt_referral_identity(
            identity.encrypted_subject_program_year
        )

        encrypted_id = identity.encrypted_subject_student_id

        result["subject_student_id"] = (
            int(decrypt_referral_identity(encrypted_id))
            if encrypted_id
            else None
        )

    return result

# =========================================================
# CREATE ANONYMOUS REFERRAL
# =========================================================

@referrals_bp.post("/referrals/anonymous")
def create_anonymous_referral():
    data, failure = json_body(
        ["subject_student_number", "concern_category", "concern_details"]
    )

    if failure:
        return failure

    subject_name, problem = clean_text(
    data.get("subject_name"),
    "subject_name",
    max_length=200,
    required=False
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
    
    privacy_problem = validate_anonymous_concern_privacy(details)

    if privacy_problem:
        return error(
            privacy_problem,
            400,
            "privacy_validation_failed"
        )

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

    subject_student_number, problem = clean_text(
    data["subject_student_number"],
    "subject_student_number",
    max_length=50
    )

    if problem:
        return error(problem)

    student = db.session.scalar(
        db.select(StudentProfile).filter_by(
            student_number=subject_student_number
        )
    )

    if not student or not student.user.is_active:
        return error(
            "No active registered student matches this student number.",
            404,
            "student_not_found"
        )

    subject_student_id = student.id
    if not subject_name:
        subject_name = f"{student.first_name} {student.last_name}"
        
    # Anonymous reporter: use a random hashed reference.
    # No reporter identity is collected or retained.
    reporter_hash = generate_anonymous_reporter_reference()

    # Pseudonymous reference for the referred Student.
    subject_reference = (
        f"student-profile:{subject_student_id}"
        if subject_student_id is not None
        else f"reported-name:{subject_name}"
    )

    subject_hash = referral_identity_hash(
        subject_reference,
        "subject"
    )

    # Incident record: do not store the subject's plaintext
    # identity or direct Student account link here.
    referral = Referral(
        tracking_code=tracking_code("REF"),
        reporter_reference_hash=reporter_hash,
        subject_identity_hash=subject_hash,
        subject_student_id=None,
        subject_name="Protected identity",
        subject_program_year=None,
        concern_category=category,
        concern_details=details,
        observed_at=observed_at,
    )

    db.session.add(referral)
    db.session.flush()

    # Separate, encrypted identity record.
    referral_identity = ReferralIdentity(
        referral_id=referral.id,
        encrypted_subject_name=encrypt_referral_identity(
            subject_name
        ),
        encrypted_subject_program_year=encrypt_referral_identity(
            program_year
        ),
        encrypted_subject_student_id=encrypt_referral_identity(
            subject_student_id
        ),
    )

    db.session.add(referral_identity)

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
            lambda item: referral_staff_dict(item)
        )
    )


# =========================================================
# GET REFERRAL
# =========================================================

@referrals_bp.get("/referrals/<int:referral_id>")
@roles_required(
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
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
        referral=referral_staff_dict(referral)
    )


# =========================================================
# TRIAGE REFERRAL
# NEW → TRIAGED
# =========================================================

@referrals_bp.patch("/referrals/<int:referral_id>/triage")
@roles_required(
    UserRole.HEAD_COUNSELOR,
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