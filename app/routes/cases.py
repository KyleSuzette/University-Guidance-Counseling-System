from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from ..enums import CaseStatus, Priority, ReferralStatus, UserRole
from ..extensions import db
from ..models import CounselingCase, CounselorProfile, ProgressNote, Referral, StudentProfile
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
)

cases_bp = Blueprint("cases", __name__)
CASE_TRANSITIONS = {
    CaseStatus.INTAKE: {CaseStatus.ACTIVE},
    CaseStatus.ACTIVE: {CaseStatus.FOLLOW_UP, CaseStatus.CLOSED},
    CaseStatus.FOLLOW_UP: {CaseStatus.ACTIVE, CaseStatus.CLOSED},
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
    data, failure = json_body(["student_id", "counselor_id", "category"])
    if failure:
        return failure
    student = db.session.get(StudentProfile, data["student_id"])
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
        if referral.subject_student_id and referral.subject_student_id != student.id:
            return error(
                "The referral does not belong to the selected student.",
                409,
                "referral_student_mismatch",
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
    elif user.role not in {UserRole.HEAD_COUNSELOR, UserRole.ADMIN}:
        return error("You do not have permission to view cases.", 403, "forbidden")
    status = request.args.get("status")
    if status:
        parsed, problem = enum_value(CaseStatus, status, "status")
        if problem:
            return error(problem)
        stmt = stmt.where(CounselingCase.status == parsed)
    return jsonify(paginated(stmt, lambda item: item.to_dict()))


@cases_bp.get("/cases/<int:case_id>")
@active_user_required
def get_case(case_id):
    case = db.session.get(CounselingCase, case_id)
    user = current_user()
    if not case:
        return error("Case not found.", 404, "not_found")
    if not can_access_case(user, case):
        return error("You do not have permission to view this case.", 403, "forbidden")
    data = case.to_dict()
    data["student"] = case.student.to_dict()
    data["counselor"] = case.counselor.to_dict()
    if user.role != UserRole.STUDENT:
        audit("CASE_VIEWED", "case", case.id, user.id)
        db.session.commit()
    return jsonify(case=data)


@cases_bp.patch("/cases/<int:case_id>/status")
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN)
def change_case_status(case_id):
    case = db.session.get(CounselingCase, case_id)
    user = current_user()
    if not case:
        return error("Case not found.", 404, "not_found")
    if not can_access_case(user, case):
        return error("You are not assigned to this case.", 403, "forbidden")
    data, failure = json_body(["status"])
    if failure:
        return failure
    new_status, problem = enum_value(CaseStatus, data["status"], "status")
    if problem:
        return error(problem)
    if new_status not in CASE_TRANSITIONS[case.status]:
        return error(f"Invalid case transition: {case.status.value} → {new_status.value}.", 409, "invalid_transition")
    old_status = case.status
    case.status = new_status
    case.closed_at = datetime.now(timezone.utc) if new_status == CaseStatus.CLOSED else None
    audit("CASE_STATUS_CHANGED", "case", case.id, user.id, {"from": old_status.value, "to": new_status.value})
    db.session.commit()
    return jsonify(case=case.to_dict())


@cases_bp.post("/cases/<int:case_id>/notes")
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN)
def add_note(case_id):
    case = db.session.get(CounselingCase, case_id)
    user = current_user()
    if not case:
        return error("Case not found.", 404, "not_found")
    if not can_access_case(user, case):
        return error("You are not assigned to this case.", 403, "forbidden")
    if not user.counselor_profile:
        return error("Only counselor accounts may author progress notes.", 403, "forbidden")
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
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN)
def list_notes(case_id):
    case = db.session.get(CounselingCase, case_id)
    user = current_user()
    if not case:
        return error("Case not found.", 404, "not_found")
    if not can_access_case(user, case):
        return error("You are not assigned to this case.", 403, "forbidden")
    notes = db.session.scalars(db.select(ProgressNote).where(ProgressNote.case_id == case.id).order_by(ProgressNote.created_at.desc())).all()
    audit("PROGRESS_NOTES_VIEWED", "case", case.id, user.id, {"count": len(notes)})
    db.session.commit()
    return jsonify(items=[{
        "id": note.id,
        "case_id": note.case_id,
        "counselor_id": note.counselor_id,
        "note": decrypt_note(note.encrypted_note),
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
    } for note in notes])


@cases_bp.patch("/cases/<int:case_id>/notes/<int:note_id>")
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN)
def update_note(case_id, note_id):
    case = db.session.get(CounselingCase, case_id)
    note = db.session.get(ProgressNote, note_id)
    user = current_user()
    if not case or not note or note.case_id != case.id:
        return error("Progress note not found.", 404, "not_found")
    if not can_access_case(user, case):
        return error("You are not assigned to this case.", 403, "forbidden")
    if user.role == UserRole.COUNSELOR and note.counselor_id != user.counselor_profile.id:
        return error("You may only edit your own progress notes.", 403, "forbidden")
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
