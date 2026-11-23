import logging

from flask import Blueprint, jsonify, request

from extensions import find_user, lifestyle_profiles, users
from routes.profile import _clean_lifestyle, validate_lifestyle_payload
from services.impact_calculator import FACTOR_VERSION, monthly_footprint, normalize_profile
from utils.http import error, now_utc, require_auth
from utils.validation import ensure_json_object

lifestyle_bp = Blueprint("lifestyle", __name__)
logger = logging.getLogger(__name__)


def _stored_profile(user):
    document = lifestyle_profiles.find_one({"user_id": user.get("_id")})
    if document and isinstance(document.get("profile"), dict):
        return document["profile"]
    return user.get("lifestyle") or {}


@lifestyle_bp.get("/lifestyle")
@require_auth
def get_lifestyle(user_id):
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    stored = _stored_profile(user)
    normalized = normalize_profile(stored)
    return jsonify(
        {
            "profile": {
                **normalized["flat"],
                "transport": normalized["transport"],
                "home": normalized["home"],
                "food": normalized["food"],
                "waste": normalized["waste"],
            },
            "analysis": monthly_footprint(normalized),
            "factor_version": FACTOR_VERSION,
        }
    )


def _clean_lifestyle_payload(user, data):
    incoming = data.get("lifestyle") if isinstance(data.get("lifestyle"), dict) else data
    if not isinstance(incoming, dict):
        return None, error("Lifestyle payload must be a JSON object.", 422)
    base_normalized = normalize_profile(_stored_profile(user))["flat"]
    return _clean_lifestyle(incoming, base_normalized), None


def _validate_lifestyle_request(data):
    failure = validate_lifestyle_payload(data)
    if failure:
        return failure
    incoming = data.get("lifestyle") if isinstance(data.get("lifestyle"), dict) else data
    if incoming is not data:
        return validate_lifestyle_payload(incoming)
    return None


def _persist_lifestyle(user_id, cleaned):
    try:
        lifestyle_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"user_id": user_id, "profile": cleaned, "updated_at": now_utc()}},
            upsert=True,
        )
        users.update_one({"_id": user_id}, {"$set": {"lifestyle": cleaned, "updated_at": now_utc()}})
    except Exception:
        logger.exception("Failed to save lifestyle")
        return error("Could not save lifestyle profile.", 503)
    return None


def _lifestyle_response(cleaned):
    normalized = normalize_profile(cleaned)
    return jsonify(
        {
            "profile": {**normalized["flat"], **{key: normalized[key] for key in ("transport", "home", "food", "waste")}},
            "analysis": monthly_footprint(normalized),
            "factor_version": FACTOR_VERSION,
        }
    )


@lifestyle_bp.post("/lifestyle")
@require_auth
def save_lifestyle(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    failure = _validate_lifestyle_request(data)
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    cleaned, failure = _clean_lifestyle_payload(user, data)
    if failure:
        return failure
    failure = _persist_lifestyle(user_id, cleaned)
    if failure:
        return failure
    return _lifestyle_response(cleaned)


@lifestyle_bp.post("/lifestyle/analyze")
@require_auth
def analyze_lifestyle(user_id):
    data = request.get_json(silent=True)
    if data is None:
        data = {}
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    failure = _validate_lifestyle_request(data)
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)

    incoming = data.get("lifestyle") if isinstance(data.get("lifestyle"), dict) else data
    base = _stored_profile(user)
    source = incoming if isinstance(incoming, dict) and incoming else base
    normalized = normalize_profile({**normalize_profile(base)["flat"], **(source if isinstance(source, dict) else {})})
    analysis = monthly_footprint(normalized)
    return jsonify({"analysis": analysis, "factor_version": FACTOR_VERSION})
