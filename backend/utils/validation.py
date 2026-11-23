"""Validation and parsing helpers for request payloads."""

import math
import re
from datetime import UTC, date, datetime

from utils.http import error

TRUTHY_VALUES = frozenset({"1", "true", "yes", "on", "t", "y"})
FALSY_VALUES = frozenset({"0", "false", "no", "off", "f", "n", ""})
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


def parse_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return _parse_bool_string(value, default) if isinstance(value, str) else default


def _parse_bool_string(value, default):
    normalized = value.strip().lower()
    if normalized in TRUTHY_VALUES:
        return True
    if normalized in FALSY_VALUES:
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


def validate_coordinates(latitude, longitude):
    lat, lat_err = finite_number(latitude, "latitude")
    if lat_err:
        return None, None, lat_err
    lng, lng_err = finite_number(longitude, "longitude")
    if lng_err:
        return None, None, lng_err
    if not -90.0 <= lat <= 90.0:
        return None, None, error("latitude must be between -90 and 90.", 422)
    if not -180.0 <= lng <= 180.0:
        return None, None, error("longitude must be between -180 and 180.", 422)
    return lat, lng, None


def clamp_location(latitude, longitude):
    return validate_coordinates(latitude, longitude)


def reject_unknown_keys(data, allowed, label="payload"):
    unknown = sorted(str(key) for key in data if str(key) not in allowed)
    if unknown:
        return error(f"Unexpected field(s) in {label}: {', '.join(unknown)}.", 422)
    return None


def bounded_text(value, field, max_length, allow_empty=True):
    if not isinstance(value, str):
        return None, error(f"{field} must be a string.", 422)
    cleaned = CONTROL_CHARACTERS.sub(" ", value)
    cleaned = " ".join(cleaned.split())
    if len(cleaned) > max_length:
        return None, error(f"{field} must be at most {max_length} characters.", 422)
    if not cleaned and not allow_empty:
        return None, error(f"{field} is required.", 422)
    return cleaned, None


def bounded_number(value, name, minimum, maximum):
    number, failure = finite_number(value, name)
    if failure:
        return None, failure
    if number < minimum or number > maximum:
        return None, error(f"{name} must be between {minimum:g} and {maximum:g}.", 422)
    return number, None
