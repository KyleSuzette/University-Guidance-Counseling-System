from datetime import datetime, timezone

from flask import Blueprint, jsonify

from ..enums import UserRole
from ..extensions import db
from ..models import ExitQuestion, ExitQuestionnaire, ExitResponse, ExitSubmission, StudentProfile
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


@exit_bp.get("/exit-questionnaires/active")
@roles_required(UserRole.STUDENT, UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN, UserRole.STAFF)
def active_questionnaire():
    form = db.session.scalar(db.select(ExitQuestionnaire).filter_by(is_active=True).order_by(ExitQuestionnaire.id.desc()))
    if not form:
        return error("No active exit questionnaire is configured.", 404, "not_found")
    return jsonify(questionnaire=form_dict(form))


@exit_bp.post("/exit-questionnaires")
@roles_required(UserRole.ADMIN, UserRole.HEAD_COUNSELOR)
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
    if not form or not form.is_active:
        return error("Active questionnaire not found.", 404, "not_found")
    data, failure = json_body(["responses"])
    if failure:
        return failure
    if not isinstance(data["responses"], list):
        return error("responses must be an array of question_id and answer objects.")
    answers = {}
    for item in data["responses"]:
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
    submission = db.session.scalar(db.select(ExitSubmission).filter_by(
        questionnaire_id=form.id, student_id=user.student_profile.id
    ))
    if not submission:
        submission = ExitSubmission(questionnaire_id=form.id, student_id=user.student_profile.id)
        db.session.add(submission)
        db.session.flush()
    else:
        db.session.execute(db.delete(ExitResponse).where(ExitResponse.submission_id == submission.id))
    for question_id, answer in answers.items():
        db.session.add(ExitResponse(submission_id=submission.id, question_id=question_id, answer=answer))
    submission.completed = True
    submission.submitted_at = datetime.now(timezone.utc)
    audit("EXIT_QUESTIONNAIRE_SUBMITTED", "exit_submission", submission.id, user.id)
    db.session.commit()
    return jsonify(message="Exit questionnaire submitted.", submission_id=submission.id, completed=True)


@exit_bp.get("/exit-submissions/<int:student_id>")
@roles_required(UserRole.HEAD_COUNSELOR, UserRole.ADMIN, UserRole.STAFF)
def get_student_submissions(student_id):
    if not db.session.get(StudentProfile, student_id):
        return error("Student not found.", 404, "not_found")
    submissions = db.session.scalars(db.select(ExitSubmission).where(ExitSubmission.student_id == student_id).order_by(ExitSubmission.submitted_at.desc())).all()
    return jsonify(items=[{
        "id": item.id,
        "questionnaire_id": item.questionnaire_id,
        "completed": item.completed,
        "submitted_at": item.submitted_at.isoformat() if item.submitted_at else None,
    } for item in submissions])
