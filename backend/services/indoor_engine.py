import logging

from services import gemini_service

logger = logging.getLogger(__name__)

BASE_RECOMMENDATIONS = [
    {
        "key": "ventilation",
        "label": "Ventilation",
        "items": [
            {"title": "Ventilate in the cleanest 2-hour window", "detail": "Cross-ventilate for 15-20 minutes instead of leaving windows open all day.", "cost": "No cost"},
            {"title": "Use an exhaust fan while cooking", "detail": "Run it for 10 minutes after the flame goes off, not just during cooking.", "cost": "No cost"},
        ],
    },
    {
        "key": "filtration",
        "label": "Filtration",
        "items": [
            {"title": "Place the purifier where you sit", "detail": "A purifier cleans the room it is in. Move it with you rather than running one unit for the whole home.", "cost": "Medium"},
            {"title": "Clean pre-filters every two weeks", "detail": "A clogged pre-filter reduces airflow and shortens the life of the HEPA stage.", "cost": "No cost"},
        ],
    },
    {
        "key": "sources",
        "label": "Pollution sources",
        "items": [
            {"title": "Switch to smokeless cooking where possible", "detail": "Keep the kitchen door closed and the exhaust on while frying or grilling.", "cost": "Low"},
            {"title": "Avoid incense, coils and candles indoors", "detail": "These produce fine particles indoors even when outdoor air is clean.", "cost": "No cost"},
        ],
    },
    {
        "key": "damp",
        "label": "Damp and dust",
        "items": [
            {"title": "Fix visible damp and leaks", "detail": "Persistent damp raises mould spores that irritate airways.", "cost": "Medium"},
            {"title": "Damp-mop and vacuum with a HEPA bag", "detail": "Dry sweeping lifts settled dust back into the breathing zone.", "cost": "Low"},
        ],
    },
]


def assess(payload, air=None):
    answers = payload.get("answers") if isinstance(payload, dict) and isinstance(payload.get("answers"), dict) else (payload or {})
    outdoor_aqi = None
    if air:
        outdoor_aqi = air.get("aqi")
    elif answers.get("outdoor_aqi") is not None:
        try:
            outdoor_aqi = int(answers.get("outdoor_aqi"))
        except (TypeError, ValueError):
            outdoor_aqi = None

    score = 62
    reasons = []
    fixes = []

    def flag(value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, str):
            return value.strip().lower() in {"yes", "true", "1", "often", "always"}
        return bool(value)

    if flag(answers.get("ventilates_daily")):
        score += 10
        reasons.append("Daily ventilation")
    else:
        score -= 8
        fixes.append("Start a 15-minute cross-ventilation routine, ideally in the cleanest part of the day.")

    if flag(answers.get("cooking_exhaust")):
        score += 8
        reasons.append("Cooking exhaust in use")
    else:
        score -= 10
        fixes.append("Use a chimney or exhaust fan every time you cook with gas or fry food.")

    if flag(answers.get("damp_or_mould")):
        score -= 14
        fixes.append("Treat damp patches and mould, then keep the room dry and ventilated.")
    else:
        score += 6
        reasons.append("No visible damp reported")

    if flag(answers.get("smoking_indoor")):
        score -= 20
        fixes.append("Make the home smoke-free indoors; open windows do not remove third-hand smoke residue.")
    else:
        score += 5

    if flag(answers.get("purifier")):
        score += 8
        reasons.append("Filtration running")
    elif outdoor_aqi is not None and outdoor_aqi > 150:
        score -= 8
        fixes.append("High outdoor pollution and no filtration: consider a HEPA purifier for the main room.")

    if flag(answers.get("incense_or_coils")):
        score -= 6
        fixes.append("Replace incense sticks and mosquito coils with alternatives that do not create fine particles.")

    if flag(answers.get("pets")):
        score -= 4
        fixes.append("Vacuum pet hair with a HEPA filter at least twice a week.")

    if flag(answers.get("road_facing")):
        score -= 5
        fixes.append("Keep road-facing windows closed during peak traffic hours.")

    if flag(answers.get("air_tight_home")):
        score += 5
        reasons.append("Home generally sealed")

    if answers.get("hours_home_outdoors") is not None:
        try:
            hours = float(answers.get("hours_home_outdoors"))
            if hours > 4 and outdoor_aqi and outdoor_aqi > 150:
                score -= 4
                fixes.append("Limit outdoor hours on high-pollution days and shift them to the cleanest window.")
        except (TypeError, ValueError):
            pass

    score = max(10, min(95, int(round(score))))
    if score >= 80:
        label, summary = "good", "Your indoor air routine looks strong. Keep the habits going."
    elif score >= 60:
        label, summary = "fair", "Solid base. A few consistent fixes would meaningfully lower indoor exposure."
    elif score >= 40:
        label, summary = "needs_attention", "Several sources are adding to indoor pollution. Start with the two highest-impact fixes."
    else:
        label, summary = "poor", "Indoor air is likely poor. Ventilation, exhaust and source control need attention now."

    recommendations = _tailor(BASE_RECOMMENDATIONS, answers)
    if gemini_service.is_enabled():
        try:
            enhanced = gemini_service.enhance_indoor(answers, score, fixes, outdoor_aqi)
        except Exception:
            logger.exception("Indoor enhancement failed")
            enhanced = None
        if enhanced:
            summary = enhanced.get("summary") or summary
            if enhanced.get("immediate"):
                fixes = list(enhanced["immediate"]) + fixes

    return {
        "score": score,
        "label": label,
        "summary": summary,
        "strengths": reasons[:5],
        "immediate": fixes[:3],
        "recommendations": recommendations,
        "outdoor_aqi": outdoor_aqi,
        "disclaimer": "Indicative self-assessment, not a measurement and not medical advice.",
    }


def _tailor(recommendations, answers):
    tailored = []
    for group in recommendations:
        items = list(group["items"])
        if group["key"] == "ventilation" and not answers.get("ventilates_daily"):
            items.insert(0, {"title": "Set a daily ventilation reminder", "detail": "Pick a time you are home and open opposite windows for 15 minutes.", "cost": "No cost"})
        if group["key"] == "sources" and answers.get("smoking_indoor"):
            items.insert(0, {"title": "Agree on a smoke-free home", "detail": "Smoking indoors leaves residue on surfaces that stays long after the smoke clears.", "cost": "No cost"})
        if group["key"] == "filtration" and not answers.get("purifier"):
            items.insert(0, {"title": "Size a purifier to the room", "detail": "Match clean air delivery rate to room volume; a small unit will not keep up in a large hall.", "cost": "Medium"})
        tailored.append({"key": group["key"], "label": group["label"], "items": items[:3]})
    return tailored


def default_recommendations():
    return {"recommendations": BASE_RECOMMENDATIONS}
