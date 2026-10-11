
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from werkzeug.security import generate_password_hash

from ..email_service import send_otp_email
from ..enums import UserRole
from ..extensions import db
from ..models import (
    AccountSettings,
    EmailVerification,
    RevokedToken,
    StudentProfile,
    User,
)
from ..utils import (
    active_user_required,
    audit,
    clean_text,
    current_user,
    error,
    json_body,
    validate_email,
    validate_password,
)

auth_bp = Blueprint("auth", __name__)

OTP_EXPIRY_MINUTES = 5
OTP_MAX_ATTEMPTS = 3
OTP_COOLDOWN_SECONDS = 60


def token_pair(user):
    settings = db.session.get(AccountSettings, user.id)
    claims = {
        "role": user.role.value,
        "session_version": settings.session_version if settings else 0,
    }
    return {
        "access_token": create_access_token(
            identity=str(user.id), additional_claims=claims
        ),
        "refresh_token": create_refresh_token(
            identity=str(user.id), additional_claims=claims
        ),
        "token_type": "Bearer",
    }


def otp_digest(email, purpose, code):
    secret = current_app.config["SECRET_KEY"]
    message = f"{purpose}:{email}:{code}".encode("utf-8")
    return hmac.new(
        secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def as_utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def latest_registration(email):
    return db.session.scalar(
        db.select(EmailVerification)
        .where(
            EmailVerification.email == email,
            EmailVerification.purpose == "registration",
        )
        .order_by(EmailVerification.created_at.desc(), EmailVerification.id.desc())
        .limit(1)
    )

def locked_registration(email):
    return db.session.scalar(
        db.select(EmailVerification)
        .where(
            EmailVerification.email == email,
            EmailVerification.purpose == "registration",
        )
        .with_for_update()
    )

def lock_registration_email(email):
    engine = db.session.get_bind()

    if engine.dialect.name != "postgresql":
        raise RuntimeError(
            "Registration locking requires PostgreSQL."
        )

    db.session.execute(
        text(
            "SELECT pg_advisory_xact_lock("
            "hashtextextended(:lock_key, 0)"
            ")"
        ),
        {
            "lock_key": f"registration:{email}",
        },
    )

@auth_bp.post("/auth/register")

def register_student():
    data, failure = json_body(
        [
            "email",
            "password",
            "student_number",
            "first_name",
            "last_name",
            "program",
            "year_level",
        ]
    )
    if failure:
        return failure

    if not isinstance(data["email"], str):
        return error("A valid email address is required.")

    email = data["email"].strip().lower()

    if not validate_email(email):
        return error("A valid email address is required.")

    password_error = validate_password(data["password"])
    if password_error:
        return error(password_error)

    try:
        if isinstance(data["year_level"], bool):
            raise ValueError()
        year_level = int(data["year_level"])
    except (TypeError, ValueError):
        return error("year_level must be a number from 1 to 8.")

    if not 1 <= year_level <= 8:
        return error("year_level must be a number from 1 to 8.")

    cleaned_fields = {}

    for field, max_length in (
        ("student_number", 50),
        ("first_name", 100),
        ("last_name", 100),
        ("program", 150),
    ):
        value, problem = clean_text(
            data[field],
            field,
            max_length=max_length,
        )
        if problem:
            return error(problem)
        cleaned_fields[field] = value

    student_number = cleaned_fields["student_number"].upper()

    contact_number, problem = clean_text(
        data.get("contact_number"),
        "contact_number",
        max_length=30,
        required=False,
    )
    if problem:
        return error(problem)

    # Hash the password before acquiring a database lock.
    pending_data = {
        "email": email,
        "password_hash": generate_password_hash(
            data["password"], method="scrypt"
        ),
        "student_number": student_number,
        "first_name": cleaned_fields["first_name"],
        "last_name": cleaned_fields["last_name"],
        "program": cleaned_fields["program"],
        "year_level": year_level,
        "contact_number": contact_number,
    }

    try:
        # Serialize registration requests for this email.
        # The lock lasts until commit or rollback.
        lock_registration_email(email)

        if db.session.scalar(
            db.select(User).filter_by(email=email)
        ):
            db.session.rollback()
            return error(
                "Email is already registered.",
                409,
                "duplicate_email",
            )

        if db.session.scalar(
            db.select(StudentProfile).filter_by(
                student_number=student_number
            )
        ):
            db.session.rollback()
            return error(
                "Student number is already registered.",
                409,
                "duplicate_student_number",
            )

        now = datetime.now(timezone.utc)
        existing = latest_registration(email)

        if existing:
            age = (
                now - as_utc(existing.created_at)
            ).total_seconds()

            if age < OTP_COOLDOWN_SECONDS:
                remaining = max(
                    1,
                    int(OTP_COOLDOWN_SECONDS - age + 0.999),
                )

                db.session.rollback()

                return jsonify(
                    error="otp_cooldown",
                    message=(
                        f"Please wait {remaining} seconds "
                        "before requesting another code."
                    ),
                    retry_after_seconds=remaining,
                ), 429

        code = f"{secrets.randbelow(1000000):06d}"

        verification = EmailVerification(
            email=email,
            purpose="registration",
            otp_hash=otp_digest(
                email, "registration", code
            ),
            pending_data=json.dumps(pending_data),
            expires_at=now + timedelta(
                minutes=OTP_EXPIRY_MINUTES
            ),
            attempts=0,
            created_at=now,
        )

        # Keep the lock while sending so another registration
        # for this email cannot pass the cooldown check.
        if not send_otp_email(
            email,
            code,
            purpose="registration",
        ):
            db.session.rollback()
            return error(
                "Unable to send the verification email. Please try again.",
                503,
                "email_delivery_failed",
            )

        # Replace any previous pending registration.
        db.session.execute(
            db.delete(EmailVerification).where(
                EmailVerification.email == email,
                EmailVerification.purpose == "registration",
            )
        )

        db.session.add(verification)
        db.session.commit()

        return jsonify(
            message="Verification code sent to your email.",
            email=email,
            expires_in_seconds=OTP_EXPIRY_MINUTES * 60,
            retry_after_seconds=OTP_COOLDOWN_SECONDS,
            max_attempts=OTP_MAX_ATTEMPTS,
            verification_required=True,
        ), 200

    except IntegrityError:
        db.session.rollback()
        return error(
            "Email or student number is already registered.",
            409,
            "duplicate_registration",
        )

    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to process registration."
        )
        return error(
            "Unable to process registration. Please try again.",
            500,
            "registration_failed",
        )


@auth_bp.post("/auth/resend-otp")
def resend_registration_otp():
    data, failure = json_body(["email"])
    if failure:
        return failure

    if not isinstance(data["email"], str):
        return error("A valid email address is required.")

    email = data["email"].strip().lower()

    if not validate_email(email):
        return error("A valid email address is required.")

    try:
        # Lock the pending registration record.
        verification = locked_registration(email)

        if not verification:
            db.session.rollback()
            return error(
                "No pending registration found. Please register again.",
                404,
                "verification_not_found",
            )

        if db.session.scalar(
            db.select(User).filter_by(email=email)
        ):
            db.session.rollback()
            return error(
                "This email is already registered. Please log in.",
                409,
                "duplicate_email",
            )

        now = datetime.now(timezone.utc)

        age = (
            now - as_utc(verification.created_at)
        ).total_seconds()

        if age < OTP_COOLDOWN_SECONDS:
            remaining = max(
                1,
                int(OTP_COOLDOWN_SECONDS - age + 0.999),
            )

            db.session.rollback()

            return jsonify(
                error="otp_cooldown",
                message=(
                    f"Please wait {remaining} seconds "
                    "before requesting another code."
                ),
                retry_after_seconds=remaining,
            ), 429

        code = f"{secrets.randbelow(1000000):06d}"

        # Preserve the current code if email delivery fails.
        if not send_otp_email(
            email,
            code,
            purpose="registration",
        ):
            db.session.rollback()
            return error(
                "Unable to resend the verification email. Please try again.",
                503,
                "email_delivery_failed",
            )

        # Invalidate the previous OTP.
        verification.otp_hash = otp_digest(
            email,
            "registration",
            code,
        )

        verification.expires_at = (
            now + timedelta(minutes=OTP_EXPIRY_MINUTES)
        )

        verification.created_at = now
        verification.attempts = 0

        db.session.commit()

        return jsonify(
            message="A new verification code has been sent.",
            email=email,
            expires_in_seconds=OTP_EXPIRY_MINUTES * 60,
            retry_after_seconds=OTP_COOLDOWN_SECONDS,
            max_attempts=OTP_MAX_ATTEMPTS,
        ), 200

    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to resend registration OTP."
        )
        return error(
            "Unable to resend the verification code. Please try again.",
            500,
            "verification_resend_failed",
        )


@auth_bp.post("/auth/verify-otp")
def verify_registration_otp():
    data, failure = json_body(["email", "otp_code"])
    if failure:
        return failure

    if not isinstance(data["email"], str):
        return error("A valid email address is required.")

    email = data["email"].strip().lower()
    code = data["otp_code"]

    if not validate_email(email):
        return error("A valid email address is required.")

    if (
        not isinstance(code, str)
        or len(code) != 6
        or not code.isascii()
        or not code.isdigit()
    ):
        return error("Enter a valid 6-digit verification code.")

    try:
        # Lock this OTP record until the transaction ends.
        verification = locked_registration(email)

        if not verification:
            db.session.rollback()
            return error(
                "No pending verification found. Please register again.",
                404,
                "verification_not_found",
            )

        now = datetime.now(timezone.utc)

        if now >= as_utc(verification.expires_at):
            db.session.delete(verification)
            db.session.commit()
            return error(
                "Verification code has expired. Please request a new code.",
                410,
                "otp_expired",
            )

        if verification.attempts >= OTP_MAX_ATTEMPTS:
            db.session.rollback()
            return error(
                "Maximum verification attempts reached. Request a new code.",
                429,
                "otp_locked",
            )

        submitted_hash = otp_digest(email, "registration", code)

        if not hmac.compare_digest(
            submitted_hash,
            verification.otp_hash,
        ):
            verification.attempts += 1
            remaining = OTP_MAX_ATTEMPTS - verification.attempts

            db.session.commit()

            if remaining == 0:
                return error(
                    "Maximum verification attempts reached. Request a new code.",
                    429,
                    "otp_locked",
                )

            return error(
                f"Incorrect verification code. {remaining} attempt(s) remaining.",
                400,
                "invalid_otp",
            )

        pending = json.loads(verification.pending_data)

        if db.session.scalar(
            db.select(User).filter_by(email=email)
        ):
            db.session.rollback()
            return error(
                "Email is already registered.",
                409,
                "duplicate_email",
            )

        if db.session.scalar(
            db.select(StudentProfile).filter_by(
                student_number=pending["student_number"]
            )
        ):
            db.session.rollback()
            return error(
                "Student number is already registered.",
                409,
                "duplicate_student_number",
            )

        user = User(
            email=email,
            role=UserRole.STUDENT,
        )

        user.password_hash = pending["password_hash"]

        db.session.add(user)
        db.session.flush()

        profile = StudentProfile(
            user_id=user.id,
            student_number=pending["student_number"],
            first_name=pending["first_name"],
            last_name=pending["last_name"],
            program=pending["program"],
            year_level=pending["year_level"],
            contact_number=pending.get("contact_number"),
        )

        db.session.add(profile)

        audit(
            "ACCOUNT_REGISTERED",
            "user",
            user.id,
            user.id,
            {"role": UserRole.STUDENT.value},
        )

        db.session.delete(verification)
        db.session.commit()

        # Verification creates an account, not a login session.
        return jsonify(
            message=(
                "Email verified. Student account created "
                "successfully. Please log in."
            ),
            user=user.public_dict(),
            profile=profile.to_dict(),
            login_required=True,
        ), 201

    except IntegrityError:
        db.session.rollback()
        return error(
            "Email or student number is already registered.",
            409,
            "duplicate_registration",
        )

    except Exception:
        db.session.rollback()
        current_app.logger.exception(
            "Failed to verify registration OTP."
        )
        return error(
            "Unable to verify your email right now. Please try again.",
            500,
            "verification_failed",
        )


@auth_bp.post("/auth/login")
def login():
    data, failure = json_body(["email", "password"])
    if failure:
        return failure
    if not isinstance(data["email"], str) or not isinstance(data["password"], str):
        return error("Email and password must be text.")
    email = data["email"].strip().lower()
    user = db.session.scalar(db.select(User).filter_by(email=email))
    if not user or not user.verify_password(data["password"]):
        return error("Invalid email or password.", 401, "invalid_credentials")
    if not user.is_active:
        return error("Account is inactive.", 403, "account_inactive")
    user.last_login_at = datetime.now(timezone.utc)
    audit("LOGIN", "user", user.id, user.id)
    db.session.commit()
    profile = user.student_profile.to_dict() if user.student_profile else (
        user.counselor_profile.to_dict() if user.counselor_profile else (
            user.staff_profile.to_dict() if user.staff_profile else None
        )
    )
    return jsonify(user=user.public_dict(), profile=profile, **token_pair(user))

@auth_bp.post("/auth/refresh")
@jwt_required(refresh=True)
def refresh():
    user = db.session.get(User, int(get_jwt_identity()))

    if not user or not user.is_active:
        return error(
            "Account is inactive or unavailable.",
            403,
            "account_inactive"
        )

    # Prevent outdated refresh tokens from creating
    # new access tokens after a password change.
    settings = db.session.get(AccountSettings, user.id)

    current_version = (
        settings.session_version
        if settings
        else 0
    )

    token_version = get_jwt().get("session_version")

    if token_version != current_version:
        return error(
            "Your session has expired. Please sign in again.",
            401,
            "session_expired"
        )

    return jsonify(
        access_token=token_pair(user)["access_token"]
    )

@auth_bp.post("/auth/logout")
@jwt_required(verify_type=False)
def logout():
    payload = get_jwt()
    if not db.session.scalar(db.select(RevokedToken).filter_by(jti=payload["jti"])):
        db.session.add(
            RevokedToken(
                jti=payload["jti"],
                expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            )
        )
    user = current_user()
    audit("LOGOUT", "user", user.id if user else None, user.id if user else None)
    db.session.commit()
    return jsonify(message="Token revoked.")


@auth_bp.get("/auth/me")
@active_user_required
def me():
    user = current_user()
    if not user:
        return error("Account not found.", 404, "not_found")
    profile = user.student_profile.to_dict() if user.student_profile else (
        user.counselor_profile.to_dict() if user.counselor_profile else (
            user.staff_profile.to_dict() if user.staff_profile else None
        )
    )
    return jsonify(user=user.public_dict(), profile=profile)
