import base64
import io
import warnings

from flask import Blueprint, jsonify, request
from PIL import Image, ImageOps, UnidentifiedImageError
from ..enums import UserRole
from ..extensions import db
from ..models import AccountSettings, CounselorProfile, StudentProfile
from ..utils import (
    active_user_required,
    audit,
    clean_text,
    current_user,
    error,
    json_body,
    paginated,
    roles_required,
    validate_password,
)

profiles_bp = Blueprint("profiles", __name__)


@profiles_bp.get("/students")
@roles_required(UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR, UserRole.ADMIN, UserRole.STAFF)
def list_students():
    search = request.args.get("search", "").strip()
    stmt = db.select(StudentProfile).order_by(StudentProfile.last_name, StudentProfile.first_name)
    if search:
        term = f"%{search}%"
        stmt = stmt.where(
            StudentProfile.student_number.ilike(term)
            | StudentProfile.first_name.ilike(term)
            | StudentProfile.last_name.ilike(term)
        )
    return jsonify(paginated(stmt, lambda item: item.to_dict()))


@profiles_bp.get("/counselors")
@active_user_required
def list_counselors():
    stmt = db.select(CounselorProfile).join(CounselorProfile.user).where(
        CounselorProfile.user.has(is_active=True)
    ).order_by(CounselorProfile.last_name)
    return jsonify(items=[item.to_dict() for item in db.session.scalars(stmt).all()])


@profiles_bp.patch("/profile")
@active_user_required
def update_own_profile():
    data, failure = json_body()
    if failure:
        return failure
    user = current_user()
    if user.role == UserRole.STUDENT:
        profile = user.student_profile
        allowed = {"first_name", "last_name", "program", "year_level", "contact_number"}
    elif user.role in {UserRole.COUNSELOR, UserRole.HEAD_COUNSELOR}:
        profile = user.counselor_profile
        allowed = {"first_name", "last_name", "specialization"}
    elif user.staff_profile:
        profile = user.staff_profile
        allowed = {"first_name", "last_name"}
    else:
        return error("This account has no editable profile.", 400)
    if profile is None:
        return error("Profile record is unavailable. Contact your administrator.", 404)
    changed = allowed & data.keys()
    if not changed:
        return error("No editable profile fields were provided.")

    updates = {}
    for field in changed:
        if field == "year_level":
            if isinstance(data[field], (bool, float)):
                return error("year_level must be a whole number from 1 to 8.")
            try:
                value = int(data[field])
            except (TypeError, ValueError):
                return error("year_level must be a number from 1 to 8.")
            if not 1 <= value <= 8:
                return error("year_level must be a number from 1 to 8.")
        else:
            required = field not in {"contact_number", "specialization"}
            max_length = (
                30
                if field == "contact_number"
                else 150
                if field in {"program", "specialization"}
                else 100
            )
            value, problem = clean_text(
                data[field], field, max_length=max_length, required=required
            )
            if problem:
                return error(problem)
        updates[field] = value

    for field, value in updates.items():
        setattr(profile, field, value)
    audit("PROFILE_UPDATED", "user", user.id, user.id, {"fields": sorted(updates)})
    db.session.commit()
    return jsonify(profile=profile.to_dict())


def own_settings():
    user = current_user()
    settings = db.session.get(AccountSettings, user.id)
    if settings is None:
        settings = AccountSettings(user_id=user.id, display_name="", bio="", session_version=0)
        db.session.add(settings)
    return settings


def settings_dict(settings):
    return {
        "display_name": settings.display_name if settings else "",
        "bio": settings.bio if settings else "",
        "avatar_url": "data:image/jpeg;base64," + base64.b64encode(settings.avatar).decode("ascii")
        if settings and settings.avatar else None,
    }


@profiles_bp.get("/account-settings")
@active_user_required
def get_settings():
    return jsonify(settings=settings_dict(db.session.get(AccountSettings, current_user().id)))


@profiles_bp.patch("/account-settings")
@active_user_required
def update_settings():
    data, failure = json_body()
    if failure:
        return failure
    if not data or set(data) - {"display_name", "bio"}:
        return error("Only display_name and bio can be changed here.")
    updates = {}
    for field, limit in (("display_name", 100), ("bio", 500)):
        if field in data:
            value, problem = clean_text(data[field], field, max_length=limit, required=False)
            if problem:
                return error(problem)
            updates[field] = value or ""
    settings = own_settings()
    for field, value in updates.items():
        setattr(settings, field, value)
    audit("ACCOUNT_SETTINGS_UPDATED", "user", settings.user_id, settings.user_id)
    db.session.commit()
    return jsonify(settings=settings_dict(settings))


@profiles_bp.put("/account-settings/photo")
@active_user_required
def upload_photo():
    upload = request.files.get("photo")
    if not upload:
        return error("Choose a PNG or JPEG photo.")
    raw = upload.stream.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        return error("Photo must be 2 MB or smaller.", 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in {"JPEG", "PNG"} or source.width * source.height > 16_000_000:
                    return error("Use a PNG or JPEG image no larger than 16 megapixels.")
                photo = ImageOps.fit(ImageOps.exif_transpose(source).convert("RGB"), (384, 384))
                output = io.BytesIO()
                photo.save(output, format="JPEG", quality=85)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        return error("This photo could not be read. Choose a valid PNG or JPEG.")
    settings = own_settings()
    settings.avatar = output.getvalue()
    audit("PROFILE_PHOTO_UPDATED", "user", settings.user_id, settings.user_id)
    db.session.commit()
    return jsonify(settings=settings_dict(settings))


@profiles_bp.delete("/account-settings/photo")
@active_user_required
def remove_photo():
    settings = own_settings()
    settings.avatar = None
    audit("PROFILE_PHOTO_REMOVED", "user", settings.user_id, settings.user_id)
    db.session.commit()
    return jsonify(settings=settings_dict(settings))


@profiles_bp.post("/account-settings/password")
@active_user_required
def change_password():
    data, failure = json_body(["current_password", "new_password"])
    if failure:
        return failure
    user = current_user()
    if not isinstance(data["current_password"], str) or not user.verify_password(data["current_password"]):
        return error("Current password is incorrect.", 400)
    problem = validate_password(data["new_password"])
    if problem:
        return error(problem)
    if user.verify_password(data["new_password"]):
        return error("Choose a password different from your current password.")
    user.set_password(data["new_password"])
    settings = own_settings()
    settings.session_version += 1
    audit("PASSWORD_CHANGED", "user", user.id, user.id)
    db.session.commit()
    return jsonify(message="Password changed. Sign in again on all devices.")
