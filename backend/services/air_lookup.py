import logging

from services import aqi_service
from utils.http import error

logger = logging.getLogger(__name__)


def air_for_user(user):
    location = (user or {}).get("location") or {}
    try:
        latitude = float(location.get("latitude", 25.4358))
        longitude = float(location.get("longitude", 81.8463))
    except (TypeError, ValueError):
        latitude, longitude = 25.4358, 81.8463
    try:
        return aqi_service.get_current(
            latitude,
            longitude,
            location_label=f"{location.get('city', 'Prayagraj')}, {location.get('state', 'Uttar Pradesh')}",
            city=location.get("city"),
            state=location.get("state"),
        )
    except RuntimeError:
        logger.exception("Air quality provider unavailable for user location")
        return None


def require_air_for_user(user):
    air = air_for_user(user)
    if air is None:
        return None, error("Air quality provider temporarily unavailable.", 503)
    return air, None
