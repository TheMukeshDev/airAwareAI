import os
import secrets
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()


def _text(name, default=""):
    return os.getenv(name, default).strip()


def _integer(name, default):
    try:
        return int(_text(name, str(default)))
    except ValueError:
        return default


def _boolean(name, default=False):
    value = _text(name, "").lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    return default


_EXPLICIT_SECRET = bool(_text("SECRET_KEY"))
_EXPLICIT_JWT_SECRET = bool(_text("JWT_SECRET_KEY"))
USING_GENERATED_SECRET = not (_EXPLICIT_SECRET or _EXPLICIT_JWT_SECRET)


class Config:
    FLASK_ENV = _text("FLASK_ENV", "development").lower()
    SECRET_KEY = _text("SECRET_KEY") or secrets.token_urlsafe(48)
    JWT_SECRET_KEY = _text("JWT_SECRET_KEY") or _text("SECRET_KEY") or SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_TOKEN_LOCATION = ["headers"]

    SUPABASE_DB_URL = _text("SUPABASE_DB_URL", _text("DATABASE_URL"))
    DB_BACKEND = _text("DB_BACKEND", "postgres").lower()

    GEMINI_API_KEY = _text("GEMINI_API_KEY")
    GEMINI_MODEL = _text("GEMINI_MODEL", "gemini-2.5-flash")
    GEMINI_TIMEOUT_SECONDS = max(1, _integer("GEMINI_TIMEOUT_SECONDS", 12))


    OPEN_METEO_AIR_URL = _text(
        "OPEN_METEO_AIR_URL", "https://air-quality-api.open-meteo.com/v1/air-quality"
    )
    OPEN_METEO_WEATHER_URL = _text(
        "OPEN_METEO_WEATHER_URL", "https://api.open-meteo.com/v1/forecast"
    )

    CARTO_API_KEY = _text("CARTO_API_KEY")
    CARTO_TILE_TIMEOUT_SECONDS = max(1, _integer("CARTO_TILE_TIMEOUT_SECONDS", 6))
    CARTO_TILE_MAX_BYTES = max(1024, _integer("CARTO_TILE_MAX_BYTES", 1024 * 1024))
    CARTO_TILE_CACHE_SECONDS = max(0, _integer("CARTO_TILE_CACHE_SECONDS", 86400))

    FRONTEND_URL = _text("FRONTEND_URL")
    CORS_ORIGINS = [
        origin.strip().rstrip("/")
        for origin in _text("CORS_ORIGINS").split(",")
        if origin.strip()
    ]
    CACHE_TTL_SECONDS = max(1, _integer("CACHE_TTL_SECONDS", 600))
    MAX_FETCH_LIMIT = max(1, _integer("MAX_FETCH_LIMIT", 5000))

    MAX_CONTENT_LENGTH = max(1024, _integer("MAX_CONTENT_LENGTH", 1024 * 1024))
    RATELIMIT_ENABLED = _boolean("RATELIMIT_ENABLED", True)
    RATELIMIT_STORAGE_URI = _text("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_DEFAULT = _text("RATELIMIT_DEFAULT", "120/minute")
    RATELIMIT_HEADERS_ENABLED = True
    SHARED_RATE_LIMIT_ENABLED = _boolean("SHARED_RATE_LIMIT_ENABLED", True)
    SECURITY_HEADERS_ENABLED = _boolean("SECURITY_HEADERS_ENABLED", True)

    JSON_SORT_KEYS = False


class TestConfig(Config):
    TESTING = True
    SECRET_KEY = "test-secret-key-not-for-production-0123456789"
    JWT_SECRET_KEY = "test-jwt-secret-key-not-for-production-0123456789"
    DB_BACKEND = "memory"
    SUPABASE_DB_URL = ""
    GEMINI_API_KEY = ""
    CACHE_TTL_SECONDS = 1
    RATELIMIT_ENABLED = False
