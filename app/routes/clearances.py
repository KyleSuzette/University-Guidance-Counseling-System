from datetime import datetime, timezone

from flask import Blueprint, jsonify

from ..enums import CaseStatus, ClearanceStatus, UserRole
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


def eligibility(student_id):
    exit_completed = db.session.scalar(
        db.select(ExitSubmission).where(
            ExitSubmission.student_id == student_id,
            ExitSubmission.completed.is_(True)
        ).limit(1)
    ) is not None

    open_case = db.session.scalar(
        db.select(CounselingCase).where(
            CounselingCase.student_id == student_id,
            CounselingCase.status != CaseStatus.CLOSED
        ).limit(1)
    )

    return exit_completed, open_case is None


@clearances_bp.post("/clearances")
@roles_required(
    UserRole.STUDENT,
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN,
    UserRole.STAFF
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

    exit_done, counseling_done = eligibility(student_id)

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
    UserRole.STAFF
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
    UserRole.HEAD_COUNSELOR,
    UserRole.ADMIN,
    UserRole.STAFF
)
def evaluate_clearance(clearance_id):
    clearance = db.session.get(Clearance, clearance_id)

    if not clearance:
        return error(
            "Clearance record not found.",
            404,
            "not_found"
        )

    data, failure = json_body()
    if failure:
        return failure

    user = current_user()

    exit_done, counseling_done = eligibility(clearance.student_id)

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
