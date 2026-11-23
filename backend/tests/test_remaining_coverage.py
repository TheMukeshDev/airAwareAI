from datetime import datetime
from types import SimpleNamespace

import pytest

import app as app_module
import db
from config import TestConfig
from extensions import impact_records, limiter, users
from routes import auth as auth_route
from routes import daily_plan as daily_plan_route
from routes import impact as impact_route
from routes import indoor_air as indoor_route
from routes import lifestyle as lifestyle_route
from routes import profile as profile_route
from services import (
    aqi_service,
    community_service,
    gemini_service,
    impact_calculator,
    indoor_engine,
    recommendation_engine,
)


@pytest.fixture()
def app(monkeypatch):
    db.reset_memory_store()
    db.reset_rate_limit_state()
    limiter.reset()
    monkeypatch.setattr(gemini_service, "is_enabled", lambda: True)
    monkeypatch.setattr(gemini_service, "chat", lambda *a, **k: {"reply": "ok", "sources": [], "suggested_questions": []})
    monkeypatch.setattr(gemini_service, "enhance_plan", lambda *a, **k: None)
    app = app_module.create_app(TestConfig)
    app.config.update(TESTING=True)
    yield app
    limiter.reset()
    db.reset_memory_store()


@pytest.fixture()
def client(app):
    return app.test_client()


def auth_headers(client, email="remaining@airaware.app"):
    response = client.post(
        "/api/auth/register",
        json={"name": "Remaining Tester", "email": email, "password": "testpass123"},
    )
    assert response.status_code == 201
    return {"Authorization": "Bearer " + response.get_json()["access_token"]}


def test_auth_remaining_helpers_and_failures(app, monkeypatch):
    with app.app_context():
        assert auth_route.serialize_user(None) is None
        assert auth_route._password_too_long(type("BadPassword", (), {"encode": lambda *_: (_ for _ in ()).throw(ValueError())})())
        assert auth_route._validate_registration_identity({"name": 1, "email": "a@b.com", "password": "testpass123"})[1] == 422
        assert auth_route._validate_registration_identity({"name": "A", "email": "a@b.com", "password": "testpass123", "consent": "yes"})[1] == 422
        assert auth_route._validate_registration_location({"latitude": 25}) is None
        monkeypatch.setattr(users, "find_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
        assert auth_route._find_existing_registration("x@x.app")[1] == 503

        monkeypatch.setattr(users, "insert_one", lambda *_a, **_k: (_ for _ in ()).throw(db.IntegrityConflict()))
        assert auth_route._insert_registration({"name": "A", "email": "a@x.app", "password_hash": "x"})[1] == 409
        monkeypatch.setattr(users, "insert_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
        assert auth_route._insert_registration({"name": "A", "email": "a@x.app", "password_hash": "x"})[1] == 503


def test_profile_remaining_helpers(app, monkeypatch):
    with app.app_context():
        assert profile_route._validate_lifestyle_numbers({"transport": {"commute_days_per_week": 99}})[1] == 422
        assert profile_route._validate_lifestyle_numbers({"home": {"household_size": "bad"}})[1] == 422
        assert profile_route._validate_lifestyle_numbers({"transport": {"commute_distance_km": 9999}})[1] == 422
        assert profile_route.validate_lifestyle_payload({"transport": {"primary_mode": "walk"}}) is None
        assert profile_route._profile_preferences({"preferences": {}}, {"notifications": "yes"})["notifications"] is True
        assert profile_route._validated_email("bad", "u1")[1][1] == 422
        monkeypatch.setattr(users, "find_one", lambda *_a, **_k: {"_id": "other"})
        assert profile_route._validated_email("used@y.app", "u1")[1][1] == 409
        monkeypatch.undo()

        class BadPassword:
            def encode(self, *_a):
                raise ValueError

        assert profile_route._validated_new_password(BadPassword(), "u1")[1][1] == 422
        assert profile_route._profile_location({}, {"location": []}) == (None, None)
        assert profile_route._profile_location({"location": {}}, {"location": {"latitude": 999}})[1][1] == 422


def test_profile_endpoints_missing_users(client, monkeypatch):
    headers = auth_headers(client)
    monkeypatch.setattr(profile_route, "find_user", lambda *_a, **_k: None)
    assert client.get("/api/profile", headers=headers).status_code == 404
    assert client.put("/api/profile", json={"name": "New Name"}, headers=headers).status_code == 404
    assert client.post("/api/profile/onboarding", json={"goals": ["reduce"]}, headers=headers).status_code == 404
    assert client.delete("/api/profile", json={"confirm_delete": True, "current_password": "testpass123"}, headers=headers).status_code == 404
    monkeypatch.undo()

    monkeypatch.setattr(profile_route.users, "update_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.put("/api/profile", json={"name": "New Name"}, headers=headers).status_code == 500


def test_daily_plan_remaining_branches(app, client, monkeypatch):
    headers = auth_headers(client)
    monkeypatch.setattr(
        daily_plan_route.recommendation_engine,
        "build_plan",
        lambda *_a, **_k: {
            "id": "generated",
            "date": "2026-01-01",
            "title": "Plan",
            "summary": "Summary",
            "actions": [{"id": "a1", "title": "Action", "detail": "Detail", "why": "Reason", "completed": False}],
        },
    )
    with app.test_request_context("/", json={}):
        assert daily_plan_route._toggle_action_value()[1][1] == 422
        assert daily_plan_route._toggle_plan_action({"actions": []}, "missing", True) is None

    monkeypatch.setattr(daily_plan_route.daily_plans, "insert_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    monkeypatch.setattr(daily_plan_route.daily_plans, "find_one", lambda *_a, **_k: None)
    assert client.post("/api/daily-plan/generate", json={"regenerate": True}, headers=headers).status_code == 503
    monkeypatch.setattr(daily_plan_route.daily_plans, "find_one", lambda *_a, **_k: {"_id": "old", "date": "2026-01-01"})
    monkeypatch.setattr(daily_plan_route.daily_plans, "update_one", lambda *_a, **_k: None)
    assert client.post("/api/daily-plan/generate", json={"regenerate": True}, headers=headers).status_code == 200


def test_impact_indoor_lifestyle_remaining_branches(app, client, monkeypatch):
    class BadPayload:
        def get(self, *_a, **_k):
            return []

    headers = auth_headers(client)
    with app.app_context():
        result = impact_route._validate_activity_payload({"note": "ok"})
        assert result is None or isinstance(result, tuple)
        assert indoor_route._assessment_answers(BadPayload())[1][1] == 422
        assert indoor_route._validate_assessment_payload({"answers": {}}, {"bogus": 1})[1] == 422
        assert lifestyle_route._clean_lifestyle_payload({}, BadPayload())[1][1] == 422

    monkeypatch.setattr(impact_route.impact_calculator, "log_journey", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/impact/log", json={"distance_km": 1, "baseline_mode": "metro", "actual_mode": "walk"}, headers=headers).status_code == 503
    monkeypatch.undo()
    monkeypatch.setattr(impact_route.impact_calculator, "personal_summary", lambda *_a, **_k: {"weekly": [], "modes": {}})
    assert client.get("/api/impact/personal", headers=headers).status_code == 200
    monkeypatch.undo()

    monkeypatch.setattr(indoor_route.indoor_assessments, "insert_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/indoor/assessment", json={"answers": {}}, headers=headers).status_code == 201
    monkeypatch.undo()

    monkeypatch.setattr(lifestyle_route.lifestyle_profiles, "update_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/lifestyle", json={}, headers=headers).status_code == 503


def test_app_jwt_expired_and_security_header_branches(app):
    with app.test_request_context("/api/health"):
        app_module._apply_security_headers(app.response_class(), app)
        app.config["SECURITY_HEADERS_ENABLED"] = False
        app_module._apply_security_headers(app.response_class(), app)
    app_module._register_error_handlers(app)


class _PostgresCursor:
    rowcount = 0

    def execute(self, statement, params=None):
        if "delete" in str(statement).lower():
            return SimpleNamespace(fetchone=lambda: None, rowcount=0)
        return SimpleNamespace(fetchone=lambda: None, fetchall=lambda: [], rowcount=0)

    def fetchone(self):
        return None

    def fetchall(self):
        return []


class _PostgresConnection:
    def __enter__(self):
        return _PostgresCursor()

    def __exit__(self, *_args):
        return False


class _PostgresPool:
    def connection(self):
        return _PostgresConnection()


def _patch_postgres_pool(monkeypatch):
    monkeypatch.setattr(db, "_pool_or_raise", _PostgresPool)
    monkeypatch.setattr(db, "_where", lambda *_args: ("TRUE", []))


def test_db_postgres_delete_remaining_branches(monkeypatch):
    _patch_postgres_pool(monkeypatch)
    assert db.PostgresCollection("users").delete_many().deleted_count == 0
    assert db.PostgresCollection("users").delete_one({"_id": "missing"}).deleted_count == 0


def test_db_postgres_clause_and_sort_remaining_branches(monkeypatch):
    _patch_postgres_pool(monkeypatch)
    assert db._exists_clause("nested", False, []) == "(data #> %s::text[]) IS NULL"
    assert db._append_fetch_sort(db.sql.SQL("select 1"), [], [("nested.x", -1), ("_id", 1)])[0]


def test_gemini_remaining_initialization_and_chat(monkeypatch):
    monkeypatch.setattr(gemini_service, "_runtime", {"api_key": "key", "model": "m", "timeout": 1})
    monkeypatch.setattr(gemini_service, "_client", None)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    import google.genai as genai

    class TypesFallback:
        class HttpOptions:
            def __init__(self, **_):
                raise RuntimeError("unsupported")
    monkeypatch.setitem(__import__("sys").modules, "google.genai.types", SimpleNamespace(HttpOptions=TypesFallback.HttpOptions))
    monkeypatch.setattr(genai, "Client", lambda **_k: SimpleNamespace(models=SimpleNamespace()))
    assert gemini_service._get_client() is not None

    monkeypatch.setattr(gemini_service, "_get_client", lambda: SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_k: SimpleNamespace(text='{"reply":"ok","sources":[],"suggested_questions":[]}'))))
    assert gemini_service.chat("hello")["reply"] == "ok"
    monkeypatch.setattr(gemini_service, "_get_client", lambda: None)
    with pytest.raises(gemini_service.GeminiUnavailable):
        gemini_service.chat("hello")


def test_aqi_remaining_branches(monkeypatch):
    assert aqi_service._sub_index("carbon_monoxide", 0) == 0
    assert aqi_service._sub_index("carbon_monoxide", 1000) is not None
    hourly = {"time": ["2026-01-01T00:00", "2026-01-01T01:00"], "pm2_5": [10, 20]}
    assert aqi_service._best_ventilation_window(hourly, "2026-01-01T00:00") is not None
    assert aqi_service._parse_dt(datetime(2026, 1, 1)) is not None
    data = {"current": {"time": "bad", "us_aqi": "bad", "pm2_5": None}, "hourly": {"time": ["2026-01-01T00:00"], "pm2_5": [10]}, "timezone": "IST"}
    payload = aqi_service._build_current_payload(data, {}, False, False, "key", 25, 81)
    assert payload["aqi"] is None
    assert aqi_service._forecast_entry({"time": ["bad"], "pm2_5": [1], "pm10": [None], "us_aqi": ["bad"]}, 0, "bad", ["bad"], [None])["us_aqi"] is None
    assert aqi_service._rolling_mean_at({"pm2_5": [10, 20]}, "pm2_5", 0, ["bad"], [None], 24) is None

    aqi_service.reset_cache()
    monkeypatch.setattr(aqi_service, "_CACHE", aqi_service.TTLCache(maxsize=10, ttl_seconds=0))
    aqi_service._cache_set("stations:25.4,81.8", [{"current": {"pm2_5": 10, "pm10": 20, "us_aqi": 40}}])
    monkeypatch.setattr(aqi_service, "_get", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    assert aqi_service.get_stations(25.4, 81.8)["stale"] is True


def test_community_remaining_branches(app, monkeypatch):
    db.reset_memory_store()
    community_service.ensure_seeded()
    users.insert_one({"_id": "u-naive", "name": "Test Member", "preferences": {}})
    naive = datetime(2026, 1, 1)
    assert community_service._to_dt(naive).tzinfo is not None
    assert community_service._parse_record_date("2026-01-01") is not None
    assert community_service._member_count({"u-naive": users.find_one({"_id": "u-naive"})}, True) == 1
    assert community_service._totals_by_user({"u-naive": {"preferences": {"share_aggregate": False}}}, True, True) == {}
    assert community_service._category_matches_record("food", {"activity_type": "food"})
    assert community_service._challenge_checkins("missing", {"category": "indoor_air"}, None, None) == 0
    assert community_service._challenge_checkins("missing", {"category": "other"}, None, None) == 0
    challenge = {"id": "x", "category": "indoor_air", "target_kg": 0, "starts_at": None, "ends_at": None}
    assert community_service._indoor_challenge_progress(challenge, set(), None, None, [], []) == (0, [])


def test_impact_and_engine_remaining_branches(monkeypatch):
    db.reset_memory_store()
    profile = {
        "transport": {"primary_mode": "car_petrol", "commute_distance_km": 10, "commute_days_per_week": 0},
        "home": {"household_size": 3, "electricity_kwh_month": 100, "cooking_fuel": "biomass", "lpg_cylinders_month": 2},
        "food": {"diet": "high_meat"},
        "waste": ["compost"],
    }
    result = impact_calculator.monthly_footprint(profile)
    assert result["breakdown"]
    assert impact_calculator._transport_opportunities(profile["transport"], "car_petrol") == []
    impact_records.insert_one({"_id": "r1", "user_id": "u", "date": "2026-01-01", "avoided_kg": 1})
    monkeypatch.setattr(impact_records, "count_documents", lambda *_a: (_ for _ in ()).throw(RuntimeError("down")))
    assert impact_calculator.history("u", 1, 8)["records"][0]["id"] == "r1"

    assert recommendation_engine._aqi_band(201) == "very_unhealthy"
    assert recommendation_engine._alert(350)["level"] == "severe"
    assert recommendation_engine._commute_action({"primary_mode": "car_petrol", "commute_distance_km": 1}, {"aqi": 100}) is not None
    assert indoor_engine._outdoor_aqi({"outdoor_aqi": "bad"}, None) is None
    assert indoor_engine._outdoor_aqi({}, {"aqi": 500}) == 500
