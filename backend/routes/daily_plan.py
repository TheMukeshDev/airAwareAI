import logging
from datetime import UTC, datetime

from flask import Blueprint, jsonify, request

from extensions import daily_plans, find_user
from security import shared_rate_limit
from services import recommendation_engine
from services.air_lookup import require_air_for_user
from services.impact_calculator import normalize_profile
from utils.http import error, iso, now_utc, require_auth
from utils.validation import ensure_json_object, parse_bool, reject_unknown_keys

daily_plan_bp = Blueprint("daily_plan", __name__)
logger = logging.getLogger(__name__)


def serialize_plan(plan):
    if not plan:
        return None
    payload = dict(plan)
    payload["id"] = str(payload.pop("_id"))
    payload["created_at"] = iso(payload.get("created_at"))
    payload["updated_at"] = iso(payload.get("updated_at"))
    return payload


def _today():
    return datetime.now(UTC).date().isoformat()


def _generate(user, regenerate=False):
    air, air_error = require_air_for_user(user)
    if air_error:
        return None, air_error
    return _build_and_store_plan(user, air, regenerate)


def _build_and_store_plan(user, air, regenerate):
    profile = normalize_profile(user.get("lifestyle") or {})
    plan = _generate_plan(user, air, profile, regenerate)
    if isinstance(plan, tuple):
        return plan
    return _store_generated_plan(user, plan)


def _generate_plan(user, air, profile, regenerate):
    try:
        return recommendation_engine.build_plan(air, profile, user.get("name"), regenerate=regenerate)
    except Exception as exc:
        logger.exception("Daily plan generation failed")
        message = "Gemini could not generate today's plan. Please retry." if "Gemini" in str(exc) else "Could not generate today's plan."
        return None, error(message, 503)


def _store_generated_plan(user, plan):
    plan.update({"user_id": user["_id"], "date": _today(), "created_at": now_utc(), "updated_at": now_utc()})
    previous = daily_plans.find_one({"user_id": user["_id"], "date": plan["date"]})
    completed = {
        action.get("id") or action.get("title"): action.get("completed")
        for action in (previous or {}).get("actions", [])
        if action.get("completed")
    }
    for action in plan["actions"]:
        key = action.get("id") or action.get("title")
        if completed.get(key) or completed.get(action.get("title")):
            action["completed"] = True
    daily_plans.delete_many({"user_id": user["_id"], "date": plan["date"]})
    try:
        result = daily_plans.insert_one(plan)
        plan["_id"] = result.inserted_id
    except Exception:
        logger.exception("Failed to store daily plan")
        # try upsert-like recovery
        existing = daily_plans.find_one({"user_id": user["_id"], "date": plan["date"]})
        if existing:
            daily_plans.update_one({"_id": existing["_id"]}, {"$set": {k: v for k, v in plan.items() if k != "_id"}})
            plan["_id"] = existing["_id"]
        else:
            return None, error("Could not store today's plan.", 503)
    return plan, None


@daily_plan_bp.get("/daily-plan/today")
@require_auth
def today_plan(user_id):
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    plan = daily_plans.find_one({"user_id": user_id, "date": _today()})
    if not plan:
        plan, failure = _generate(user, regenerate=False)
        if failure:
            return failure
    return jsonify({"plan": serialize_plan(plan)})


@daily_plan_bp.post("/daily-plan/generate")
@require_auth
@shared_rate_limit("daily_plan.generate", 20, 3600)
def generate_plan(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    failure = reject_unknown_keys(data, {"regenerate"}, "daily plan")
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    result = _existing_or_generate(user, data)
    if isinstance(result, tuple):
        plan, failure = result
    else:
        return result
    if failure:
        return failure
    return jsonify({"plan": serialize_plan(plan)})


def _existing_or_generate(user, data):
    regenerate = parse_bool(data.get("regenerate"), False)
    if not regenerate:
        existing = daily_plans.find_one({"user_id": user["_id"], "date": _today()})
        if existing:
            return jsonify({"plan": serialize_plan(existing)})
    return _generate(user, regenerate=regenerate)


def _toggle_action_value():
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return None, failure
    failure = reject_unknown_keys(data, {"completed"}, "daily plan action")
    if failure:
        return None, failure
    if not isinstance(data.get("completed"), bool):
        return None, error("completed must be a boolean.", 422)
    return data["completed"], None


@daily_plan_bp.patch("/daily-plan/<plan_id>/actions/<action_id>")
@require_auth
def toggle_action(user_id, plan_id, action_id):
    completed, failure = _toggle_action_value()
    if failure:
        return failure
    plan = daily_plans.find_one({"_id": plan_id, "user_id": user_id})
    if not plan:
        return error("Plan not found.", 404)
    actions = _toggle_plan_action(plan, action_id, completed)
    if actions is None:
        return error("Action not found in this plan.", 404)

    daily_plans.update_one({"_id": plan["_id"]}, {"$set": {"actions": actions, "updated_at": now_utc()}})
    plan["actions"] = actions
    return jsonify({"plan": serialize_plan(plan)})


def _toggle_plan_action(plan, action_id, completed):
    actions = plan.get("actions") or []
    matches = [action for action in actions if str(action.get("id")) == str(action_id)]
    if not matches:
        return None
    matches[0]["completed"] = bool(completed)
    return actions
