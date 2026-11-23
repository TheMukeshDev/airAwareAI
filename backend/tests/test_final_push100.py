import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module
import db as database
from config import TestConfig
from db import postgres_store
from extensions import limiter, token_denylist
from routes import assistant as assistant_routes
from routes import daily_plan as daily_plan_routes
from routes import indoor_air as indoor_routes
from routes import profile as profile_routes
from services import (
    aqi_service,
    community_service,
    gemini_service,
    impact_calculator,
    indoor_engine,
    recommendation_engine,
)
from utils.validation import bounded_text


@pytest.fixture()
def app():
    database.reset_memory_store()
    token_denylist._entries.clear()
    limiter.reset()
    application = app_module.create_app(TestConfig)
    application.config.update(TESTING=True)
    yield application
    limiter.reset()
    token_denylist._entries.clear()
    database.reset_memory_store()


@pytest.fixture()
def client(app):
    return app.test_client()


def auth_headers(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Final Tester", "email": "final100@airaware.app", "password": "testpass123"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def test_provider_class_helpers(monkeypatch):
    monkeypatch.setattr(aqi_service, "_get", lambda *args: {"ok": True})
    monkeypatch.setattr(aqi_service, "_CACHE", aqi_service.TTLCache(maxsize=10, ttl_seconds=60))
    provider = aqi_service._air_provider
    assert provider.fetch_json("https://example.invalid/data", {}) == {"ok": True}
    assert provider.location_key(1, 2) == aqi_service.location_key(1, 2)
    provider.reset_cache()
    provider.cache_set("class:key", {"value": 1})
    assert provider.cache_get("class:key")[1] is False
    assert provider.cache_age("class:key") is not None
    provider.reset_cache()


def test_assistant_class_helpers(monkeypatch):
    monkeypatch.setattr(gemini_service, "_runtime", {"api_key": "", "model": "m", "timeout": 1})
    monkeypatch.setattr(gemini_service, "_client", None)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    service = gemini_service._assistant
    assert service.generate_json("x", gemini_service.PlanEnhancement) is None
    assert service.json_data({"a": 1}) == '{"a": 1}'
    assert service.context_block(None).startswith("No live")
    types = SimpleNamespace(
        Part=lambda text: SimpleNamespace(text=text),
        Content=lambda role, parts: SimpleNamespace(role=role, parts=parts),
    )
    contents = service.chat_contents(types, [{"role": "user", "content": "hi"}], "ctx", "question")
    assert len(contents) == 2
    assert service.chat_result(SimpleNamespace(text='{"reply":"x"}'), None)["reply"] == "x"
    assert service.sources(None)


def test_gemini_http_options_fallbacks(monkeypatch):
    from google.genai import types

    class Boom:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("unsupported")

    monkeypatch.setattr(types, "HttpOptions", Boom)
    monkeypatch.setattr(gemini_service, "_runtime", {"api_key": "key", "model": "m", "timeout": 1})
    monkeypatch.setattr(gemini_service, "_client", None)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    assert gemini_service._client_factory() is not None

    plan_response = SimpleNamespace(text='{"title":"t","summary":"s"}')
    plan_client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kwargs: plan_response))
    monkeypatch.setattr(gemini_service, "_get_client", lambda: plan_client)
    assert gemini_service._generate_json("x", gemini_service.PlanEnhancement)["title"] == "t"

    chat_response = SimpleNamespace(text='{"reply":"hello"}')
    chat_client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kwargs: chat_response))
    monkeypatch.setattr(gemini_service, "_get_client", lambda: chat_client)
    assert gemini_service.chat("hi")["reply"] == "hello"


def test_aqi_remaining_helpers(monkeypatch):
    aqi_service.reset_cache()
    hourly = {"time": ["bad", "2026-01-01T10:00"], "pm2_5": [1, 2]}
    assert aqi_service._best_ventilation_window(hourly, "2026-01-01T09:00") is None
    data = {
        "current": {"time": "2026-01-01T10:00"},
        "hourly": {"time": ["2026-01-01T10:00"], "pm2_5": [10]},
        "timezone": "Asia/Kolkata",
    }
    payload = aqi_service._build_current_payload(data, None, False, False, "key", 1, 1)
    assert "aqi" in payload
    times = [aqi_service._parse_dt("2026-01-01T09:00"), aqi_service._parse_dt("2026-01-01T10:00")]
    assert aqi_service._parse_dt("2026-01-01T00:00:00+00:00") is not None
    assert aqi_service._rolling_values([1, 2], 0, times[1], times, 0) == []
    assert aqi_service._rolling_values([None, 2], 1, times[1], times, 24) == [2.0]
    assert aqi_service._rolling_values([1, 2], 1, times[1], times, 24) == [2.0, 1.0]
    assert aqi_service._rolling_values([1, 2], 1, times[0], times, 24) == [1.0]
    daily = aqi_service._forecast_daily([
        {"time": "2026-01-01T00:00", "us_aqi": 10, "india_aqi": None, "pm2_5": None}
    ])
    assert daily[0]["pm2_5_mean"] is None
    monkeypatch.setattr(aqi_service, "_CACHE", aqi_service.TTLCache(maxsize=10, ttl_seconds=60))
    key = f"stations:{aqi_service.location_key(1, 1)}"
    aqi_service._cache_set(key, {"current": {"us_aqi": 50}})
    assert aqi_service._get_stations(1, 1)["cache"]["hit"]
    aqi_service.reset_cache()
    monkeypatch.setattr(aqi_service, "_get", lambda *args: (_ for _ in ()).throw(RuntimeError("down")))
    with pytest.raises(RuntimeError):
        aqi_service._get_stations(1, 1)
    monkeypatch.setitem(
        aqi_service.CPCB_BREAKPOINTS,
        "pm2_5",
        [(0, 0, 0, 50), (50, 50, 100, 100)],
    )
    assert aqi_service._sub_index("pm2_5", 0) == 0


def test_db_helper_remaining_branches(monkeypatch):
    assert "IS NOT NULL" in database._exists_clause("name", True, [])
    clauses = []
    params = []
    database._append_where_clause(clauses, params, "name", {"$unknown": 1})
    assert clauses == []
    monkeypatch.setattr(database, "connect", lambda: "memory")
    monkeypatch.setattr(database, "_pool", object())
    with pytest.raises(database.StorageUnavailable):
        database._pool_or_raise()


def test_postgres_helper_remaining_branches(monkeypatch):
    from psycopg import sql

    fake_database = SimpleNamespace(sql=sql, _is_simple_allowed_key=lambda key: False)
    with monkeypatch.context() as patch:
        patch.setattr(postgres_store, "_database", lambda: fake_database)
        statement, args = postgres_store._append_fetch_sort(sql.SQL("select 1"), [], [("_id", -1)])
    assert statement.as_string(None).endswith("id DESC")
    assert args == []

    class BrokenConnection:
        def execute(self, *args, **kwargs):
            raise RuntimeError("boom")

    class ConnectionContext:
        def __enter__(self):
            return BrokenConnection()

        def __exit__(self, *args):
            return False

    class Pool:
        def connection(self):
            return ConnectionContext()

    monkeypatch.setattr(database, "_pool_or_raise", lambda: Pool())
    monkeypatch.setattr(database, "_raise_if_integrity", lambda exc: None)
    with pytest.raises(RuntimeError):
        postgres_store.PostgresCollection("items").update_one({}, {"$set": {"ok": True}})

    connection = SimpleNamespace(execute=lambda *args: None)
    result = postgres_store.PostgresCollection("items")._insert_upsert(
        database, connection, {"nested": {"a": 1}, "name": "x"}, {"$set": {"ok": True}}
    )
    assert result.upserted_id


def test_assistant_conversation_conflict_fallback(monkeypatch):
    existing = {"_id": "c1", "user_id": "u1"}
    monkeypatch.setattr(assistant_routes.conversations, "find_one", lambda query: existing)
    assert assistant_routes._conversation("u1") is existing
    calls = []

    def find_one(query):
        calls.append(1)
        return existing if len(calls) > 1 else None

    monkeypatch.setattr(assistant_routes.conversations, "find_one", find_one)

    def insert_one(document):
        raise database.IntegrityConflict("duplicate")

    monkeypatch.setattr(assistant_routes.conversations, "insert_one", insert_one)
    assert assistant_routes._conversation("u1") is existing


def test_daily_plan_non_tuple_result(client, monkeypatch, app):
    headers = auth_headers(client)
    monkeypatch.setattr(
        daily_plan_routes,
        "_existing_or_generate",
        lambda user, data: app.response_class(json.dumps({"ok": True}), mimetype="application/json"),
    )
    response = client.post("/api/daily-plan/generate", headers=headers, json={})
    assert response.get_json() == {"ok": True}


def test_indoor_assessment_answer_failure(client, monkeypatch):
    headers = auth_headers(client)
    monkeypatch.setattr(
        indoor_routes,
        "_assessment_answers",
        lambda data: (None, indoor_routes.error("answers must be a JSON object.", 422)),
    )
    response = client.post("/api/indoor/assessment", headers=headers, json={})
    assert response.status_code == 422


def test_sensitive_body_size_limit(client):
    headers = auth_headers(client)
    body = json.dumps({"confirm_delete": True, "current_password": "x" * 5000})
    response = client.delete(
        "/api/profile",
        headers=headers,
        data=body,
        content_type="application/json",
    )
    assert response.status_code == 413


def test_profile_helper_remaining_branches(app, monkeypatch):
    monkeypatch.setattr(profile_routes, "DEFAULT_PREFERENCES", {})
    with app.test_request_context("/api/profile", method="PUT", json={}):
        cleaned = profile_routes._clean_lifestyle(
            {"transport": {"primary_mode": "metro"}, "primary_mode": "bus"}, {}
        )
        assert cleaned["primary_mode"] in {"metro", "bus"}
        merged = {}
        profile_routes._apply_lifestyle_value(merged, "household_size", float("nan"))
        assert merged == {}
        assert profile_routes._profile_preferences({}, {})["aqi_scale"] == "us"
        assert profile_routes.validate_lifestyle_payload([]) is not None
        assert profile_routes.validate_lifestyle_payload({"transport": {"primary_mode": "invalid"}}) is not None
        assert profile_routes._onboarding_updates({}, {})[0]["onboarding_complete"] is True
    with app.test_request_context("/api/profile", method="DELETE", json=["x"]):
        assert profile_routes._deletion_failure({}, "u1") is not None
    with app.test_request_context("/api/profile", method="PUT", json=[]):
        assert profile_routes._prepare_profile_update("u1")[2] is not None


def test_password_encoding_failure(app):
    class BrokenPassword(str):
        def encode(self, *args, **kwargs):
            raise RuntimeError("cannot encode")

    with app.test_request_context("/api/profile", method="PUT", json={}):
        value, failure = profile_routes._validated_new_password(BrokenPassword("validpass"), "u1")
        assert value is None
        assert failure[1] == 422


def test_profile_update_no_supported_fields(app, monkeypatch):
    monkeypatch.setattr(profile_routes, "_credential_updates", lambda user, data, user_id: ({}, None))
    monkeypatch.setattr(profile_routes, "_profile_field_updates", lambda user, data: ({}, None))
    monkeypatch.setattr(profile_routes, "find_user", lambda user_id: {"_id": user_id})
    original = profile_routes.update_profile.__wrapped__.__wrapped__
    with app.test_request_context("/api/profile", method="PUT", json={}):
        response = original("u1")
        assert response[1] == 422


def test_onboarding_failure_branch(app, monkeypatch):
    monkeypatch.setattr(
        profile_routes,
        "_onboarding_updates",
        lambda user, data: (None, profile_routes.error("Invalid onboarding.", 422)),
    )
    monkeypatch.setattr(profile_routes, "find_user", lambda user_id: {"_id": user_id})
    original = profile_routes.complete_onboarding.__wrapped__
    with app.test_request_context("/api/profile/onboarding", method="POST", json={}):
        response = original("u1")
        assert response[1] == 422


def test_expired_token_and_unknown_limit_endpoint(monkeypatch, app, client):
    monkeypatch.setattr(app_module, "ROUTE_LIMITS", {"missing.endpoint": "10/minute"})
    application = app_module.create_app(TestConfig)
    application.config.update(TESTING=True)
    with application.test_request_context("/api/health"):
        assert application.view_functions["health"]() is not None
    response = client.get("/api/health")
    assert response.status_code == 200
    with app.app_context():
        token = create_access_token("u1", expires_delta=timedelta(seconds=-1))
    expired = client.get("/api/profile", headers={"Authorization": f"Bearer {token}"})
    assert expired.status_code == 401
    assert "expired" in expired.get_json()["error"].lower()


def test_community_service_remaining_branches(monkeypatch):
    aware = datetime(2026, 1, 1, tzinfo=UTC)
    assert community_service._to_dt(aware) is aware
    assert community_service._to_dt("2026-01-01T00:00:00+00:00") == aware

    class BrokenDate:
        def __str__(self):
            raise RuntimeError("bad date")

    assert community_service._parse_record_date(BrokenDate()) is None
    monkeypatch.setattr(
        community_service,
        "_load_collection",
        lambda collection: [{"avoided_kg": 1}] if collection is community_service.impact_records else [],
    )
    assert community_service._totals_by_user({}) == {}
    assert community_service._member_count({"u1": {}}) == 1
    challenge = {"category": "mobility"}
    records = [
        {"user_id": "other", "date": "2026-01-01", "activity_type": "journey"},
        {"user_id": "u1", "date": "2026-01-01", "activity_type": "journey", "avoided_kg": 1},
    ]
    assert community_service._challenge_checkins("u1", challenge, None, None, records, []) == 1
    assessments = [
        {"user_id": "other", "created_at": "2026-01-01T00:00:00+00:00"},
        {"user_id": "u1", "created_at": None},
    ]
    assert community_service._challenge_checkins("u1", {"category": "indoor_air"}, None, None, [], assessments) == 0
    assert community_service._indoor_challenge_progress(
        {"category": "indoor_air"}, ["u1"], None, None, [], assessments
    )[0] == 0
    assert community_service._challenge_memberships([{}], "u1")[1] == {}
    monkeypatch.setattr(community_service, "ensure_seeded", lambda: None)

    def load_list(collection):
        if collection is community_service.impact_records:
            return [{"avoided_kg": 1}]
        return []

    monkeypatch.setattr(community_service, "_load_collection", load_list)
    assert community_service.stats(None)["members"] == 0
    assert community_service.list_challenges("u1")["challenges"] == []

    monkeypatch.setattr(
        community_service.challenges, "find_one", lambda query: {"id": "c1"}
    )
    monkeypatch.setattr(community_service.challenge_members, "find_one", lambda query: None)

    def fail_insert(document):
        raise RuntimeError("insert failed")

    monkeypatch.setattr(community_service.challenge_members, "insert_one", fail_insert)
    with pytest.raises(RuntimeError):
        community_service.join_challenge("u1", "c1")

    calls = []

    def find_existing(query):
        calls.append(1)
        return {"challenge_id": "c1", "user_id": "u1"} if len(calls) > 1 else None

    monkeypatch.setattr(community_service.challenge_members, "find_one", find_existing)
    assert community_service.join_challenge("u1", "c1")["challenge"] is None


def test_impact_and_recommendation_remaining_branches(monkeypatch):
    assert impact_calculator._transport_opportunities(
        {"commute_distance_km": 0.1, "commute_days_per_week": 5}, "car_petrol"
    ) == []
    profile = {
        "transport": {"primary_mode": "metro", "commute_distance_km": 0},
        "home": {"household_size": 2, "electricity_kwh_month": 100, "cooking_fuel": "lpg", "lpg_cylinders_month": 2},
        "food": {"diet": "vegetarian"},
        "waste": ["composts"],
    }
    result = impact_calculator.monthly_footprint(profile)
    assert any("LPG cylinder" in item["title"] for item in result["opportunities"])
    assert all("plant-based" not in item["title"] for item in result["opportunities"])
    monkeypatch.setitem(
        impact_calculator.FACTORS["diet"],
        "mixed",
        impact_calculator.FACTORS["diet"]["vegetarian"],
    )
    direct = impact_calculator._opportunities(
        {},
        {"electricity_kwh_month": 0, "household_size": 1},
        {"diet": "mixed"},
        ["composts"],
        {},
        1,
        "walk",
        0,
    )
    assert direct == []
    assert recommendation_engine._commute_action(
        {"primary_mode": "car_petrol", "commute_distance_km": 0.1}, 100
    ) is None
    score, fixes = indoor_engine._score_outdoor_exposure(
        100, [], {"hours_home_outdoors": "8"}, 200
    )
    assert score == 88
    assert fixes
    short_score, short_fixes = indoor_engine._score_outdoor_exposure(
        100, [], {"hours_home_outdoors": 2}, 200
    )
    assert short_score == 92
    assert len(short_fixes) == 1


def test_bounded_text_keeps_unicode():
    assert bounded_text("  café  ", "value", 20) == ("café", None)
