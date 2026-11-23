"""Server-side CARTO tile proxy.

The basemap key is read only from Config.CARTO_API_KEY and never from a request.
TILE_URL is the contract the map client uses; it keeps the key off the browser.
"""

import hashlib

import requests
from flask import Blueprint, Response, current_app, jsonify

from config import Config

map_tiles_bp = Blueprint("map_tiles", __name__)

TILE_URL = "/api/map/tiles/dark_all/{z}/{x}/{y}.png"

ALLOWED_STYLES = frozenset(
    {
        "dark_all",
        "light_all",
        "voyager",
        "dark_nolabels",
        "light_nolabels",
        "voyager_nolabels",
    }
)
MAX_ZOOM = 20


def _valid_tile(style, z, x, y):
    if style not in ALLOWED_STYLES or not 0 <= z <= MAX_ZOOM:
        return False
    bound = 1 << z
    return 0 <= x < bound and 0 <= y < bound


def _upstream_url(style, z, x, y):
    return f"https://a.basemaps.cartocdn.com/{style}/{z}/{x}/{y}.png"


def _fetch_tile(url, params, timeout, max_bytes):
    upstream = requests.get(url, params=params, timeout=timeout, stream=True)
    with upstream:
        if upstream.status_code != 200:
            return None
        content_type = upstream.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "image/png":
            return None
        chunks = []
        total = 0
        for chunk in upstream.iter_content(chunk_size=8192):
            if not chunk:
                continue
            total += len(chunk)
            if total > max_bytes:
                return None
            chunks.append(chunk)
        return b"".join(chunks)


@map_tiles_bp.get("/<style>/<int:z>/<int:x>/<int:y>.png")
def tile(style, z, x, y):
    if not _valid_tile(style, z, x, y):
        return jsonify({"error": "Unknown basemap style or tile coordinates."}), 404

    api_key = Config.CARTO_API_KEY
    params = {"key": api_key} if api_key else {}
    timeout = int(current_app.config.get("CARTO_TILE_TIMEOUT_SECONDS", Config.CARTO_TILE_TIMEOUT_SECONDS))
    max_bytes = int(current_app.config.get("CARTO_TILE_MAX_BYTES", Config.CARTO_TILE_MAX_BYTES))
    cache_seconds = int(current_app.config.get("CARTO_TILE_CACHE_SECONDS", Config.CARTO_TILE_CACHE_SECONDS))

    try:
        payload = _fetch_tile(_upstream_url(style, z, x, y), params, timeout, max_bytes)
    except requests.RequestException:
        payload = None
    if payload is None:
        return jsonify({"error": "Basemap tile provider is temporarily unavailable."}), 502

    response = Response(payload, mimetype="image/png")
    response.headers["Cache-Control"] = f"public, max-age={cache_seconds}"
    response.headers["ETag"] = f'"{hashlib.sha256(payload).hexdigest()}"'
    return response
