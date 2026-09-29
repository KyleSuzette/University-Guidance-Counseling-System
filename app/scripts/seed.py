from app import create_app
from app.enums import UserRole
from app.extensions import db
from app.models import CounselorProfile, ExitQuestion, ExitQuestionnaire, Room, StudentProfile, User


def ensure_user(email, password, role):
    user = db.session.scalar(db.select(User).filter_by(email=email))
    if not user:
        user = User(email=email, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.flush()
    return user


def seed():
    admin = ensure_user("admin@guidance.local", "ChangeMe123!", UserRole.ADMIN)
    head = ensure_user("head@guidance.local", "ChangeMe123!", UserRole.HEAD_COUNSELOR)
    counselor = ensure_user("counselor@guidance.local", "ChangeMe123!", UserRole.COUNSELOR)
    student = ensure_user("student@guidance.local", "ChangeMe123!", UserRole.STUDENT)

    if not head.counselor_profile:
        db.session.add(CounselorProfile(user_id=head.id, employee_number="HC-001", first_name="Morgan", last_name="Reyes", specialization="Student Welfare"))
    if not counselor.counselor_profile:
        db.session.add(CounselorProfile(user_id=counselor.id, employee_number="GC-001", first_name="Alex", last_name="Santos", specialization="Academic and Personal Counseling"))
    if not student.student_profile:
        db.session.add(StudentProfile(user_id=student.id, student_number="2026-0001", first_name="Jamie", last_name="Cruz", program="BS Medical Technology", year_level=3, contact_number="09170000000"))
    if not db.session.scalar(db.select(Room).filter_by(name="Guidance Room 1")):
        db.session.add(Room(name="Guidance Room 1", location="Student Services Building"))
    if not db.session.scalar(db.select(ExitQuestionnaire).filter_by(is_active=True)):
        form = ExitQuestionnaire(title="Student Exit Questionnaire", is_active=True)
        db.session.add(form)
        db.session.flush()
        prompts = [
            "What was your primary reason for leaving or graduating?",
            "How would you rate the guidance services you received?",
            "Do you have any unresolved concerns requiring follow-up?",
            "What improvements would you recommend for student support services?",
        ]
        for position, prompt in enumerate(prompts, 1):
            db.session.add(ExitQuestion(questionnaire_id=form.id, prompt=prompt, field_type="text", is_required=True, position=position))
    db.session.commit()
    print("Seed complete.")
    print("Demo password for all accounts: ChangeMe123!")
    print("Accounts: admin@guidance.local, head@guidance.local, counselor@guidance.local, student@guidance.local")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        seed()

