import pytest

import app as app_module
import db
from config import TestConfig
from extensions import conversations, hash_password, limiter, token_denylist
from routes import assistant as assistant_route
from routes import auth as auth_route
from routes import community as community_route
from routes import daily_plan as daily_plan_route
from routes import impact as impact_route
from routes import indoor_air as indoor_route
from routes import lifestyle as lifestyle_route
from routes import map_tiles as map_tiles_route
from routes import profile as profile_route
from services import gemini_service
from utils.http import error


@pytest.fixture()
def app(monkeypatch):
    db.reset_memory_store()
    token_denylist._entries.clear()
    limiter.reset()
    monkeypatch.setattr(gemini_service, "is_enabled", lambda: True)
    monkeypatch.setattr(gemini_service, "chat", lambda *a, **k: {"reply": "ok", "sources": [], "suggested_questions": []})
    application = app_module.create_app(TestConfig)
    application.config.update(TESTING=True)
    yield application
    limiter.reset()
    db.reset_memory_store()


@pytest.fixture()
def client(app):
    return app.test_client()


def _auth(client, email="final@airaware.app"):
    response = client.post(
        "/api/auth/register",
        json={"name": "Final Tester", "email": email, "password": "testpass123"},
    )
    assert response.status_code == 201
    return {"Authorization": "Bearer " + response.get_json()["access_token"]}


def test_profile_lifestyle_validation_helpers(app):
    with app.app_context():
        assert profile_route._unwrap_lifestyle_payload([])[1][1] == 422
        assert profile_route._unwrap_lifestyle_payload({"lifestyle": {}, "bogus": 1})[1][1] == 422
        assert profile_route._unwrap_lifestyle_payload({"lifestyle": []})[1][1] == 422
        assert profile_route._unwrap_lifestyle_payload({"primary_mode": "walk"})[0]["primary_mode"] == "walk"

        assert profile_route._validate_lifestyle_groups({"transport": {"bogus": 1}})[1] == 422
        assert profile_route._validate_waste("recycle")[1] == 422
        assert profile_route._validate_waste(["x"] * 21)[1] == 422
        assert profile_route._validate_waste([""])[1] == 422
        assert profile_route._validate_waste(["recycle"]) is None
        assert profile_route._validate_lifestyle_enums({"diet": "invalid"})[1] == 422
        assert profile_route._validate_lifestyle_text({"household_type": "x" * 81})[1] == 422
        assert profile_route._validate_lifestyle_text({"waste": "bad"})[1] == 422
        assert profile_route._validate_nested_lifestyle_text({"transport": {"diet": "x" * 81}})[1] == 422
        assert profile_route._validate_number_field({}, "household_size", 1, 20) is None
        assert profile_route._validate_number_field({"household_size": "x"}, "household_size", 1, 20)[1] == 422
        assert profile_route._validate_nested_numbers({"home": {"household_size": 99}}, "household_size", 1, 20)[1] == 422
        assert profile_route._validate_lifestyle_numbers({"commute_days_per_week": 99})[1] == 422
        assert profile_route.validate_lifestyle_payload({"bogus": 1})[1] == 422
        assert profile_route.validate_lifestyle_payload({"transport": {"bogus": 1}})[1] == 422
        assert profile_route.validate_lifestyle_payload({"diet": "x" * 81})[1] == 422
        assert profile_route.validate_lifestyle_payload({"home": {"diet": "x" * 81}})[1] == 422
        assert profile_route.validate_lifestyle_payload({"household_size": "x"})[1] == 422


def test_profile_update_helpers(app):
    with app.app_context():
        cleaned = profile_route._clean_lifestyle(
            {"transport": {"primary_mode": "walk"}, "home": {"household_size": 2}, "food": {"diet": "vegan"}},
            {},
        )
        assert cleaned["primary_mode"] == "walk"
        assert profile_route._apply_lifestyle_value({}, "household_size", "bad") is None
        assert profile_route._profile_name({}) is None
        assert profile_route._profile_name({"name": 1})[1] == 422
        assert profile_route._profile_name({"name": "A"})[1] == 422
        assert profile_route._name_update(("bad", 422))[1][1] == 422
        assert profile_route._profile_location({}, {"location": {"latitude": 999, "longitude": 0}})[1][1] == 422
        prefs = profile_route._profile_preferences({}, {"notifications": "yes", "aqi_scale": "bad"})
        assert prefs["notifications"] is True
        assert prefs["aqi_scale"] == "us"
        assert profile_route._profile_updates({}, {})[1][1] == 422
        assert profile_route._profile_updates({}, {"name": "A"})[1][1] == 422
        assert profile_route._profile_updates({}, {"location": {"latitude": 999, "longitude": 0}})[1][1] == 422


def test_profile_payload_and_credential_helpers(app):
    with app.app_context():
        assert profile_route._validate_profile_payload({"bogus": 1})[1] == 422
        assert profile_route._validate_profile_payload({"location": {"bogus": 1}})[1] == 422
        assert profile_route._validate_profile_payload({"preferences": {"bogus": 1}})[1] == 422
        assert profile_route._validate_profile_payload({"lifestyle": {"bogus": 1}})[1] == 422
        assert profile_route._validate_location_payload(None) is None
        assert profile_route._validate_location_payload({"bogus": 1})[1] == 422
        assert profile_route._validate_location_payload({"city": "x" * 81})[1] == 422

        user = {"password_hash": hash_password("currentpass"), "_id": "u1"}
        assert profile_route._current_password_failure(user, {"email": "x@y.app"}, "u1")[1] == 400
        assert profile_route._current_password_failure(user, {"email": "x@y.app", "current_password": "bad"}, "u1")[1] == 401
        assert profile_route._current_password_failure(user, {"email": "x@y.app", "current_password": "currentpass"}, "u1") is None
        assert profile_route._validated_email("bad", "u1")[1][1] == 422
        assert profile_route._validated_email("free@y.app", "u1")[0] == "free@y.app"
        assert profile_route._validated_new_password("short", "u1")[1][1] == 422
        assert profile_route._validated_new_password("x" * 73, "u1")[1][1] == 422
        assert profile_route._validated_new_password("validpass123", "u1")[0] == "validpass123"
        assert profile_route._credential_updates(user, {"email": "bad", "current_password": "currentpass"}, "u1")[1][1] == 422
        assert profile_route._credential_updates(user, {"password": "short", "current_password": "currentpass"}, "u1")[1][1] == 422
        assert profile_route._profile_field_updates({}, {}) == ({}, None)


def test_profile_goals_onboarding_and_deletion_helpers(app):
    with app.app_context():
        assert profile_route._validate_goals("reduce")[1] == 422
        assert profile_route._validate_goals(["x"] * 7)[1] == 422
        assert profile_route._validate_goals([""])[1] == 422
        assert profile_route._validate_goals(["reduce"]) is None
        assert profile_route._onboarding_updates({}, {"location": {"latitude": 999, "longitude": 0}})[1][1] == 422
        updates, failure = profile_route._onboarding_updates(
            {}, {"goals": ["reduce", "cycle"], "lifestyle": {"primary_mode": "walk"}}
        )
        assert failure is None
        assert updates["preferences"]["goal"] == "reduce"
        assert updates["onboarding_complete"] is True
        profile_route._persist_onboarding("u1", updates)
        profile_route._audit_profile_update({"password": "x"}, "u1")
        profile_route._audit_profile_update({"name": "x"}, "u1")

        user = {"password_hash": hash_password("currentpass"), "_id": "u1"}
        with app.test_request_context("/", json={}):
            response = profile_route._deletion_failure(user, "u1")
            assert response[1] == 400
        profile_route._delete_user_data("u1")


def test_profile_endpoints(client, app):
    headers = _auth(client)
    assert client.get("/api/profile", headers={"Authorization": "Bearer bad"}).status_code == 401
    assert client.put("/api/profile", data="[1]", content_type="application/json", headers=headers).status_code == 400
    assert client.put("/api/profile", json={"bogus": 1}, headers=headers).status_code == 422
    assert client.put("/api/profile", json={"name": "A"}, headers=headers).status_code == 422
    assert client.put("/api/profile", json={"name": "New Name"}, headers=headers).status_code == 200
    assert client.put(
        "/api/profile",
        json={"email": "free@y.app", "current_password": "testpass123"},
        headers=headers,
    ).status_code == 200
    assert client.put(
        "/api/profile",
        json={"password": "short", "current_password": "testpass123"},
        headers=headers,
    ).status_code == 422
    assert client.post("/api/profile/onboarding", data="[1]", content_type="application/json", headers=headers).status_code == 400
    assert client.post("/api/profile/onboarding", json={"bogus": 1}, headers=headers).status_code == 422
    assert client.post("/api/profile/onboarding", json={"goals": [""]}, headers=headers).status_code == 422
    assert client.post("/api/profile/onboarding", json={"goals": ["reduce"]}, headers=headers).status_code == 200
    assert client.delete("/api/profile", data="[1]", content_type="application/json", headers=headers).status_code == 400
    assert client.delete("/api/profile", json={"bogus": 1}, headers=headers).status_code == 422
    assert client.delete("/api/profile", json={}, headers=headers).status_code == 400
    assert client.delete("/api/profile", json={"confirm_delete": True}, headers=headers).status_code == 400
    assert client.delete(
        "/api/profile",
        json={"confirm_delete": True, "current_password": "bad"},
        headers=headers,
    ).status_code == 401


def test_auth_helpers(app):
    with app.app_context():
        assert auth_route._clean_name(None) == ""
        assert len(auth_route._clean_name("x" * 81)) == 80
        assert auth_route._password_too_long("x" * 73) is True
        assert auth_route._password_is_weak("password") is True
        assert auth_route._validate_registration("A", "bad@y.app", "x" * 73)[2][1] == 422
        assert auth_route._validate_registration_identity({"name": "A", "email": "bad"})[1] == 422
        assert auth_route._validate_registration_location({"bogus": 1})[1] == 422
        assert auth_route.serialize_user({"_id": "u1", "email": "a@b.app"})["id"] == "u1"


def test_auth_endpoints(client):
    assert client.post("/api/auth/register", json={"name": "Final", "email": "a@b.app", "password": "password"}).status_code == 422
    assert client.post("/api/auth/register", json={"name": "Final", "email": "bad", "password": "longpass123"}).status_code == 422
    assert client.post("/api/auth/register", json={"name": "Final", "email": "a@b.app", "password": "x" * 73}).status_code == 422
    assert client.post("/api/auth/register", json={"name": "Final", "email": "a@b.app", "password": "longpass123"}).status_code == 201
    assert client.post("/api/auth/register", json={"name": "Final", "email": "a@b.app", "password": "longpass123"}).status_code == 409
    assert client.post("/api/auth/login", data="[1]", content_type="application/json").status_code == 400
    assert client.post("/api/auth/login", json={"email": "bad", "password": "x"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "a@b.app", "password": "x" * 73}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "a@b.app", "password": "wrongpass"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "a@b.app", "password": "longpass123"}).status_code == 200


def test_assistant_routes(client, monkeypatch):
    headers = _auth(client)
    assert client.post("/api/assistant/chat", data="[1]", content_type="application/json", headers=headers).status_code == 400
    assert client.post("/api/assistant/chat", json={"message": ""}, headers=headers).status_code == 422
    assert client.post("/api/assistant/chat", json={"message": "hello"}, headers=headers).status_code == 200
    assert client.get("/api/assistant/history", headers=headers).status_code == 200
    monkeypatch.setattr(assistant_route.gemini_service, "chat", lambda *a, **k: (_ for _ in ()).throw(gemini_service.GeminiUnavailable("down")))
    assert client.post("/api/assistant/chat", json={"message": "hello"}, headers=headers).status_code == 503


def test_community_routes(client, monkeypatch):
    headers = _auth(client)
    assert client.get("/api/community/stats", headers=headers).status_code == 200
    assert client.get("/api/community/challenges", headers=headers).status_code == 200
    assert client.post("/api/community/challenges/join", json={}, headers=headers).status_code == 422
    assert client.get("/api/community/leaderboard", headers=headers).status_code == 200
    monkeypatch.setattr(community_route.community_service, "stats", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.get("/api/community/stats", headers=headers).status_code == 503


def test_assistant_conversation_helpers(app, monkeypatch):
    with app.app_context():
        assert assistant_route._conversation("u1")["user_id"] == "u1"
        monkeypatch.setattr(conversations, "find_one", lambda *a, **k: {"_id": "existing"})
        assert assistant_route._conversation("u1")["_id"] == "existing"

        def conflict(*_a, **_k):
            raise db.IntegrityConflict()

        monkeypatch.setattr(conversations, "insert_one", conflict)
        assert assistant_route._conversation("u1")["_id"] == "existing"
        monkeypatch.setattr(conversations, "find_one", lambda *a, **k: None)
        assert assistant_route._conversation("u1")["user_id"] == "u1"

        def broken(*_a, **_k):
            raise RuntimeError("down")

        monkeypatch.setattr(conversations, "insert_one", broken)
        with pytest.raises(RuntimeError):
            assistant_route._conversation("u1")


def test_assistant_failure_branches(client, monkeypatch):
    headers = _auth(client)

    def fake_chat(*_a, **_k):
        return {"reply": "ok"}

    with monkeypatch.context() as m:
        m.setattr(gemini_service, "chat", fake_chat)
        assert client.post("/api/assistant/chat", json={"bogus": 1}, headers=headers).status_code == 422
        assert client.post("/api/assistant/chat", json={"message": "x" * 2001}, headers=headers).status_code == 422
        m.setattr(assistant_route, "find_user", lambda *_a, **_k: None)
        assert client.post("/api/assistant/chat", json={"message": "hi"}, headers=headers).status_code == 404
    with monkeypatch.context() as m:
        m.setattr(gemini_service, "chat", fake_chat)
        m.setattr(conversations, "find_one", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
        assert client.post("/api/assistant/chat", json={"message": "hi"}, headers=headers).status_code == 503
    with monkeypatch.context() as m:
        m.setattr(gemini_service, "chat", fake_chat)
        m.setattr(conversations, "update_one", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
        assert client.post("/api/assistant/chat", json={"message": "hi"}, headers=headers).status_code == 200


def test_community_failure_branches(client, monkeypatch):
    headers = _auth(client)
    assert client.post("/api/community/challenges/join", json={"bogus": 1}, headers=headers).status_code == 422
    assert client.post("/api/community/challenges/join", json={"challenge_id": "x" * 101}, headers=headers).status_code == 422
    monkeypatch.setattr(community_route.community_service, "list_challenges", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.get("/api/community/challenges", headers=headers).status_code == 503
    monkeypatch.undo()
    monkeypatch.setattr(community_route.community_service, "join_challenge", lambda *a, **k: (_ for _ in ()).throw(LookupError()))
    assert client.post("/api/community/challenges/join", json={"challenge_id": "x"}, headers=headers).status_code == 404
    monkeypatch.undo()
    monkeypatch.setattr(community_route.community_service, "join_challenge", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/community/challenges/join", json={"challenge_id": "x"}, headers=headers).status_code == 503
    monkeypatch.undo()
    monkeypatch.setattr(community_route.community_service, "leaderboard", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.get("/api/community/leaderboard", headers=headers).status_code == 503


def test_daily_plan_helpers(app):
    assert daily_plan_route.serialize_plan(None) is None
    assert daily_plan_route.serialize_plan({"_id": "p", "actions": []})["id"] == "p"
    with app.test_request_context("/", json={"bogus": 1}):
        assert daily_plan_route._toggle_action_value()[1][1] == 422
    with app.test_request_context("/", json={"completed": "yes"}):
        assert daily_plan_route._toggle_action_value()[1][1] == 422
    assert daily_plan_route._toggle_plan_action({"actions": []}, "x", True) is None


def test_daily_plan_failure_branches(client, monkeypatch):
    headers = _auth(client)
    assert client.post("/api/daily-plan/generate", data="[1]", content_type="application/json", headers=headers).status_code == 400
    assert client.post("/api/daily-plan/generate", json={"bogus": 1}, headers=headers).status_code == 422
    monkeypatch.setattr(daily_plan_route, "find_user", lambda *a, **k: None)
    assert client.get("/api/daily-plan/today", headers=headers).status_code == 404
    assert client.post("/api/daily-plan/generate", json={}, headers=headers).status_code == 404
    monkeypatch.undo()
    monkeypatch.setattr(daily_plan_route.daily_plans, "find_one", lambda *a, **k: None)
    monkeypatch.setattr(daily_plan_route.daily_plans, "insert_one", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/daily-plan/generate", json={}, headers=headers).status_code == 503
    monkeypatch.undo()
    assert client.patch("/api/daily-plan/p1/actions/a1", json={"completed": True}, headers=headers).status_code == 404


def test_impact_helpers_and_failure_branches(app, client, monkeypatch):
    headers = _auth(client)
    with app.app_context():
        assert impact_route._validate_activity_numbers({"distance_km": -1})[1] == 422
        assert impact_route._validate_activity_payload({"bogus": 1})[1] == 422
        assert impact_route._validate_activity_payload({"note": "x" * 281})[1] == 422
    assert client.post("/api/impact/log", data="[1]", content_type="application/json", headers=headers).status_code == 400
    assert client.post("/api/impact/log", json={"bogus": 1}, headers=headers).status_code == 422
    valid_activity = {"distance_km": 1}
    monkeypatch.setattr(impact_route, "find_user", lambda *a, **k: None)
    assert client.get("/api/impact/personal", headers=headers).status_code == 404
    assert client.post("/api/impact/log", json=valid_activity, headers=headers).status_code == 404
    assert client.get("/api/impact/history", headers=headers).status_code == 404
    monkeypatch.undo()
    monkeypatch.setattr(impact_route.impact_calculator, "log_journey", lambda *a, **k: (_ for _ in ()).throw(TypeError()))
    assert client.post("/api/impact/log", json=valid_activity, headers=headers).status_code == 422
    monkeypatch.undo()
    monkeypatch.setattr(impact_route.impact_calculator, "history", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.get("/api/impact/history", headers=headers).status_code == 503


def test_indoor_failure_branches(app, client, monkeypatch):
    headers = _auth(client)
    assert client.post("/api/indoor/assessment", data="[1]", content_type="application/json", headers=headers).status_code == 400
    assert client.post("/api/indoor/assessment", json={"answers": [], "bogus": 1}, headers=headers).status_code == 422
    with app.app_context():
        assert indoor_route._validate_assessment_numbers({"hours_home_outdoors": 25})[1] == 422
        assert indoor_route._validate_assessment_payload({}, {"bogus": 1})[1] == 422
    monkeypatch.setattr(indoor_route, "find_user", lambda *a, **k: None)
    assert client.post("/api/indoor/assessment", json={"answers": {}}, headers=headers).status_code == 404
    monkeypatch.undo()
    monkeypatch.setattr(indoor_route.indoor_assessments, "insert_one", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/indoor/assessment", json={"answers": {}}, headers=headers).status_code == 201


def test_lifestyle_failure_branches(app, client, monkeypatch):
    headers = _auth(client)
    assert client.post("/api/lifestyle", data="[1]", content_type="application/json", headers=headers).status_code == 400
    assert client.post("/api/lifestyle", json={"bogus": 1}, headers=headers).status_code == 422
    assert client.post("/api/lifestyle/analyze", data="[1]", content_type="application/json", headers=headers).status_code == 400
    monkeypatch.setattr(lifestyle_route, "find_user", lambda *a, **k: None)
    assert client.get("/api/lifestyle", headers=headers).status_code == 404
    assert client.post("/api/lifestyle", json={}, headers=headers).status_code == 404
    assert client.post("/api/lifestyle/analyze", json={}, headers=headers).status_code == 404
    monkeypatch.undo()
    monkeypatch.setattr(lifestyle_route.lifestyle_profiles, "update_one", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/lifestyle", json={}, headers=headers).status_code == 503
    monkeypatch.undo()

    class BadPayload:
        def get(self, *_a, **_k):
            return []

    with app.app_context():
        assert lifestyle_route._clean_lifestyle_payload({}, BadPayload())[1][1] == 422
    monkeypatch.setattr(lifestyle_route.users, "update_one", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    with app.test_request_context("/", json={}):
        assert lifestyle_route._persist_lifestyle("u1", {})[1] == 503


def test_map_tile_fetch_branches(monkeypatch):
    class FakeResponse:
        status_code = 200
        headers = {"Content-Type": "image/png; charset=binary"}

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

        def iter_content(self, chunk_size):
            yield b""
            yield b"abc"

    monkeypatch.setattr(map_tiles_route.requests, "get", lambda *a, **k: FakeResponse())
    assert map_tiles_route._fetch_tile("url", {}, 1, 100) == b"abc"
    assert map_tiles_route._valid_tile("bad", 0, 0, 0) is False
    assert map_tiles_route._valid_tile("light", 21, 0, 0) is False


def test_auth_serialization_and_validation_helpers(app):
    class BadPassword:
        def encode(self, *_a, **_k):
            raise RuntimeError("bad encoding")

    with app.app_context():
        assert auth_route.serialize_user(None) is None
        assert auth_route._password_too_long(BadPassword()) is True
        assert auth_route._validate_registration_identity({"name": "x" * 81, "email": "a@b.app", "password": "testpass123"})[1] == 422
        data = {"name": "Tester", "email": "a@b.app", "password": "testpass123", "consent": "yes"}
        assert auth_route._validate_registration_identity(data)[1] == 422


def test_auth_payload_validation_branches(app):
    long_name = {"name": "x" * 81, "email": "a@b.app", "password": "testpass123"}
    bad_location = {"name": "Tester", "email": "a@b.app", "password": "testpass123", "location": []}
    with app.test_request_context("/", json=long_name):
        assert auth_route._registration_payload()[1][1] == 422
    with app.test_request_context("/", json=bad_location):
        assert auth_route._registration_payload()[1][1] == 422


def test_auth_registration_and_login_failures(client, monkeypatch):
    base = {"name": "Tester", "email": "fail@airaware.app", "password": "testpass123"}
    bad_location = {**base, "email": "loc@airaware.app", "location": {"latitude": 100}}
    assert client.post("/api/auth/register", json=bad_location).status_code == 422
    with monkeypatch.context() as m:
        m.setattr(auth_route.users, "insert_one", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
        assert client.post("/api/auth/register", json=base).status_code == 503
    assert client.post("/api/auth/login", json={"email": "a@b.app", "password": "x", "bogus": 1}).status_code == 422
    with monkeypatch.context() as m:
        m.setattr(auth_route.users, "find_one", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
        assert client.post("/api/auth/login", json={"email": "a@b.app", "password": "x"}).status_code == 503


def test_daily_plan_store_recovery(app, monkeypatch):
    user = {"_id": "u1"}
    plan = {"actions": [{"id": "a1", "title": "Walk"}], "date": "2026-01-01"}

    def boom(*_a, **_k):
        raise RuntimeError("down")

    with monkeypatch.context() as m:
        m.setattr(daily_plan_route.daily_plans, "find_one", lambda *a, **k: None)
        m.setattr(daily_plan_route.daily_plans, "insert_one", boom)
        with app.app_context():
            result, failure = daily_plan_route._store_generated_plan(user, plan)
        assert result is None and failure[1] == 503
    with monkeypatch.context() as m:
        m.setattr(daily_plan_route.daily_plans, "find_one", lambda *a, **k: {"_id": "old"})
        m.setattr(daily_plan_route.daily_plans, "insert_one", boom)
        m.setattr(daily_plan_route.daily_plans, "update_one", lambda *a, **k: None)
        with app.app_context():
            result, failure = daily_plan_route._store_generated_plan(user, plan)
        assert result["_id"] == "old" and failure is None


def test_daily_plan_existing_and_toggle_branches(app, client, monkeypatch):
    headers = _auth(client)
    existing = {"_id": "p1", "actions": [{"id": "a1", "title": "Walk"}]}
    with app.test_request_context("/", json={}):
        monkeypatch.setattr(daily_plan_route.daily_plans, "find_one", lambda *a, **k: existing)
        assert daily_plan_route._existing_or_generate({"_id": "u1"}, {}).status_code == 200
        monkeypatch.undo()
        with app.test_request_context("/", data="[1]", content_type="application/json"):
            assert daily_plan_route._toggle_action_value()[1][1] == 400

    monkeypatch.setattr(
        daily_plan_route.daily_plans,
        "find_one",
        lambda *a, **k: {"_id": "p1", "actions": [{"id": "other"}]},
    )
    response = client.patch("/api/daily-plan/p1/actions/a1", json={"completed": True}, headers=headers)
    assert response.status_code == 404


def test_impact_note_and_exception_branches(app, client, monkeypatch):
    with app.app_context():
        assert impact_route._validate_activity_payload({"distance_km": 1, "note": "x" * 281})[1] == 422
    headers = _auth(client)
    with monkeypatch.context() as m:
        m.setattr(impact_route.impact_calculator, "log_journey", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
        assert client.post("/api/impact/log", json={"distance_km": 1}, headers=headers).status_code == 503


def test_indoor_answer_validation_branches(app, client):
    class BadAnswers:
        def get(self, *_a, **_k):
            return []

    with app.app_context():
        assert indoor_route._assessment_answers(BadAnswers())[1][1] == 422
        assert indoor_route._validate_assessment_numbers({"hours_home_outdoors": 1, "outdoor_aqi": 2}) is None
        assert indoor_route._validate_assessment_payload({"answers": {}, "bogus": 1}, {})[1] == 422
    headers = _auth(client)
    assert client.post("/api/indoor/assessment", json={"answers": []}, headers=headers).status_code == 422


def test_lifestyle_remaining_branch_branches(app, client, monkeypatch):
    headers = _auth(client)
    with monkeypatch.context() as m:
        m.setattr(
            lifestyle_route,
            "_clean_lifestyle_payload",
            lambda *a, **k: (None, error("bad lifestyle", 422)),
        )
        assert client.post("/api/lifestyle", json={}, headers=headers).status_code == 422
    assert client.post("/api/lifestyle/analyze", headers=headers).status_code == 200
    assert client.post("/api/lifestyle/analyze", json={"bogus": 1}, headers=headers).status_code == 422
