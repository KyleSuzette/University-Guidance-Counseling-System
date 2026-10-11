from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from ..enums import UserRole, ClearanceAccessStatus, ExitReviewStatus,ClearanceStatus
from ..extensions import db
from ..models import ExitQuestion, ExitQuestionnaire, ExitResponse, ExitSubmission, StudentProfile, Clearance
from ..utils import audit, clean_text, current_user, error, json_body, parse_boolean, roles_required
exit_bp = Blueprint("exit", __name__)
def form_dict(form):
    return {
        "id": form.id,
        "title": form.title,
        "is_active": form.is_active,
        "questions": [{
            "id": question.id,
            "prompt": question.prompt,
            "field_type": question.field_type,
            "is_required": question.is_required,
            "position": question.position,
        } for question in form.questions],
    }
def _student_clearance(user, requested_id=None):
    """Return (clearance, failure); reject ambiguous unscoped multi-year access."""
    if not user.student_profile:
        return None, error("Student profile not found.", 404, "student_profile_not_found")

    query = db.select(Clearance).where(
        Clearance.student_id == user.student_profile.id,
        Clearance.workflow_version == 2,
    )
    if requested_id is not None:
        try:
            requested_id = int(requested_id)
        except (TypeError, ValueError):
            return None, error("clearance_id must be an integer.", 400, "invalid_clearance_id")
        if requested_id <= 0:
            return None, error("clearance_id must be positive.", 400, "invalid_clearance_id")
        query = query.where(Clearance.id == requested_id)
        clearance = db.session.scalar(query)
        if not clearance:
            return None, error("Clearance request not found.", 404, "clearance_not_found")
        return clearance, None

    candidates = db.session.scalars(
        query.order_by(Clearance.created_at.desc(), Clearance.id.desc()).limit(2)
    ).all()
    if not candidates:
        return None, error("Please request clearance access first.", 403, "clearance_access_required")
    if len(candidates) > 1:
        return None, error(
            "Select an academic-year clearance using clearance_id.",
            400, "clearance_selection_required",
        )
    return candidates[0], None

@exit_bp.post("/exit-questionnaires/start")
@roles_required(UserRole.STUDENT)
def start_exit_questionnaire():
    user = current_user()

    if not user.student_profile:
        return error(
            "Student profile not found.",
            404,
            "student_profile_not_found",
        )

    data, failure = json_body()
    if failure:
        return failure

    clearance, failure = _student_clearance(
        user, data.get("clearance_id")
    )
    if failure:
        return failure

    # Lock this clearance during version assignment.
    clearance = db.session.scalar(
        db.select(Clearance)
        .where(Clearance.id == clearance.id)
        .with_for_update()
    )

    if clearance.workflow_version != 2:
        return error("Historical clearance.", 409, "historical_clearance")

    if clearance.status == ClearanceStatus.CLEARED:
        return error(
            "Clearance already finalized.",
            409,
            "clearance_finalized",
        )

    if clearance.access_status != ClearanceAccessStatus.APPROVED:
        return error(
            "Clearance access must be approved first.",
            403,
            "clearance_access_not_approved",
        )

    # Reuse the questionnaire previously assigned to this clearance.
    submission = db.session.scalar(
        db.select(ExitSubmission)
        .where(
            ExitSubmission.clearance_id == clearance.id,
            ExitSubmission.student_id == user.student_profile.id,
        )
        .order_by(ExitSubmission.id.asc())
        .limit(1)
    )

    if submission:
        questionnaire = db.session.get(
            ExitQuestionnaire,
            submission.questionnaire_id,
        )
        if not questionnaire:
            return error(
                "The assigned questionnaire is missing.",
                409,
                "assigned_questionnaire_missing",
            )

    else:
        # A Student without an assigned version receives the
        # current questionnaire.
        questionnaire = db.session.scalar(
            db.select(ExitQuestionnaire)
            .where(ExitQuestionnaire.is_active.is_(True))
            .order_by(ExitQuestionnaire.id.desc())
            .limit(1)
        )

        if not questionnaire:
            return error(
                "No active questionnaire is available.",
                404,
                "not_found",
            )

        # Reserve the questionnaire version before answers are submitted.
        submission = ExitSubmission(
            questionnaire_id=questionnaire.id,
            clearance_id=clearance.id,
            student_id=user.student_profile.id,
            completed=False,
            review_status=ExitReviewStatus.PENDING,
        )

        db.session.add(submission)
        db.session.flush()

        audit(
            "EXIT_QUESTIONNAIRE_ASSIGNED",
            "exit_submission",
            submission.id,
            user.id,
            {
                "clearance_id": clearance.id,
                "questionnaire_id": questionnaire.id,
            },
        )

    result = {
        "questionnaire": form_dict(questionnaire),
        "submission_id": submission.id,
        "completed": submission.completed,
        "review_status": (
            submission.review_status.value
            if submission.completed
            else "NOT_SUBMITTED"
        ),
    }

    db.session.commit()
    return jsonify(result)

@exit_bp.get("/exit-questionnaires/active")
@roles_required(
    UserRole.STUDENT,
    UserRole.ADMIN,
    UserRole.STAFF,
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
)
def active_questionnaire():
    user = current_user()
    # Students must have approved clearance access.
    if user.role == UserRole.STUDENT:
        if not user.student_profile:
            return error(
                "Student profile not found.",
                404,
                "student_profile_not_found",
            )
        clearance, failure = _student_clearance(user, request.args.get("clearance_id"))
        if failure:
            return failure
        if clearance.status == ClearanceStatus.CLEARED:
            return error("This clearance has already been finalized.", 409, "clearance_finalized")

        if clearance.access_status != ClearanceAccessStatus.APPROVED:
            return error(
                "Your clearance access request must be approved before "
                "you can answer the Exit Questionnaire.",
                403,
                "clearance_access_not_approved",
            )
    form = db.session.scalar(
        db.select(ExitQuestionnaire)
        .filter_by(is_active=True)
        .order_by(ExitQuestionnaire.id.desc())
    )
    if not form:
        return error(
            "No active exit questionnaire is configured.",
            404,
            "not_found",
        )
    return jsonify(questionnaire=form_dict(form))
@exit_bp.post("/exit-questionnaires")
@roles_required(UserRole.ADMIN, UserRole.HEAD_COUNSELOR, UserRole.COUNSELOR,UserRole.STAFF,)
def create_questionnaire():
    data, failure = json_body(["title", "questions"])
    if failure:
        return failure
    title, problem = clean_text(data["title"], "title", max_length=200)
    if problem:
        return error(problem)
    if not isinstance(data["questions"], list) or not data["questions"]:
        return error("questions must be a non-empty array.")
    if len(data["questions"]) > 100:
        return error("questions must not contain more than 100 items.")
    validated_questions = []
    for index, item in enumerate(data["questions"]):
        if not isinstance(item, dict):
            return error(f"Question {index + 1} requires a prompt.")
        prompt, problem = clean_text(
            item.get("prompt"), f"questions[{index}].prompt", max_length=500
        )
        if problem:
            return error(problem)
        field_type, problem = clean_text(
            item.get("field_type", "text"),
            f"questions[{index}].field_type",
            max_length=30,
        )
        if problem:
            return error(problem)
        if field_type not in {"text", "textarea"}:
            return error(
                f"questions[{index}].field_type must be text or textarea."
            )
        is_required, problem = parse_boolean(
            item.get("is_required", True), f"questions[{index}].is_required"
        )
        if problem:
            return error(problem)
        validated_questions.append((prompt, field_type, is_required))
    for existing in db.session.scalars(db.select(ExitQuestionnaire).filter_by(is_active=True)):
        existing.is_active = False
    form = ExitQuestionnaire(title=title, is_active=True)
    db.session.add(form)
    db.session.flush()
    for index, (prompt, field_type, is_required) in enumerate(validated_questions):
        db.session.add(ExitQuestion(
            questionnaire_id=form.id,
            prompt=prompt,
            field_type=field_type,
            is_required=is_required,
            position=index + 1,
        ))
    user = current_user()
    audit("EXIT_QUESTIONNAIRE_CREATED", "exit_questionnaire", form.id, user.id)
    db.session.commit()
    return jsonify(questionnaire=form_dict(form)), 201
@exit_bp.post("/exit-questionnaires/<int:questionnaire_id>/submit")
@roles_required(UserRole.STUDENT)
def submit_questionnaire(questionnaire_id):
    form = db.session.get(ExitQuestionnaire, questionnaire_id)
    user = current_user()
    if not user.student_profile:
        return error(
            "Student profile not found.",
            404,
            "student_profile_not_found",
        )
    data, failure = json_body(["responses"])
    if failure:
        return failure
    clearance, failure = _student_clearance(user, data.get("clearance_id"))
    if failure:
        return failure

    if clearance.access_status != ClearanceAccessStatus.APPROVED:
        return error(
            "Your clearance access request must be approved "
            "before you can submit the Exit Questionnaire.",
            403,
            "clearance_access_not_approved",
        )
    if not form:
        return error("Questionnaire not found.", 404, "not_found")
    
    if not form.is_active:
        # Inactive questionnaire versions remain valid for
        # students who were previously assigned to them.
        assigned = db.session.scalar(
            db.select(ExitSubmission)
            .where(
                ExitSubmission.questionnaire_id == form.id,
                ExitSubmission.clearance_id == clearance.id,
                ExitSubmission.student_id == user.student_profile.id,
            )
            .limit(1)
        )

        if not assigned:
            return error(
                "This questionnaire version is no longer available "
                "for new submissions.",
                409,
                "questionnaire_inactive",
            )
    if not isinstance(data["responses"], list):
        return error("responses must be an array of question_id and answer objects.")
    answers = {}
    for item in data["responses"]:
        if not isinstance(item, dict):
            return error("Every response must be an object.")
        try:
            question_id = int(item["question_id"])
        except (KeyError, TypeError, ValueError):
            return error("Every response requires a numeric question_id and an answer.")
        answer = item.get("answer", "")
        if not isinstance(answer, str):
            return error("Every answer must be text.")
        answer = answer.strip()
        if len(answer) > 10000:
            return error("An answer must not exceed 10000 characters.")
        answers[question_id] = answer
    valid_ids = {question.id for question in form.questions}
    if not set(answers).issubset(valid_ids):
        return error("One or more responses do not belong to this questionnaire.")
    missing = [question.id for question in form.questions if question.is_required and not answers.get(question.id)]
    if missing:
        return error("All required questions must be answered.", details={"missing_question_ids": missing})
    # A finalized clearance must not be modified.
    if clearance.status == ClearanceStatus.CLEARED:
        return error(
            "This clearance is already finalized.",
            409,
            "clearance_finalized",
        )
    # Prevent creating another submission on a different form for this clearance.
    other_form = db.session.scalar(
        db.select(ExitSubmission.id).where(
            ExitSubmission.clearance_id == clearance.id,
            ExitSubmission.questionnaire_id != form.id,
        ).limit(1)
    )
    if other_form is not None:
        return error(
            "A different questionnaire is already associated with this clearance.",
            409, "clearance_questionnaire_exists",
        )

    # Find the submission for this specific clearance request.
    submission = db.session.scalar(
        db.select(ExitSubmission).where(
            ExitSubmission.questionnaire_id == form.id,
            ExitSubmission.clearance_id == clearance.id,
            ExitSubmission.student_id == user.student_profile.id,
        )
    )
    if submission:
    # An assigned but incomplete questionnaire can be
    # submitted for the first time.
    # Completed questionnaires can be corrected only
    # when the reviewer returns them.
        if (
        submission.completed
        and submission.review_status != ExitReviewStatus.RETURNED
    ):
            return error(
                "This questionnaire is awaiting review or has "
                "already been approved. Changes are not allowed.",
                409,
                "submission_not_editable",
            )
        # Replace answers only for a returned submission.
        db.session.execute(
            db.delete(ExitResponse).where(
                ExitResponse.submission_id == submission.id
            )
        )
    else:
        submission = ExitSubmission(
            questionnaire_id=form.id,
            student_id=user.student_profile.id,
            clearance_id=clearance.id,
        )
        db.session.add(submission)
        db.session.flush()
    for question_id, answer in answers.items():
        db.session.add(ExitResponse(submission_id=submission.id, question_id=question_id, answer=answer))
    submission.completed = True
    submission.submitted_at = datetime.now(timezone.utc)
    # Every submission or resubmission requires a new review.
    submission.review_status = ExitReviewStatus.PENDING
    submission.reviewed_by_user_id = None
    submission.reviewed_at = None
    submission.review_remarks = None
    audit(
        "EXIT_QUESTIONNAIRE_SUBMITTED",
        "exit_submission",
        submission.id,
        user.id,
    )
    db.session.commit()
    return jsonify(message="Exit questionnaire submitted.", submission_id=submission.id, completed=True)
@exit_bp.get("/exit-submissions/<int:student_id>")
@roles_required(
    UserRole.STAFF,
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
)
def get_student_submissions(student_id):
    if not db.session.get(StudentProfile, student_id):
        return error("Student not found.", 404, "not_found")
    submissions = db.session.scalars(db.select(ExitSubmission).where(ExitSubmission.student_id == student_id).order_by(ExitSubmission.submitted_at.desc())).all()
    return jsonify(items=[{
        "id": item.id,
        "questionnaire_id": item.questionnaire_id,
        "clearance_id": item.clearance_id,
        "completed": item.completed,
        "review_status": (
            item.review_status.value
            if item.completed
            else "NOT_SUBMITTED"
        ),
        "submitted_at": item.submitted_at.isoformat() if item.submitted_at else None,
    } for item in submissions])
@exit_bp.get("/exit-submissions/<int:submission_id>/review")
@roles_required(
    UserRole.STAFF,
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
)
def view_exit_submission_review(submission_id):
    submission = db.session.get(ExitSubmission, submission_id)
    if not submission:
        return error(
            "Exit questionnaire submission not found.",
            404,
            "not_found",
        )
    if not submission.completed:
        return error(
            "This questionnaire has not been submitted yet.",
            409,
            "submission_incomplete",
        )
    if submission.clearance_id is None:
        return error(
            "This historical submission is not linked to a "
            "clearance request and cannot enter the new review workflow.",
            409,
            "clearance_link_missing",
        )
    clearance = db.session.get(Clearance, submission.clearance_id)
    if not clearance or clearance.student_id != submission.student_id:
        return error(
            "The submission is not linked to a valid Student "
            "clearance request.",
            409,
            "invalid_clearance_link",
        )
    if clearance.access_status != ClearanceAccessStatus.APPROVED:
        return error(
            "Clearance access has not been approved.",
            409,
            "clearance_access_not_approved",
        )
    responses = db.session.scalars(
        db.select(ExitResponse)
        .where(ExitResponse.submission_id == submission.id)
    ).all()
    answers = []
    for response in responses:
        question = db.session.get(ExitQuestion, response.question_id)
        if not question or question.questionnaire_id != submission.questionnaire_id:
            return error(
                "The submission contains an invalid question reference.",
                409,
                "invalid_question_reference",
            )
        answers.append({
            "question_id": question.id,
            "position": question.position,
            "prompt": question.prompt,
            "answer": response.answer,
        })
    answers.sort(key=lambda item: item["position"])
    user = current_user()
    audit(
        "EXIT_SUBMISSION_VIEWED_FOR_REVIEW",
        "exit_submission",
        submission.id,
        user.id,
        {
            "clearance_id": clearance.id,
        },
    )
    db.session.commit()
    return jsonify(
        submission={
            "id": submission.id,
            "student_id": submission.student_id,
            "questionnaire_id": submission.questionnaire_id,
            "clearance_id": clearance.id,
            "academic_year": clearance.academic_year,
            "completed": submission.completed,
            "submitted_at": (
                submission.submitted_at.isoformat()
                if submission.submitted_at
                else None
            ),
            "review_status": submission.review_status.value,
            "reviewed_by_user_id": submission.reviewed_by_user_id,
            "reviewed_at": (
                submission.reviewed_at.isoformat()
                if submission.reviewed_at
                else None
            ),
            "review_remarks": submission.review_remarks,
            "answers": answers,
        }
    )
@exit_bp.patch("/exit-submissions/<int:submission_id>/evaluate")
@roles_required(
    UserRole.STAFF,
    UserRole.COUNSELOR,
    UserRole.HEAD_COUNSELOR,
)
def evaluate_exit_submission(submission_id):
    submission = db.session.scalar(
        db.select(ExitSubmission).where(ExitSubmission.id == submission_id).with_for_update()
    )
    if not submission:
        return error(
            "Exit questionnaire submission not found.",
            404,
            "not_found",
        )
    if not submission.completed:
        return error(
            "The questionnaire has not been submitted.",
            409,
            "submission_incomplete",
        )
    if submission.clearance_id is None:
        return error(
            "This submission is not linked to a clearance request.",
            409,
            "clearance_link_missing",
        )
    clearance = db.session.get(Clearance, submission.clearance_id)
    if not clearance or clearance.student_id != submission.student_id:
        return error(
            "Invalid clearance association.",
            409,
            "invalid_clearance_link",
        )
    if clearance.access_status != ClearanceAccessStatus.APPROVED:
        return error(
            "Clearance access has not been approved.",
            409,
            "clearance_access_not_approved",
        )
    if clearance.status == ClearanceStatus.CLEARED:
        return error(
            "This clearance has already been finalized.",
            409,
            "clearance_finalized",
        )
    if not db.session.scalar(
        db.select(ExitResponse.id).where(ExitResponse.submission_id == submission.id).limit(1)
    ):
        return error("The submission has no answers to review.", 409, "answers_missing")

    if submission.review_status != ExitReviewStatus.PENDING:
        return error(
            "This submission has already been reviewed. "
            "Only a newly resubmitted questionnaire can be reviewed again.",
            409,
            "submission_already_reviewed",
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
    if not approve and not remarks:
        return error(
            "Remarks are required when returning a questionnaire.",
            400,
            "review_remarks_required",
        )
    user = current_user()
    submission.review_status = (
        ExitReviewStatus.APPROVED
        if approve
        else ExitReviewStatus.RETURNED
    )
    submission.reviewed_by_user_id = user.id
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.review_remarks = remarks
    
    # Synchronize questionnaire review with this clearance.
    # Approval completes the requirement; return makes it pending.
    # This does not approve the overall clearance.
    clearance.exit_questionnaire_completed = (
        submission.review_status == ExitReviewStatus.APPROVED
    )

    audit(
        "EXIT_SUBMISSION_REVIEWED",
        "exit_submission",
        submission.id,
        user.id,
        {
            "decision": submission.review_status.value,
            "remarks": remarks,
            "clearance_id": clearance.id,
            "student_id": submission.student_id,
        },
    )
    db.session.commit()
    return jsonify(
        message="Exit questionnaire review recorded successfully.",
        submission_id=submission.id,
        clearance_id=clearance.id,
        review_status=submission.review_status.value,
        reviewed_by_user_id=submission.reviewed_by_user_id,
        reviewed_at=submission.reviewed_at.isoformat(),
        review_remarks=submission.review_remarks,
    )
@exit_bp.get("/exit-submissions/me")
@roles_required(UserRole.STUDENT)
def own_exit_submissions():
    user = current_user()
    if not user.student_profile:
        return error(
            "Student profile not found.",
            404,
            "student_profile_not_found",
        )
    submissions = db.session.scalars(
        db.select(ExitSubmission)
        .where(
            ExitSubmission.student_id == user.student_profile.id
        )
        .order_by(
            ExitSubmission.submitted_at.desc(),
            ExitSubmission.id.desc(),
        )
    ).all()
    return jsonify(
        items=[
            {
                "id": item.id,
                "questionnaire_id": item.questionnaire_id,
                "clearance_id": item.clearance_id,
                "completed": item.completed,
                "submitted_at": (
                    item.submitted_at.isoformat()
                    if item.submitted_at
                    else None
                ),
                "review_status": item.review_status.value,
                "reviewed_at": (
                    item.reviewed_at.isoformat()
                    if item.reviewed_at
                    else None
                ),
                "review_remarks": item.review_remarks,
            }
            for item in submissions
        ]
    )


@exit_bp.get("/exit-questionnaires")
@roles_required(UserRole.ADMIN, UserRole.STAFF, UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR)
def list_questionnaires():
    forms = db.session.scalars(
        db.select(ExitQuestionnaire).order_by(ExitQuestionnaire.id.desc())
    ).all()
    return jsonify(items=[form_dict(item) for item in forms])


@exit_bp.put("/exit-questionnaires/<int:questionnaire_id>")
@roles_required(UserRole.ADMIN, UserRole.STAFF, UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR)
def edit_questionnaire(questionnaire_id):
    """Publish an edited copy; never change questions used by previous submissions."""
    old = db.session.get(ExitQuestionnaire, questionnaire_id)
    if not old:
        return error("Questionnaire not found.", 404, "not_found")
    if not old.is_active:
        return error("Only the active questionnaire can be edited.", 409, "questionnaire_inactive")

    data, failure = json_body(["title", "questions"])
    if failure:
        return failure
    title, problem = clean_text(data["title"], "title", max_length=200)
    if problem:
        return error(problem)
    if not isinstance(data["questions"], list) or not (1 <= len(data["questions"]) <= 100):
        return error("questions must contain 1 to 100 items.")

    validated = []
    for i, item in enumerate(data["questions"]):
        if not isinstance(item, dict):
            return error(f"Question {i + 1} must be an object.")
        prompt, problem = clean_text(item.get("prompt"), f"questions[{i}].prompt", max_length=500)
        if problem:
            return error(problem)
        field_type, problem = clean_text(item.get("field_type", "text"), f"questions[{i}].field_type", max_length=30)
        if problem:
            return error(problem)
        if field_type not in {"text", "textarea"}:
            return error(f"questions[{i}].field_type must be text or textarea.")
        required, problem = parse_boolean(item.get("is_required", True), f"questions[{i}].is_required")
        if problem:
            return error(problem)
        validated.append((prompt, field_type, required))

    # Prevent racing publishers from silently overwriting the active form.
    locked = db.session.scalar(
        db.select(ExitQuestionnaire).where(ExitQuestionnaire.id == questionnaire_id).with_for_update()
    )
    if not locked.is_active:
        return error("This questionnaire is no longer active.", 409, "questionnaire_inactive")
    for form in db.session.scalars(
        db.select(ExitQuestionnaire).where(ExitQuestionnaire.is_active.is_(True)).with_for_update()
    ):
        form.is_active = False
    replacement = ExitQuestionnaire(title=title, is_active=True)
    db.session.add(replacement)
    db.session.flush()
    for i, (prompt, field_type, required) in enumerate(validated, start=1):
        db.session.add(ExitQuestion(
            questionnaire_id=replacement.id,
            prompt=prompt,
            field_type=field_type,
            is_required=required,
            position=i,
        ))
    audit("EXIT_QUESTIONNAIRE_REVISED", "exit_questionnaire", replacement.id, current_user().id,
          {"replaces_questionnaire_id": questionnaire_id})
    db.session.commit()
    return jsonify(message="Revised questionnaire published as a new version.",
                   replaces_questionnaire_id=questionnaire_id,
                   questionnaire=form_dict(replacement)), 201

@exit_bp.get("/exit-submissions/me/<int:submission_id>/answers")
@roles_required(UserRole.STUDENT)
def own_exit_submission_answers(submission_id):
    user = current_user()

    if not user.student_profile:
        return error("Student profile not found.", 404, "not_found")

    submission = db.session.get(ExitSubmission, submission_id)

    if (
        not submission
        or submission.student_id != user.student_profile.id
    ):
        return error("Submission not found.", 404, "not_found")

    answers = db.session.scalars(
        db.select(ExitResponse).where(
            ExitResponse.submission_id == submission.id
        )
    ).all()

    return jsonify(
        submission_id=submission.id,
        questionnaire_id=submission.questionnaire_id,
        completed=submission.completed,
        review_status=(
            submission.review_status.value
            if submission.completed
            else "NOT_SUBMITTED"
        ),
        responses=[
            {
                "question_id": item.question_id,
                "answer": item.answer,
            }
            for item in answers
        ],
    )
