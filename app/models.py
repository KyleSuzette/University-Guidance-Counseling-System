from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from werkzeug.security import check_password_hash, generate_password_hash

from .enums import (
    AppointmentStatus,
    CaseStatus,
    ClearanceStatus,
    Priority,
    ReferralStatus,
    UserRole,
)
from .extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class AccountSettings(db.Model):
    """Additive settings table; existing user/profile schemas remain unchanged."""
    __tablename__ = "account_settings"
    user_id: Mapped[int] = mapped_column(db.ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str] = mapped_column(db.String(100), default="")
    bio: Mapped[str] = mapped_column(db.String(500), default="")
    avatar: Mapped[bytes | None] = mapped_column(db.LargeBinary, nullable=True)
    session_version: Mapped[int] = mapped_column(default=0)


# =========================================================
# MIXINS
# =========================================================

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        default=utcnow,
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        default=utcnow,
        onupdate=utcnow,
        nullable=False
    )


# =========================================================
# USER
# =========================================================

class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    email: Mapped[str] = mapped_column(
        db.String(255),
        unique=True,
        index=True,
        nullable=False
    )

    password_hash: Mapped[str] = mapped_column(
        db.String(255),
        nullable=False
    )

    role: Mapped[UserRole] = mapped_column(
        db.Enum(UserRole),
        index=True,
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        default=True,
        nullable=False
    )

    last_login_at: Mapped[datetime | None]

    student_profile: Mapped["StudentProfile | None"] = relationship(
        back_populates="user",
        uselist=False
    )

    counselor_profile: Mapped["CounselorProfile | None"] = relationship(
        back_populates="user",
        uselist=False
    )

    staff_profile: Mapped["StaffProfile | None"] = relationship(
        back_populates="user",
        uselist=False
    )

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(
            password,
            method="scrypt"
        )

    def verify_password(self, password: str) -> bool:
        return check_password_hash(
            self.password_hash,
            password
        )

    def public_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "role": self.role.value,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }


# =========================================================
# STUDENT PROFILE
# =========================================================

class StudentProfile(TimestampMixin, db.Model):
    __tablename__ = "student_profiles"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    user_id: Mapped[int] = mapped_column(
        db.ForeignKey(
            "users.id",
            ondelete="CASCADE"
        ),
        unique=True
    )

    student_number: Mapped[str] = mapped_column(
        db.String(50),
        unique=True,
        index=True
    )

    first_name: Mapped[str] = mapped_column(
        db.String(100)
    )

    last_name: Mapped[str] = mapped_column(
        db.String(100)
    )

    program: Mapped[str] = mapped_column(
        db.String(150)
    )

    year_level: Mapped[int] = mapped_column()

    contact_number: Mapped[str | None] = mapped_column(
        db.String(30)
    )

    user: Mapped[User] = relationship(
        back_populates="student_profile"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "student_number": self.student_number,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": f"{self.first_name} {self.last_name}",
            "program": self.program,
            "year_level": self.year_level,
            "contact_number": self.contact_number,
            "active": self.user.is_active,
        }


# =========================================================
# COUNSELOR PROFILE
# =========================================================

class CounselorProfile(TimestampMixin, db.Model):
    __tablename__ = "counselor_profiles"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    user_id: Mapped[int] = mapped_column(
        db.ForeignKey(
            "users.id",
            ondelete="CASCADE"
        ),
        unique=True
    )

    employee_number: Mapped[str] = mapped_column(
        db.String(50),
        unique=True,
        index=True
    )

    first_name: Mapped[str] = mapped_column(
        db.String(100)
    )

    last_name: Mapped[str] = mapped_column(
        db.String(100)
    )

    specialization: Mapped[str | None] = mapped_column(
        db.String(150)
    )

    user: Mapped[User] = relationship(
        back_populates="counselor_profile"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "employee_number": self.employee_number,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": f"{self.first_name} {self.last_name}",
            "specialization": self.specialization,
            "active": self.user.is_active,
        }


# =========================================================
# STAFF / ADMIN PROFILE
# =========================================================

class StaffProfile(TimestampMixin, db.Model):
    __tablename__ = "staff_profiles"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    user_id: Mapped[int] = mapped_column(
        db.ForeignKey(
            "users.id",
            ondelete="CASCADE"
        ),
        unique=True,
        nullable=False
    )

    employee_number: Mapped[str] = mapped_column(
        db.String(50),
        unique=True,
        index=True,
        nullable=False
    )

    first_name: Mapped[str] = mapped_column(
        db.String(100),
        nullable=False
    )

    last_name: Mapped[str] = mapped_column(
        db.String(100),
        nullable=False
    )

    user: Mapped[User] = relationship(
        back_populates="staff_profile"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "employee_number": self.employee_number,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": f"{self.first_name} {self.last_name}",
            "active": self.user.is_active,
        }


# =========================================================
# REFERRAL
# =========================================================

class Referral(TimestampMixin, db.Model):
    __tablename__ = "referrals"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    tracking_code: Mapped[str] = mapped_column(
        db.String(36),
        unique=True,
        index=True
    )

    subject_student_id: Mapped[int | None] = mapped_column(
        db.ForeignKey("student_profiles.id"),
        index=True
    )

    subject_name: Mapped[str] = mapped_column(
        db.String(200)
    )

    subject_program_year: Mapped[str | None] = mapped_column(
        db.String(200)
    )

    concern_category: Mapped[str] = mapped_column(
        db.String(100),
        index=True
    )

    concern_details: Mapped[str] = mapped_column(
        db.Text
    )

    observed_at: Mapped[datetime | None]

    priority: Mapped[Priority] = mapped_column(
        db.Enum(Priority),
        default=Priority.MEDIUM,
        index=True
    )

    status: Mapped[ReferralStatus] = mapped_column(
        db.Enum(ReferralStatus),
        default=ReferralStatus.NEW,
        index=True
    )

    triage_notes: Mapped[str | None] = mapped_column(
        db.Text
    )

    triaged_by_user_id: Mapped[int | None] = mapped_column(
        db.ForeignKey("users.id")
    )

    triaged_at: Mapped[datetime | None]

    assigned_counselor_id: Mapped[int | None] = mapped_column(
        db.ForeignKey("counselor_profiles.id"),
        index=True
    )

    assigned_at: Mapped[datetime | None]

    subject_student: Mapped[StudentProfile | None] = relationship(
        foreign_keys=[subject_student_id]
    )

    assigned_counselor: Mapped[CounselorProfile | None] = relationship(
        foreign_keys=[assigned_counselor_id]
    )

    def to_dict(self):
        return {
            "id": self.id,
            "tracking_code": self.tracking_code,
            "subject_student_id": self.subject_student_id,
            "subject_name": self.subject_name,
            "subject_program_year": self.subject_program_year,
            "concern_category": self.concern_category,
            "concern_details": self.concern_details,
            "observed_at": (
                self.observed_at.isoformat()
                if self.observed_at
                else None
            ),
            "priority": self.priority.value,
            "status": self.status.value,
            "triage_notes": self.triage_notes,
            "assigned_counselor_id": self.assigned_counselor_id,
            "created_at": self.created_at.isoformat(),
        }


# =========================================================
# COUNSELING CASE
# =========================================================

class CounselingCase(TimestampMixin, db.Model):
    __tablename__ = "counseling_cases"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    case_number: Mapped[str] = mapped_column(
        db.String(40),
        unique=True,
        index=True
    )

    student_id: Mapped[int] = mapped_column(
        db.ForeignKey("student_profiles.id"),
        index=True
    )

    counselor_id: Mapped[int] = mapped_column(
        db.ForeignKey("counselor_profiles.id"),
        index=True
    )

    referral_id: Mapped[int | None] = mapped_column(
        db.ForeignKey("referrals.id"),
        unique=True
    )

    category: Mapped[str] = mapped_column(
        db.String(100)
    )

    priority: Mapped[Priority] = mapped_column(
        db.Enum(Priority),
        default=Priority.MEDIUM
    )

    status: Mapped[CaseStatus] = mapped_column(
        db.Enum(CaseStatus),
        default=CaseStatus.INTAKE,
        index=True
    )

    intake_summary: Mapped[str | None] = mapped_column(
        db.Text
    )

    opened_at: Mapped[datetime] = mapped_column(
        default=utcnow
    )

    closed_at: Mapped[datetime | None]

    student: Mapped[StudentProfile] = relationship(
        foreign_keys=[student_id]
    )

    counselor: Mapped[CounselorProfile] = relationship(
        foreign_keys=[counselor_id]
    )

    referral: Mapped[Referral | None] = relationship(
        foreign_keys=[referral_id]
    )

    notes: Mapped[list["ProgressNote"]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "case_number": self.case_number,
            "student_id": self.student_id,
            "counselor_id": self.counselor_id,
            "referral_id": self.referral_id,
            "category": self.category,
            "priority": self.priority.value,
            "status": self.status.value,
            "intake_summary": self.intake_summary,
            "opened_at": self.opened_at.isoformat(),
            "closed_at": (
                self.closed_at.isoformat()
                if self.closed_at
                else None
            ),
        }


# =========================================================
# PROGRESS NOTE
# =========================================================

class ProgressNote(TimestampMixin, db.Model):
    __tablename__ = "progress_notes"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    case_id: Mapped[int] = mapped_column(
        db.ForeignKey(
            "counseling_cases.id",
            ondelete="CASCADE"
        ),
        index=True
    )

    counselor_id: Mapped[int] = mapped_column(
        db.ForeignKey("counselor_profiles.id"),
        index=True
    )

    encrypted_note: Mapped[bytes] = mapped_column(
        db.LargeBinary
    )

    case: Mapped[CounselingCase] = relationship(
        back_populates="notes"
    )

    counselor: Mapped[CounselorProfile] = relationship()


# =========================================================
# ROOM
# =========================================================

class Room(TimestampMixin, db.Model):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    name: Mapped[str] = mapped_column(
        db.String(100),
        unique=True
    )

    location: Mapped[str | None] = mapped_column(
        db.String(200)
    )

    is_active: Mapped[bool] = mapped_column(
        default=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "location": self.location,
            "is_active": self.is_active,
        }


# =========================================================
# APPOINTMENT
# =========================================================

class Appointment(TimestampMixin, db.Model):
    __tablename__ = "appointments"

    __table_args__ = (
        CheckConstraint(
            "ends_at > starts_at",
            name="ck_appointment_valid_range"
        ),
        Index(
            "ix_appointment_counselor_time",
            "counselor_id",
            "starts_at",
            "ends_at"
        ),
        Index(
            "ix_appointment_student_time",
            "student_id",
            "starts_at",
            "ends_at"
        ),
        Index(
            "ix_appointment_room_time",
            "room_id",
            "starts_at",
            "ends_at"
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    student_id: Mapped[int] = mapped_column(
        db.ForeignKey("student_profiles.id"),
        index=True
    )

    counselor_id: Mapped[int] = mapped_column(
        db.ForeignKey("counselor_profiles.id"),
        index=True
    )

    case_id: Mapped[int | None] = mapped_column(
        db.ForeignKey("counseling_cases.id"),
        index=True
    )

    room_id: Mapped[int | None] = mapped_column(
        db.ForeignKey("rooms.id"),
        index=True
    )

    starts_at: Mapped[datetime] = mapped_column(
        index=True
    )

    ends_at: Mapped[datetime] = mapped_column(
        index=True
    )

    status: Mapped[AppointmentStatus] = mapped_column(
        db.Enum(AppointmentStatus),
        default=AppointmentStatus.REQUESTED,
        index=True
    )

    purpose: Mapped[str] = mapped_column(
        db.String(250)
    )

    requested_by_user_id: Mapped[int] = mapped_column(
        db.ForeignKey("users.id")
    )

    cancellation_reason: Mapped[str | None] = mapped_column(
        db.String(250)
    )

    student: Mapped[StudentProfile] = relationship(
        foreign_keys=[student_id]
    )

    counselor: Mapped[CounselorProfile] = relationship(
        foreign_keys=[counselor_id]
    )

    room: Mapped[Room | None] = relationship()

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "counselor_id": self.counselor_id,
            "case_id": self.case_id,
            "room_id": self.room_id,

            "student": (
                self.student.to_dict()
                if self.student
                else None
            ),

            "counselor": (
                self.counselor.to_dict()
                if self.counselor
                else None
            ),

            "room": (
                self.room.to_dict()
                if self.room
                else None
            ),

            "starts_at": self.starts_at.isoformat(),
            "ends_at": self.ends_at.isoformat(),
            "status": self.status.value,
            "purpose": self.purpose,
            "cancellation_reason": self.cancellation_reason,
            "requested_by_user_id": self.requested_by_user_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# =========================================================
# EXIT QUESTIONNAIRE
# =========================================================

class ExitQuestionnaire(TimestampMixin, db.Model):
    __tablename__ = "exit_questionnaires"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    title: Mapped[str] = mapped_column(
        db.String(200)
    )

    is_active: Mapped[bool] = mapped_column(
        default=True,
        index=True
    )

    questions: Mapped[list["ExitQuestion"]] = relationship(
        back_populates="questionnaire",
        cascade="all, delete-orphan",
        order_by="ExitQuestion.position"
    )


class ExitQuestion(TimestampMixin, db.Model):
    __tablename__ = "exit_questions"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    questionnaire_id: Mapped[int] = mapped_column(
        db.ForeignKey(
            "exit_questionnaires.id",
            ondelete="CASCADE"
        ),
        index=True
    )

    prompt: Mapped[str] = mapped_column(
        db.String(500)
    )

    field_type: Mapped[str] = mapped_column(
        db.String(30),
        default="text"
    )

    is_required: Mapped[bool] = mapped_column(
        default=True
    )

    position: Mapped[int] = mapped_column(
        default=0
    )

    questionnaire: Mapped[ExitQuestionnaire] = relationship(
        back_populates="questions"
    )


# =========================================================
# EXIT SUBMISSION
# =========================================================

class ExitSubmission(TimestampMixin, db.Model):
    __tablename__ = "exit_submissions"

    __table_args__ = (
        UniqueConstraint(
            "questionnaire_id",
            "student_id",
            name="uq_exit_submission_student_form"
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    questionnaire_id: Mapped[int] = mapped_column(
        db.ForeignKey("exit_questionnaires.id"),
        index=True
    )

    student_id: Mapped[int] = mapped_column(
        db.ForeignKey("student_profiles.id"),
        index=True
    )

    completed: Mapped[bool] = mapped_column(
        default=False
    )

    submitted_at: Mapped[datetime | None]

    responses: Mapped[list["ExitResponse"]] = relationship(
        cascade="all, delete-orphan"
    )


class ExitResponse(TimestampMixin, db.Model):
    __tablename__ = "exit_responses"

    __table_args__ = (
        UniqueConstraint(
            "submission_id",
            "question_id",
            name="uq_exit_response_question"
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    submission_id: Mapped[int] = mapped_column(
        db.ForeignKey(
            "exit_submissions.id",
            ondelete="CASCADE"
        ),
        index=True
    )

    question_id: Mapped[int] = mapped_column(
        db.ForeignKey("exit_questions.id"),
        index=True
    )

    answer: Mapped[str] = mapped_column(
        db.Text
    )


# =========================================================
# CLEARANCE
# =========================================================

class Clearance(TimestampMixin, db.Model):
    __tablename__ = "clearances"

    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "academic_year",
            name="uq_clearance_student_year"
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    student_id: Mapped[int] = mapped_column(
        db.ForeignKey("student_profiles.id"),
        index=True
    )

    academic_year: Mapped[str] = mapped_column(
        db.String(20)
    )

    status: Mapped[ClearanceStatus] = mapped_column(
        db.Enum(ClearanceStatus),
        default=ClearanceStatus.NOT_CLEARED,
        index=True
    )

    exit_questionnaire_completed: Mapped[bool] = mapped_column(
        default=False
    )

    counseling_requirements_completed: Mapped[bool] = mapped_column(
        default=False
    )

    exit_interview_completed: Mapped[bool] = mapped_column(
        default=False
    )

    approved_by_user_id: Mapped[int | None] = mapped_column(
        db.ForeignKey("users.id")
    )

    approved_at: Mapped[datetime | None]

    remarks: Mapped[str | None] = mapped_column(
        db.String(500)
    )

    certificate_number: Mapped[str | None] = mapped_column(
        db.String(50),
        unique=True
    )

    student: Mapped[StudentProfile] = relationship()

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,

            "student": (
                self.student.to_dict()
                if self.student
                else None
            ),

            "academic_year": self.academic_year,
            "status": self.status.value,

            "exit_questionnaire_completed":
                self.exit_questionnaire_completed,

            "counseling_requirements_completed":
                self.counseling_requirements_completed,

            "exit_interview_completed":
                self.exit_interview_completed,

            "approved_by_user_id":
                self.approved_by_user_id,

            "approved_at": (
                self.approved_at.isoformat()
                if self.approved_at
                else None
            ),

            "remarks": self.remarks,
            "certificate_number": self.certificate_number,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# =========================================================
# AUDIT LOG
# =========================================================

class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    actor_user_id: Mapped[int | None] = mapped_column(
        db.ForeignKey("users.id"),
        index=True
    )

    action: Mapped[str] = mapped_column(
        db.String(100),
        index=True
    )

    entity_type: Mapped[str] = mapped_column(
        db.String(80),
        index=True
    )

    entity_id: Mapped[str | None] = mapped_column(
        db.String(80)
    )

    metadata_json: Mapped[dict | None] = mapped_column(
        db.JSON
    )

    created_at: Mapped[datetime] = mapped_column(
        default=utcnow,
        index=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "actor_user_id": self.actor_user_id,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "metadata": self.metadata_json,
            "created_at": self.created_at.isoformat(),
        }


# =========================================================
# REVOKED TOKEN
# =========================================================

class RevokedToken(db.Model):
    __tablename__ = "revoked_tokens"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    jti: Mapped[str] = mapped_column(
        db.String(36),
        unique=True,
        index=True
    )

    expires_at: Mapped[datetime] = mapped_column(
        index=True
    )
