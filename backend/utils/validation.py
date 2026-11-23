"""Validation and parsing helpers for request payloads."""

import math
from datetime import UTC, date, datetime

from utils.http import error


def parse_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off", ""}:
            return False
    return default


def ensure_json_object(data, failure_builder=None):
    if not isinstance(data, dict):
        if failure_builder:
            return None, failure_builder("Request body must be a JSON object.", 400)
        return None, error("Request body must be a JSON object.", 400)
    return data, None



def finite_number(value, name):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None, error(f"{name} must be a number.", 422)
    if not math.isfinite(number):
        return None, error(f"{name} must be a finite number.", 422)
    return number, None


def validate_iso_date(value, allow_future=False):
    if not isinstance(value, str):
        raise ValueError("date must be an ISO YYYY-MM-DD string")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("date must be a valid ISO YYYY-MM-DD date") from exc
    today = datetime.now(UTC).date()
    if not allow_future and parsed > today:
        raise ValueError("date cannot be in the future")
    if parsed.year < 2000 or parsed.year > today.year + 1:
        raise ValueError("date is outside the supported range")
    return parsed.isoformat()


def clamp_location(latitude, longitude):
    lat, lat_err = finite_number(latitude, "latitude")
    if lat_err:
        return None, None, lat_err
    lng, lng_err = finite_number(longitude, "longitude")
    if lng_err:
        return None, None, lng_err
    lat = max(-90.0, min(90.0, lat))
    lng = max(-180.0, min(180.0, lng))
    return lat, lng, None
