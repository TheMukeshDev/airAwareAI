import re
from datetime import UTC, datetime
from functools import wraps

from flask import g, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from utils.audit import audit_event


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


def _sensitive_audit(event_type, reason_code, status_code):
    audit_event(
        event_type,
        outcome="failure",
        reason_code=reason_code,
        request_id=getattr(g, "request_id", None),
        status_code=status_code,
    )


def require_sensitive_confirmation(fn=None, *, event_type="sensitive_operation", max_body_bytes=16384):
    """Require a bounded JSON object body before a sensitive route runs."""

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            length = request.content_length or 0
            if length > max_body_bytes:
                _sensitive_audit(event_type, "payload_too_large", 413)
                return error("Request body is too large.", 413)
            data = request.get_json(silent=True)
            if data is None and not request.is_json:
                has_body = bool(request.get_data(cache=True))
                status = 415 if has_body else 400
                _sensitive_audit(event_type, "json_required", status)
                message = "A JSON request body is required." if has_body else "Request body is required."
                return error(message, status)
            if not isinstance(data, dict):
                _sensitive_audit(event_type, "invalid_payload", 400)
                return error("Request body must be a JSON object.", 400)
            return view(*args, **kwargs)

        return wrapper

    return decorator(fn) if fn is not None else decorator


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

