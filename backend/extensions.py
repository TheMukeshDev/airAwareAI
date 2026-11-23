import threading
import time

import bcrypt as bcrypt_lib
from flask import has_request_context, request
from flask_jwt_extended import JWTManager, get_jwt_identity
from flask_limiter import Limiter

import db as database

jwt = JWTManager()


def _client_ip():
    value = request.headers.get("X-Vercel-Forwarded-For", "")
    for candidate in value.split(","):
        candidate = candidate.strip()
        if candidate:
            return candidate
    return request.remote_addr or "unknown"


def _rate_limit_key():
    if not has_request_context():
        return "anonymous"
    try:
        identity = get_jwt_identity()
    except Exception:
        identity = None
    if identity:
        return f"user:{identity}"
    return f"ip:{_client_ip()}"


limiter = Limiter(key_func=_rate_limit_key, default_limits=[])


class TokenDenylist:
    """Process-local cache with a Postgres-backed source of truth when configured."""

    def __init__(self):
        self._entries = {}
        self._lock = threading.Lock()

    def revoke(self, jti, expires_at=None):
        if not jti:
            return
        key = str(jti)
        expiry = float(expires_at) if expires_at else time.time() + 12 * 3600
        with self._lock:
            self._entries[key] = expiry
            self._prune_locked()
        if database.storage_mode() == "supabase":
            database.revoke_token(key, expiry)

    def is_revoked(self, jti):
        if not jti:
            return False
        key = str(jti)
        with self._lock:
            self._prune_locked()
            local = key in self._entries
        if database.storage_mode() == "supabase":
            return database.is_token_revoked(key) or local
        return local

    def _prune_locked(self):
        now = time.time()
        for key in [key for key, expiry in self._entries.items() if expiry <= now]:
            self._entries.pop(key, None)


token_denylist = TokenDenylist()

users = database.collection("users")
lifestyle_profiles = database.collection("lifestyle_profiles")
air_quality_records = database.collection("air_quality_records")
daily_plans = database.collection("daily_plans")
activities = database.collection("activities")
impact_records = database.collection("impact_records")
indoor_assessments = database.collection("indoor_assessments")
conversations = database.collection("conversations")
challenges = database.collection("challenges")
challenge_members = database.collection("challenge_members")
community_stats = database.collection("community_stats")
notifications = database.collection("notifications")


def hash_password(password: str) -> str:
    return bcrypt_lib.hashpw(password.encode("utf-8"), bcrypt_lib.gensalt(rounds=12)).decode("utf-8")


def check_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt_lib.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def find_user(user_id):
    if not user_id:
        return None
    return users.find_one({"_id": database.to_oid(user_id)})
