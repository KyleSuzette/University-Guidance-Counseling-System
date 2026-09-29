from flask import Blueprint, jsonify, request

from ..enums import AppointmentStatus, UserRole
from ..extensions import db
from ..models import Appointment, CounselingCase, CounselorProfile, Room, StudentProfile
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
)

appointments_bp = Blueprint("appointments", __name__)
BLOCKING_STATUSES = [AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED]
STATUS_TRANSITIONS = {
    AppointmentStatus.REQUESTED: {AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED},
    AppointmentStatus.CONFIRMED: {
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
    },
    AppointmentStatus.COMPLETED: set(),
    AppointmentStatus.CANCELLED: set(),
    AppointmentStatus.NO_SHOW: set(),
}


def find_conflicts(student_id, counselor_id, room_id, starts_at, ends_at, exclude_id=None):
    stmt = db.select(Appointment).where(
        Appointment.status.in_(BLOCKING_STATUSES),
        Appointment.starts_at < ends_at,
        Appointment.ends_at > starts_at,
    )
    if exclude_id:
        stmt = stmt.where(Appointment.id != exclude_id)
    candidates = db.session.scalars(stmt).all()
    conflicts = []
    for item in candidates:
        reasons = []
        if item.student_id == student_id:
            reasons.append("student")
        if item.counselor_id == counselor_id:
            reasons.append("counselor")
        if room_id and item.room_id == room_id:
            reasons.append("room")
        if reasons:
            conflicts.append({"appointment_id": item.id, "resources": reasons})
    return conflicts


@appointments_bp.post("/appointments")
@roles_required(UserRole.STUDENT, UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN, UserRole.STAFF)
def create_appointment():
    data, failure = json_body(["student_id", "counselor_id", "starts_at", "ends_at", "purpose"])
    if failure:
        return failure
    user = current_user()
    student_id, problem = parse_positive_int(data["student_id"], "student_id")
    if problem:
        return error(problem)
    counselor_id, problem = parse_positive_int(data["counselor_id"], "counselor_id")
    if problem:
        return error(problem)
    room_id = None
    if data.get("room_id") not in (None, ""):
        room_id, problem = parse_positive_int(data["room_id"], "room_id")
        if problem:
            return error(problem)
    case_id = None
    if data.get("case_id") not in (None, ""):
        case_id, problem = parse_positive_int(data["case_id"], "case_id")
        if problem:
            return error(problem)
    if user.role == UserRole.STUDENT and student_id != user.student_profile.id:
        return error("Students may only request appointments for themselves.", 403, "forbidden")
    student = db.session.get(StudentProfile, student_id)
    counselor = db.session.get(CounselorProfile, counselor_id)
    room = db.session.get(Room, room_id) if room_id else None
    if not student or not student.user.is_active:
        return error("Active student not found.", 404, "not_found")
    if not counselor or not counselor.user.is_active:
        return error("Active counselor not found.", 404, "not_found")
    if room_id and (not room or not room.is_active):
        return error("Active room not found.", 404, "not_found")
    starts_at, start_error = parse_iso_datetime(data["starts_at"], "starts_at")
    ends_at, end_error = parse_iso_datetime(data["ends_at"], "ends_at")
    if start_error or end_error:
        return error(start_error or end_error)
    if ends_at <= starts_at:
        return error("ends_at must be later than starts_at.")
    if (ends_at - starts_at).total_seconds() > 4 * 3600:
        return error("An appointment cannot exceed 4 hours.")
    case = db.session.get(CounselingCase, case_id) if case_id else None
    if case_id and not case:
        return error("Case not found.", 404, "not_found")
    if case and (case.student_id != student.id or case.counselor_id != counselor.id):
        return error("The selected case does not match the student and counselor.", 409, "case_mismatch")
    purpose, problem = clean_text(data["purpose"], "purpose", min_length=3, max_length=250)
    if problem:
        return error(problem)
    conflicts = find_conflicts(student.id, counselor.id, room.id if room else None, starts_at, ends_at)
    if conflicts:
        return error("The requested time conflicts with an existing appointment.", 409, "schedule_conflict", {"conflicts": conflicts})
    appointment = Appointment(
        student_id=student.id,
        counselor_id=counselor.id,
        case_id=case.id if case else None,
        room_id=room.id if room else None,
        starts_at=starts_at,
        ends_at=ends_at,
        purpose=purpose,
        requested_by_user_id=user.id,
    )
    db.session.add(appointment)
    db.session.flush()
    audit("APPOINTMENT_REQUESTED", "appointment", appointment.id, user.id)
    db.session.commit()
    return jsonify(appointment=appointment.to_dict()), 201


@appointments_bp.get("/appointments")
@roles_required(UserRole.STUDENT, UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN, UserRole.STAFF)
def list_appointments():
    user = current_user()
    stmt = db.select(Appointment).order_by(Appointment.starts_at.desc())
    if user.role == UserRole.STUDENT:
        stmt = stmt.where(Appointment.student_id == user.student_profile.id)
    elif user.role == UserRole.COUNSELOR:
        stmt = stmt.where(Appointment.counselor_id == user.counselor_profile.id)
    status = request.args.get("status")
    if status:
        parsed, problem = enum_value(AppointmentStatus, status, "status")
        if problem:
            return error(problem)
        stmt = stmt.where(Appointment.status == parsed)
    return jsonify(paginated(stmt, lambda item: item.to_dict()))


@appointments_bp.patch("/appointments/<int:appointment_id>/status")
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN, UserRole.STAFF)
def update_appointment_status(appointment_id):
    appointment = db.session.get(Appointment, appointment_id)
    user = current_user()
    if not appointment:
        return error("Appointment not found.", 404, "not_found")
    if user.role == UserRole.COUNSELOR and appointment.counselor_id != user.counselor_profile.id:
        return error("You are not assigned to this appointment.", 403, "forbidden")
    data, failure = json_body(["status"])
    if failure:
        return failure
    status, problem = enum_value(AppointmentStatus, data["status"], "status")
    if problem:
        return error(problem)
    if status == appointment.status:
        return jsonify(appointment=appointment.to_dict())
    if status not in STATUS_TRANSITIONS[appointment.status]:
        return error(
            f"Invalid appointment transition: {appointment.status.value} → {status.value}.",
            409,
            "invalid_transition",
        )
    if status == AppointmentStatus.CONFIRMED:
        conflicts = find_conflicts(appointment.student_id, appointment.counselor_id, appointment.room_id, appointment.starts_at, appointment.ends_at, appointment.id)
        if conflicts:
            return error("Appointment cannot be confirmed because the time is no longer available.", 409, "schedule_conflict", {"conflicts": conflicts})
    cancellation_reason, problem = clean_text(
        data.get("cancellation_reason"),
        "cancellation_reason",
        max_length=250,
        required=False,
    )
    if problem:
        return error(problem)
    appointment.status = status
    appointment.cancellation_reason = cancellation_reason if status == AppointmentStatus.CANCELLED else None
    audit("APPOINTMENT_STATUS_CHANGED", "appointment", appointment.id, user.id, {"status": status.value})
    db.session.commit()
    return jsonify(appointment=appointment.to_dict())


@appointments_bp.patch("/appointments/<int:appointment_id>/cancel")
@roles_required(UserRole.STUDENT, UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN, UserRole.STAFF)
def cancel_appointment(appointment_id):
    appointment = db.session.get(Appointment, appointment_id)
    user = current_user()
    if not appointment:
        return error("Appointment not found.", 404, "not_found")
    permitted = user.role in {UserRole.HEAD_COUNSELOR, UserRole.ADMIN, UserRole.STAFF}
    permitted |= user.role == UserRole.STUDENT and appointment.student_id == user.student_profile.id
    permitted |= user.role == UserRole.COUNSELOR and appointment.counselor_id == user.counselor_profile.id
    if not permitted:
        return error("You cannot cancel this appointment.", 403, "forbidden")
    if appointment.status in {AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW}:
        return error("A finalized appointment cannot be cancelled.", 409, "invalid_transition")
    data, failure = json_body()
    if failure:
        return failure
    reason, problem = clean_text(data.get("reason"), "reason", max_length=250, required=False)
    if problem:
        return error(problem)
    appointment.status = AppointmentStatus.CANCELLED
    appointment.cancellation_reason = reason
    audit("APPOINTMENT_CANCELLED", "appointment", appointment.id, user.id)
    db.session.commit()
    return jsonify(appointment=appointment.to_dict())
