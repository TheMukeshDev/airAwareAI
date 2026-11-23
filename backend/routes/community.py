import logging

from flask import Blueprint, jsonify, request

from security import shared_rate_limit
from services import community_service
from utils.http import error, pagination, require_auth
from utils.validation import ensure_json_object, reject_unknown_keys

community_bp = Blueprint("community", __name__)
logger = logging.getLogger(__name__)


@community_bp.get("/community/stats")
@require_auth
@shared_rate_limit("community.read", 120, 60)
def stats(user_id):
    try:
        return jsonify(community_service.stats(user_id))
    except Exception:
        logger.exception("Failed to load community stats")
        return error("Could not load community stats.", 503)


@community_bp.get("/community/challenges")
@require_auth
@shared_rate_limit("community.read", 120, 60)
def challenges(user_id):
    try:
        return jsonify(community_service.list_challenges(user_id))
    except Exception:
        logger.exception("Failed to load community challenges")
        return error("Could not load community challenges.", 503)


def _challenge_id_from_payload():
    data = request.get_json(silent=True)
    data, failure = ensure_json_object(data)
    if failure:
        return None, failure
    failure = reject_unknown_keys(data, {"challenge_id"}, "challenge join")
    if failure:
        return None, failure
    challenge_id = data.get("challenge_id")
    if not isinstance(challenge_id, str) or not challenge_id.strip():
        return None, error("challenge_id is required.", 422)
    if len(challenge_id.strip()) > 100:
        return None, error("challenge_id must be at most 100 characters.", 422)
    return challenge_id.strip(), None


@community_bp.post("/community/challenges/join")
@require_auth
@shared_rate_limit("community.join", 30, 60)
def join(user_id):
    challenge_id, failure = _challenge_id_from_payload()
    if failure:
        return failure
    try:
        return jsonify(community_service.join_challenge(user_id, challenge_id))
    except LookupError:
        return error("Challenge not found.", 404)

    except Exception:
        logger.exception("Failed to join challenge")
        return error("Could not join challenge.", 503)


@community_bp.get("/community/leaderboard")
@require_auth
@shared_rate_limit("community.read", 120, 60)
def leaderboard(user_id):
    page, per_page = pagination(default_per_page=10)
    try:
        return jsonify(community_service.leaderboard(user_id, page=page, per_page=per_page))
    except Exception:
        logger.exception("Failed to load leaderboard")
        return error("Could not load leaderboard.", 503)
