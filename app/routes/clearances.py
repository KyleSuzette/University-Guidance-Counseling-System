from datetime import datetime, timezone
from flask import Blueprint, jsonify
from ..enums import (
    CaseStatus,
    ClearanceAccessStatus,
    ClearanceStatus,
    ExitReviewStatus,
    UserRole,
)
from ..extensions import db
from ..models import Clearance, CounselingCase, ExitSubmission, StudentProfile
from ..utils import (
    audit,
    clean_text,
    current_user,
    error,
    json_body,
    parse_boolean,
    parse_positive_int,
    roles_required,
    tracking_code,
)
clearances_bp = Blueprint("clearances", __name__)
def eligibility(student_id, clearance_id):
    # Only an approved submission linked to this exact
    # clearance request can satisfy the exit requirement.
    approved_exit = db.session.scalar(
        db.select(ExitSubmission).where(
            ExitSubmission.student_id == student_id,
            ExitSubmission.clearance_id == clearance_id,
            ExitSubmission.completed.is_(True),
            ExitSubmission.review_status == ExitReviewStatus.APPROVED,
        ).limit(1)
    ) is not None
    open_case = db.session.scalar(
        db.select(CounselingCase).where(
            CounselingCase.student_id == student_id,
            CounselingCase.status != CaseStatus.CLOSED,
        ).limit(1)
    )
    return approved_exit, open_case is None
@clearances_bp.post("/clearances")
@roles_required(
    UserRole.STUDENT,
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN,
    UserRole.STAFF,
    UserRole.COUNSELOR,
)
def create_clearance_request():
    data, failure = json_body(["academic_year"])
    if failure:
        return failure
    user = current_user()
    if user.role == UserRole.STUDENT:
        if not user.student_profile:
            return error(
                "Student profile not found.",
                404,
                "student_profile_not_found"
            )
        student_id = user.student_profile.id
    else:
        student_id = data.get("student_id")
    student_id, problem = parse_positive_int(student_id, "student_id")
    if problem:
        return error(problem)
    student = db.session.get(StudentProfile, student_id)
    if not student or not student.user.is_active:
        return error(
            "Active student not found.",
            404,
            "not_found"
        )
    academic_year, problem = clean_text(
        data["academic_year"], "academic_year", max_length=20
    )
    if problem:
        return error(problem)
    existing = db.session.scalar(
        db.select(Clearance).where(
            Clearance.student_id == student_id,
            Clearance.academic_year == academic_year
        ).limit(1)
    )
    if existing:
        return error(
            "A clearance record already exists for this academic year.",
            409,
            "duplicate_clearance"
        )
    # A newly requested clearance has no approved submission yet.
    exit_done = False
    _, counseling_done = eligibility(student_id, None)
    clearance = Clearance(
        student_id=student_id,
        academic_year=academic_year,
        exit_questionnaire_completed=exit_done,
        counseling_requirements_completed=counseling_done,
        exit_interview_completed=False,
        status=ClearanceStatus.NOT_CLEARED,
    )
    db.session.add(clearance)
    db.session.flush()
    audit(
        "CLEARANCE_REQUESTED",
        "clearance",
        clearance.id,
        user.id,
        {
            "student_id": student_id,
            "academic_year": academic_year,
        }
    )
    db.session.commit()
    return jsonify(clearance=clearance.to_dict()), 201
@clearances_bp.get("/clearances/me")
@roles_required(UserRole.STUDENT)
def own_clearances():
    user = current_user()
    if not user.student_profile:
        return error(
            "Student profile not found.",
            404,
            "student_profile_not_found"
        )
    items = db.session.scalars(
        db.select(Clearance).where(
            Clearance.student_id == user.student_profile.id
        ).order_by(
            Clearance.created_at.desc()
        )
    ).all()
    return jsonify(items=[item.to_dict() for item in items])
@clearances_bp.get("/clearances")
@roles_required(
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN,
    UserRole.STAFF,
    UserRole.COUNSELOR,
)
def list_clearances():
    items = db.session.scalars(
        db.select(Clearance).order_by(
            Clearance.created_at.desc()
        )
    ).all()
    return jsonify(items=[item.to_dict() for item in items])
@clearances_bp.patch("/clearances/<int:clearance_id>/evaluate")
@roles_required(
    UserRole.STAFF,
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
)
def evaluate_clearance(clearance_id):
    clearance = db.session.scalar(
        db.select(Clearance)
        .where(Clearance.id == clearance_id)
        .with_for_update()
    )
    if not clearance:
        return error(
            "Clearance record not found.",
            404,
            "not_found"
        )
    # Finalized clearances cannot be changed through
    # the normal evaluation workflow.
    if clearance.status == ClearanceStatus.CLEARED:
        return error(
            "This clearance has already been finalized "
            "and cannot be modified.",
            409,
            "clearance_finalized",
        )
    data, failure = json_body()
    if failure:
        return failure
    user = current_user()
    exit_done, counseling_done = eligibility(
    clearance.student_id,
    clearance.id,
)
    clearance.exit_questionnaire_completed = exit_done
    clearance.counseling_requirements_completed = counseling_done
    if "exit_interview_completed" in data:
        interview_value, problem = parse_boolean(
            data.get("exit_interview_completed"),
            "exit_interview_completed",
        )
        if problem:
            return error(problem)
        clearance.exit_interview_completed = interview_value
    if "remarks" in data:
        remarks, problem = clean_text(
            data.get("remarks"),
            "remarks",
            max_length=500,
            required=False,
        )
        if problem:
            return error(problem)
        clearance.remarks = remarks
    if "approve" in data:
        approve, problem = parse_boolean(data.get("approve"), "approve")
        if problem:
            return error(problem)
    else:
        approve = False
    if approve:
        if clearance.workflow_version != 2:
            return error("Historical clearance cannot use the new approval workflow.", 409, "historical_clearance")
        if clearance.access_status != ClearanceAccessStatus.APPROVED:
            return error(
                "Clearance access must be approved first.",
                409,
                "clearance_access_not_approved",
            )
        if not (
            exit_done
            and counseling_done
            and clearance.exit_interview_completed
        ):
            return error(
                "Clearance cannot be approved until all requirements are complete.",
                409,
                "requirements_incomplete",
                {
                    "exit_questionnaire_completed": exit_done,
                    "counseling_requirements_completed": counseling_done,
                    "exit_interview_completed": clearance.exit_interview_completed,
                }
            )
        clearance.status = ClearanceStatus.CLEARED
        clearance.approved_by_user_id = user.id
        clearance.approved_at = datetime.now(timezone.utc)
        clearance.certificate_number = (
            clearance.certificate_number
            or tracking_code("CLR")
        )
    audit(
        "CLEARANCE_EVALUATED",
        "clearance",
        clearance.id,
        user.id,
        {
            "status": clearance.status.value,
            "exit_questionnaire_completed": clearance.exit_questionnaire_completed,
            "counseling_requirements_completed": clearance.counseling_requirements_completed,
            "exit_interview_completed": clearance.exit_interview_completed,
        }
    )
    db.session.commit()
    return jsonify(clearance=clearance.to_dict())
@clearances_bp.patch("/clearances/<int:clearance_id>/access")
@roles_required(
    UserRole.STAFF,
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
)
def review_clearance_access(clearance_id):
    clearance = db.session.scalar(
        db.select(Clearance)
        .where(Clearance.id == clearance_id)
        .with_for_update()
    )
    if not clearance:
        return error(
            "Clearance request not found.",
            404,
            "not_found",
        )
    if clearance.workflow_version != 2 or clearance.status == ClearanceStatus.CLEARED:
        return error("This clearance is not open for access review.", 409, "clearance_finalized")
    if not clearance.student.user.is_active:
        return error("The student account is inactive.", 409, "student_inactive")

    if clearance.access_status != ClearanceAccessStatus.PENDING:
        return error(
            "This clearance access request has already been reviewed.",
            409,
            "already_reviewed",
        )
    data, failure = json_body(["approve"])
    if failure:
        return failure
    approve, problem = parse_boolean(data["approve"], "approve")
    if problem:
        return error(problem)
    remarks, problem = clean_text(
        data.get("remarks"),
        "remarks",
        max_length=500,
        required=False,
    )
    if problem:
        return error(problem)
    user = current_user()
    clearance.access_status = (
        ClearanceAccessStatus.APPROVED
        if approve
        else ClearanceAccessStatus.REJECTED
    )
    clearance.access_reviewed_by_user_id = user.id
    clearance.access_reviewed_at = datetime.now(timezone.utc)
    clearance.access_review_remarks = remarks
    audit(
        "CLEARANCE_ACCESS_REVIEWED",
        "clearance",
        clearance.id,
        user.id,
        {
            "decision": clearance.access_status.value,
            "remarks": remarks,
            "student_id": clearance.student_id,
            "academic_year": clearance.academic_year,
        },
    )
    db.session.commit()
    return jsonify(clearance=clearance.to_dict())
@clearances_bp.post("/clearances/<int:clearance_id>/resubmit-access")
@roles_required(UserRole.STUDENT)
def resubmit_clearance_access(clearance_id):
    user = current_user()
    if not user.student_profile:
        return error(
            "Student profile not found.",
            404,
            "student_profile_not_found",
        )
    clearance = db.session.get(Clearance, clearance_id)
    if not clearance:
        return error(
            "Clearance request not found.",
            404,
            "not_found",
        )
    # Students may resubmit only their own requests.
    if clearance.student_id != user.student_profile.id:
        return error(
            "You cannot resubmit another student's clearance request.",
            403,
            "forbidden",
        )
    if clearance.workflow_version != 2:
        return error(
            "Historical clearance records cannot be resubmitted.",
            409,
            "historical_clearance",
        )
    if clearance.status == ClearanceStatus.CLEARED:
        return error(
            "This clearance has already been finalized.",
            409,
            "clearance_finalized",
        )
    if clearance.access_status != ClearanceAccessStatus.REJECTED:
        return error(
            "Only rejected clearance access requests can be resubmitted.",
            409,
            "access_not_rejected",
        )
    clearance.access_status = ClearanceAccessStatus.PENDING
    clearance.access_reviewed_by_user_id = None
    clearance.access_reviewed_at = None
    clearance.access_review_remarks = None
    audit(
        "CLEARANCE_ACCESS_RESUBMITTED",
        "clearance",
        clearance.id,
        user.id,
        {
            "student_id": clearance.student_id,
            "academic_year": clearance.academic_year,
        },
    )
    db.session.commit()
    return jsonify(
        message="Clearance access request resubmitted successfully.",
        clearance=clearance.to_dict(),
    )
