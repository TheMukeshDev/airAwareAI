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


def _flag(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"yes", "true", "1", "often", "always"}
    return bool(value) if value is not None else False


def _outdoor_aqi(answers, air):
    if air:
        return air.get("aqi")
    try:
        return int(answers.get("outdoor_aqi")) if answers.get("outdoor_aqi") is not None else None
    except (TypeError, ValueError):
        return None


def _indoor_score(answers, outdoor_aqi):
    score = 62
    reasons = []
    fixes = []
    score, reasons, fixes = _score_positive_items(score, reasons, fixes, answers)
    score, reasons, fixes = _score_negative_items(score, reasons, fixes, answers)
    score, fixes = _score_missing_habits(score, fixes, answers)
    score, fixes = _score_outdoor_exposure(score, fixes, answers, outdoor_aqi)
    return max(10, min(95, int(round(score)))), reasons, fixes


def _apply_positive(score, reasons, enabled, amount, text):
    if enabled:
        return score + amount, reasons + [text]
    return score, reasons


def _apply_negative(score, fixes, enabled, amount, text):
    if enabled:
        return score + amount, fixes + [text]
    return score, fixes


def _score_positive_items(score, reasons, fixes, answers):
    positive = (
        ("ventilates_daily", 10, "Daily ventilation"),
        ("cooking_exhaust", 8, "Cooking exhaust in use"),
        ("purifier", 8, "Filtration running"),
        ("air_tight_home", 5, "Home generally sealed"),
    )
    for key, amount, text in positive:
        score, reasons = _apply_positive(score, reasons, _flag(answers.get(key)), amount, text)
    if not _flag(answers.get("damp_or_mould")):
        score, reasons = score + 6, reasons + ["No visible damp reported"]
    if not _flag(answers.get("smoking_indoor")):
        score += 5
    return score, reasons, fixes


def _score_negative_items(score, reasons, fixes, answers):
    negative = (
        ("damp_or_mould", -14, "Treat damp patches and mould, then keep the room dry and ventilated."),
        ("smoking_indoor", -20, "Make the home smoke-free indoors; open windows do not remove third-hand smoke residue."),
        ("incense_or_coils", -6, "Replace incense sticks and mosquito coils with alternatives that do not create fine particles."),
        ("pets", -4, "Vacuum pet hair with a HEPA filter at least twice a week."),
        ("road_facing", -5, "Keep road-facing windows closed during peak traffic hours."),
    )
    for key, amount, text in negative:
        score, fixes = _apply_negative(score, fixes, _flag(answers.get(key)), amount, text)
    return score, reasons, fixes


def _score_missing_habits(score, fixes, answers):
    if not _flag(answers.get("ventilates_daily")):
        score -= 8
        fixes.insert(0, "Start a 15-minute cross-ventilation routine, ideally in the cleanest part of the day.")
    if not _flag(answers.get("cooking_exhaust")):
        score -= 10
        fixes.append("Use a chimney or exhaust fan every time you cook with gas or fry food.")
    return score, fixes


def _score_outdoor_exposure(score, fixes, answers, outdoor_aqi):
    if not _flag(answers.get("purifier")) and outdoor_aqi is not None and outdoor_aqi > 150:
        score -= 8
        fixes.append("High outdoor pollution and no filtration: consider a HEPA purifier for the main room.")
    try:
        hours = float(answers.get("hours_home_outdoors"))
        if hours > 4 and outdoor_aqi is not None and outdoor_aqi > 150:
            score -= 4
            fixes.append("Limit outdoor hours on high-pollution days and shift them to the cleanest window.")
    except (TypeError, ValueError):
        logger.debug("Ignoring non-numeric hours_home_outdoors value")
    return score, fixes


def _score_band(score):
    bands = (
        (80, "good", "Your indoor air routine looks strong. Keep the habits going."),
        (60, "fair", "Solid base. A few consistent fixes would meaningfully lower indoor exposure."),
        (40, "needs_attention", "Several sources are adding to indoor pollution. Start with the two highest-impact fixes."),
    )
    return next(((label, summary) for limit, label, summary in bands if score >= limit),
                ("poor", "Indoor air is likely poor. Ventilation, exhaust and source control need attention now."))


def assess(payload, air=None):
    answers = payload.get("answers") if isinstance(payload, dict) and isinstance(payload.get("answers"), dict) else (payload or {})
    outdoor_aqi = _outdoor_aqi(answers, air)
    score, reasons, fixes = _indoor_score(answers, outdoor_aqi)
    label, summary = _score_band(score)
    recommendations = _tailor(BASE_RECOMMENDATIONS, answers)
    if gemini_service.is_enabled():
        try:
            enhanced = gemini_service.enhance_indoor(answers, score, fixes, outdoor_aqi)
        except Exception:
            logger.exception("Indoor enhancement failed")
            enhanced = None
        if enhanced:
            summary = enhanced.get("summary") or summary
            fixes = list(enhanced["immediate"]) + fixes if enhanced.get("immediate") else fixes

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
