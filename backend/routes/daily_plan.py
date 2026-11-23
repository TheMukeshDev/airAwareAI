import logging
from datetime import UTC, datetime

from flask import Blueprint, jsonify, request

from extensions import daily_plans, find_user
from security import shared_rate_limit
from services import recommendation_engine
from services.air_lookup import require_air_for_user
from services.impact_calculator import normalize_profile
from utils.http import error, iso, now_utc, require_auth
from utils.validation import ensure_json_object, parse_bool

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
    profile = normalize_profile(user.get("lifestyle") or {})
    try:
        plan = recommendation_engine.build_plan(air, profile, user.get("name"), regenerate=regenerate)
    except Exception as exc:
        logger.exception("Daily plan generation failed")
        if "Gemini" in str(exc):
            return None, error("Gemini could not generate today's plan. Please retry.", 503)
        return None, error("Could not generate today's plan.", 503)
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
    if data is None:
        data = {}
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)

    regenerate = parse_bool(data.get("regenerate"), False)
    if not regenerate:
        existing = daily_plans.find_one({"user_id": user_id, "date": _today()})
        if existing:
            return jsonify({"plan": serialize_plan(existing)})
    plan, failure = _generate(user, regenerate=regenerate)
    if failure:
        return failure
    return jsonify({"plan": serialize_plan(plan)})


@daily_plan_bp.patch("/daily-plan/<plan_id>/actions/<action_id>")
@require_auth
def toggle_action(user_id, plan_id, action_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    if "completed" not in data:
        return error("completed is required.", 422)
    completed = parse_bool(data.get("completed"), False)

    plan = daily_plans.find_one({"_id": plan_id, "user_id": user_id})
    if not plan:
        return error("Plan not found.", 404)

    actions = plan.get("actions") or []
    found = False
    for action in actions:
        if str(action.get("id")) == str(action_id):
            action["completed"] = bool(completed)
            found = True
            break
    if not found:
        return error("Action not found in this plan.", 404)

    daily_plans.update_one({"_id": plan["_id"]}, {"$set": {"actions": actions, "updated_at": now_utc()}})
    plan["actions"] = actions
    return jsonify({"plan": serialize_plan(plan)})
