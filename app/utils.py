import base64
import hashlib
import re
import secrets
from datetime import datetime, timezone
from functools import wraps

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from .enums import UserRole
from .extensions import db
from .models import AuditLog, User

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def error(message, status=400, code="validation_error", details=None):
    payload = {"error": code, "message": message}
    if details:
        payload["details"] = details
    return jsonify(payload), status


def json_body(required=None):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, error("A JSON object is required.")
    missing = [name for name in (required or []) if data.get(name) in (None, "")]
    if missing:
        return None, error("Required fields are missing.", details={"missing": missing})
    return data, None


def validate_email(value):
    return bool(value and EMAIL_RE.match(value.strip().lower()))


def validate_password(value):
    if not isinstance(value, str) or len(value) < 8:
        return "Password must contain at least 8 characters."
    if not re.search(r"[A-Z]", value) or not re.search(r"[a-z]", value):
        return "Password must contain uppercase and lowercase letters."
    if not re.search(r"\d", value) or not re.search(r"[^A-Za-z0-9]", value):
        return "Password must contain a number and a special character."
    return None


def parse_boolean(value, field_name):
    if not isinstance(value, bool):
        return None, f"{field_name} must be true or false."
    return value, None


def parse_positive_int(value, field_name):
    if isinstance(value, bool):
        return None, f"{field_name} must be a positive integer."
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None, f"{field_name} must be a positive integer."
    if parsed < 1:
        return None, f"{field_name} must be a positive integer."
    return parsed, None


def clean_text(value, field_name, *, min_length=1, max_length=None, required=True):
    if value is None and not required:
        return None, None
    if not isinstance(value, str):
        return None, f"{field_name} must be text."
    cleaned = value.strip()
    if len(cleaned) < min_length:
        if required:
            return None, f"{field_name} must contain at least {min_length} character(s)."
        return None, None
    if max_length is not None and len(cleaned) > max_length:
        return None, f"{field_name} must not exceed {max_length} characters."
    return cleaned, None


def parse_iso_datetime(value, field_name="datetime"):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc), None
    except (TypeError, ValueError):
        return None, f"{field_name} must be an ISO 8601 datetime."


def enum_value(enum_class, value, field_name):
    try:
        return enum_class(str(value).upper()), None
    except (ValueError, TypeError):
        allowed = [item.value for item in enum_class]
        return None, f"{field_name} must be one of: {', '.join(allowed)}."


def current_user():
    identity = get_jwt_identity()
    if not identity:
        return None
    try:
        return db.session.get(User, int(identity))
    except (TypeError, ValueError):
        return None


def active_user_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        verify_jwt_in_request()
        user = current_user()
        if not user or not user.is_active:
            return error("Account is inactive or unavailable.", 403, "account_inactive")
        return fn(*args, **kwargs)

    return wrapped


def roles_required(*roles):
    accepted = {role.value if isinstance(role, UserRole) else str(role) for role in roles}

    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            verify_jwt_in_request()
            user = current_user()
            if not user or not user.is_active:
                return error("Account is inactive or unavailable.", 403, "account_inactive")
            if user.role.value not in accepted:
                return error("You do not have permission to perform this action.", 403, "forbidden")
            return fn(*args, **kwargs)

        return wrapped

    return decorator


def audit(action, entity_type, entity_id=None, actor_user_id=None, metadata=None):
    db.session.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            metadata_json=metadata,
        )
    )


def _fernet():
    configured = current_app.config.get("NOTES_ENCRYPTION_KEY", "").encode()
    if configured:
        key = configured
    else:
        digest = hashlib.sha256(current_app.config["SECRET_KEY"].encode()).digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_note(plaintext):
    return _fernet().encrypt(plaintext.encode("utf-8"))


def decrypt_note(ciphertext):
    try:
        return _fernet().decrypt(ciphertext).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError("Progress note could not be decrypted with the configured key.") from exc


def tracking_code(prefix):
    return f"{prefix}-{datetime.now(timezone.utc):%Y%m%d}-{secrets.token_hex(4).upper()}"


def page_args():
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except ValueError:
        page, per_page = 1, 20
    return page, per_page


def paginated(select_stmt, serializer):
    page, per_page = page_args()
    result = db.paginate(select_stmt, page=page, per_page=per_page, error_out=False)
    return {
        "items": [serializer(item) for item in result.items],
        "pagination": {
            "page": result.page,
            "per_page": result.per_page,
            "total": result.total,
            "pages": result.pages,
        },
    }
