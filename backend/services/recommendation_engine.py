import logging
import re
from datetime import UTC, datetime

from services import gemini_service
from services.impact_calculator import FACTOR_VERSION, FACTORS, MODE_LABELS, normalize_profile, transport_factor

logger = logging.getLogger(__name__)

SLOT_ORDER = {"morning": 0, "midday": 1, "afternoon": 2, "evening": 3, "night": 4}


def _aqi_band(aqi):
    if aqi is None:
        return "unknown"
    if aqi <= 50:
        return "good"
    if aqi <= 100:
        return "moderate"
    if aqi <= 150:
        return "unhealthy_sensitive"
    if aqi <= 200:
        return "unhealthy"
    if aqi <= 300:
        return "very_unhealthy"
    return "hazardous"


def _alert(aqi):
    if aqi is None:
        return None
    if aqi > 300:
        return {"level": "severe", "message": "Hazardous air today. Keep indoor air clean and avoid outdoor exertion."}
    if aqi > 200:
        return {"level": "high", "message": "Very unhealthy air. Mask up if you must go out and keep windows closed."}
    if aqi > 150:
        return {"level": "elevated", "message": "Unhealthy for sensitive groups. Shorten outdoor time where you can."}
    return None


def _profile_sources(profile):
    profile = profile or {}
    normalized = normalize_profile(profile)
    transport = normalized["transport"]
    home = normalized["home"]
    flat = normalized["flat"]
    transport.update({k: profile.get(k) for k in ("primary_mode", "commute_distance_km") if profile.get(k) is not None})
    home.update({k: profile.get(k) for k in ("electricity_kwh_month", "cooking_fuel") if profile.get(k) is not None})
    # Prefer explicit flat keys from incoming profile over empty normalized defaults
    for key in ("primary_mode", "commute_distance_km", "electricity_kwh_month"):
        if key in profile and profile.get(key) is not None:
            flat[key] = profile.get(key)
    return transport, home, flat


def _commute_action(profile, aqi):
    transport, _home, flat = _profile_sources(profile)
    mode = transport.get("primary_mode") or flat.get("primary_mode") or "two_wheeler"
    distance = float(transport.get("commute_distance_km") or flat.get("commute_distance_km") or 0)
    if distance <= 0 or mode in {"walk", "cycle", "metro", "bus"}:
        return None
    alt = "metro" if distance >= 5 else "bus"
    base_factor = transport_factor(mode) or 0
    alt_factor = transport_factor(alt) or 0
    saving = max(0.0, (base_factor - alt_factor) * distance * 2)
    if saving <= 0.05:
        return None
    return {
        "title": f"Take the {MODE_LABELS.get(alt, alt).lower()} for today's commute",
        "detail": f"A {distance:g} km one-way trip by {MODE_LABELS.get(mode, mode).lower()} is replaced by public transport for the round trip.",
        "why": "Public transport moves more people per unit of fuel, so the same trip emits far less.",
        "priority": "medium",
        "slot": "morning",
        "co2_saved_kg": round(saving, 2),
        "safety": "Carry a mask for the walk to the stop if AQI is above 150.",
        "category": "mobility",
        "factor_version": FACTOR_VERSION,
    }


def build_actions(context, profile):
    aqi = context.get("aqi")
    pm2_5 = context.get("pm2_5")
    window = context.get("outdoor_window") or {}
    actions = []

    if window.get("label"):
        if aqi is not None and aqi <= 100:
            actions.append(
                {
                    "title": f"Open windows during {window['label']}",
                    "detail": f"Modelled PM2.5 is lowest around then (about {window.get('pm2_5')} ug/m3). Air the rooms for 15-20 minutes.",
                    "why": "Outdoor particulate levels set how much pollution comes in when you ventilate.",
                    "priority": "high",
                    "slot": "morning",
                    "co2_saved_kg": 0.0,
                    "safety": "Close windows before traffic peaks and if you smell smoke.",
                    "category": "indoor_air",
                    "factor_version": FACTOR_VERSION,
                }
            )
        else:
            actions.append(
                {
                    "title": f"Keep windows closed, then ventilate at {window['label']}",
                    "detail": "Today's outdoor PM2.5 stays elevated. The cleanest modelled window is short, so use it and close up again.",
                    "why": "Ventilating during the cleanest window limits how much pollution settles indoors.",
                    "priority": "high",
                    "slot": "morning",
                    "co2_saved_kg": 0.0,
                    "safety": "Do not seal a room with a running gas appliance or open flame.",
                    "category": "indoor_air",
                    "factor_version": FACTOR_VERSION,
                }
            )

    if aqi is not None and aqi > 150:
        actions.append(
            {
                "title": "Move the workout indoors",
                "detail": "Swap the run or cycle for an indoor session, and keep the session shorter than usual.",
                "why": "Breathing rate rises several times during exercise, which multiplies the pollution inhaled.",
                "priority": "high",
                "slot": "evening",
                "co2_saved_kg": 0.0,
                "safety": "Stop and rest if you feel chest tightness or a cough.",
                "category": "health",
                "factor_version": FACTOR_VERSION,
            }
        )
    else:
        actions.append(
            {
                "title": "Use the cleaner hours for outdoor movement",
                "detail": f"Aim for a walk or cycle around {window.get('label') or 'early morning'} when PM2.5 is lowest.",
                "why": "Same distance, less pollution inhaled, and walking or cycling emits nothing at the tailpipe.",
                "priority": "medium",
                "slot": "morning",
                "co2_saved_kg": 0.0,
                "safety": "Choose a side street away from traffic where possible.",
                "category": "health",
                "factor_version": FACTOR_VERSION,
            }
        )

    commute = _commute_action(profile, aqi)
    if commute:
        actions.append(commute)

    actions.append(
        {
            "title": "Damp-mop floors instead of dry sweeping",
            "detail": "A wet cloth or mop picks up settled dust instead of lifting it back into the air.",
            "why": "Settled dust is a large share of indoor PM2.5 in homes near roads.",
            "priority": "medium",
            "slot": "afternoon",
            "co2_saved_kg": 0.0,
            "safety": "Avoid bleach and strong cleaners in a closed room.",
            "category": "indoor_air",
            "factor_version": FACTOR_VERSION,
        }
    )

    _transport, home, flat = _profile_sources(profile)
    kwh = float(home.get("electricity_kwh_month") or flat.get("electricity_kwh_month") or 0)
    if kwh > 80:
        saving = round(kwh * 0.05 * FACTORS["electricity"]["grid_factor"], 2)
        actions.append(
            {
                "title": "Run cooling and heavy appliances in one block",
                "detail": "Batch laundry, dishwashing and charging into the coolest part of the day and skip standby power.",
                "why": "Small demand reductions add up across the month on the grid's emission factor.",
                "priority": "low",
                "slot": "evening",
                "co2_saved_kg": saving,
                "safety": "Keep vents and exhaust fans unobstructed.",
                "category": "energy",
                "factor_version": FACTOR_VERSION,
            }
        )

    if pm2_5 is not None and pm2_5 > 60:
        actions.append(
            {
                "title": "Check the purifier filter and run it on low",
                "detail": "A dirty pre-filter cuts airflow and efficiency. Run the purifier in the room you use most.",
                "why": "Indoor filtration reduces exposure when outdoor PM2.5 is high.",
                "priority": "medium",
                "slot": "night",
                "co2_saved_kg": 0.0,
                "safety": "Do not use an ozone-generating 'air cleaner'.",
                "category": "indoor_air",
                "factor_version": FACTOR_VERSION,
            }
        )

    for index, action in enumerate(actions):
        action["id"] = f"a{index + 1}"
        action["completed"] = False
        action.setdefault("window", window.get("label"))
    actions.sort(key=lambda action: (SLOT_ORDER.get(action.get("slot"), 9), {"high": 0, "medium": 1, "low": 2}.get(action.get("priority"), 3)))
    return actions


def _numeric_tokens(text):
    if not text:
        return set()
    return set(re.findall(r"\d+(?:\.\d+)?", str(text)))


def _allowed_numeric_context(context, actions):
    allowed = set()
    for value in (context or {}).values():
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            allowed.add(str(value).rstrip("0").rstrip(".") if isinstance(value, float) else str(value))
            allowed.add(str(value))
        elif isinstance(value, dict):
            allowed.update(_numeric_tokens(" ".join(str(v) for v in value.values() if v is not None)))
        elif isinstance(value, (list, tuple)):
            allowed.update(_numeric_tokens(" ".join(str(v) for v in value)))
        elif isinstance(value, str):
            allowed.update(_numeric_tokens(value))
    for action in actions or []:
        for key in ("co2_saved_kg", "detail", "title", "why", "window"):
            allowed.update(_numeric_tokens(action.get(key)))
    return allowed


def _safe_text(original, candidate, allowed_numbers):
    if not candidate:
        return original
    candidate_numbers = _numeric_tokens(candidate)
    unknown = {token for token in candidate_numbers if token not in allowed_numbers}
    if unknown:
        return original
    return str(candidate).strip() or original


def build_plan(air, profile, user_name=None, regenerate=False):
    aqi = air.get("aqi")
    band = _aqi_band(aqi)
    context = {
        "aqi": aqi,
        "scale": "US AQI",
        "pm2_5": (air.get("pollutants") or {}).get("pm2_5"),
        "location": (air.get("location") or {}).get("name"),
        "source": air.get("source"),
        "observed_at": air.get("observed_at"),
        "outdoor_window": air.get("ventilation_window"),
        "alert": _alert(aqi),
        "india_aqi": air.get("aqi_india"),
        "factor_version": FACTOR_VERSION,
    }
    normalized_profile = normalize_profile(profile)
    actions = build_actions(context, profile)

    title = "A cleaner day, planned around the air"
    if band == "good":
        title = "Good air today - make the most of it"
    elif band in {"unhealthy_sensitive", "unhealthy", "very_unhealthy", "hazardous"}:
        title = "Low-exposure day plan"

    summary = (
        f"US AQI is {aqi} at {context['location']}, with PM2.5 around "
        f"{context['pm2_5']} ug/m3. This plan keeps exposure down and still saves carbon where it is easy."
        if aqi is not None
        else "Air quality data is unavailable right now, so this plan focuses on indoor air and low-carbon habits."
    )

    if not gemini_service.is_enabled():
        raise gemini_service.GeminiUnavailable(
            "Gemini is not configured. Add GEMINI_API_KEY to backend/.env and restart the API."
        )
    enhanced = gemini_service.enhance_plan(context, actions, {**normalized_profile["flat"], **normalized_profile}, user_name)
    if not enhanced:
        raise gemini_service.GeminiUnavailable("Gemini could not generate today's plan. Please retry.")

    allowed_numbers = _allowed_numeric_context(context, actions)
    allowed_numbers.update(_numeric_tokens(title))
    allowed_numbers.update(_numeric_tokens(summary))
    title = _safe_text(title, enhanced.get("title"), allowed_numbers)
    summary = _safe_text(summary, enhanced.get("summary"), allowed_numbers)

    overrides = {}
    for item in enhanced.get("actions") or []:
        if isinstance(item, dict) and item.get("id"):
            overrides[str(item.get("id"))] = item
    for action in actions:
        patch = overrides.get(action["id"]) or {}
        if patch.get("detail"):
            action["detail"] = _safe_text(action.get("detail"), patch.get("detail"), allowed_numbers)
        if patch.get("why"):
            action["why"] = _safe_text(action.get("why"), patch.get("why"), allowed_numbers)

    return {
        "date": datetime.now(UTC).date().isoformat(),
        "title": title,
        "summary": summary,
        "generated_by": "gemini",
        "regenerated": bool(regenerate),
        "factor_version": FACTOR_VERSION,
        "context": context,
        "actions": actions,
        "disclaimer": "Guidance only. Not medical advice, and AQI is modelled for your nearest grid cell.",
    }
