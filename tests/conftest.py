import pytest

from app import create_app
from app.enums import UserRole
from app.extensions import db
from app.models import CounselorProfile, ExitQuestion, ExitQuestionnaire, Room, StudentProfile, User


class TestConfig:
    TESTING = True
    SECRET_KEY = "test-secret-key-that-is-longer-than-thirty-two-bytes"
    JWT_SECRET_KEY = "test-jwt-secret-key-that-is-longer-than-thirty-two-bytes"
    NOTES_ENCRYPTION_KEY = ""
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    FRONTEND_ORIGINS = ["http://localhost"]


@pytest.fixture()
def app():
    app = create_app(TestConfig)
    with app.app_context():
        db.drop_all()
        db.create_all()
        users = {}
        for name, role in [
            ("admin", UserRole.ADMIN),
            ("head", UserRole.HEAD_COUNSELOR),
            ("counselor", UserRole.COUNSELOR),
            ("student", UserRole.STUDENT),
            ("student2", UserRole.STUDENT),
            ("staff", UserRole.STAFF),
        ]:
            user = User(email=f"{name}@test.local", role=role)
            user.set_password("Password1!")
            db.session.add(user)
            db.session.flush()
            users[name] = user
        for name, employee in [("head", "H-1"), ("counselor", "C-1")]:
            db.session.add(CounselorProfile(user_id=users[name].id, employee_number=employee, first_name=name.title(), last_name="Tester"))
        for name, number in [("student", "S-1"), ("student2", "S-2")]:
            db.session.add(StudentProfile(user_id=users[name].id, student_number=number, first_name=name.title(), last_name="Tester", program="BS Test", year_level=1))
        db.session.add(Room(name="Room A", location="Building 1"))
        form = ExitQuestionnaire(title="Exit", is_active=True)
        db.session.add(form)
        db.session.flush()
        db.session.add(ExitQuestion(questionnaire_id=form.id, prompt="Feedback?", position=1, is_required=True))
        db.session.commit()
    yield app
    with app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, name):
    response = client.post("/api/v1/auth/login", json={"email": f"{name}@test.local", "password": "Password1!"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json['access_token']}"}


@pytest.fixture()
def auth(client):
    return lambda name: login(client, name)
