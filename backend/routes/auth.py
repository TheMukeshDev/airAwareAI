import logging
import re

from flask import Blueprint, jsonify
from flask_jwt_extended import create_access_token, get_jwt, jwt_required

from db import IntegrityConflict
from extensions import check_password, hash_password, token_denylist, users
from utils.http import error, iso, now_utc, parse_json, valid_email
from utils.validation import clamp_location

auth_bp = Blueprint("auth", __name__)
logger = logging.getLogger(__name__)

DEFAULT_PREFERENCES = {
    "notifications": True,
    "daily_digest": True,
    "leaderboard_opt_in": False,
    "share_aggregate": True,
    "aqi_scale": "us",
    "goal": "reduce_emissions",
}

DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing")


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


@auth_bp.post("/register")
def register():
    data, failure = parse_json("name", "email", "password")
    if failure:
        return failure

    name_raw = data.get("name")
    email_raw = data.get("email")
    password = data.get("password")
    if not isinstance(name_raw, str) or not isinstance(email_raw, str) or not isinstance(password, str):
        return error("Invalid registration payload.", 422)

    name = _clean_name(name_raw)
    email = email_raw.strip().lower()

    if len(name) < 2:
        return error("Please enter your name.", 422)
    if not valid_email(email):
        return error("Enter a valid email address.", 422)
    if len(password) < 8:
        return error("Password must be at least 8 characters.", 422)
    if len(password) > 128 or _password_too_long(password):
        return error("Password must be at most 72 bytes.", 422)

    try:
        existing = users.find_one({"email": email})
    except Exception:
        logger.exception("Failed to check existing user during registration")
        return error("Registration is temporarily unavailable.", 503)
    if existing:
        return error("An account with this email already exists. Try signing in.", 409)

    location_in = data.get("location") if isinstance(data.get("location"), dict) else {}
    lat = location_in.get("latitude", 25.4358)
    lng = location_in.get("longitude", 81.8463)
    latitude, longitude, loc_err = clamp_location(lat, lng)
    if loc_err:
        return loc_err

    user = {
        "name": name,
        "email": email,
        "password_hash": hash_password(password),
        "location": {
            "city": str(location_in.get("city", "Prayagraj"))[:80],
            "state": str(location_in.get("state", "Uttar Pradesh"))[:80],
            "country": str(location_in.get("country", "India"))[:80],
            "latitude": latitude,
            "longitude": longitude,
        },
        "lifestyle": {},
        "preferences": dict(DEFAULT_PREFERENCES),
        "onboarding_complete": False,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    try:
        result = users.insert_one(user)
        user["_id"] = result.inserted_id
    except IntegrityConflict:
        return error("An account with this email already exists. Try signing in.", 409)
    except Exception:
        logger.exception("Failed to create user")
        return error("Registration is temporarily unavailable.", 503)

    token = create_access_token(identity=str(result.inserted_id))
    return jsonify({"access_token": token, "token_type": "Bearer", "user": serialize_user(user)}), 201


@auth_bp.post("/login")
def login():
    data, failure = parse_json("email", "password")
    if failure:
        return failure
    email_raw = data.get("email")
    password = data.get("password")
    if not isinstance(email_raw, str) or not isinstance(password, str):
        return error("Invalid email or password.", 401)
    if _password_too_long(password):
        # still do dummy check to keep timing similar
        check_password("dummy", DUMMY_PASSWORD_HASH)
        return error("Invalid email or password.", 401)
    email = email_raw.strip().lower()
    try:
        user = users.find_one({"email": email})
    except Exception:
        logger.exception("Failed to look up user during login")
        return error("Login is temporarily unavailable.", 503)
    hashed = (user or {}).get("password_hash") or DUMMY_PASSWORD_HASH
    valid = check_password(password, hashed) and user is not None
    if not valid:
        return error("Invalid email or password.", 401)
    token = create_access_token(identity=str(user["_id"]))
    return jsonify({"access_token": token, "token_type": "Bearer", "user": serialize_user(user)})


@auth_bp.post("/logout")
@jwt_required()
def logout():
    claims = get_jwt()
    token_denylist.revoke(claims.get("jti"), claims.get("exp"))
    return jsonify({"message": "Signed out."})
