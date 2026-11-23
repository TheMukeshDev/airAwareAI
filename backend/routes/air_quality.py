import logging

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from extensions import find_user
from services import aqi_service
from utils.http import error
from utils.validation import clamp_location, finite_number

air_quality_bp = Blueprint("air_quality", __name__)
logger = logging.getLogger(__name__)


def _resolve_location():
    verify_jwt_in_request(optional=True)
    identity = get_jwt_identity()
    user = find_user(identity) if identity else None
    location = (user or {}).get("location") or {}

    def number(name, fallback, default):
        value, problem = finite_number(request.args.get(name), name)
        if problem or value is None:
            value, problem = finite_number(fallback, name)
        return default if problem or value is None else value

    latitude, longitude, problem = clamp_location(
        number("latitude", location.get("latitude"), 25.4358),
        number("longitude", location.get("longitude"), 81.8463),
    )
    if problem:
        latitude, longitude, _fallback_problem = clamp_location(
            location.get("latitude", 25.4358),
            location.get("longitude", 81.8463),
        )

    label = request.args.get("location") or location.get("city")
    if label and location.get("state") and not request.args.get("location"):
        label = f"{location.get('city')}, {location.get('state')}"
    return latitude, longitude, label, user


@air_quality_bp.get("/air-quality/current")
def current():
    latitude, longitude, label, user = _resolve_location()
    location = (user or {}).get("location") or {}
    try:
        payload = aqi_service.get_current(
            latitude,
            longitude,
            location_label=label or f"{latitude:.2f}, {longitude:.2f}",
            city=location.get("city"),
            state=location.get("state"),
        )
    except RuntimeError:
        logger.exception("Air quality current fetch failed")
        return error("Air quality provider temporarily unavailable.", 503)
    if user:
        preferred = (user.get("preferences") or {}).get("aqi_scale", "us")
        payload["preferred_scale"] = preferred
    return jsonify(payload)


@air_quality_bp.get("/air-quality/forecast")
def forecast():
    latitude, longitude, _label, _user = _resolve_location()
    try:
        hours = max(6, min(int(request.args.get("hours", 48)), 72))
    except (TypeError, ValueError):
        hours = 48
    try:
        payload = aqi_service.get_forecast(latitude, longitude, hours=hours)
    except RuntimeError:
        logger.exception("Air quality forecast fetch failed")
        return error("Air quality provider temporarily unavailable.", 503)
    return jsonify(payload)


@air_quality_bp.get("/air-quality/stations")
def stations():
    latitude, longitude, _label, _user = _resolve_location()
    try:
        payload = aqi_service.get_stations(latitude, longitude)
    except Exception:
        logger.exception("Air quality stations fetch failed")
        return error("Could not load nearby grid readings.", 503)
    return jsonify(payload)
