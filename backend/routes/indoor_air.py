import logging

from flask import Blueprint, jsonify, request

from extensions import find_user, indoor_assessments
from security import shared_rate_limit
from services import indoor_engine
from services.air_lookup import air_for_user
from utils.http import error, now_utc, require_auth
from utils.validation import ensure_json_object

indoor_bp = Blueprint("indoor", __name__)
logger = logging.getLogger(__name__)


@indoor_bp.post("/indoor/assessment")
@require_auth
@shared_rate_limit("indoor.assessment", 30, 3600)
def create_assessment(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)

    air = air_for_user(user)
    try:
        assessment = indoor_engine.assess(data, air)
    except Exception:
        logger.exception("Indoor assessment failed")
        return error("Could not assess indoor air right now.", 503)
    try:
        indoor_assessments.insert_one(
            {
                "user_id": user_id,
                "answers": data.get("answers") if isinstance(data.get("answers"), dict) else data,
                "score": assessment.get("score"),
                "label": assessment.get("label"),
                "created_at": now_utc(),
            }
        )
    except Exception:
        logger.exception("Failed to store indoor assessment")
    return jsonify({"assessment": assessment}), 201


@indoor_bp.get("/indoor/recommendations")
@require_auth
def recommendations(user_id):
    payload = indoor_engine.default_recommendations()
    payload["disclaimer"] = "General guidance, not medical advice."
    return jsonify(payload)
