import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()


def _positive_int(name, default):
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


def _database_url():
    url = os.getenv("DATABASE_URL", "sqlite:///guidance.db").strip()
    if url.startswith("postgres://"):
        return "postgresql://" + url.removeprefix("postgres://")
    return url


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "development-only-secret-key-change-before-production")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "development-only-jwt-key-change-before-production")
    NOTES_ENCRYPTION_KEY = os.getenv("NOTES_ENCRYPTION_KEY", "")
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=_positive_int("ACCESS_TOKEN_MINUTES", 60))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=_positive_int("REFRESH_TOKEN_DAYS", 7))
    JWT_TOKEN_LOCATION = ["headers"]
    MAX_CONTENT_LENGTH = 3 * 1024 * 1024  # permits multipart overhead for a 2 MB photo
    JSON_SORT_KEYS = False
    FRONTEND_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:5500"
        ).split(",")
        if origin.strip()
    ]
