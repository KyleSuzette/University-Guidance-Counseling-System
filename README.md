# University Guidance & Counseling Management System

An integrated Flask application for university guidance and counseling. It includes the REST API and the supplied server-rendered HTML/CSS/JavaScript client in one deployable project. The API remains available under `/api/v1` for future clients.

## Included

- JWT access and refresh authentication with server-side logout/revocation
- Student, counselor, head counselor, admin, and staff roles
- Student and counselor profiles
- Truly decoupled anonymous peer referral intake (no referrer account or request metadata stored)
- Referral triage, priority queue, and counselor assignment
- Enforced case lifecycle: `INTAKE → ACTIVE → FOLLOW_UP → CLOSED`
- Encrypted-at-rest progress notes with restricted access
- Appointment requests and overlapping-time conflict detection for student, counselor, and room
- Exit questionnaire creation and submission
- Clearance eligibility checks, approval, and certificate numbering
- Appointment, pseudonymized case-summary, and exit-clearance PDF outputs
- Confidentiality-safe audit logs
- Pagination, consistent JSON errors, CORS configuration, seed data, and automated tests
- Responsive browser pages for authentication, dashboard, appointments, referrals, cases, exit questionnaires, clearance, and administration

## Quick start on Windows (PowerShell)

You need Python 3.11 or newer.

```powershell
cd guidance_backend
py -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
.venv\Scripts\python.exe -m app.scripts.seed
.venv\Scripts\python.exe run.py
```

Using `.venv\Scripts\python.exe` directly avoids the PowerShell execution-policy error that can block `Activate.ps1`.

Open `http://127.0.0.1:5000/` for the web client. The API health check is available at `http://127.0.0.1:5000/api/v1/health` and returns:

```json
{"service":"guidance-backend","status":"ok"}
```

## Quick start on macOS/Linux

```bash
cd guidance_backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
cp .env.example .env
.venv/bin/python -m app.scripts.seed
.venv/bin/python run.py
```

## Demo accounts

The seed script creates these local-only accounts. All initially use `ChangeMe123!`.

| Role | Email |
|---|---|
| Admin | `admin@guidance.local` |
| Head counselor | `head@guidance.local` |
| Counselor | `counselor@guidance.local` |
| Student | `student@guidance.local` |

Change or delete demo credentials before deployment.

## Authentication

Log in:

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email":"admin@guidance.local","password":"ChangeMe123!"}
```

Send the returned access token on protected endpoints:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Use `POST /auth/refresh` with the refresh token for a new access token. Use `POST /auth/logout` to revoke either token.

## API route map

All routes begin with `/api/v1`.

| Method and route | Access | Purpose |
|---|---|---|
| `GET /health` | Public | Health check |
| `POST /auth/register` | Public | Register a student |
| `POST /auth/login` | Public | Log in |
| `POST /auth/refresh` | Refresh token | Refresh access |
| `POST /auth/logout` | Any token | Revoke token |
| `GET /auth/me` | Signed in | Current account/profile |
| `PATCH /profile` | Signed in | Update own profile |
| `GET /students` | Staff/counseling roles | Search students |
| `GET /counselors` | Signed in | List active counselors |
| `POST /referrals/anonymous` | Public | Submit anonymous referral |
| `GET /referrals/status/:code` | Public | Check referral status |
| `GET /referrals` | Counseling roles | Referral queue |
| `GET /referrals/:id` | Assigned/management | Referral details |
| `PATCH /referrals/:id/triage` | Head/admin | Set triage result |
| `PATCH /referrals/:id/assign` | Head/admin | Assign counselor |
| `POST /cases` | Head/admin | Open case |
| `GET /cases` | Authorized | Role-filtered cases |
| `GET /cases/:id` | Authorized participant | Case details |
| `PATCH /cases/:id/status` | Assigned/management | Advance lifecycle |
| `POST /cases/:id/notes` | Authorized counselor | Add encrypted note |
| `GET /cases/:id/notes` | Authorized counselor | Read decrypted notes |
| `PATCH /cases/:id/notes/:noteId` | Author/management | Edit encrypted note |
| `POST /appointments` | Signed-in supported roles | Request appointment |
| `GET /appointments` | Signed-in supported roles | Role-filtered schedule |
| `PATCH /appointments/:id/status` | Counseling/staff roles | Update status |
| `PATCH /appointments/:id/cancel` | Participant/management | Cancel appointment |
| `GET /exit-questionnaires/active` | Signed in | Active form |
| `POST /exit-questionnaires` | Head/admin | Publish new active form |
| `POST /exit-questionnaires/:id/submit` | Student | Submit answers |
| `GET /exit-submissions/:studentId` | Head/admin/staff | Completion records |
| `POST /clearances` | Student/management | Request clearance |
| `GET /clearances/me` | Student | Own clearance records |
| `PATCH /clearances/:id/evaluate` | Head/admin/staff | Recheck/approve |
| `GET /reports/appointments/:id/confirmation.pdf` | Participant/management | Appointment slip |
| `GET /reports/cases/:id/summary.pdf` | Assigned/management | Pseudonymized summary |
| `GET /reports/clearances/:id/certificate.pdf` | Student/management | Clearance certificate |
| `POST /admin/accounts` | Admin | Create staff/counseling account |
| `PATCH /admin/accounts/:id/active` | Admin | Activate/deactivate account |
| `POST /rooms` | Head/admin | Create room |
| `GET /rooms` | Signed in | List rooms |
| `GET /audit-logs` | Head/admin | Read safe audit trail |

## Important request bodies

Anonymous referral:

```json
{
  "subject_name": "Student name or identifying description",
  "subject_student_id": 1,
  "subject_program_year": "BSMT 3",
  "concern_category": "Wellbeing",
  "concern_details": "Observed behavior and reason for concern, with enough detail for triage.",
  "observed_at": "2026-09-14T08:00:00+08:00"
}
```

Appointment request (all datetimes are converted to UTC):

```json
{
  "student_id": 1,
  "counselor_id": 2,
  "case_id": 1,
  "room_id": 1,
  "starts_at": "2026-09-20T09:00:00+08:00",
  "ends_at": "2026-09-20T10:00:00+08:00",
  "purpose": "Initial consultation"
}
```

Exit questionnaire response:

```json
{
  "responses": [
    {"question_id": 1, "answer": "Graduating"},
    {"question_id": 2, "answer": "Very satisfied"}
  ]
}
```

## Frontend integration

The included client uses the same-origin API automatically. Its page routes are `/`, `/register`, `/dashboard`, `/appointments`, `/referrals`, `/cases`, `/exit-questionnaire`, `/manage-exit-questionnaire`, `/clearance`, and `/admin-management`; role-based navigation hides pages that a user cannot use. Anonymous referrals remain available without signing in.

If another client is added:

1. Set its API base URL to `http://127.0.0.1:5000/api/v1` during development.
2. Attach the returned access token as a Bearer token.
3. A `401` means login/refresh is needed; `403` means the account lacks permission; `409` means a state or schedule conflict; `422` means the token is invalid.
4. PDF endpoints return binary `application/pdf`; open their response as a Blob.
5. Set `FRONTEND_ORIGINS` in `.env` to exact deployed frontend origins, comma-separated.

## Tests

```powershell
.venv\Scripts\python.exe -m pytest -q
```

The suite checks registration, anonymity, role denial, case transitions, encrypted note storage, appointment conflict rejection, questionnaire/clearance completion, and PDF creation.

## Production checklist

- Replace `SECRET_KEY` and `JWT_SECRET_KEY` with long random values.
- Generate and safely back up `NOTES_ENCRYPTION_KEY`. Losing or changing it makes existing notes unreadable.
- Replace SQLite with PostgreSQL via `DATABASE_URL` for a multi-user deployment.
- Serve through HTTPS using Gunicorn behind a reverse proxy or a managed platform.
- Restrict `FRONTEND_ORIGINS`; never use `*` for a confidential production system.
- Change seed passwords, define an account-provisioning policy, and schedule database backups.
- Add institutional privacy/retention rules and obtain approval from the university's data-protection officer.
- For high-concurrency production scheduling, add a database-level overlap constraint or serializable transaction in PostgreSQL. Application conflict checks are sufficient for this class project and ordinary single-instance use, but not a guarantee under simultaneous writes.

## Project structure

```text
guidance_backend/
├── app/
│   ├── routes/               # REST endpoint modules
│   ├── scripts/seed.py       # Idempotent demo data
│   ├── static/               # CSS, browser JavaScript, and images
│   ├── templates/            # Server-rendered client pages
│   ├── __init__.py           # Flask application factory
│   ├── config.py             # Environment configuration
│   ├── enums.py              # Roles and lifecycle values
│   ├── extensions.py         # Flask extensions
│   ├── models.py             # SQLAlchemy database schema
│   └── utils.py              # Auth, validation, encryption, audit helpers
├── tests/                    # Automated integration tests
├── .env.example
├── requirements.txt
├── requirements-dev.txt
├── run.py                    # Development entry point
└── wsgi.py                   # Production entry point
```

The included `instance/guidance.db` is local development data from the supplied project and is preserved in this polished copy. For a fresh environment, run the seed command after configuring `.env`; do not ship demo credentials or this database to production without reviewing its contents.
