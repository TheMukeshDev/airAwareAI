import json
import logging
import math
import threading
import time
from collections import OrderedDict
from datetime import UTC, datetime
from urllib.parse import urlparse

import requests

from config import Config

logger = logging.getLogger(__name__)

POLLUTANT_WINDOWS_HOURS = {
    "pm2_5": 24,
    "pm10": 24,
    "nitrogen_dioxide": 24,
    "sulphur_dioxide": 24,
    "ozone": 8,
    "carbon_monoxide": 8,
}

CURRENT_FIELDS = [
    "pm10",
    "pm2_5",
    "carbon_monoxide",
    "nitrogen_dioxide",
    "sulphur_dioxide",
    "ozone",
    "us_aqi",
    "european_aqi",
    "dust",
    "uv_index",
]

POLLUTANT_UNITS = {
    "pm2_5": "ug/m3",
    "pm10": "ug/m3",
    "carbon_monoxide": "ug/m3",
    "nitrogen_dioxide": "ug/m3",
    "sulphur_dioxide": "ug/m3",
    "ozone": "ug/m3",
    "dust": "ug/m3",
}

CPCB_BREAKPOINTS = {
    "pm2_5": [(0, 0, 30, 50), (31, 51, 60, 100), (61, 101, 90, 200), (91, 201, 120, 300), (121, 301, 250, 400), (251, 401, 500, 500)],
    "pm10": [(0, 0, 50, 50), (51, 51, 100, 100), (101, 101, 250, 200), (251, 201, 350, 300), (351, 301, 430, 400), (431, 401, 600, 500)],
    "nitrogen_dioxide": [(0, 0, 40, 50), (41, 51, 80, 100), (81, 101, 180, 200), (181, 201, 280, 300), (281, 301, 400, 400), (401, 401, 1000, 500)],
    "sulphur_dioxide": [(0, 0, 40, 50), (41, 51, 80, 100), (81, 101, 380, 200), (381, 201, 800, 300), (801, 301, 1600, 400), (1601, 401, 2000, 500)],
    "ozone": [(0, 0, 50, 50), (51, 51, 100, 100), (101, 101, 168, 200), (169, 201, 208, 300), (209, 301, 748, 400), (749, 401, 1000, 500)],
    "carbon_monoxide": [(0, 0, 1, 50), (1.1, 51, 2, 100), (2.1, 101, 10, 200), (10.1, 201, 17, 300), (17.1, 301, 34, 400), (34.1, 401, 50, 500)],
}

POLLUTANT_LABELS = {
    "pm2_5": "PM2.5",
    "pm10": "PM10",
    "nitrogen_dioxide": "NO2",
    "sulphur_dioxide": "SO2",
    "ozone": "O3",
    "carbon_monoxide": "CO",
}

MODEL_GRID_NOTE = "CAMS model output for the nearest grid cell, not a physical monitor on your street."
INDIA_AQI_NOTE = "Indian AQI is computed from modelled concentrations using CPCB sub-index breakpoints with pollutant-specific averaging windows."


class TTLCache:
    def __init__(self, maxsize=2048, ttl_seconds=600):
        self.maxsize = maxsize
        self.ttl_seconds = ttl_seconds
        self._store = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None, True
            expires_at, payload, stored_at = entry
            self._store.move_to_end(key)
            return (payload, stored_at), now >= expires_at

    def set(self, key, payload):
        now = time.time()
        ttl = float(self.ttl_seconds)
        with self._lock:
            self._store[key] = (now + ttl, payload, now)
            self._store.move_to_end(key)
            while len(self._store) > self.maxsize:
                self._store.popitem(last=False)

    def age(self, key):
        with self._lock:
            entry = self._store.get(key)
            return int(time.time() - entry[2]) if entry else None

    def clear(self):
        with self._lock:
            self._store.clear()


_CACHE = TTLCache(maxsize=2048, ttl_seconds=getattr(Config, "CACHE_TTL_SECONDS", 600))


def _cache_get(key):
    return _CACHE.get(key)


def _cache_set(key, payload):
    _CACHE.set(key, payload)


def _cache_age(key):
    return _CACHE.age(key)


def reset_cache():
    _CACHE.clear()


MAX_PROVIDER_BYTES = 2_000_000


def _get(url, params, timeout=8):
    allowed_hosts = {
        urlparse(Config.OPEN_METEO_AIR_URL).hostname,
        urlparse(Config.OPEN_METEO_WEATHER_URL).hostname,
    }
    if urlparse(url).hostname not in allowed_hosts:
        raise RuntimeError("Air quality provider host is not allowed.")
    response = requests.get(url, params=params, timeout=timeout, allow_redirects=False, stream=True)
    if response.status_code >= 300:
        raise RuntimeError("Air quality provider returned an unexpected response.")
    chunks = []
    total = 0
    for chunk in response.iter_content(8192):
        total += len(chunk)
        if total > MAX_PROVIDER_BYTES:
            raise RuntimeError("Air quality provider response is too large.")
        chunks.append(chunk)
    return json.loads(b"".join(chunks))



def location_key(latitude, longitude):
    return f"{round(latitude, 3)},{round(longitude, 3)}"


def _sub_index(pollutant, concentration):
    if concentration is None:
        return None
    if pollutant == "carbon_monoxide":
        concentration = concentration / 1000.0
    table = CPCB_BREAKPOINTS.get(pollutant)
    if not table:
        return None
    c = float(concentration)
    for c_low, i_low, c_high, i_high in table:
        if c <= c_high:
            if c_high == c_low:
                return int(i_low)
            return round(i_low + (i_high - i_low) * (c - c_low) / (c_high - c_low))
    last = table[-1]
    return int(last[3])


def cpcb_aqi(pollutant_means):
    sub_indices = {}
    for pollutant, value in pollutant_means.items():
        index = _sub_index(pollutant, value)
        if index is not None:
            sub_indices[pollutant] = index
    if not sub_indices:
        return None, None, {}
    primary = max(sub_indices, key=sub_indices.get)
    return sub_indices[primary], POLLUTANT_LABELS.get(primary, primary), sub_indices


def _parse_dt(value):
    if isinstance(value, datetime):
        return value
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed
    except Exception:
        return None


def _trailing_mean(hourly, key, reference_time, hours=None):
    if not hourly or not hourly.get("time"):
        return None
    times = hourly["time"]
    values = hourly.get(key) or []
    if len(times) != len(values):
        return None
    if hours is None:
        hours = POLLUTANT_WINDOWS_HOURS.get(key, 24)
    reference = _parse_dt(reference_time)
    indexed = []
    for stamp, value in zip(times, values, strict=False):

        if value is None:
            continue
        parsed = _parse_dt(stamp)
        if parsed is None:
            continue
        indexed.append((parsed, float(value)))
    if not indexed:
        return None
    if reference is not None:
        window = [value for parsed, value in indexed if 0 <= (reference - parsed).total_seconds() < hours * 3600]
        if len(window) < min(3, hours):
            # allow inclusive boundary as fallback when exact-hour samples align
            window = [value for parsed, value in indexed if 0 <= (reference - parsed).total_seconds() <= hours * 3600]
    else:
        window = [value for _, value in indexed[-hours:]]
    if len(window) < min(3, hours):
        # Not enough samples in averaging window
        return None
    return round(sum(window) / len(window), 2)


def _safe(value):
    if value is None:
        return None
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


def fetch_air(latitude, longitude):
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(CURRENT_FIELDS),
        "hourly": "pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide,us_aqi",
        "past_days": 1,
        "forecast_days": 3,
        "timezone": "auto",
    }
    return _get(Config.OPEN_METEO_AIR_URL, params)


def fetch_weather(latitude, longitude):
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,visibility,weather_code",
        "wind_speed_unit": "kmh",
        "timezone": "auto",
    }
    return _get(Config.OPEN_METEO_WEATHER_URL, params)


def _weather_payload(weather):
    current = (weather or {}).get("current") or {}
    return {
        "temperature_c": _safe(current.get("temperature_2m")),
        "relative_humidity": _safe(current.get("relative_humidity_2m")),
        "wind_speed_kmh": _safe(current.get("wind_speed_10m")),
        "wind_direction": _safe(current.get("wind_direction_10m")),
        "cloud_cover": _safe(current.get("cloud_cover")),
        "visibility_m": _safe(current.get("visibility")),
        "weather_code": current.get("weather_code"),
    }


def _best_ventilation_window(hourly, observed_at=None, tz_name=None, hours_ahead=48):
    if not hourly or not hourly.get("time"):
        return None
    times = hourly["time"]
    values = hourly.get("pm2_5") or []
    observed = _parse_dt(observed_at)
    best = None
    for index in range(len(times) - 1):
        pair = values[index : index + 2]
        if len(pair) < 2 or any(value is None for value in pair):
            continue
        try:
            start = _parse_dt(times[index])
        except Exception:
            start = None
        if start is None:
            continue
        if observed is not None:
            # consider future slots only (within next hours_ahead)
            delta_h = (start - observed).total_seconds() / 3600.0
            if delta_h < 0 or delta_h > hours_ahead:
                continue
        mean = sum(float(v) for v in pair) / 2
        if best is None or mean < best[0]:
            best = (mean, start, index)
    if not best:
        return None
    mean, start, index = best
    end_hour = (start.hour + 2) % 24
    # Keep original naive/local representation for display; include date in label
    label = f"{start.strftime('%Y-%m-%d %H:%M')}-{end_hour:02d}:00"
    if tz_name:
        label = f"{label} ({tz_name})"
    return {
        "start": start.strftime("%H:%M"),
        "end": f"{end_hour:02d}:00",
        "date": start.date().isoformat(),
        "pm2_5": round(mean, 1),
        "label": label,
    }


def _exposure(aqi, pm2_5, hours_outdoors=2.0):
    if aqi is None:
        return {
            "level": None,
            "message": "No reading available, so exposure cannot be estimated.",
            "hours_outdoors": hours_outdoors,
        }
    if aqi <= 50:
        level, message = "low", "Typical outdoor activity is fine for most people."
    elif aqi <= 100:
        level, message = "moderate", "Sensitive groups may notice effects on long outdoor exposure."
    elif aqi <= 150:
        level, message = "elevated", "Sensitive groups should shorten intense outdoor activity."
    elif aqi <= 200:
        level, message = "high", "Limit prolonged outdoor exertion; prefer indoor alternatives."
    else:
        level, message = "very high", "Avoid outdoor exertion where possible and keep windows closed."
    return {
        "level": level,
        "message": message,
        "hours_outdoors": hours_outdoors,
        "pm2_5": pm2_5,
        "indicative": True,
    }


def _air_fetch_with_cache(latitude, longitude):
    key = f"air:{location_key(latitude, longitude)}"
    cached, expired = _cache_get(key)
    payload = cached[0] if cached else None
    stale = False
    if payload and not expired:
        data = payload
    else:
        try:
            data = fetch_air(latitude, longitude)
            _cache_set(key, data)
        except Exception as exc:
            if payload:
                data = payload
                stale = True
            else:
                logger.exception("Air quality provider unavailable")
                raise RuntimeError("Air quality provider unavailable.") from exc
    return data, stale, cached is not None, key


def _weather_fetch_with_cache(latitude, longitude):
    key = f"weather:{location_key(latitude, longitude)}"
    cached, expired = _cache_get(key)
    payload = cached[0] if cached else None
    if payload and not expired:
        return payload, False
    try:
        weather = fetch_weather(latitude, longitude)
        _cache_set(key, weather)
        return weather, False
    except Exception:
        logger.exception("Weather provider unavailable")
        return payload or {}, bool(payload)


def _build_current_payload(data, weather, stale, hit, key, latitude, longitude, location_label=None, city=None, state=None):
    current = data.get("current") or {}
    hourly = data.get("hourly") or {}
    observed_at = current.get("time")
    pollutants = {key_name: _safe(current.get(key_name)) for key_name in POLLUTANT_UNITS}
    means = {}
    means_basis = {}
    for pollutant in ("pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide", "ozone", "carbon_monoxide"):
        hours = POLLUTANT_WINDOWS_HOURS.get(pollutant, 24)
        mean = _trailing_mean(hourly, pollutant, observed_at, hours)
        if mean is not None:
            means[pollutant] = mean
            means_basis[pollutant] = {"mean": mean, "window_hours": hours}
    india_aqi, primary_pollutant, sub_indices = cpcb_aqi(means)

    us_aqi = current.get("us_aqi")
    if us_aqi is not None:
        try:
            us_aqi = int(round(float(us_aqi)))
        except (TypeError, ValueError):
            us_aqi = None

    window = _best_ventilation_window(hourly, observed_at=observed_at, tz_name=data.get("timezone"))
    exposure = _exposure(us_aqi, pollutants.get("pm2_5"), 2.0)

    indoor_hint = None
    if window:
        indoor_hint = (
            f"Lowest outdoor PM2.5 in the next 48 hours is around {window['label']} "
            f"(about {window['pm2_5']} ug/m3). Use that window to ventilate."
        )

    if india_aqi is None:
        primary_label = None
    else:
        primary_label = primary_pollutant or None

    source = "Open-Meteo Air Quality (CAMS model output)"
    return {
        "location": {
            "name": location_label or city or f"{latitude:.3f}, {longitude:.3f}",
            "city": city or location_label,
            "admin1": state,
            "latitude": latitude,
            "longitude": longitude,
            "timezone": data.get("timezone"),
        },
        "observed_at": observed_at,
        "fetched_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "source": source,
        "source_url": "https://open-meteo.com/en/docs/air-quality-api",
        "scale": "us",
        "aqi": us_aqi,
        "aqi_india": india_aqi,
        "aqi_india_method": "computed_cpcb_subindex_from_model_concentrations",
        "aqi_india_primary": primary_label,
        "aqi_india_subindices": sub_indices,
        "aqi_averaging_basis": means_basis,
        "primary_pollutant": primary_label,
        "pollutants": pollutants,
        "units": POLLUTANT_UNITS,
        "weather": _weather_payload(weather),
        "exposure": exposure,
        "indoor_hint": indoor_hint,
        "ventilation_window": window,
        "stale": stale,
        "cache": {"hit": hit, "age_seconds": _cache_age(key)},
        "provider_european_aqi": current.get("european_aqi"),
        "notes": [MODEL_GRID_NOTE, INDIA_AQI_NOTE],
    }


def get_current(latitude, longitude, location_label=None, city=None, state=None):
    data, stale, hit, key = _air_fetch_with_cache(latitude, longitude)
    weather, _w_stale = _weather_fetch_with_cache(latitude, longitude)
    return _build_current_payload(data, weather, stale, hit, key, latitude, longitude, location_label, city, state)


def _rolling_mean_at(hourly, pollutant, index, times, parsed_times, hours):
    values = hourly.get(pollutant) or []
    if index >= len(parsed_times):
        return None
    end = parsed_times[index]
    if end is None:
        return None
    collected = []
    for j in range(index, -1, -1):
        t = parsed_times[j]
        if t is None or j >= len(values) or values[j] is None:
            continue
        delta_h = (end - t).total_seconds() / 3600.0
        if 0 <= delta_h <= hours:
            collected.append(float(values[j]))
        elif delta_h > hours:
            break
    if len(collected) < min(3, hours):
        return None
    return round(sum(collected) / len(collected), 2)


def get_forecast(latitude, longitude, hours=48):
    data, stale, hit, key = _air_fetch_with_cache(latitude, longitude)
    hourly_raw = (data or {}).get("hourly") or {}
    times = hourly_raw.get("time") or []
    parsed_times = [_parse_dt(t) for t in times]
    observed = _parse_dt((data.get("current") or {}).get("time"))

    series = []
    for index, stamp in enumerate(times):
        parsed = parsed_times[index]
        if parsed is None:
            continue
        if observed is not None and parsed < observed:
            continue
        entry = {"time": stamp}
        for field in ("pm2_5", "pm10", "nitrogen_dioxide", "ozone", "us_aqi"):
            values = hourly_raw.get(field) or []
            entry[field] = values[index] if index < len(values) else None
        try:
            entry["us_aqi"] = int(round(float(entry["us_aqi"]))) if entry["us_aqi"] is not None else None
        except (TypeError, ValueError):
            entry["us_aqi"] = None

        means = {}
        means_basis = {}
        for pollutant in ("pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide", "ozone", "carbon_monoxide"):
            window_h = POLLUTANT_WINDOWS_HOURS.get(pollutant, 24)
            mean = _rolling_mean_at(hourly_raw, pollutant, index, times, parsed_times, window_h)
            if mean is not None:
                means[pollutant] = mean
                means_basis[pollutant] = {"mean": mean, "window_hours": window_h}
        if means:
            india_aqi, primary, sub = cpcb_aqi(means)
            entry["india_aqi"] = india_aqi
            entry["india_aqi_primary"] = primary
            entry["india_aqi_basis"] = "rolling_mean"
            entry["aqi_averaging_basis"] = means_basis
        else:
            # Fall back to single hourly values as indicative estimate
            sub = cpcb_aqi(
                {
                    "pm2_5": entry.get("pm2_5"),
                    "pm10": entry.get("pm10"),
                    "nitrogen_dioxide": entry.get("nitrogen_dioxide"),
                    "ozone": entry.get("ozone"),
                }
            )
            entry["india_aqi"] = sub[0]
            entry["india_aqi_primary"] = sub[1]
            entry["india_aqi_basis"] = "hourly_indicative_estimate"
            entry["aqi_averaging_basis"] = {}
            entry["india_aqi_note"] = "Hourly indicative estimate, not a CPCB 24h/8h AQI."

        series.append(entry)
        if len(series) >= hours:
            break

    daily = {}
    for entry in series:
        date_key = entry["time"][:10]
        bucket = daily.setdefault(date_key, {"date": date_key, "us_aqi_max": None, "india_aqi_max": None, "pm2_5": []})
        if entry.get("us_aqi") is not None:
            bucket["us_aqi_max"] = max(bucket["us_aqi_max"] or 0, entry["us_aqi"])
        if entry.get("india_aqi") is not None:
            bucket["india_aqi_max"] = max(bucket["india_aqi_max"] or 0, entry["india_aqi"])
        if entry.get("pm2_5") is not None:
            try:
                bucket["pm2_5"].append(float(entry["pm2_5"]))
            except (TypeError, ValueError):
                pass

    daily_list = []
    for bucket in daily.values():
        pm_values = bucket.pop("pm2_5")
        bucket["pm2_5_mean"] = round(sum(pm_values) / len(pm_values), 1) if pm_values else None
        daily_list.append(bucket)

    location = {
        "latitude": data.get("latitude", latitude),
        "longitude": data.get("longitude", longitude),
        "timezone": data.get("timezone"),
        "name": f"{latitude:.3f}, {longitude:.3f}",
    }
    return {
        "location": location,
        "source": "Open-Meteo Air Quality (CAMS model output)",
        "source_url": "https://open-meteo.com/en/docs/air-quality-api",
        "hourly": series,
        "daily": daily_list,
        "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "stale": stale,
        "cache": {"hit": hit, "age_seconds": _cache_age(key)},
        "notes": [MODEL_GRID_NOTE, INDIA_AQI_NOTE],
    }


def _distance_km(lat1, lng1, lat2, lng2):
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return round(2 * radius * math.asin(math.sqrt(a)), 1)


def get_stations(latitude, longitude):
    offsets = [
        (0.0, 0.0, "Centre"),
        (0.13, 0.0, "North"),
        (0.0, 0.13, "East"),
        (-0.13, 0.0, "South"),
        (0.0, -0.13, "West"),
        (0.09, 0.09, "North-east"),
    ]
    latitudes = ",".join(f"{latitude + dlat:.4f}" for dlat, _, _ in offsets)
    longitudes = ",".join(f"{longitude + dlng:.4f}" for _, dlng, _ in offsets)
    key = f"stations:{location_key(latitude, longitude)}"
    cached, expired = _cache_get(key)
    if cached and not expired:
        data = cached[0]
        stale = False
        hit = True
    else:
        stale = False
        hit = cached is not None
        try:
            data = _get(
                Config.OPEN_METEO_AIR_URL,
                {
                    "latitude": latitudes,
                    "longitude": longitudes,
                    "current": "pm2_5,pm10,us_aqi",
                    "timezone": "auto",
                },
            )
            _cache_set(key, data)
        except Exception as exc:
            if cached:
                data = cached[0]
                stale = True
            else:
                logger.exception("Station/grid provider unavailable")
                raise RuntimeError("Air quality provider unavailable.") from exc

    results = data if isinstance(data, list) else [data]
    stations = []
    for index, result in enumerate(results):
        dlat, dlng, label = offsets[index] if index < len(offsets) else (0, 0, f"Point {index + 1}")
        current = result.get("current") or {}
        stations.append(
            {
                "id": f"grid-{index}-{round(latitude + dlat, 3)}-{round(longitude + dlng, 3)}",
                "name": f"Grid point - {label}",
                "latitude": float(result.get("latitude", latitude + dlat)),
                "longitude": float(result.get("longitude", longitude + dlng)),
                "aqi": int(round(current["us_aqi"])) if current.get("us_aqi") is not None else None,
                "pm2_5": _safe(current.get("pm2_5")),
                "pm10": _safe(current.get("pm10")),
                "scale": "us",
                "distance_km": _distance_km(latitude, longitude, latitude + dlat, longitude + dlng),
                "kind": "model_grid",
            }
        )
    return {
        "stations": stations,
        "source": "Open-Meteo Air Quality (CAMS model output)",
        "note": "These are sampled CAMS grid cells, not physical monitoring stations.",
        "stale": stale,
        "cache": {"hit": hit, "age_seconds": _cache_age(key)},
        "notes": [MODEL_GRID_NOTE],
    }
