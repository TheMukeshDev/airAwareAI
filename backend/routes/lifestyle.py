import logging

from flask import Blueprint, jsonify, request

from extensions import find_user, lifestyle_profiles, users
from routes.profile import _clean_lifestyle
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


@lifestyle_bp.post("/lifestyle")
@require_auth
def save_lifestyle(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)

    incoming = data.get("lifestyle") if isinstance(data.get("lifestyle"), dict) else data
    if not isinstance(incoming, dict):
        return error("Lifestyle payload must be a JSON object.", 422)

    stored = _stored_profile(user)
    base_normalized = normalize_profile(stored)["flat"]
    merged = dict(base_normalized)
    # overlay only keys explicitly supplied by client
    for key, value in incoming.items():
        merged[key] = value
        if isinstance(value, dict):
            merged[key] = value
    # _clean_lifestyle applies normalization/default bounds from merged input onto base
    cleaned = _clean_lifestyle(incoming, base_normalized)
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
    normalized = normalize_profile(cleaned)
    return jsonify(
        {
            "profile": {**normalized["flat"], **{key: normalized[key] for key in ("transport", "home", "food", "waste")}},
            "analysis": monthly_footprint(normalized),
            "factor_version": FACTOR_VERSION,
        }
    )


@lifestyle_bp.post("/lifestyle/analyze")
@require_auth
def analyze_lifestyle(user_id):
    data = request.get_json(silent=True)
    if data is None:
        data = {}
    data, failure = ensure_json_object(data)
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
