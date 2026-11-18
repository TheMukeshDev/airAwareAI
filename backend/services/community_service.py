import logging
from datetime import UTC, datetime, timedelta

from extensions import challenge_members, challenges, impact_records, indoor_assessments, users
from services.impact_calculator import FACTOR_VERSION, personal_summary

logger = logging.getLogger(__name__)

DEFAULT_CHALLENGES = [
    {
        "id": "clean-commute-week",
        "title": "Clean commute week",
        "description": "Log at least three low-emission commutes this week - metro, bus, cycle or walk.",
        "category": "mobility",
        "target_kg": 12.0,
        "duration_days": 7,
        "icon": "train",
    },
    {
        "id": "metro-mornings",
        "title": "Metro mornings",
        "description": "Replace morning car trips with the metro for five working days.",
        "category": "mobility",
        "target_kg": 18.0,
        "duration_days": 10,
        "icon": "sunrise",
    },
    {
        "id": "window-smart",
        "title": "Window-smart week",
        "description": "Ventilate only in the cleanest window for a week and log how it felt.",
        "category": "indoor_air",
        "target_kg": 0.0,
        "duration_days": 7,
        "icon": "wind",
    },
    {
        "id": "plant-forward",
        "title": "Plant-forward fortnight",
        "description": "Add two plant-based days a week and log the trips you also swap.",
        "category": "food",
        "target_kg": 8.0,
        "duration_days": 14,
        "icon": "leaf",
    },
]


def ensure_seeded():
    now = datetime.now(UTC)
    for template in DEFAULT_CHALLENGES:
        existing = challenges.find_one({"id": template["id"]})
        if existing:
            continue
        try:
            challenges.insert_one(
                {
                    **template,
                    "starts_at": now,
                    "ends_at": now + timedelta(days=template["duration_days"]),
                    "created_at": now,
                }
            )
        except Exception:
            logger.exception("Failed to seed challenge %s", template.get("id"))


def _display_name(user):
    name = (user or {}).get("display_name") or (user or {}).get("name") or "Member"
    parts = str(name).split()
    if len(parts) > 1:
        return f"{parts[0]} {parts[-1][0]}."
    return parts[0] if parts else "Member"


def _to_dt(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
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


def _date_in_window(date_str, start_dt, end_dt):
    if not date_str:
        return False
    try:
        # impact record dates are YYYY-MM-DD
        if len(str(date_str)) == 10:
            dt = datetime.fromisoformat(str(date_str)).replace(tzinfo=UTC)
        else:
            dt = _to_dt(date_str)
    except Exception:
        dt = _to_dt(date_str)
    if dt is None:
        return False
    if start_dt and dt.date() < start_dt.date():
        return False
    if end_dt and dt.date() > end_dt.date():
        return False
    return True


def _category_matches_record(category, record):
    if not category:
        return True
    if category == "mobility":
        return (record.get("activity_type") or "journey") == "journey"
    if category == "food":
        return record.get("activity_type") == "food" or record.get("category") == "food"
    if category == "indoor_air":
        return record.get("activity_type") == "indoor_air" or record.get("category") == "indoor_air"
    return record.get("category") == category or record.get("activity_type") == category


def _users_by_id():
    mapping = {}
    try:
        for user in users.find({}):
            mapping[user.get("_id")] = user
    except Exception:
        logger.exception("Failed to load users")
    return mapping


def _totals_by_user(users_map=None, require_share_aggregate=False, require_leaderboard_opt_in=False):
    users_map = users_map if users_map is not None else _users_by_id()
    totals = {}
    try:
        records = list(impact_records.find({}))
    except Exception:
        logger.exception("Failed to load impact records")
        records = []
    for record in records:
        user_id = record.get("user_id")
        if not user_id:
            continue
        user = users_map.get(user_id) or {}
        prefs = user.get("preferences") or {}
        if require_share_aggregate and prefs.get("share_aggregate") is False:
            continue
        if require_leaderboard_opt_in and prefs.get("leaderboard_opt_in") is not True:
            continue
        totals[user_id] = totals.get(user_id, 0.0) + float(record.get("avoided_kg") or 0)
    return {key: round(value, 2) for key, value in totals.items()}


def _member_count(users_map=None, require_share_aggregate=False):
    users_map = users_map if users_map is not None else _users_by_id()
    if not require_share_aggregate:
        return len(users_map)
    count = 0
    for user in users_map.values():
        prefs = user.get("preferences") or {}
        if prefs.get("share_aggregate") is not False:
            count += 1
    return count


def _score_label(score):
    if score >= 80:
        return "Leading"
    if score >= 60:
        return "Strong"
    if score >= 35:
        return "Building"
    return "Emerging"


def _challenge_checkins(user_id, challenge, start_dt, end_dt):
    category = challenge.get("category")
    count = 0
    if category == "indoor_air":
        try:
            assessments = list(indoor_assessments.find({"user_id": user_id}))
        except Exception:
            assessments = []
        for item in assessments:
            ts = _to_dt(item.get("created_at"))
            if ts and ((not start_dt) or ts >= start_dt) and ((not end_dt) or ts <= end_dt):
                count += 1
        return count
    try:
        records = list(impact_records.find({"user_id": user_id}))
    except Exception:
        records = []
    for record in records:
        if not _date_in_window(record.get("date"), start_dt, end_dt):
            continue
        if _category_matches_record(category, record):
            count += 1
    return count


def stats(user_id):
    users_map = _users_by_id()
    totals = _totals_by_user(users_map, require_share_aggregate=True)
    members = _member_count(users_map, require_share_aggregate=True)
    collective = round(sum(max(0.0, value) for value in totals.values()), 1)

    personal = 0.0
    if user_id:
        try:
            personal = personal_summary(user_id, days=30)["totals"]["avoided_kg"]
        except Exception:
            logger.exception("Failed to compute personal summary for stats")
            personal = 0.0

    # rank among users who share aggregate (and have totals)
    ranking = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    rank = next((index + 1 for index, (key, _) in enumerate(ranking) if key == user_id), None)

    per_member = collective / members if members else 0.0
    score = min(100, round((per_member / 12.0) * 100)) if collective else 0
    if rank and rank <= 3 and score < 60:
        score = max(score, 60)

    return {
        "members": members,
        "collective_avoided_kg": collective,
        "your_avoided_kg": personal,
        "your_rank": rank,
        "neighbourhood_score": score,
        "neighbourhood_label": _score_label(score),
        "per_member_kg": round(per_member, 2),
        "factor_version": FACTOR_VERSION,
        "privacy_note": "Only aggregated totals and display names are shown. Journeys and locations stay private.",
    }


def list_challenges(user_id):
    ensure_seeded()
    now = datetime.now(UTC)
    memberships = {}
    try:
        for member in challenge_members.find({"user_id": user_id}):
            memberships[member.get("challenge_id")] = member
    except Exception:
        logger.exception("Failed to load challenge memberships")

    items = []
    try:
        challenge_docs = list(challenges.find({}))
    except Exception:
        logger.exception("Failed to load challenges")
        challenge_docs = []
    challenge_docs.sort(key=lambda c: c.get("created_at") or now, reverse=True)

    # preload impact records once for efficiency
    try:
        all_records = list(impact_records.find({}))
    except Exception:
        all_records = []

    for challenge in challenge_docs:
        challenge_id = challenge.get("id")
        try:
            member_rows = list(challenge_members.find({"challenge_id": challenge_id}))
        except Exception:
            member_rows = []
        member_ids = {row.get("user_id") for row in member_rows if row.get("user_id")}
        start_dt = _to_dt(challenge.get("starts_at"))
        end_dt = _to_dt(challenge.get("ends_at"))
        target = float(challenge.get("target_kg") or 0)
        category = challenge.get("category")

        progress_kg = 0.0
        for record in all_records:
            if record.get("user_id") not in member_ids:
                continue
            if not _date_in_window(record.get("date"), start_dt, end_dt):
                continue
            if not _category_matches_record(category, record):
                continue
            progress_kg += float(record.get("avoided_kg") or 0)
        progress_kg = round(max(0.0, progress_kg), 2)

        if target > 0:
            progress_pct = min(100, round((progress_kg / target) * 100)) if target else 0
        else:
            # habit challenge: derive check-ins from records/assessments in window
            completed_members = 0
            for uid in member_ids:
                if _challenge_checkins(uid, challenge, start_dt, end_dt) > 0:
                    completed_members += 1
                    # best-effort update stored completed_logs for transparency
                    try:
                        challenge_members.update_one(
                            {"challenge_id": challenge_id, "user_id": uid},
                            {"$set": {"completed_logs": _challenge_checkins(uid, challenge, start_dt, end_dt)}},
                        )
                    except Exception:
                        pass
            progress_pct = min(100, round((completed_members / max(1, len(member_ids))) * 100)) if member_ids else 0

        days_left = None
        if isinstance(end_dt, datetime):
            days_left = max(0, (end_dt.date() - now.date()).days)

        items.append(
            {
                "id": challenge_id,
                "title": challenge.get("title"),
                "description": challenge.get("description"),
                "category": category,
                "icon": challenge.get("icon"),
                "target_kg": target,
                "participants": len(member_ids),
                "joined": challenge_id in memberships,
                "ends_at": end_dt.isoformat().replace("+00:00", "Z") if isinstance(end_dt, datetime) else None,
                "days_left": days_left,
                "progress_pct": progress_pct,
                "progress_kg": progress_kg,
                "active": bool(challenge_id in memberships),
            }
        )
    return {"challenges": items}


def join_challenge(user_id, challenge_id):
    ensure_seeded()
    challenge = challenges.find_one({"id": challenge_id})
    if not challenge:
        raise LookupError("Challenge not found")
    existing = challenge_members.find_one({"challenge_id": challenge_id, "user_id": user_id})
    if not existing:
        try:
            challenge_members.insert_one(
                {
                    "challenge_id": challenge_id,
                    "user_id": user_id,
                    "joined_at": datetime.now(UTC),
                    "completed_logs": 0,
                }
            )
        except Exception:
            # possible unique conflict in concurrent join; treat as joined if exists now
            logger.exception("Failed to join challenge, checking existing membership")
            existing = challenge_members.find_one({"challenge_id": challenge_id, "user_id": user_id})
            if not existing:
                raise
    updated = next(
        (item for item in list_challenges(user_id)["challenges"] if item["id"] == challenge_id),
        None,
    )
    return {"challenge": updated}


def leaderboard(user_id, page=1, per_page=10):
    try:
        page = max(1, int(page))
        per_page = max(1, int(per_page))
    except (TypeError, ValueError):
        page, per_page = 1, 10
    users_map = _users_by_id()
    totals = _totals_by_user(users_map, require_leaderboard_opt_in=True)
    ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    total = len(ordered)
    start = (page - 1) * per_page
    entries = []
    for index, (member_id, avoided) in enumerate(ordered[start : start + per_page], start=start + 1):
        user = users_map.get(member_id) or {}
        entries.append(
            {
                "rank": index,
                "name": "You" if member_id == user_id else _display_name(user),
                "avoided_kg": round(avoided, 1),
                "is_you": member_id == user_id,
                "verified": False,
            }
        )
    return {
        "entries": entries,
        "page": page,
        "pages": max(1, (total + per_page - 1) // per_page),
        "total": total,
        "note": "Rankings use self-logged estimates on the development factor set.",
    }
