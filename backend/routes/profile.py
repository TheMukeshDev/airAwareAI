import logging

from flask import Blueprint, g, jsonify, request

from extensions import (
    air_quality_records,
    challenge_members,
    check_password,
    conversations,
    daily_plans,
    find_user,
    hash_password,
    impact_records,
    indoor_assessments,
    lifestyle_profiles,
    users,
)
from routes.auth import DEFAULT_PREFERENCES, serialize_user
from services.impact_calculator import normalize_profile
from utils.audit import audit_event
from utils.http import error, now_utc, require_auth, require_sensitive_confirmation, valid_email
from utils.validation import (
    bounded_number,
    bounded_text,
    clamp_location,
    ensure_json_object,
    parse_bool,
    reject_unknown_keys,
)

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

PROFILE_FIELDS = frozenset({"name", "email", "password", "current_password", "location", "preferences", "lifestyle"})
LOCATION_FIELDS = frozenset({"city", "state", "country", "latitude", "longitude"})
PREFERENCE_FIELDS = frozenset({
    "notifications", "daily_digest", "leaderboard_opt_in", "share_aggregate",
    "transport", "goal", "aqi_scale",
})
LIFESTYLE_GROUPS = {
    "transport": frozenset({
        "primary_mode", "commute_distance_km", "commute_days_per_week",
        "weekly_other_km", "flights_per_year",
    }),
    "home": frozenset({
        "household_size", "electricity_kwh_month", "cooking_fuel", "lpg_cylinders_month",
    }),
    "food": frozenset({"diet"}),
}
LIFESTYLE_FIELDS = frozenset(LIFESTYLE_DEFAULTS) | frozenset(LIFESTYLE_GROUPS)
LIFESTYLE_TEXT_FIELDS = frozenset({"household_type", "primary_mode", "cooking_fuel", "diet"})
LIFESTYLE_ENUMS = {
    "household_type": {"apartment", "house", "shared"},
    "primary_mode": {"walk", "cycle", "metro", "bus", "two_wheeler", "car_petrol", "car_diesel", "carpool"},
    "cooking_fuel": {"lpg", "png", "electricity", "biomass"},
    "diet": {"mixed", "vegetarian", "vegan", "high_meat"},
}


def _audit(event_type, outcome, reason_code, user_id=None):
    audit_event(
        event_type,
        user_id=user_id,
        outcome=outcome,
        reason_code=reason_code,
        request_id=getattr(g, "request_id", None),
    )


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
        _apply_lifestyle_value(merged, key, value)
    # Re-normalize via shared helper for canonical types/defaults
    return normalize_profile(merged)["flat"]


def _apply_lifestyle_value(merged, key, value):
    if key in NUMERIC_LIFESTYLE:
        import math
        try:
            number = float(value)
        except (TypeError, ValueError):
            return
        if math.isfinite(number):
            low, high = NUMERIC_LIFESTYLE[key]
            merged[key] = max(low, min(high, number))
    elif key == "waste":
        merged[key] = value if isinstance(value, list) else ([value] if value else [])
    elif key in LIFESTYLE_DEFAULTS:
        merged[key] = value


def _profile_updates(user, data):
    updates = {}
    name_result = _profile_name(data)
    name_updates, name_failure = _name_update(name_result)
    if name_failure:
        return {}, name_failure
    updates.update(name_updates)
    location_updates, loc_failure = _location_update(user, data)
    if loc_failure:
        return {}, loc_failure
    updates.update(location_updates)
    if isinstance(data.get("preferences"), dict):
        updates["preferences"] = _profile_preferences(user, data["preferences"])
    if isinstance(data.get("lifestyle"), dict):
        updates["lifestyle"] = _clean_lifestyle(data["lifestyle"], user.get("lifestyle") or {})
    if not updates:
        return {}, error("No supported fields to update.", 422)
    return updates, None


def _profile_name(data):
    if "name" not in data:
        return None
    if not isinstance(data.get("name"), str):
        return ("Please enter your name.", 422)
    name = str(data["name"]).strip()[:80]
    if len(name) < 2:
        return ("Please enter your name.", 422)
    return name


def _name_update(name_result):
    if name_result is None:
        return {}, None
    if isinstance(name_result, tuple):
        message, status = name_result
        return {}, error(message, status)
    return {"name": name_result}, None


def _location_update(user, data):
    location, failure = _profile_location(user, data)
    return ({}, failure) if failure else (({"location": location} if location else {}), None)


def _profile_location(user, data):
    if not isinstance(data.get("location"), dict):
        return None, None
    location = data["location"]
    base = user.get("location") or {}
    latitude, longitude, failure = clamp_location(
        location.get("latitude", base.get("latitude", 25.4358)),
        location.get("longitude", base.get("longitude", 81.8463)),
    )
    if failure:
        return None, failure
    return {
        "city": str(location.get("city") or base.get("city") or "Prayagraj")[:80],
        "state": str(location.get("state") or base.get("state") or "Uttar Pradesh")[:80],
        "country": str(location.get("country") or "India")[:80],
        "latitude": latitude,
        "longitude": longitude,
    }, None


def _profile_preferences(user, incoming):
    defaults = user.get("preferences") or DEFAULT_PREFERENCES
    preferred = {**defaults, **incoming}
    for key in ("notifications", "daily_digest", "leaderboard_opt_in", "share_aggregate"):
        if key in preferred:
            preferred[key] = parse_bool(preferred[key], bool(defaults.get(key, False)))
    preferred["aqi_scale"] = preferred.get("aqi_scale") if preferred.get("aqi_scale") in {"us", "india"} else "us"
    return preferred


def _unwrap_lifestyle_payload(payload):
    if not isinstance(payload, dict):
        return None, error("Lifestyle payload must be a JSON object.", 422)
    if "lifestyle" not in payload:
        return payload, None
    failure = reject_unknown_keys(payload, {"lifestyle"}, "lifestyle payload")
    if failure:
        return None, failure
    inner = payload["lifestyle"]
    if not isinstance(inner, dict):
        return None, error("Lifestyle payload must be a JSON object.", 422)
    return inner, None


def _validate_lifestyle_groups(payload):
    for group, allowed in LIFESTYLE_GROUPS.items():
        value = payload.get(group)
        if isinstance(value, dict):
            failure = reject_unknown_keys(value, allowed, group)
            if failure:
                return failure
    return None


def _validate_waste(value):
    if not isinstance(value, list):
        return error("waste must be a list.", 422)
    if len(value) > 20:
        return error("waste must contain at most 20 items.", 422)
    for item in value:
        _, failure = bounded_text(item, "waste item", 60, allow_empty=False)
        if failure:
            return failure
    return None


def _validate_lifestyle_enums(payload):
    for key, allowed in LIFESTYLE_ENUMS.items():
        if key in payload and payload[key] not in allowed:
            return error(f"{key} has an unsupported value.", 422)
    return None


def _validate_lifestyle_text(payload):
    for key, value in payload.items():
        if key in LIFESTYLE_TEXT_FIELDS:
            cleaned, failure = bounded_text(value, key, 80)
            if failure:
                return failure
            payload[key] = cleaned
        elif key == "waste":
            failure = _validate_waste(value)
            if failure:
                return failure
    return _validate_lifestyle_enums(payload)


def _validate_nested_lifestyle_text(payload):
    for group in ("transport", "home", "food"):
        nested = payload.get(group)
        if isinstance(nested, dict):
            failure = _validate_lifestyle_text(nested)
            if failure:
                return failure
    return None


def _validate_number_field(payload, key, minimum, maximum):
    if key not in payload:
        return None
    _, failure = bounded_number(payload[key], key, minimum, maximum)
    return failure


def _validate_nested_numbers(payload, key, minimum, maximum):
    for group in ("transport", "home"):
        nested = payload.get(group)
        if isinstance(nested, dict) and key in nested:
            return _validate_number_field(nested, key, minimum, maximum)
    return None


def _validate_lifestyle_numbers(payload):
    for key, (minimum, maximum) in NUMERIC_LIFESTYLE.items():
        failure = _validate_number_field(payload, key, minimum, maximum)
        if failure:
            return failure
        failure = _validate_nested_numbers(payload, key, minimum, maximum)
        if failure:
            return failure
    return None


def validate_lifestyle_payload(payload):
    payload, failure = _unwrap_lifestyle_payload(payload)
    if failure:
        return failure
    failure = reject_unknown_keys(payload, LIFESTYLE_FIELDS, "lifestyle payload")
    if failure:
        return failure
    failure = _validate_lifestyle_groups(payload)
    if failure:
        return failure
    failure = _validate_lifestyle_text(payload)
    if failure:
        return failure
    failure = _validate_nested_lifestyle_text(payload)
    if failure:
        return failure
    return _validate_lifestyle_numbers(payload)


def _validate_profile_payload(data):
    failure = reject_unknown_keys(data, PROFILE_FIELDS, "profile update")
    if failure:
        return failure
    failure = _validate_location_payload(data.get("location"))
    if failure:
        return failure
    if isinstance(data.get("preferences"), dict):
        failure = reject_unknown_keys(data["preferences"], PREFERENCE_FIELDS, "preferences")
        if failure:
            return failure
    if isinstance(data.get("lifestyle"), dict):
        return validate_lifestyle_payload(data["lifestyle"])
    return None


def _validate_location_payload(location):
    if not isinstance(location, dict):
        return None
    failure = reject_unknown_keys(location, LOCATION_FIELDS, "location")
    if failure:
        return failure
    for field in ("city", "state", "country"):
        if field in location:
            cleaned, failure = bounded_text(location[field], field, 80)
            if failure:
                return failure
            location[field] = cleaned
    return None


def _current_password_failure(user, data, user_id):
    if not ("email" in data or "password" in data):
        return None
    event = "password_update" if "password" in data else "profile_update"
    current = data.get("current_password")
    if not isinstance(current, str) or not current:
        _audit(event, "failure", "missing_current_password", user_id)
        return error("current_password is required.", 400)
    if not check_password(current, user.get("password_hash") or ""):
        _audit(event, "failure", "invalid_current_password", user_id)
        return error("Current password is invalid.", 401)
    return None


def _validated_email(email, user_id):
    if not isinstance(email, str) or len(email) > 254 or not valid_email(email):
        return None, error("Enter a valid email address.", 422)
    normalized = email.strip().lower()
    existing = users.find_one({"email": normalized})
    if existing and str(existing.get("_id")) != str(user_id):
        return None, error("An account with this email already exists.", 409)
    return normalized, None


def _validated_new_password(password, user_id):
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        _audit("password_update", "failure", "invalid_password", user_id)
        return None, error("Password must be between 8 and 128 characters.", 422)
    try:
        too_long = len(password.encode("utf-8")) > 72
    except Exception:
        return None, error("Invalid password.", 422)
    if too_long:
        _audit("password_update", "failure", "invalid_password", user_id)
        return None, error("Password must be at most 72 bytes.", 422)
    return password, None


def _credential_updates(user, data, user_id):
    failure = _current_password_failure(user, data, user_id)
    if failure:
        return {}, failure
    updates = {}
    if "email" in data:
        email, failure = _validated_email(data["email"], user_id)
        if failure:
            return {}, failure
        updates["email"] = email
    if "password" in data:
        password, failure = _validated_new_password(data["password"], user_id)
        if failure:
            return {}, failure
        updates["password_hash"] = hash_password(password)
    return updates, None


def _profile_field_updates(user, data):
    if not any(key in data for key in ("name", "location", "preferences", "lifestyle")):
        return {}, None
    return _profile_updates(user, data)


def _persist_profile_updates(user_id, updates):
    updates["updated_at"] = now_utc()
    users.update_one({"_id": user_id}, {"$set": updates})
    if "lifestyle" in updates:
        lifestyle_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"user_id": user_id, "profile": updates["lifestyle"], "updated_at": now_utc()}},
            upsert=True,
        )


def _audit_profile_update(data, user_id):
    if "password" in data:
        _audit("password_update", "success", "updated", user_id=user_id)
    else:
        _audit("profile_updated", "success", "fields_changed", user_id=user_id)


def _validate_goals(goals):
    if not isinstance(goals, list) or len(goals) > 6:
        return error("goals must be a list of at most 6 items.", 422)
    for goal in goals:
        _, failure = bounded_text(goal, "goal", 40, allow_empty=False)
        if failure:
            return failure
    return None


def _onboarding_updates(user, data):
    location_in = data.get("location") if isinstance(data.get("location"), dict) else {}
    base_location = user.get("location") or {}
    latitude, longitude, failure = clamp_location(
        location_in.get("latitude", base_location.get("latitude", 25.4358)),
        location_in.get("longitude", base_location.get("longitude", 81.8463)),
    )
    if failure:
        return None, failure
    lifestyle = _clean_lifestyle(
        data.get("lifestyle") if isinstance(data.get("lifestyle"), dict) else {},
        user.get("lifestyle"),
    )
    goals = data.get("goals") or []
    preferences = {**(user.get("preferences") or DEFAULT_PREFERENCES)}
    if goals:
        preferences["goal"] = str(goals[0])[:40]
    preferences["goals"] = [str(goal)[:40] for goal in goals][:6]
    return {
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
    }, None


def _persist_onboarding(user_id, updates):
    users.update_one({"_id": user_id}, {"$set": updates})
    lifestyle_profiles.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "profile": updates["lifestyle"], "updated_at": now_utc()}},
        upsert=True,
    )


def _deletion_failure(user, user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data or {})
    if failure:
        _audit("account_deleted", "failure", "invalid_payload", user_id=user_id)
        return failure
    failure = reject_unknown_keys(data, {"confirm_delete", "current_password"}, "account deletion")
    if failure:
        _audit("account_deleted", "failure", "unexpected_fields", user_id=user_id)
        return failure
    if data.get("confirm_delete") is not True:
        _audit("account_deleted", "failure", "confirmation_required", user_id=user_id)
        return error("confirm_delete=true is required.", 400)
    current_password = data.get("current_password")
    if not isinstance(current_password, str) or not current_password:
        _audit("account_deleted", "failure", "missing_current_password", user_id=user_id)
        return error("current_password is required.", 400)
    if not check_password(current_password, user.get("password_hash") or ""):
        _audit("account_deleted", "failure", "invalid_current_password", user_id=user_id)
        return error("Current password is invalid.", 401)
    return None


def _delete_user_data(user_id):
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


@profile_bp.get("/profile")
@require_auth
def get_profile(user_id):
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    return jsonify({"user": serialize_user(user)})


def _prepare_profile_update(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return None, None, failure
    failure = _validate_profile_payload(data)
    if failure:
        return None, None, failure
    user = find_user(user_id)
    if not user:
        return None, None, error("Profile not found.", 404)
    return data, user, None


@profile_bp.put("/profile")
@require_auth
@require_sensitive_confirmation(event_type="profile_update", max_body_bytes=16384)
def update_profile(user_id):
    data, user, failure = _prepare_profile_update(user_id)
    if failure:
        return failure
    credentials, failure = _credential_updates(user, data, user_id)
    if failure:
        return failure
    fields, failure = _profile_field_updates(user, data)
    if failure:
        return failure
    updates = {**credentials, **fields}
    if not updates:
        return error("No supported fields to update.", 422)
    _persist_profile_updates(user_id, updates)
    _audit_profile_update(data, user_id)
    return jsonify({"user": serialize_user(find_user(user_id))})


@profile_bp.post("/profile/onboarding")
@require_auth
def complete_onboarding(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    failure = reject_unknown_keys(data, {"location", "lifestyle", "goals", "preferences"}, "onboarding")
    if failure:
        return failure
    failure = _validate_goals(data.get("goals", []))
    if failure:
        return failure
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    updates, failure = _onboarding_updates(user, data)
    if failure:
        return failure
    _persist_onboarding(user_id, updates)
    return jsonify({"user": serialize_user(find_user(user_id))})


@profile_bp.delete("/profile")
@require_auth
@require_sensitive_confirmation(event_type="account_deletion", max_body_bytes=4096)
def delete_profile(user_id):
    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)
    failure = _deletion_failure(user, user_id)
    if failure:
        return failure
    _delete_user_data(user_id)
    _audit("account_deleted", "success", "deleted", user_id=user_id)
    return jsonify({"deleted": True})
