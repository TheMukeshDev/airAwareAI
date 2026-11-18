import logging

from flask import Blueprint, jsonify, request

import db as database
from extensions import conversations, find_user
from services import gemini_service
from services.air_lookup import air_for_user
from utils.http import error, now_utc, require_auth
from utils.validation import ensure_json_object

assistant_bp = Blueprint("assistant", __name__)
logger = logging.getLogger(__name__)


def _conversation(user_id):
    document = conversations.find_one({"user_id": user_id})
    if document:
        return document
    created = {
        "user_id": user_id,
        "messages": [],
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    try:
        result = conversations.insert_one(created)
        created["_id"] = result.inserted_id
        return created
    except database.IntegrityConflict:
        existing = conversations.find_one({"user_id": user_id})
        if existing:
            return existing
    except Exception:
        logger.exception("Failed to create conversation")
        raise
    # fallback
    existing = conversations.find_one({"user_id": user_id})
    return existing or created


@assistant_bp.post("/assistant/chat")
@require_auth
def chat(user_id):
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return failure
    message = data.get("message")
    if not isinstance(message, str):
        return error("Type a question first.", 422)
    message = message.strip()
    if not message:
        return error("Type a question first.", 422)
    if len(message) > 800:
        return error("Please keep questions under 800 characters.", 422)

    user = find_user(user_id)
    if not user:
        return error("Profile not found.", 404)

    air = air_for_user(user)
    try:
        conversation = _conversation(user_id)
    except Exception:
        return error("Could not start conversation.", 503)
    history = (conversation or {}).get("messages") or []

    lifestyle = user.get("lifestyle") or {}
    profile_summary = (
        f"Primary mode {lifestyle.get('primary_mode', 'unknown')}, "
        f"commute {lifestyle.get('commute_distance_km', 0)} km one way, "
        f"cooking fuel {lifestyle.get('cooking_fuel', 'unknown')}, "
        f"household of {lifestyle.get('household_size', 1)}."
    )
    try:
        result = gemini_service.chat(message, air=air, history=history, profile_summary=profile_summary)
    except gemini_service.GeminiUnavailable:
        logger.exception("Gemini unavailable for chat")
        return error("Gemini is unavailable right now. Please try again.", 503)

    user_message = {
        "id": f"u-{int(now_utc().timestamp())}",
        "role": "user",
        "content": message,
        "created_at": now_utc().isoformat(),
    }
    assistant_message = {
        "id": f"a-{int(now_utc().timestamp())}",
        "role": "assistant",
        "content": result["reply"],
        "sources": result.get("sources", []),
        "suggested_questions": result.get("suggested_questions", []),
        "generated_by": result.get("generated_by"),
        "created_at": now_utc().isoformat(),
    }
    messages = (history + [user_message, assistant_message])[-40:]
    try:
        conversations.update_one(
            {"_id": conversation["_id"]},
            {"$set": {"messages": messages, "updated_at": now_utc()}},
        )
    except Exception:
        logger.exception("Failed to save conversation history")

    return jsonify(
        {
            "id": assistant_message["id"],
            "reply": result["reply"],
            "sources": result.get("sources", []),
            "suggested_questions": result.get("suggested_questions", []),
            "generated_by": result.get("generated_by"),
        }
    )


@assistant_bp.get("/assistant/history")
@require_auth
def history(user_id):
    conversation = conversations.find_one({"user_id": user_id})
    messages = (conversation or {}).get("messages") or []
    return jsonify({"messages": messages})
