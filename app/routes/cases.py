import hashlib
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from ..enums import CaseStatus, Priority, ReferralStatus, UserRole
from ..extensions import db
from ..models import AuditLog, CounselingCase, CounselorProfile, ProgressNote, Referral, ReferralIdentity, StudentProfile
from ..utils import (
    active_user_required,
    audit,
    clean_text,
    current_user,
    decrypt_note,
    encrypt_note,
    enum_value,
    error,
    json_body,
    paginated,
    roles_required,
    tracking_code,
    encrypt_closure,
    decrypt_closure,
    encrypt_student_summary,
    decrypt_student_summary,
    decrypt_referral_identity,
)

cases_bp = Blueprint("cases", __name__)

CASE_TRANSITIONS = {
    CaseStatus.INTAKE: {
        CaseStatus.ACTIVE,
    },
    CaseStatus.ACTIVE: {
        CaseStatus.FOLLOW_UP,
        CaseStatus.PENDING_CLOSURE,
    },
    CaseStatus.FOLLOW_UP: {
        CaseStatus.ACTIVE,
        CaseStatus.PENDING_CLOSURE,
    },
    CaseStatus.PENDING_CLOSURE: {
        CaseStatus.CLOSED,
        CaseStatus.REVISION_REQUIRED,
    },
    CaseStatus.REVISION_REQUIRED: {
        CaseStatus.ACTIVE,
        CaseStatus.FOLLOW_UP,
        CaseStatus.PENDING_CLOSURE,
    },
    CaseStatus.CLOSED: set(),
}



def can_access_case(user, case):
    if user.role in {UserRole.HEAD_COUNSELOR, UserRole.ADMIN}:
        return True
    if user.role == UserRole.COUNSELOR:
        return user.counselor_profile and case.counselor_id == user.counselor_profile.id
    if user.role == UserRole.STUDENT:
        return user.student_profile and case.student_id == user.student_profile.id
    return False


@cases_bp.post("/cases")
@roles_required(UserRole.HEAD_COUNSELOR, UserRole.ADMIN)
def create_case():
    data, failure = json_body(["counselor_id", "category"])
    if failure:
        return failure

    # Automatically identify the student from the referral.
    if data.get("referral_id"):

        referral = db.session.get(Referral, data["referral_id"])

        if not referral:
            return error("Referral not found.", 404, "not_found")

        identity = db.session.scalar(
            db.select(ReferralIdentity).filter_by(
                referral_id=referral.id
            )
        )

        if not identity or not identity.encrypted_subject_student_id:
            return error(
                "This referral has no verified registered student. "
                "Automatic linking is unavailable.",
                409,
                "student_link_unavailable"
            )

        try:
            student_id = int(
                decrypt_referral_identity(
                    identity.encrypted_subject_student_id
                )
            )
        except (ValueError, TypeError):
            return error(
                "Invalid registered student identity.",
                409,
                "invalid_student_identity"
            )

    else:
        # Preserve support for cases created without a referral.
        student_id = data.get("student_id")

        if not student_id:
            return error(
                "A registered student is required.",
                400,
                "student_required"
            )

    student = db.session.get(StudentProfile, student_id)
    counselor = db.session.get(CounselorProfile, data["counselor_id"])
    if not student or not student.user.is_active:
        return error("Active student not found.", 404, "not_found")
    if not counselor or not counselor.user.is_active:
        return error("Active counselor not found.", 404, "not_found")
    category, problem = clean_text(data["category"], "category", max_length=100)
    if problem:
        return error(problem)
    intake_summary, problem = clean_text(
        data.get("intake_summary"), "intake_summary", max_length=5000, required=False
    )
    if problem:
        return error(problem)
    priority, problem = enum_value(Priority, data.get("priority", "MEDIUM"), "priority")
    if problem:
        return error(problem)
    referral = None
    if data.get("referral_id"):
        referral = db.session.get(Referral, data["referral_id"])
        if not referral:
            return error("Referral not found.", 404, "not_found")
        if db.session.scalar(db.select(CounselingCase).filter_by(referral_id=referral.id)):
            return error("A case already exists for this referral.", 409, "duplicate_case")
        if referral.status != ReferralStatus.ASSIGNED:
            return error(
                "Only assigned referrals can be converted into counseling cases.",
                409,
                "invalid_referral_status",
            )
        if referral.assigned_counselor_id != counselor.id:
            return error(
                "The selected counselor does not match the referral's assigned counselor.",
                409,
                "counselor_assignment_mismatch",
            )
    case = CounselingCase(
        case_number=tracking_code("CASE"),
        student_id=student.id,
        counselor_id=counselor.id,
        referral_id=referral.id if referral else None,
        category=category,
        priority=priority,
        intake_summary=intake_summary,
    )
    db.session.add(case)
    db.session.flush()
    if referral:
        referral.assigned_counselor_id = counselor.id
        referral.status = ReferralStatus.CLOSED
    user = current_user()
    audit("CASE_CREATED", "case", case.id, user.id, {"student_id": student.id, "counselor_id": counselor.id})
    db.session.commit()
    return jsonify(case=case.to_dict()), 201


@cases_bp.get("/cases")
@active_user_required
def list_cases():
    user = current_user()
    stmt = db.select(CounselingCase).order_by(CounselingCase.opened_at.desc())
    if user.role == UserRole.STUDENT and user.student_profile:
        stmt = stmt.where(CounselingCase.student_id == user.student_profile.id)
    elif user.role == UserRole.COUNSELOR and user.counselor_profile:
        stmt = stmt.where(CounselingCase.counselor_id == user.counselor_profile.id)
    elif user.role not in {UserRole.HEAD_COUNSELOR,UserRole.ADMIN, UserRole.STAFF,}:
        return error("You do not have permission to view cases.", 403,"forbidden")
    status = request.args.get("status")
    if status:
        parsed, problem = enum_value(CaseStatus, status, "status")
        if problem:
            return error(problem)
        stmt = stmt.where(CounselingCase.status == parsed)
    
    return jsonify(
        paginated(
            stmt,
            lambda item: item.to_dict(role=user.role.value)
        )
    )


@cases_bp.get("/cases/<int:case_id>")
@active_user_required
def get_case(case_id):
    case = db.session.get(CounselingCase, case_id)
    user = current_user()

    if not case:
        return error(
            "Case not found.",
            404,
            "not_found"
        )

    # Staff may view administrative case details only.
    # Other roles continue using the existing access rules.
    if (
        user.role != UserRole.STAFF
        and not can_access_case(user, case)
    ):
        return error("You do not have permission to view this case.",403,"forbidden" )

    # Serialize case information according to role.
    data = case.to_dict(role=user.role.value)

    # Detailed profiles are restricted to counseling
    # professionals who are authorized for this case.
    if user.role in {
        UserRole.COUNSELOR,
        UserRole.HEAD_COUNSELOR,
    }:
        data["student"] = case.student.to_dict()
        data["counselor"] = case.counselor.to_dict()

    # Record access to counseling case details.
    if user.role != UserRole.STUDENT:
        audit(
            "CASE_VIEWED",
            "case",
            case.id,
            user.id
        )
        db.session.commit()

    return jsonify(case=data)

@cases_bp.patch("/cases/<int:case_id>/status")
@roles_required(UserRole.COUNSELOR)
def change_case_status(case_id):
    case = db.session.get(CounselingCase, case_id)
    user = current_user()

    if not case:
        return error("Case not found.", 404, "not_found")

    if (
        not user.counselor_profile
        or case.counselor_id != user.counselor_profile.id
    ):
        return error(
            "You are not assigned to this case.",
            403,
            "forbidden"
        )

    data, failure = json_body(["status"])
    if failure:
        return failure

    new_status, problem = enum_value(
        CaseStatus,
        data["status"],
        "status"
    )
    if problem:
        return error(problem)

    # Closure requests and approvals require separate endpoints.
    if new_status in {
        CaseStatus.PENDING_CLOSURE,
        CaseStatus.REVISION_REQUIRED,
        CaseStatus.CLOSED,
    }:
        return error(
            "Closure requests and reviews must use the designated workflow.",
            403,
            "closure_workflow_required"
        )

    # Cases awaiting review cannot be modified through this endpoint.
    if case.status in {
        CaseStatus.PENDING_CLOSURE,
        CaseStatus.CLOSED,
    }:
        return error(
            "This case cannot be updated while awaiting closure review or after closure.",
            409,
            "invalid_case_state"
        )

    if new_status not in CASE_TRANSITIONS[case.status]:
        return error(
            f"Invalid case transition: "
            f"{case.status.value} → {new_status.value}.",
            409,
            "invalid_transition"
        )

    old_status = case.status
    case.status = new_status

    audit(
        "CASE_STATUS_CHANGED",
        "case",
        case.id,
        user.id,
        {
            "from": old_status.value,
            "to": new_status.value,
        }
    )

    db.session.commit()

    return jsonify(case=case.to_dict())



@cases_bp.post("/cases/<int:case_id>/notes")
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR)
def add_note(case_id):
    case = db.session.get(CounselingCase, case_id)
    user = current_user()
    if not case:
        return error("Case not found.", 404, "not_found")
    if not can_access_case(user, case):
        return error("You are not assigned to this case.", 403, "forbidden")
    if user.role != UserRole.COUNSELOR or not user.counselor_profile:
        return error(
            "Only the assigned Counselor may add progress notes.",
            403,
            "forbidden"
        )
    if case.status not in {
        CaseStatus.ACTIVE,
        CaseStatus.FOLLOW_UP,
        CaseStatus.REVISION_REQUIRED,
    }:
        return error(
            "Progress notes cannot be added in the current case status.",
            409,
            "invalid_case_state"
        )
    data, failure = json_body(["note"])
    if failure:
        return failure
    note_text, problem = clean_text(data["note"], "note", min_length=3, max_length=10000)
    if problem:
        return error(problem)
    note = ProgressNote(case_id=case.id, counselor_id=user.counselor_profile.id, encrypted_note=encrypt_note(note_text))
    db.session.add(note)
    db.session.flush()
    audit("PROGRESS_NOTE_ADDED", "progress_note", note.id, user.id, {"case_id": case.id})
    db.session.commit()
    return jsonify(note={"id": note.id, "case_id": case.id, "created_at": note.created_at.isoformat()}), 201


@cases_bp.get("/cases/<int:case_id>/notes")
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR)
def list_notes(case_id):
    case = db.session.get(CounselingCase, case_id)
    user = current_user()
    if not case:
        return error("Case not found.", 404, "not_found")
    if not can_access_case(user, case):
        return error("You are not assigned to this case.", 403, "forbidden")
    notes = db.session.scalars(
        db.select(ProgressNote)
        .where(ProgressNote.case_id == case.id)
        .order_by(ProgressNote.created_at.desc())
    ).all()

    items = []

    for note in notes:
        try:
            note_text = decrypt_note(note.encrypted_note)
            available = True
        except RuntimeError:
            note_text = None
            available = False

        items.append({
            "id": note.id,
            "case_id": note.case_id,
            "counselor_id": note.counselor_id,
            "note": note_text,
            "available": available,
            "created_at": note.created_at.isoformat(),
            "updated_at": note.updated_at.isoformat(),
        })

    audit(
        "PROGRESS_NOTES_VIEWED",
        "case",
        case.id,
        user.id,
        {
            "count": len(notes),
            "unavailable_count": sum(
                not item["available"] for item in items
            )
        }
    )
    db.session.commit()
    return jsonify(items=items)



@cases_bp.patch("/cases/<int:case_id>/notes/<int:note_id>")
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR)
def update_note(case_id, note_id):
    if current_user().role != UserRole.COUNSELOR:
        return error(
            "Only the assigned Counselor may edit progress notes.",
            403,
            "forbidden"
        )
    case = db.session.get(CounselingCase, case_id)
    note = db.session.get(ProgressNote, note_id)
    user = current_user()
    if not case or not note or note.case_id != case.id:
        return error("Progress note not found.", 404, "not_found")
    if not can_access_case(user, case):
        return error("You are not assigned to this case.", 403, "forbidden")
    if not user.counselor_profile or note.counselor_id != user.counselor_profile.id:
        return error("You may only edit your own progress notes.", 403, "forbidden")
    
    if case.status not in {
        CaseStatus.ACTIVE,
        CaseStatus.FOLLOW_UP,
        CaseStatus.REVISION_REQUIRED,
    }:
        return error(
            "Progress notes cannot be edited in the current case status.",
            409,
            "invalid_case_state"
        )
    
    # Protect historical encrypted notes from being overwritten.
    # Only notes encrypted using the new v2 format may be edited.
    stored_note = bytes(note.encrypted_note) if note.encrypted_note is not None else b""

    if not stored_note.startswith(b"v2:"):
        return error(
            "This historical progress note cannot be edited because "
            "its original encryption key has not been recovered.",
            409,
            "historical_note_protected"
        )
    data, failure = json_body(["note"])
    if failure:
        return failure
    note_text, problem = clean_text(data["note"], "note", min_length=3, max_length=10000)
    if problem:
        return error(problem)
    note.encrypted_note = encrypt_note(note_text)
    audit("PROGRESS_NOTE_UPDATED", "progress_note", note.id, user.id, {"case_id": case.id})
    db.session.commit()
    return jsonify(message="Progress note updated.")


@cases_bp.post("/cases/<int:case_id>/request-closure")
@roles_required(UserRole.COUNSELOR)
def request_case_closure(case_id):
    user = current_user()

    case = db.session.get(CounselingCase, case_id)

    if not case:
        return error("Case not found.", 404, "not_found")

    # Only the assigned counselor can request closure.
    if (
        not user.counselor_profile
        or case.counselor_id != user.counselor_profile.id
    ):
        return error(
            "Only the assigned counselor can request case closure.",
            403,
            "forbidden"
        )

    # Only active, follow-up, or returned cases can be submitted.
    allowed_statuses = {
        CaseStatus.ACTIVE,
        CaseStatus.FOLLOW_UP,
        CaseStatus.REVISION_REQUIRED,
    }

    if case.status not in allowed_statuses:
        return error(
            "This case is not eligible for closure.",
            409,
            "invalid_case_state"
        )

    data, failure = json_body(["closure_summary"])
    if failure:
        return failure

    summary, problem = clean_text(
        data["closure_summary"],
        "closure_summary",
        min_length=10,
        max_length=5000
    )

    if problem:
        return error(problem)

    previous_status = case.status

    case.status = CaseStatus.PENDING_CLOSURE
    case.closure_requested_by_user_id = user.id
    case.closure_requested_at = datetime.now(timezone.utc)
    case.closure_summary = encrypt_closure(summary)

    # Clear any previous review decision when resubmitting.
    case.closure_reviewed_by_user_id = None
    case.closure_reviewed_at = None
    case.closure_review_remarks = None

    audit(
        "CASE_CLOSURE_REQUESTED",
        "case",
        case.id,
        user.id,
        {
            "from": previous_status.value,
            "to": CaseStatus.PENDING_CLOSURE.value
        }
    )

    db.session.commit()

    return jsonify(
        message="Case closure request submitted for Head Counselor review.",
        case=case.to_dict()
    ), 200


@cases_bp.post("/cases/<int:case_id>/review-closure")
@roles_required(UserRole.HEAD_COUNSELOR)
def review_case_closure(case_id):
    user = current_user()
    case = db.session.get(CounselingCase, case_id)

    if not case:
        return error("Case not found.", 404, "not_found")

    if case.status != CaseStatus.PENDING_CLOSURE:
        return error(
            "This case does not have a pending closure request.",
            409,
            "invalid_case_state"
        )
    
    # Require this Head Counselor to have retrieved
    # the current closure request before reviewing it.
    requested_at = (
        case.closure_requested_at.isoformat()
        if case.closure_requested_at
        else None
    )

    if not requested_at:
        return error(
            "This closure request has no submission timestamp.",
            409,
            "invalid_closure_request"
        )

    review_logs = db.session.scalars(
        db.select(AuditLog)
        .where(
            AuditLog.actor_user_id == user.id,
            AuditLog.action == "CASE_CLOSURE_DETAILS_VIEWED",
            AuditLog.entity_type == "case",
            AuditLog.entity_id == str(case.id),
        )
    ).all()

    reviewed_current_request = any(
        (log.metadata_json or {}).get("closure_requested_at")
        == requested_at
        for log in review_logs
    )

    if not reviewed_current_request:
        return error(
            "Please open and review the current closure "
            "request before approving or returning it.",
            409,
            "closure_review_required"
        )

    data, failure = json_body(["decision"])
    if failure:
        return failure

    decision = str(data["decision"]).strip().upper()

    if decision not in {"APPROVE", "RETURN"}:
        return error(
            "Decision must be APPROVE or RETURN.",
            400,
            "invalid_decision"
        )

    remarks, problem = clean_text(
        data.get("remarks"),
        "remarks",
        max_length=5000,
        required=False
    )

    if problem:
        return error(problem)

    if decision == "RETURN" and not remarks:
        return error(
            "Please provide remarks explaining why the case is returned.",
            400,
            "remarks_required"
        )

    now = datetime.now(timezone.utc)

    case.closure_reviewed_by_user_id = user.id
    case.closure_reviewed_at = now
    case.closure_review_remarks = (
    encrypt_closure(remarks)
    if remarks
    else None
    )

    if decision == "APPROVE":
        case.status = CaseStatus.CLOSED
        case.closed_at = now
        message = "Case closure approved successfully."
        audit_action = "CASE_CLOSURE_APPROVED"
    else:
        case.status = CaseStatus.REVISION_REQUIRED
        case.closed_at = None
        message = "Case returned to the assigned counselor for revision."
        audit_action = "CASE_CLOSURE_RETURNED"

    audit(
        audit_action,
        "case",
        case.id,
        user.id,
        {
            "decision": decision,
            "status": case.status.value
        }
    )

    db.session.commit()

    return jsonify(
        message=message,
        case=case.to_dict()
    ), 200

@cases_bp.get("/cases/<int:case_id>/closure-review")
@roles_required(UserRole.HEAD_COUNSELOR)
def get_closure_review(case_id):
    user = current_user()
    case = db.session.get(CounselingCase, case_id)

    if not case:
        return error(
            "Case not found.",
            404,
            "not_found"
        )

    if case.status != CaseStatus.PENDING_CLOSURE:
        return error(
            "This case does not have a pending closure request.",
            409,
            "invalid_case_state"
        )
    
    # Decrypt the closure summary before recording
    # that the current request was successfully viewed.
    closure_summary = (
        decrypt_closure(case.closure_summary)
        if case.closure_summary
        else None
    )
    
    if not closure_summary or not closure_summary.strip():
        return error(
            "This closure request has no valid summary "
            "and cannot be reviewed.",
            409,
            "invalid_closure_summary"
        )

    # Record access to confidential closure information.
    audit(
        "CASE_CLOSURE_DETAILS_VIEWED",
        "case",
        case.id,
        user.id,
        {
            "closure_requested_at": (
                case.closure_requested_at.isoformat()
                if case.closure_requested_at
                else None
            )
        }
    )

    db.session.commit()

    return jsonify(
        case_id=case.id,
        case_number=case.case_number,
        status=case.status.value,
        closure_summary=closure_summary,
        requested_at=(
            case.closure_requested_at.isoformat()
            if case.closure_requested_at
            else None
        )
    ), 200

@cases_bp.get("/cases/<int:case_id>/revision-feedback")
@roles_required(UserRole.COUNSELOR)
def get_revision_feedback(case_id):
    user = current_user()
    case = db.session.get(CounselingCase, case_id)

    if not case:
        return error(
            "Case not found.",
            404,
            "not_found"
        )

    # Only the assigned Counselor can read feedback.
    if (
        not user.counselor_profile
        or case.counselor_id != user.counselor_profile.id
    ):
        return error(
            "You are not assigned to this case.",
            403,
            "forbidden"
        )

    if case.status != CaseStatus.REVISION_REQUIRED:
        return error(
            "No active revision feedback is available for this case.",
            409,
            "invalid_case_state"
        )

    audit(
        "CASE_REVISION_FEEDBACK_VIEWED",
        "case",
        case.id,
        user.id
    )

    db.session.commit()

    return jsonify(
        case_id=case.id,
        case_number=case.case_number,
        status=case.status.value,
        remarks=(
            decrypt_closure(case.closure_review_remarks)
            if case.closure_review_remarks
            else None
        ),
        reviewed_at=(
            case.closure_reviewed_at.isoformat()
            if case.closure_reviewed_at
            else None
        )
    ), 200

@cases_bp.put("/cases/<int:case_id>/student-summary")
@roles_required(UserRole.COUNSELOR)
def save_student_summary(case_id):
    user = current_user()
    case = db.session.get(CounselingCase, case_id)

    if not case:
        return error(
            "Case not found.",
            404,
            "not_found"
        )

    # Only the assigned Counselor may prepare the summary.
    if (
        not user.counselor_profile
        or case.counselor_id != user.counselor_profile.id
    ):
        return error(
            "Only the assigned Counselor may prepare "
            "this student-facing summary.",
            403,
            "forbidden"
        )

    # Student-facing summaries are drafted after closure.
    if case.status != CaseStatus.CLOSED:
        return error(
            "The case must be closed before preparing "
            "a student-facing summary.",
            409,
            "invalid_case_state"
        )

    # A released summary must not be silently overwritten.
    if case.student_summary_released_at is not None:
        return error(
            "This summary has already been released "
            "and cannot be edited.",
            409,
            "summary_already_released"
        )

    data, failure = json_body(["student_summary"])
    if failure:
        return failure

    summary, problem = clean_text(
        data["student_summary"],
        "student_summary",
        min_length=10,
        max_length=5000
    )

    if problem:
        return error(problem)

    # Store encrypted text, never plaintext.
    case.student_summary = encrypt_student_summary(summary)

    audit(
        "STUDENT_SUMMARY_DRAFT_SAVED",
        "case",
        case.id,
        user.id
    )

    db.session.commit()

    return jsonify(
        message=(
            "Student-facing summary saved as a private draft. "
            "It has not been released to the Student."
        ),
        case_id=case.id,
        released=False
    ), 200

@cases_bp.get("/cases/<int:case_id>/student-summary/review")
@roles_required(UserRole.HEAD_COUNSELOR)
def review_student_summary(case_id):
    user = current_user()
    case = db.session.get(CounselingCase, case_id)

    if not case:
        return error(
            "Case not found.",
            404,
            "not_found"
        )

    if case.status != CaseStatus.CLOSED:
        return error(
            "Only closed cases may have student-facing summaries reviewed.",
            409,
            "invalid_case_state"
        )

    if not case.student_summary:
        return error(
            "The assigned Counselor has not prepared "
            "a student-facing summary.",
            409,
            "student_summary_missing"
        )

    # Decrypt successfully before recording access.
    summary = decrypt_student_summary(case.student_summary)

    if not summary.strip():
        return error(
            "The student-facing summary is empty.",
            409,
            "invalid_student_summary"
        )

    
    # Fingerprint the exact encrypted draft reviewed.
    # Do not store the readable summary in audit metadata.
    summary_fingerprint = hashlib.sha256(
        case.student_summary.encode("utf-8")
    ).hexdigest()

    audit(
        "STUDENT_SUMMARY_REVIEWED",
        "case",
        case.id,
        user.id,
        {
            "summary_fingerprint": summary_fingerprint
        }
    )


    db.session.commit()

    return jsonify(
        case_id=case.id,
        case_number=case.case_number,
        student_summary=summary,
        released=case.student_summary_released_at is not None
    ), 200

@cases_bp.post("/cases/<int:case_id>/student-summary/release")
@roles_required(UserRole.HEAD_COUNSELOR)
def release_student_summary(case_id):
    user = current_user()
    case = db.session.get(CounselingCase, case_id)

    if not case:
        return error("Case not found.", 404, "not_found")

    if case.status != CaseStatus.CLOSED:
        return error(
            "Only closed cases may have student summaries released.",
            409,
            "invalid_case_state"
        )

    if case.student_summary_released_at is not None:
        return error(
            "This student summary has already been released.",
            409,
            "summary_already_released"
        )

    if not case.student_summary:
        return error(
            "The assigned Counselor has not prepared a student summary.",
            409,
            "student_summary_missing"
        )

    # Validate ciphertext before authorizing its release.
    summary = decrypt_student_summary(case.student_summary)

    if not summary.strip():
        return error(
            "The student summary is empty.",
            409,
            "invalid_student_summary"
        )

    # Match the current encrypted draft to the version
    # reviewed by this Head Counselor.
    current_fingerprint = hashlib.sha256(
        case.student_summary.encode("utf-8")
    ).hexdigest()

    review_logs = db.session.scalars(
        db.select(AuditLog)
        .where(
            AuditLog.actor_user_id == user.id,
            AuditLog.action == "STUDENT_SUMMARY_REVIEWED",
            AuditLog.entity_type == "case",
            AuditLog.entity_id == str(case.id),
        )
    ).all()

    reviewed_current_draft = any(
        (log.metadata_json or {}).get("summary_fingerprint")
        == current_fingerprint
        for log in review_logs
    )

    if not reviewed_current_draft:
        return error(
            "Please review the current student summary "
            "before authorizing its release.",
            409,
            "student_summary_review_required"
        )

    # Explicit release authorization.
    case.student_summary_released_at = datetime.now(timezone.utc)
    case.student_summary_released_by_user_id = user.id

    audit(
        "STUDENT_SUMMARY_RELEASED",
        "case",
        case.id,
        user.id,
        {
            "summary_fingerprint": current_fingerprint
        }
    )

    db.session.commit()

    return jsonify(
        message="Student-facing summary released successfully.",
        case_id=case.id,
        released=True,
        released_at=case.student_summary_released_at.isoformat()
    ), 200

@cases_bp.get("/cases/<int:case_id>/student-summary")
@roles_required(UserRole.STUDENT)
def get_released_student_summary(case_id):
    user = current_user()
    case = db.session.get(CounselingCase, case_id)

    if not case:
        return error(
            "Case not found.",
            404,
            "not_found"
        )

    # Students can access only their own case.
    if (
        not user.student_profile
        or case.student_id != user.student_profile.id
    ):
        return error(
            "You do not have permission to view this summary.",
            403,
            "forbidden"
        )

    # Closure alone does not grant access.
    if case.status != CaseStatus.CLOSED:
        return error(
            "This case has not been closed.",
            409,
            "invalid_case_state"
        )

    # Require explicit Head Counselor release.
    if (
        case.student_summary_released_at is None
        or case.student_summary_released_by_user_id is None
        or not case.student_summary
    ):
        return error(
            "No student-facing summary has been released for this case.",
            404,
            "summary_not_released"
        )

    # Decrypt only after all authorization checks succeed.
    summary = decrypt_student_summary(case.student_summary)

    audit(
        "STUDENT_SUMMARY_VIEWED",
        "case",
        case.id,
        user.id
    )

    db.session.commit()

    return jsonify(
        case_id=case.id,
        case_number=case.case_number,
        student_summary=summary,
        released_at=case.student_summary_released_at.isoformat()
    ), 200