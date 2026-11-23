import hashlib
import logging
import os
import uuid

from flask import Flask, g, jsonify, request
from flask_cors import CORS
from flask_jwt_extended.exceptions import JWTExtendedException
from flask_limiter import RateLimitExceeded
from jwt.exceptions import PyJWTError

import db as database
from config import USING_GENERATED_SECRET, Config
from extensions import jwt, limiter, token_denylist
from routes.air_quality import air_quality_bp
from routes.assistant import assistant_bp
from routes.auth import auth_bp
from routes.community import community_bp
from routes.daily_plan import daily_plan_bp
from routes.impact import impact_bp
from routes.indoor_air import indoor_bp
from routes.lifestyle import lifestyle_bp
from routes.map_tiles import map_tiles_bp
from routes.profile import profile_bp
from services import gemini_service

logger = logging.getLogger(__name__)

BLUEPRINTS = (
    (auth_bp, "/api/auth"),
    (profile_bp, "/api"),
    (air_quality_bp, "/api"),
    (lifestyle_bp, "/api"),
    (daily_plan_bp, "/api"),
    (indoor_bp, "/api"),
    (impact_bp, "/api"),
    (assistant_bp, "/api"),
    (community_bp, "/api"),
    (map_tiles_bp, "/api/map/tiles"),
)

ROUTE_LIMITS = {
    "auth.login": "5/minute;20/hour",
    "auth.register": "10/minute;50/hour",
    "assistant.chat": "20/day",
    "air_quality.current": "60/minute",
    "air_quality.forecast": "60/minute",
    "air_quality.stations": "30/minute",
    "daily_plan.generate_plan": "10/hour;30/day",
    "indoor.create_assessment": "20/hour;60/day",
    "community.stats": "60/minute",
    "community.challenges": "60/minute",
    "community.join": "20/minute",
    "community.leaderboard": "60/minute",
    "map_tiles.tile": "300/minute",
}
PUBLIC_CACHE_ENDPOINTS = frozenset(
    {"air_quality.current", "air_quality.forecast", "air_quality.stations"}
)
_LIMIT_BASE = {}


def _fail_on_insecure_secrets(app):
    if app.config.get("TESTING"):
        return
    production = str(app.config.get("FLASK_ENV", "development")).lower() in {"production", "prod"}
    secret = str(app.config.get("JWT_SECRET_KEY", ""))
    if production and (USING_GENERATED_SECRET or len(secret) < 32):
        raise RuntimeError(
            "JWT_SECRET_KEY must be explicitly set to at least 32 characters in production."
        )
    if USING_GENERATED_SECRET:
        app.logger.warning(
            "No JWT_SECRET_KEY configured: using an ephemeral secret. Issued tokens will be "
            "invalidated when the process restarts."
        )


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)
    app.url_map.strict_slashes = False
    _fail_on_insecure_secrets(app)

    dev_origins = {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    }
    production = str(app.config.get("FLASK_ENV", "development")).lower() in {"production", "prod"}
    configured = {str(origin).rstrip("/") for origin in (app.config.get("CORS_ORIGINS") or ())}
    frontend = app.config.get("FRONTEND_URL")
    if frontend:
        configured.add(str(frontend).rstrip("/"))
    if production:
        if not configured:
            raise RuntimeError("CORS_ORIGINS must be explicitly set in production.")
    else:
        configured |= dev_origins
    CORS(app, resources={r"/api/*": {"origins": sorted(configured)}}, supports_credentials=False)

    jwt.init_app(app)
    limiter.enabled = bool(app.config.get("RATELIMIT_ENABLED", True))
    limiter.init_app(app)
    database.configure(app.config)
    gemini_service.configure(app.config)
    try:
        database.connect()
    except database.StorageUnavailable as exc:
        app.logger.warning("Storage unavailable at startup: %s", exc)

    @jwt.token_in_blocklist_loader
    def token_revoked(_jwt_header, jwt_payload):
        return token_denylist.is_revoked(jwt_payload.get("jti"))

    for blueprint, prefix in BLUEPRINTS:
        app.register_blueprint(blueprint, url_prefix=prefix)

    for endpoint, limit in ROUTE_LIMITS.items():
        if endpoint in app.view_functions:
            base = _LIMIT_BASE.setdefault(endpoint, app.view_functions[endpoint])
            app.view_functions[endpoint] = limiter.limit(limit)(base)

    @app.before_request
    def assign_request_id():
        g.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]

    @app.after_request
    def apply_security_headers(response):
        response.headers.setdefault("X-Request-ID", getattr(g, "request_id", ""))
        if app.config.get("SECURITY_HEADERS_ENABLED", True):
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
            )
        if response.status_code == 200 and request.endpoint in PUBLIC_CACHE_ENDPOINTS:
            visibility = "private" if request.headers.get("Authorization") else "public"
            ttl = int(app.config.get("CACHE_TTL_SECONDS", 600))
            response.headers["Cache-Control"] = f"{visibility}, max-age={ttl}"
            etag = '"' + hashlib.sha256(response.get_data()).hexdigest() + '"'
            response.headers["ETag"] = etag
            if request.headers.get("If-None-Match") == etag:
                response.status_code = 304
                response.set_data(b"")
        return response

    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "status": "healthy",
                "service": "AirAware AI API",
                "storage": database.storage_mode(),
                "ai": "gemini" if gemini_service.is_enabled() else "not-configured",
            }
        )

    @app.get("/api/ready")
    def ready():
        checks = {
            "storage": database.storage_mode() in {"supabase", "memory"},
            "ai": gemini_service.is_enabled(),
        }
        ok = all(checks.values())
        return jsonify({"ready": ok, "checks": checks}), (200 if ok else 503)

    limiter.exempt(health)
    limiter.exempt(ready)

    @jwt.unauthorized_loader
    def missing_token(_reason):
        return jsonify({"error": "Authentication required."}), 401

    @jwt.invalid_token_loader
    def invalid_token(_reason):
        return jsonify({"error": "Your session token is invalid. Please sign in again."}), 401

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return jsonify({"error": "Your session expired. Please sign in again."}), 401

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Endpoint not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(_error):
        return jsonify({"error": "Method not allowed for this endpoint."}), 405

    @app.errorhandler(RateLimitExceeded)
    def rate_limited(error):
        response = jsonify({"error": "Too many requests. Please retry later."})
        response.status_code = 429
        if error.retry_after:
            response.headers["Retry-After"] = str(error.retry_after)
        return response

    @app.errorhandler(JWTExtendedException)
    @app.errorhandler(PyJWTError)
    def jwt_error(_error):
        return jsonify({"error": "Your session token could not be verified."}), 401

    @app.errorhandler(database.StorageUnavailable)
    def storage_unavailable(_error):
        app.logger.error("Storage unavailable (request %s)", getattr(g, "request_id", ""))
        return jsonify({"error": "Data storage is temporarily unavailable."}), 503

    @app.errorhandler(gemini_service.GeminiUnavailable)
    def gemini_unavailable(_error):
        app.logger.error("Gemini unavailable (request %s)", getattr(g, "request_id", ""))
        return jsonify({"error": "The AI assistant is temporarily unavailable."}), 503

    @app.errorhandler(500)
    def server_error(_error):
        return jsonify({"error": "Unexpected server error. Please retry."}), 500

    @app.errorhandler(Exception)
    def unhandled(error):
        logger.exception("Unhandled error (request %s): %s", getattr(g, "request_id", ""), error)
        return jsonify({"error": "Unexpected server error. Please retry."}), 500

    return app


app = create_app()


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}
    app.run(host="127.0.0.1", port=5000, debug=debug)
