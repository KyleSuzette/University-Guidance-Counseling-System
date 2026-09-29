from app.extensions import db
from app.models import AuditLog, CounselorProfile, ProgressNote, StudentProfile


def test_health_and_student_registration(client):
    assert client.get("/api/v1/health").status_code == 200
    response = client.post("/api/v1/auth/register", json={
        "email": "new@test.local", "password": "StrongPass1!", "student_number": "S-99",
        "first_name": "New", "last_name": "Student", "program": "BS Test", "year_level": 2,
    })
    assert response.status_code == 201
    assert response.json["user"]["role"] == "student"


def test_frontend_pages_and_security_headers(client):
    page = client.get("/")
    assert page.status_code == 200
    assert b"anonymousReferralButton" in page.data
    assert page.headers["X-Content-Type-Options"] == "nosniff"
    assert page.headers["X-Frame-Options"] == "DENY"
    assert client.get("/referrals").status_code == 200
    assert client.get("/dashboard").status_code == 200


def test_anonymous_referral_has_no_actor_or_referrer_field(app, client):
    response = client.post("/api/v1/referrals/anonymous", json={
        "subject_name": "Student Concerned", "concern_category": "Wellbeing",
        "concern_details": "The student has appeared distressed for several days.",
    })
    assert response.status_code == 201
    with app.app_context():
        log = db.session.scalar(db.select(AuditLog).filter_by(action="ANONYMOUS_REFERRAL_CREATED"))
        assert log.actor_user_id is None
        assert "referrer" not in log.metadata_json if log.metadata_json else True


def test_student_cannot_access_referral_queue(client, auth):
    response = client.get("/api/v1/referrals", headers=auth("student"))
    assert response.status_code == 403


def create_case(client, auth):
    counselor = client.get("/api/v1/counselors", headers=auth("head")).json["items"][1]
    students = client.get("/api/v1/students", headers=auth("head")).json["items"]
    student = next(item for item in students if item["student_number"] == "S-1")
    response = client.post("/api/v1/cases", headers=auth("head"), json={
        "student_id": student["id"], "counselor_id": counselor["id"], "category": "Academic", "priority": "HIGH",
    })
    assert response.status_code == 201
    return response.json["case"], student, counselor


def test_case_lifecycle_and_encrypted_notes(app, client, auth):
    case, _student, _counselor = create_case(client, auth)
    counselor_headers = auth("counselor")
    result = client.patch(f"/api/v1/cases/{case['id']}/status", headers=counselor_headers, json={"status": "ACTIVE"})
    assert result.status_code == 200
    note = client.post(f"/api/v1/cases/{case['id']}/notes", headers=counselor_headers, json={"note": "Private counseling note."})
    assert note.status_code == 201
    with app.app_context():
        stored = db.session.scalar(db.select(ProgressNote))
        assert b"Private counseling note" not in stored.encrypted_note
    listed = client.get(f"/api/v1/cases/{case['id']}/notes", headers=counselor_headers)
    assert listed.json["items"][0]["note"] == "Private counseling note."
    assert client.patch(f"/api/v1/cases/{case['id']}/status", headers=counselor_headers, json={"status": "INTAKE"}).status_code == 409


def test_appointment_double_booking_is_rejected(client, auth):
    case, student, counselor = create_case(client, auth)
    headers = auth("student")
    base = {
        "student_id": student["id"], "counselor_id": counselor["id"], "case_id": case["id"], "room_id": 1,
        "starts_at": "2027-01-10T09:00:00Z", "ends_at": "2027-01-10T10:00:00Z", "purpose": "Intake",
    }
    assert client.post("/api/v1/appointments", headers=headers, json=base).status_code == 201
    overlap = {**base, "starts_at": "2027-01-10T09:30:00Z", "ends_at": "2027-01-10T10:30:00Z"}
    response = client.post("/api/v1/appointments", headers=headers, json=overlap)
    assert response.status_code == 409
    assert response.json["error"] == "schedule_conflict"


def test_pdf_appointment_report(client, auth):
    case, student, counselor = create_case(client, auth)
    response = client.post("/api/v1/appointments", headers=auth("student"), json={
        "student_id": student["id"], "counselor_id": counselor["id"], "case_id": case["id"], "room_id": 1,
        "starts_at": "2027-02-10T09:00:00Z", "ends_at": "2027-02-10T10:00:00Z", "purpose": "Intake",
    })
    report = client.get(f"/api/v1/reports/appointments/{response.json['appointment']['id']}/confirmation.pdf", headers=auth("student"))
    assert report.status_code == 200
    assert report.mimetype == "application/pdf"
    assert report.data.startswith(b"%PDF")


def test_exit_questionnaire_clearance_and_certificate(client, auth):
    form = client.get("/api/v1/exit-questionnaires/active", headers=auth("student")).json["questionnaire"]
    question_id = form["questions"][0]["id"]
    submitted = client.post(
        f"/api/v1/exit-questionnaires/{form['id']}/submit",
        headers=auth("student"),
        json={"responses": [{"question_id": question_id, "answer": "Everything completed."}]},
    )
    assert submitted.status_code == 200
    requested = client.post(
        "/api/v1/clearances",
        headers=auth("student"),
        json={"academic_year": "2026-2027"},
    )
    assert requested.status_code == 201
    clearance_id = requested.json["clearance"]["id"]
    approved = client.patch(
        f"/api/v1/clearances/{clearance_id}/evaluate",
        headers=auth("head"),
        json={"approve": True, "exit_interview_completed": True},
    )
    assert approved.status_code == 200
    assert approved.json["clearance"]["status"] == "CLEARED"
    report = client.get(
        f"/api/v1/reports/clearances/{clearance_id}/certificate.pdf",
        headers=auth("student"),
    )
    assert report.status_code == 200
    assert report.data.startswith(b"%PDF")
