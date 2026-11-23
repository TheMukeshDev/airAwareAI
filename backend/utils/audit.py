"""Structured audit events for security-sensitive operations."""

import json
import logging
from datetime import UTC, datetime

audit_logger = logging.getLogger("security")

SAFE_DETAILS = frozenset({"reason_code", "request_id", "status_code"})


def audit_event(event_type, user_id=None, outcome="success", **details):
    payload = {
        "event_type": event_type,
        "timestamp": datetime.now(UTC).isoformat(),
        "outcome": outcome,
    }
    payload.update({key: value for key, value in details.items() if key in SAFE_DETAILS})
    audit_logger.info("%s", json.dumps(payload, sort_keys=True))
