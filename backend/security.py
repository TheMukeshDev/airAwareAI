"""Shared guards for high-risk endpoints.

Flask-Limiter's default counters remain process-local; set RATELIMIT_STORAGE_URI to a
shared store to cover every route. The shared guard here covers the high-risk routes
listed in app.ROUTE_LIMITS with a Postgres counter. If Supabase is unconfigured or
temporarily unreachable, both the JWT denylist and these counters fall back to
process-local memory, so that serverless instance has only a local view.
"""

from functools import wraps

from flask import current_app, jsonify

import db as database
from extensions import _rate_limit_key


def shared_rate_limit(bucket, limit, window_seconds):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if current_app.config.get("SHARED_RATE_LIMIT_ENABLED", True):
                allowed = database.rate_limit_hit(bucket, _rate_limit_key(), limit, window_seconds)
                if not allowed:
                    return jsonify({"error": "Too many requests. Please retry later."}), 429
            return fn(*args, **kwargs)

        return wrapper

    return decorator
