import logging

from flask import Blueprint, jsonify, request

from extensions import (
    air_quality_records,
    challenge_members,
    conversations,
    daily_plans,
    find_user,
    impact_records,
    indoor_assessments,
    lifestyle_profiles,
    users,
)
from routes.auth import DEFAULT_PREFERENCES, serialize_user
from services.impact_calculator import normalize_profile
from utils.http import error, now_utc, require_auth
from utils.validation import clamp_location, ensure_json_object, parse_bool

profile_bp = Blueprint("profile", __name__)
logger = logging.getLogger(__name__)

LIFESTYLE_DEFAULTS = {
    "household_type": "apartment",
    "household_size": 1,
    "electricity_kwh_month": 180,
    "cooking_fuel": "lpg",
    "lpg_cylinders_month": 1,
    "primary_mode": "two_wheeler",
    "commute_distance_km": 12,
    "commute_days_per_week": 5,
    "weekly_other_km": 30,
    "flights_per_year": 0,
    "diet": "mixed",
    "waste": ["segregates_waste"],
}

NUMERIC_LIFESTYLE = {
    "household_size": (1, 20),
    "electricity_kwh_month": (0, 5000),
    "lpg_cylinders_month": (0, 12),
    "commute_distance_km": (0, 400),
    "commute_days_per_week": (0, 7),
    "weekly_other_km": (0, 5000),
    "flights_per_year": (0, 100),
}


def _clean_lifestyle(incoming, base):
    # base should be stored/normalized flat profile; overlay only provided keys
    base_norm = normalize_profile(base or {})["flat"] if base else dict(LIFESTYLE_DEFAULTS)
    merged = {**dict(LIFESTYLE_DEFAULTS), **base_norm}
    incoming = incoming or {}
    # flatten nested groups if provided
    for group in ("transport", "home", "food"):
        group_val = incoming.get(group)
        if isinstance(group_val, dict):
            for k, v in group_val.items():
                if k not in incoming:
                    incoming = {**incoming, k: v}
    for key, value in incoming.items():
        if key in NUMERIC_LIFESTYLE:
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            import math
            if not math.isfinite(number):
                continue
            low, high = NUMERIC_LIFESTYLE[key]
            merged[key] = max(low, min(high, number))
        elif key == "waste":
            merged[key] = value if isinstance(value, list) else ([value] if value else [])
        elif key in LIFESTYLE_DEFAULTS:
            merged[key] = value
    # Re-normalize via shared helper for canonical types/defaults
    return normalize_profile(merged)["flat"]


@profile_bp.get("/profile")
@require_auth
def get_profile(user_id):
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    return jsonify({"user": serialize_user(user)})


@profile_bp.put("/profile")
@require_auth
def update_profile(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)

    updates = {}
    if "name" in data:
        if not isinstance(data.get("name"), str):
            return error("Please enter your name.", 422)
        name = str(data.get("name", "")).strip()[:80]
        if len(name) < 2:
            return error("Please enter your name.", 422)
        updates["name"] = name

    if isinstance(data.get("location"), dict):
        location = data["location"]
        lat = location.get("latitude", (user.get("location") or {}).get("latitude", 25.4358))
        lng = location.get("longitude", (user.get("location") or {}).get("longitude", 81.8463))
        latitude, longitude, loc_err = clamp_location(lat, lng)
        if loc_err:
            return loc_err
        updates["location"] = {
            "city": str(location.get("city") or (user.get("location") or {}).get("city") or "Prayagraj")[:80],
            "state": str(location.get("state") or (user.get("location") or {}).get("state") or "Uttar Pradesh")[:80],
            "country": str(location.get("country") or "India")[:80],
            "latitude": latitude,
            "longitude": longitude,
        }

    if isinstance(data.get("preferences"), dict):
        preferred = {**(user.get("preferences") or DEFAULT_PREFERENCES), **data["preferences"]}
        for key in ("notifications", "daily_digest", "leaderboard_opt_in", "share_aggregate"):
            if key in preferred:
                preferred[key] = parse_bool(preferred[key], bool((user.get("preferences") or DEFAULT_PREFERENCES).get(key, False)))
        if preferred.get("aqi_scale") not in {"us", "india"}:
            preferred["aqi_scale"] = "us"
        updates["preferences"] = preferred

    if isinstance(data.get("lifestyle"), dict):
        base_lifestyle = user.get("lifestyle") or {}
        updates["lifestyle"] = _clean_lifestyle(data["lifestyle"], base_lifestyle)

    if not updates:
        return error("No supported fields to update.", 422)

    updates["updated_at"] = now_utc()
    users.update_one({"_id": user_id}, {"$set": updates})
    if "lifestyle" in updates:
        lifestyle_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"user_id": user_id, "profile": updates["lifestyle"], "updated_at": now_utc()}},
            upsert=True,
        )
    return jsonify({"user": serialize_user(find_user(user_id))})


@profile_bp.post("/profile/onboarding")
@require_auth
def complete_onboarding(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)

    location_in = data.get("location") if isinstance(data.get("location"), dict) else {}
    lat = location_in.get("latitude", (user.get("location") or {}).get("latitude", 25.4358))
    lng = location_in.get("longitude", (user.get("location") or {}).get("longitude", 81.8463))
    latitude, longitude, loc_err = clamp_location(lat, lng)
    if loc_err:
        return loc_err

    lifestyle = _clean_lifestyle(data.get("lifestyle") if isinstance(data.get("lifestyle"), dict) else {}, user.get("lifestyle"))
    goals = data.get("goals") if isinstance(data.get("goals"), list) else []
    preferences = {**(user.get("preferences") or DEFAULT_PREFERENCES)}
    if goals:
        preferences["goal"] = str(goals[0])[:40]
    preferences["goals"] = [str(goal)[:40] for goal in goals][:6]

    updates = {
        "location": {
            "city": str(location_in.get("city") or "Prayagraj")[:80],
            "state": str(location_in.get("state") or "Uttar Pradesh")[:80],
            "country": str(location_in.get("country") or "India")[:80],
            "latitude": latitude,
            "longitude": longitude,
        },
        "lifestyle": lifestyle,
        "preferences": preferences,
        "onboarding_complete": True,
        "updated_at": now_utc(),
    }
    users.update_one({"_id": user_id}, {"$set": updates})
    lifestyle_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "profile": lifestyle, "updated_at": now_utc()}},
        upsert=True,
    )
    return jsonify({"user": serialize_user(find_user(user_id))})


@profile_bp.delete("/profile")
@require_auth
def delete_profile(user_id):
    for store in (
        users,
        lifestyle_profiles,
        air_quality_records,
        daily_plans,
        impact_records,
        indoor_assessments,
        conversations,
    ):
        store.delete_many({"user_id": user_id} if store is not users else {"_id": user_id})
    challenge_members.delete_many({"user_id": user_id})
    return jsonify({"deleted": True})
