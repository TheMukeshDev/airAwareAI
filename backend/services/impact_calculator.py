import json
import math
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from extensions import impact_records
from utils.validation import validate_iso_date

FACTORS_PATH = Path(__file__).resolve().parent.parent / "data" / "emission_factors_v1.json"

with FACTORS_PATH.open("r", encoding="utf-8") as handle:
    FACTORS = json.load(handle)

FACTOR_VERSION = FACTORS["version"]

MODE_LABELS = {key: value["label"] for key, value in FACTORS["transport"].items()}

MAX_DISTANCE_KM = 5000
MAX_PASSENGERS = 20


def transport_factor(mode, passengers=1):
    entry = FACTORS["transport"].get(mode)
    if not entry:
        return None
    passengers = max(1, int(passengers or 1))
    if mode in {"car_petrol", "car_diesel"}:
        return entry["factor"] / passengers
    if mode == "carpool":
        return FACTORS["transport"]["car_petrol"]["factor"] / max(3, passengers)
    if mode == "two_wheeler" and passengers > 1:
        return entry["factor"] / passengers
    return entry["factor"]


def transport_emissions(mode, distance_km, passengers=1):
    factor = transport_factor(mode, passengers)
    if factor is None:
        raise ValueError(f"Unknown transport mode: {mode}")
    return round(float(distance_km) * factor, 4)


def _to_number(value, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return number


def normalize_profile(payload):
    payload = payload or {}
    transport_in = payload.get("transport") if isinstance(payload.get("transport"), dict) else payload
    home_in = payload.get("home") if isinstance(payload.get("home"), dict) else payload
    food_in = payload.get("food") if isinstance(payload.get("food"), dict) else payload
    waste = payload.get("waste", [])
    if isinstance(waste, str):
        waste = [waste]

    def number(value, default=0.0):
        return _to_number(value, default)

    transport = {
        "primary_mode": transport_in.get("primary_mode", payload.get("primary_mode", "two_wheeler")),
        "commute_distance_km": number(transport_in.get("commute_distance_km", payload.get("commute_distance_km", 0))),
        "commute_days_per_week": number(transport_in.get("commute_days_per_week", payload.get("commute_days_per_week", 0))),
        "weekly_other_km": number(transport_in.get("weekly_other_km", payload.get("weekly_other_km", 0))),
        "flights_per_year": number(transport_in.get("flights_per_year", payload.get("flights_per_year", 0))),
    }
    if transport["primary_mode"] not in FACTORS["transport"]:
        transport["primary_mode"] = "two_wheeler"

    home = {
        "household_size": max(1, int(number(home_in.get("household_size", payload.get("household_size", 1)), 1))),
        "electricity_kwh_month": number(home_in.get("electricity_kwh_month", payload.get("electricity_kwh_month", 0))),
        "cooking_fuel": home_in.get("cooking_fuel", payload.get("cooking_fuel", "lpg")),
        "lpg_cylinders_month": number(home_in.get("lpg_cylinders_month", payload.get("lpg_cylinders_month", 1)), 1),
        "household_type": home_in.get("household_type", payload.get("household_type", "apartment")),
    }
    if home["cooking_fuel"] not in {"lpg", "png", "electricity", "biomass"}:
        home["cooking_fuel"] = "lpg"

    diet = food_in.get("diet", payload.get("diet", "mixed"))
    if diet not in FACTORS["diet"]:
        diet = "mixed"
    food = {"diet": diet}

    flat = {**transport, **home, **food, "waste": waste}
    return {
        "transport": transport,
        "home": home,
        "food": food,
        "waste": waste,
        "flat": flat,
    }


def log_journey(user_id, payload):
    if not user_id:
        raise ValueError("user_id is required")
    distance, passengers, mode_baseline, mode_actual = _validate_journey(payload)

    record_date = validate_iso_date(payload.get("date") or datetime.now(UTC).date().isoformat())

    baseline_kg = transport_emissions(mode_baseline, distance, passengers)
    actual_kg = transport_emissions(mode_actual, distance, passengers)
    record = {
        "user_id": user_id,
        "activity_type": "journey",
        "date": record_date,
        "distance_km": round(distance, 2),
        "baseline_mode": mode_baseline,
        "actual_mode": mode_actual,
        "passengers": passengers,
        "baseline_kg": baseline_kg,
        "actual_kg": actual_kg,
        "avoided_kg": round(baseline_kg - actual_kg, 4),
        "note": str(payload.get("note") or "").strip()[:280] or None,

        "factor_version": FACTOR_VERSION,
        "verified": False,
        "created_at": datetime.now(UTC),
    }
    result = impact_records.insert_one(record)
    record["id"] = str(result.inserted_id)
    record.pop("_id", None)
    return record


def _parse_passengers(raw):
    try:
        passengers = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("passengers must be a number") from exc
    return passengers


def _validate_journey(payload):
    try:
        distance = float(payload.get("distance_km", 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("distance_km must be a number") from exc
    if not math.isfinite(distance) or distance <= 0 or distance > MAX_DISTANCE_KM:
        raise ValueError(f"distance_km must be greater than 0 and at most {MAX_DISTANCE_KM}")
    raw_passengers = payload.get("passengers", 1)
    raw_passengers = 1 if raw_passengers is None or raw_passengers == "" else raw_passengers
    passengers = _parse_passengers(raw_passengers)
    if passengers < 1 or passengers > MAX_PASSENGERS:
        raise ValueError(f"passengers must be between 1 and {MAX_PASSENGERS}")
    mode_baseline = payload.get("baseline_mode")
    mode_actual = payload.get("actual_mode")
    if mode_baseline not in FACTORS["transport"]:
        raise ValueError("Unknown baseline_mode")
    if mode_actual not in FACTORS["transport"]:
        raise ValueError("Unknown actual_mode")
    return distance, passengers, mode_baseline, mode_actual


def _monthly_transport(transport):
    mode = transport.get("primary_mode", "two_wheeler")
    distance = _to_number(transport.get("commute_distance_km", 0), 0)
    days = _to_number(transport.get("commute_days_per_week", 0), 0)
    other = _to_number(transport.get("weekly_other_km", 0), 0)
    flights = _to_number(transport.get("flights_per_year", 0), 0)
    monthly_km = distance * 2 * days * 4.33 + other * 4.33
    commute_kg = monthly_km * (transport_factor(mode) or 0)
    flight_kg = flights * FACTORS["flights"]["kg_per_flight"] / 12
    return commute_kg + flight_kg, mode, monthly_km



def monthly_footprint(profile):
    profile = profile or {}
    transport = profile.get("transport", profile)
    home = profile.get("home", {})
    food = profile.get("food", {})
    waste_flags = profile.get("waste", []) or []
    household_size = max(1, int(_to_number(home.get("household_size", 1), 1)))
    if isinstance(waste_flags, str):
        waste_flags = [waste_flags]

    transport_kg, mode, monthly_km = _monthly_transport(transport)
    electricity_kg = _to_number(home.get("electricity_kwh_month", 0), 0) * FACTORS["electricity"]["grid_factor"] / household_size

    cooking_fuel = home.get("cooking_fuel", "lpg")
    cylinders = _to_number(home.get("lpg_cylinders_month", 1), 1)
    if cooking_fuel == "lpg":
        cooking_kg = cylinders * FACTORS["cooking"]["lpg_cylinder_kg"] / household_size
    elif cooking_fuel == "png":
        cooking_kg = FACTORS["cooking"]["png_monthly_kg"] / household_size
    elif cooking_fuel == "electricity":
        cooking_kg = FACTORS["cooking"]["electric_monthly_kg"] / household_size
    else:
        cooking_kg = FACTORS["cooking"]["biomass_monthly_kg"] / household_size

    diet = food.get("diet", "mixed")
    diet_kg = FACTORS["diet"].get(diet, FACTORS["diet"]["mixed"])

    waste_kg = FACTORS["waste"]["base_monthly_kg"]
    for flag in waste_flags:
        waste_kg += FACTORS["waste"].get(flag, 0)
    waste_kg = max(0.0, waste_kg) / household_size

    breakdown = [
        {"key": "transport", "label": "Transport", "kg_per_month": round(transport_kg, 1)},
        {"key": "electricity", "label": "Electricity", "kg_per_month": round(electricity_kg, 1)},
        {"key": "cooking", "label": "Cooking", "kg_per_month": round(cooking_kg, 1)},
        {"key": "food", "label": "Food", "kg_per_month": round(diet_kg, 1)},
        {"key": "waste", "label": "Waste", "kg_per_month": round(waste_kg, 1)},
    ]
    total = round(sum(item["kg_per_month"] for item in breakdown), 1)

    opportunities = _opportunities(transport, home, food, waste_flags, breakdown, household_size, mode, monthly_km)
    return {
        "breakdown": breakdown,
        "total_kg_per_month": total,
        "annual_kg": round(total * 12, 0),
        "factor_version": FACTOR_VERSION,
        "assumptions": FACTORS["assumptions"],
        "opportunities": opportunities,
        "inputs_used": {
            "primary_mode": mode,
            "household_size": household_size,
            "monthly_transport_km": round(monthly_km, 1),
        },
    }


def _transport_opportunities(transport, mode):
    distance = _to_number(transport.get("commute_distance_km", 0), 0)
    days = _to_number(transport.get("commute_days_per_week", 0), 0)
    if mode not in {"two_wheeler", "car_petrol", "car_diesel"} or distance <= 0 or days <= 0:
        return []
    alt = "metro" if distance >= 5 else "bus"
    weekly_saving = max(0.0, ((transport_factor(mode) or 0) - (transport_factor(alt) or 0)) * distance * 2 * min(days, 3))
    if weekly_saving <= 0.5:
        return []
    return [{"title": f"Swap {min(int(days), 3)} commute days to {MODE_LABELS.get(alt, alt).lower()}",
             "detail": f"Keep your {MODE_LABELS.get(mode, mode).lower()} for the other days. Saving is per week for a {distance:g} km one-way commute.",
             "saving_kg": round(weekly_saving * 4.33, 1),
             "difficulty": "Moderate - needs route planning"}]


def _opportunities(transport, home, food, waste_flags, breakdown, household_size, mode, monthly_km):
    items = []
    items.extend(_transport_opportunities(transport, mode))
    electricity = _to_number(home.get("electricity_kwh_month", 0), 0)
    if electricity > 60:
        saving = electricity * 0.1 * FACTORS["electricity"]["grid_factor"] / household_size
        items.append(
            {
                "title": "Cut standby and cooling load by 10%",
                "detail": "Set ACs two degrees warmer, switch off at the plug and replace the oldest bulbs first.",
                "saving_kg": round(saving, 1),
                "difficulty": "Easy - no cost",
            }
        )

    if home.get("cooking_fuel") == "lpg" and _to_number(home.get("lpg_cylinders_month", 0), 0) >= 2:
        saving = FACTORS["cooking"]["lpg_cylinder_kg"] * 0.2 / household_size
        items.append(
            {
                "title": "Stretch one LPG cylinder further",
                "detail": "Use a pressure cooker and lids, and pre-soak pulses. A 20% reduction is realistic for most households.",
                "saving_kg": round(saving, 1),
                "difficulty": "Easy - habit change",
            }
        )

    if food.get("diet") in {"mixed", "high_meat"}:
        target = "vegetarian"
        saving = FACTORS["diet"].get(food.get("diet"), 110) - FACTORS["diet"].get(target, 65)
        if saving > 0:
            items.append(
                {
                    "title": "Add two plant-based days each week",
                    "detail": "Replacing some meat meals lowers diet-related emissions without changing everything at once.",
                    "saving_kg": round(saving * 0.3, 1),
                    "difficulty": "Easy - meal planning",
                }
            )

    if "composts" not in waste_flags:
        items.append(
            {
                "title": "Start composting kitchen waste",
                "detail": "A covered bin or society compost pit diverts wet waste and avoids landfill methane.",
                "saving_kg": round(abs(FACTORS["waste"]["composts"]) / household_size, 1),
                "difficulty": "Moderate - needs space",
            }
        )

    items.sort(key=lambda item: item["saving_kg"], reverse=True)
    return items[:5]


def _weekly_buckets(records):
    buckets = {}
    for record in records:
        try:
            record_date = date.fromisoformat(record.get("date", ""))
        except (TypeError, ValueError):
            continue
        key = (record_date - timedelta(days=record_date.weekday())).isoformat()
        buckets[key] = buckets.get(key, 0) + (record.get("avoided_kg", 0) or 0)
    return buckets


def _achievements(records, avoided, modes):
    thresholds = (
        (bool(records), {"key": "first", "label": "First journey logged"}),
        (avoided >= 10, {"key": "ten", "label": "10 kg CO2e avoided"}),
        (avoided >= 50, {"key": "fifty", "label": "50 kg CO2e avoided"}),
        (len(records) >= 5, {"key": "five", "label": "5 activities logged"}),
        (modes.get("metro", 0) >= 20, {"key": "metro", "label": "Metro regular"}),
    )
    return [achievement for enabled, achievement in thresholds if enabled]


def personal_summary(user_id, days=30):
    since_date = (datetime.now(UTC) - timedelta(days=days)).date().isoformat()
    today = datetime.now(UTC).date().isoformat()
    try:
        records = list(impact_records.find({"user_id": user_id, "date": {"$gte": since_date, "$lte": today}}))
    except Exception:
        records = [r for r in impact_records.find({"user_id": user_id}) if (r.get("date") or "") >= since_date]
    records.sort(key=lambda record: record.get("date") or "", reverse=True)

    baseline = round(sum(record.get("baseline_kg", 0) or 0 for record in records), 2)
    actual = round(sum(record.get("actual_kg", 0) or 0 for record in records), 2)
    avoided = round(sum(record.get("avoided_kg", 0) or 0 for record in records), 2)
    distance = round(sum(record.get("distance_km", 0) or 0 for record in records), 1)
    reduction = round((avoided / baseline) * 100, 1) if baseline else 0.0

    weekly_buckets = _weekly_buckets(records)

    ordered_weeks = sorted(weekly_buckets.items())[-8:]
    weekly = [
        {
            "week": key,
            "label": date.fromisoformat(key).strftime("%d %b"),
            "avoided_kg": round(value, 2),
        }
        for key, value in ordered_weeks
    ]

    modes = {}
    for record in records:
        mode = record.get("actual_mode", "unknown")
        modes[mode] = modes.get(mode, 0) + (record.get("distance_km", 0) or 0)

    achievements = _achievements(records, avoided, modes)

    return {
        "period_days": days,
        "factor_version": FACTOR_VERSION,
        "totals": {
            "baseline_kg": baseline,
            "actual_kg": actual,
            "avoided_kg": avoided,
            "distance_km": distance,
            "logged_activities": len(records),
            "reduction_pct": reduction,
        },
        "weekly": weekly,
        "by_mode": [
            {"mode": mode, "label": MODE_LABELS.get(mode, mode), "distance_km": round(value, 1)}
            for mode, value in sorted(modes.items(), key=lambda item: item[1], reverse=True)
        ],
        "achievements": achievements,
    }


def history(user_id, page=1, per_page=8):
    try:
        page = max(1, int(page))
        per_page = max(1, int(per_page))
    except (TypeError, ValueError):
        page, per_page = 1, 8
    skip = (page - 1) * per_page
    try:
        total = impact_records.count_documents({"user_id": user_id})
        cursor = impact_records.find({"user_id": user_id}).sort("date", -1).skip(skip).limit(per_page)
        records = list(cursor)
    except Exception:
        records = list(impact_records.find({"user_id": user_id}))
        records.sort(key=lambda record: (record.get("date") or "", record.get("created_at") or ""), reverse=True)
        total = len(records)
        records = records[skip : skip + per_page]
    serialized = []
    for record in records:
        item = dict(record)
        item["id"] = str(item.pop("_id"))
        created = item.get("created_at")
        if isinstance(created, datetime):
            item["created_at"] = created.isoformat()
        serialized.append(item)
    return {
        "records": serialized,
        "page": page,
        "pages": max(1, (total + per_page - 1) // per_page),
        "total": total,
    }
