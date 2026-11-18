import re
from datetime import UTC, datetime
from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request


def error(message, status=400, details=None):
    payload = {"error": message}
    if details is not None:
        payload["details"] = details
    return jsonify(payload), status


def parse_json(*required):
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return None, error("Request body must be a JSON object.")
    missing = [field for field in required if not str(data.get(field, "")).strip()]
    if missing:
        return None, error("Missing required fields.", 422, missing)
    return data, None


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def valid_email(value):
    return isinstance(value, str) and bool(value and EMAIL_RE.match(value.strip()))


def now_utc():
    return datetime.now(UTC)


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")
    return str(value)


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        identity = get_jwt_identity()
        if not identity:
            return error("Authentication required.", 401)
        from extensions import find_user

        if find_user(identity) is None:
            return error("Your account no longer exists. Please sign in again.", 401)
        return fn(identity, *args, **kwargs)

    return wrapper


def pagination(default_per_page=10, max_per_page=50):
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        per_page = int(request.args.get("per_page", default_per_page))
    except (TypeError, ValueError):
        per_page = default_per_page
    per_page = max(1, min(per_page, max_per_page))
    return page, per_page


def coords_from_request(default_lat=25.4358, default_lng=81.8463):
    try:
        latitude = float(request.args.get("latitude", default_lat))
    except (TypeError, ValueError):
        latitude = default_lat
    try:
        longitude = float(request.args.get("longitude", default_lng))
    except (TypeError, ValueError):
        longitude = default_lng
    latitude = max(-90.0, min(90.0, latitude))
    longitude = max(-180.0, min(180.0, longitude))
    scale = request.args.get("scale", "us")
    if scale not in {"us", "india"}:
        scale = "us"
    return latitude, longitude, scale
