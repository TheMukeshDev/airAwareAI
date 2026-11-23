import logging

from flask import Blueprint, jsonify, request

from extensions import find_user, indoor_assessments
from security import shared_rate_limit
from services import indoor_engine
from services.air_lookup import air_for_user
from utils.http import error, now_utc, require_auth
from utils.validation import bounded_number, ensure_json_object, reject_unknown_keys

indoor_bp = Blueprint("indoor", __name__)
logger = logging.getLogger(__name__)

ASSESSMENT_FIELDS = frozenset({
    "ventilates_daily", "cooking_exhaust", "purifier", "air_tight_home",
    "damp_or_mould", "smoking_indoor", "incense_or_coils", "pets",
    "road_facing", "hours_home_outdoors", "outdoor_aqi",
})
ASSESSMENT_NUMBERS = (("hours_home_outdoors", 0, 24), ("outdoor_aqi", 0, 5000))


def _assessment_answers(data):
    answers = data.get("answers") if isinstance(data.get("answers"), dict) else data
    if not isinstance(answers, dict):
        return None, error("answers must be a JSON object.", 422)
    return answers, None


def _validate_assessment_numbers(answers):
    for name, minimum, maximum in ASSESSMENT_NUMBERS:
        if name in answers:
            _, failure = bounded_number(answers[name], name, minimum, maximum)
            if failure:
                return failure
    return None


def _validate_assessment_payload(data, answers):
    if isinstance(data.get("answers"), dict):
        failure = reject_unknown_keys(data, {"answers"}, "indoor assessment")
        if failure:
            return failure
    failure = reject_unknown_keys(answers, ASSESSMENT_FIELDS, "indoor answers")
    if failure:
        return failure
    return _validate_assessment_numbers(answers)


def _store_assessment(user_id, data, assessment):
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


@indoor_bp.post("/indoor/assessment")
@require_auth
@shared_rate_limit("indoor.assessment", 30, 3600)
def create_assessment(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    answers, failure = _assessment_answers(data)
    if failure:
        return failure
    failure = _validate_assessment_payload(data, answers)
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
    _store_assessment(user_id, data, assessment)
    return jsonify({"assessment": assessment}), 201


@indoor_bp.get("/indoor/recommendations")
@require_auth
def recommendations(user_id):
    payload = indoor_engine.default_recommendations()
    payload["disclaimer"] = "General guidance, not medical advice."
    return jsonify(payload)
