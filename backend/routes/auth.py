import logging
import re

from flask import Blueprint, g, jsonify
from flask_jwt_extended import create_access_token, get_jwt, jwt_required

from db import IntegrityConflict
from extensions import check_password, hash_password, token_denylist, users
from utils.audit import audit_event
from utils.http import error, iso, now_utc, parse_json, valid_email
from utils.validation import bounded_text, clamp_location, reject_unknown_keys

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)
AUTH_SCHEME = "Bearer"

DEFAULT_PREFERENCES = {
    "notifications": True,
    "daily_digest": True,
    "leaderboard_opt_in": False,
    "share_aggregate": True,
    "aqi_scale": "us",
    "goal": "reduce_emissions",
}

DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing")
WEAK_PASSWORDS = frozenset({"password", "password1", "12345678", "qwerty12", "letmein1", "admin123"})
REGISTRATION_FIELDS = frozenset({"name", "email", "password", "consent", "location"})
LOGIN_FIELDS = frozenset({"email", "password"})


def _audit(event_type, outcome, reason_code, user_id=None):
    audit_event(
        event_type,
        user_id=user_id,
        outcome=outcome,
        reason_code=reason_code,
        request_id=getattr(g, "request_id", None),
    )



def serialize_user(user):
    if not user:
        return None
    return {
        "id": str(user.get("_id")),
        "name": user.get("name"),
        "email": user.get("email"),
        "location": user.get("location") or {},
        "lifestyle": user.get("lifestyle") or {},
        "preferences": user.get("preferences") or DEFAULT_PREFERENCES,
        "onboarding_complete": bool(user.get("onboarding_complete")),
        "created_at": iso(user.get("created_at")),
    }


def _clean_name(value):
    return re.sub(r"\s+", " ", (value or "").strip())[:80]


def _password_too_long(password):
    try:
        return len(password.encode("utf-8")) > 72
    except Exception:
        return True


def _password_is_weak(password):
    stripped = password.strip()
    return (
        not stripped
        or stripped.lower() in WEAK_PASSWORDS
        or len(set(stripped)) < 4
    )


def _validate_registration(name_raw, email_raw, password):
    name = _clean_name(name_raw)
    email = email_raw.strip().lower()
    validations = (
        (len(name) >= 2, "Please enter your name.", 422),
        (valid_email(email), "Enter a valid email address.", 422),
        (len(password) >= 8, "Password must be at least 8 characters.", 422),
        (len(password) <= 128 and not _password_too_long(password), "Password must be at most 72 bytes.", 422),
        (not _password_is_weak(password), "Choose a stronger password.", 422),
    )
    for valid, message, status in validations:
        if not valid:
            return name, email, error(message, status)
    return name, email, None


def _validate_registration_identity(data):
    name_raw, email_raw, password = data.get("name"), data.get("email"), data.get("password")
    if not isinstance(name_raw, str) or not isinstance(email_raw, str) or not isinstance(password, str):
        return error("Invalid registration payload.", 422)
    name, failure = bounded_text(name_raw, "name", 80, allow_empty=False)
    if failure:
        return failure
    consent = data.get("consent")
    if consent is not None and not isinstance(consent, bool):
        return error("consent must be a boolean.", 422)
    data["name"] = name
    data["email"] = email_raw.strip().lower()
    return None


def _clean_location_text(location):
    for field in ("city", "state", "country"):
        if field in location:
            cleaned, failure = bounded_text(location[field], field, 80)
            if failure:
                return failure
            location[field] = cleaned
    return None


def _validate_registration_location(location):
    if location is None:
        return None
    if not isinstance(location, dict):
        return error("location must be a JSON object.", 422)
    failure = reject_unknown_keys(location, {"city", "state", "country", "latitude", "longitude"}, "location")
    if failure:
        return failure
    return _clean_location_text(location)


def _registration_payload():
    data, failure = parse_json("name", "email", "password")
    if failure:
        return None, failure
    failure = reject_unknown_keys(data, REGISTRATION_FIELDS, "registration payload")
    if failure:
        return None, failure
    failure = _validate_registration_identity(data)
    if failure:
        return None, failure
    failure = _validate_registration_location(data.get("location"))
    if failure:
        return None, failure
    return data, None


def _find_existing_registration(email):
    try:
        existing = users.find_one({"email": email})
    except Exception:
        logger.exception("Failed to check existing user during registration")
        return error("Registration is temporarily unavailable.", 503)
    if existing:
        return error("An account with this email already exists. Try signing in.", 409)
    return None


@auth_bp.post("/register")
def register():
    data, failure = _registration_payload()
    if failure:
        _audit("registration", "failure", "invalid_payload")
        return failure
    name, email, password_error = _validate_registration(data["name"], data["email"], data["password"])
    if password_error:
        _audit("registration", "failure", "invalid_fields")
        return password_error
    existing_result = _find_existing_registration(email)
    if existing_result is not None:
        _audit("registration", "failure", "duplicate_email")
        return existing_result
    location_in = data.get("location") if isinstance(data.get("location"), dict) else {}
    latitude, longitude, loc_err = clamp_location(
        location_in.get("latitude", 25.4358),
        location_in.get("longitude", 81.8463),
    )
    if loc_err:
        _audit("registration", "failure", "invalid_location")
        return loc_err
    user = _registration_user(name, email, data["password"], location_in, latitude, longitude)
    result = _insert_registration(user)
    if result[1] < 400:
        _audit("registration", "success", "created")
    return result


def _registration_user(name, email, password, location, latitude, longitude):
    return {
        "name": name, "email": email, "password_hash": hash_password(password),
        "location": {
            "city": str(location.get("city", "Prayagraj"))[:80],
            "state": str(location.get("state", "Uttar Pradesh"))[:80],
            "country": str(location.get("country", "India"))[:80],
            "latitude": latitude, "longitude": longitude,
        },
        "lifestyle": {}, "preferences": dict(DEFAULT_PREFERENCES),
        "onboarding_complete": False, "created_at": now_utc(), "updated_at": now_utc(),
    }


def _insert_registration(user):
    try:
        result = users.insert_one(user)
        user["_id"] = result.inserted_id
    except IntegrityConflict:
        return error("An account with this email already exists. Try signing in.", 409)
    except Exception:
        logger.exception("Failed to create user")
        return error("Registration is temporarily unavailable.", 503)

    token = create_access_token(identity=str(result.inserted_id))
    return jsonify({"access_token": token, "token_type": AUTH_SCHEME, "user": serialize_user(user)}), 201


def _login_payload():
    data, failure = parse_json("email", "password")
    if failure:
        return None, failure
    failure = reject_unknown_keys(data, LOGIN_FIELDS, "login payload")
    if failure:
        return None, failure
    email_raw, password = data.get("email"), data.get("password")
    if not isinstance(email_raw, str) or not isinstance(password, str):
        return None, error("Invalid email or password.", 401)
    if _password_too_long(password):
        check_password("dummy", DUMMY_PASSWORD_HASH)
        return None, error("Invalid email or password.", 401)
    return (email_raw.strip().lower(), password), None


@auth_bp.post("/login")
def login():
    credentials, failure = _login_payload()
    if failure:
        _audit("login_failure", "failure", "invalid_payload")
        return failure
    email, password = credentials
    try:
        user = users.find_one({"email": email})
    except Exception:
        logger.exception("Failed to look up user during login")
        return error("Login is temporarily unavailable.", 503)
    hashed = (user or {}).get("password_hash") or DUMMY_PASSWORD_HASH
    valid = check_password(password, hashed) and user is not None
    if not valid:
        _audit("login_failure", "failure", "invalid_credentials")
        return error("Invalid email or password.", 401)
    _audit("login", "success", "authenticated", user_id=user["_id"])
    token = create_access_token(identity=str(user["_id"]))
    return jsonify({"access_token": token, "token_type": AUTH_SCHEME, "user": serialize_user(user)})


@auth_bp.post("/logout")
@jwt_required()
def logout():
    claims = get_jwt()
    token_denylist.revoke(claims.get("jti"), claims.get("exp"))
    return jsonify({"message": "Signed out."})
