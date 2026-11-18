import logging

from flask import Blueprint, jsonify, request

from extensions import find_user
from services import impact_calculator
from utils.http import error, pagination, require_auth
from utils.validation import ensure_json_object

impact_bp = Blueprint("impact", __name__)
logger = logging.getLogger(__name__)

PERIODS = {"7d": 7, "30d": 30, "90d": 90, "year": 365}


@impact_bp.get("/impact/personal")
@require_auth
def personal(user_id):
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    period = request.args.get("period", "30d")
    days = PERIODS.get(period, 30)
    return jsonify(impact_calculator.personal_summary(user_id, days=days))


@impact_bp.post("/impact/log")
@require_auth
def log_activity(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    try:
        record = impact_calculator.log_journey(user_id, data)
    except (TypeError, ValueError):
        return error("Invalid activity details.", 422)

    except Exception:
        logger.exception("Failed to log impact activity")
        return error("Could not log activity.", 503)
    return jsonify({"record": record}), 201


@impact_bp.get("/impact/history")
@require_auth
def activity_history(user_id):
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    page, per_page = pagination(default_per_page=8)
    try:
        payload = impact_calculator.history(user_id, page=page, per_page=per_page)
    except Exception:
        logger.exception("Failed to load impact history")
        return error("Could not load activity history.", 503)
    return jsonify(payload)
