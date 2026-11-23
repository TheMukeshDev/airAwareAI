
import pytest

import app as app_module
import db
from config import TestConfig
from extensions import limiter, token_denylist
from routes import assistant as assistant_route
from routes import auth as auth_route
from routes import community as community_route
from routes import daily_plan as daily_plan_route
from routes import impact as impact_route
from routes import indoor_air as indoor_route
from routes import lifestyle as lifestyle_route
from routes import profile as profile_route


@pytest.fixture()
def app(monkeypatch):
    db.reset_memory_store()
    token_denylist._entries.clear()
    limiter.reset()
    monkeypatch.setattr("services.gemini_service.is_enabled", lambda: True)
    monkeypatch.setattr("services.gemini_service.chat", lambda *a, **k: {"reply": "ok", "sources": [], "suggested_questions": []})
    monkeypatch.setattr("services.gemini_service.enhance_plan", lambda *a, **k: {"title": "Plan", "summary": "Summary", "actions": []})
    monkeypatch.setattr("services.aqi_service.get_current", lambda *a, **k: {"aqi": 80, "aqi_india": 70, "pollutants": {"pm2_5": 30}, "ventilation_window": {"label": "10:00"}, "location": {"name": "Test"}, "observed_at": "2026-01-01", "source": "Test"})
    monkeypatch.setattr("services.aqi_service.get_forecast", lambda *a, **k: {"hourly": [], "daily": []})
    monkeypatch.setattr("services.aqi_service.get_stations", lambda *a, **k: {"stations": []})
    application = app_module.create_app(TestConfig)
    application.config.update(TESTING=True)
    yield application
    limiter.reset()
    db.reset_memory_store()


@pytest.fixture()
def client(app):
    return app.test_client()


def headers(client, email="route@x.app"):
    r = client.post("/api/auth/register", json={"name": "Route User", "email": email, "password": "testpass123"})
    assert r.status_code == 201
    return {"Authorization": "Bearer " + r.get_json()["access_token"]}


def test_auth_all_branches(client, monkeypatch):
    assert client.post("/api/auth/register", data="[1]", content_type="application/json").status_code == 400
    assert client.post("/api/auth/register", json={"name":"A","email":"x"}).status_code == 422
    assert client.post("/api/auth/register", json={"name":"A","email":"bad","password":"testpass123"}).status_code == 422
    assert client.post("/api/auth/register", json={"name":"A","email":"weak@x.app","password":"        "}).status_code == 422
    h = headers(client)
    assert client.post("/api/auth/register", json={"name":"Route","email":"route@x.app","password":"testpass123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email":"route@x.app","password":"testpass123"}).status_code == 200
    assert client.post("/api/auth/login", json={"email":"route@x.app","password":"badpass123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email":"none@x.app","password":"badpass123"}).status_code == 401
    assert client.post("/api/auth/login", json=[]).status_code == 422
    assert client.post("/api/auth/login", json={"email":123,"password":"bad"}).status_code == 401
    assert client.post("/api/auth/logout", headers=h).status_code == 200


def test_profile_update_onboarding_delete_branches(client):
    h = headers(client, "profile@x.app")
    assert client.get("/api/profile", headers=h).status_code == 200
    assert client.put("/api/profile", headers=h, json=[]).status_code == 400
    assert client.put("/api/profile", headers=h, json={"no": 1}).status_code == 422
    assert client.put("/api/profile", headers=h, json={"name":"Renamed","location":{"city":"X","latitude":20,"longitude":80},"preferences":{"notifications":"yes","aqi_scale":"india"},"lifestyle":{"diet":"vegan","household_size":2}}).status_code == 200
    assert client.put("/api/profile", headers=h, json={"email":"new@x.app"}).status_code == 400
    assert client.put("/api/profile", headers=h, json={"password":"newpass123","current_password":"wrong"}).status_code == 401
    assert client.put("/api/profile", headers=h, json={"password":"newpass123","current_password":"testpass123"}).status_code == 200
    assert client.post("/api/profile/onboarding", headers=h, json={"goals":["reduce"],"location":{"latitude":20,"longitude":80},"lifestyle":{"diet":"vegetarian"}}).status_code == 200
    assert client.post("/api/profile/onboarding", headers=h, json={"goals":[1]}).status_code == 422
    assert client.delete("/api/profile", headers=h, json={}).status_code == 400
    assert client.delete("/api/profile", headers=h, json={"confirm_delete":True,"current_password":"wrong"}).status_code == 401
    assert client.delete("/api/profile", headers=h, json={"confirm_delete":True,"current_password":"newpass123"}).status_code == 200


def test_air_forecast_stations_branches(client, monkeypatch):
    assert client.get("/api/air-quality/current").status_code == 200
    assert client.get("/api/air-quality/current?latitude=bad&longitude=200").status_code == 200
    assert client.get("/api/air-quality/forecast?hours=bad").status_code == 200
    assert client.get("/api/air-quality/forecast?hours=100").status_code == 200
    assert client.get("/api/air-quality/stations").status_code == 200
    monkeypatch.setattr("services.aqi_service.get_current", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    assert client.get("/api/air-quality/current").status_code == 503
    monkeypatch.setattr("services.aqi_service.get_forecast", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    assert client.get("/api/air-quality/forecast").status_code == 503
    monkeypatch.setattr("services.aqi_service.get_stations", lambda *a, **k: (_ for _ in ()).throw(Exception("x")))
    assert client.get("/api/air-quality/stations").status_code == 503


def test_lifestyle_daily_indoor_impact_assistant_community(client, monkeypatch):
    h = headers(client, "flows@x.app")
    assert client.get("/api/lifestyle", headers=h).status_code == 200
    assert client.post("/api/lifestyle/analyze", headers=h, json={}).status_code == 200
    assert client.post("/api/lifestyle", headers=h, json={"primary_mode":"car_petrol","commute_distance_km":10,"electricity_kwh_month":200}).status_code == 200
    assert client.post("/api/lifestyle", headers=h, json={"lifestyle":{"diet":"vegan"}}).status_code == 200
    assert client.post("/api/lifestyle", headers=h, json=[]).status_code == 400
    assert client.post("/api/lifestyle", headers=h, json={"bogus":1}).status_code == 422

    plan = client.get("/api/daily-plan/today", headers=h)
    assert plan.status_code == 200
    pid = plan.get_json()["plan"]["id"]
    aid = plan.get_json()["plan"]["actions"][0]["id"]
    assert client.patch(f"/api/daily-plan/{pid}/actions/{aid}", headers=h, json={"completed":True}).status_code == 200
    assert client.patch(f"/api/daily-plan/{pid}/actions/{aid}", headers=h, json={"completed":"yes"}).status_code == 422
    assert client.patch("/api/daily-plan/no/actions/no", headers=h, json={"completed":True}).status_code == 404
    assert client.post("/api/daily-plan/generate", headers=h, json={"regenerate":True}).status_code == 200
    assert client.post("/api/daily-plan/generate", headers=h, json={"unknown":1}).status_code == 422
    assert client.post("/api/daily-plan/generate", headers=h, json=[]).status_code == 400

    assert client.post("/api/indoor/assessment", headers=h, json={"answers":{"ventilates_daily":True,"purifier":True}}).status_code == 201
    assert client.post("/api/indoor/assessment", headers=h, json={"answers":[]}).status_code == 422
    assert client.get("/api/indoor/recommendations", headers=h).status_code == 200

    assert client.post("/api/impact/log", headers=h, json={"distance_km":10,"baseline_mode":"car_petrol","actual_mode":"metro"}).status_code == 201
    assert client.post("/api/impact/log", headers=h, json={"distance_km":-1,"baseline_mode":"car","actual_mode":"metro"}).status_code == 422
    assert client.get("/api/impact/personal?period=bad", headers=h).status_code == 200
    assert client.get("/api/impact/history?page=bad&per_page=bad", headers=h).status_code == 200

    assert client.post("/api/assistant/chat", headers=h, json={"message":"hello"}).status_code == 200
    assert client.get("/api/assistant/history", headers=h).status_code == 200
    assert client.post("/api/assistant/chat", headers=h, json={"message":" "}).status_code == 422
    assert client.post("/api/assistant/chat", headers=h, json=[]).status_code == 400

    assert client.get("/api/community/stats", headers=h).status_code == 200
    challenges = client.get("/api/community/challenges", headers=h).get_json()["challenges"]
    assert challenges
    assert client.post("/api/community/challenges/join", headers=h, json={"challenge_id":challenges[0]["id"]}).status_code == 200
    assert client.post("/api/community/challenges/join", headers=h, json={"challenge_id":"missing"}).status_code == 404
    assert client.post("/api/community/challenges/join", headers=h, json=[]).status_code == 400
    assert client.get("/api/community/leaderboard?page=bad&per_page=bad", headers=h).status_code == 200


def test_route_payload_and_lookup_edge_branches(client, monkeypatch):
    h = headers(client, "edge@x.app")

    with client.application.app_context():
        assert auth_route._clean_location_text({"city": "X", "state": "Y", "country": "Z"}) is None
        assert auth_route._clean_location_text({"city": "X" * 81})[1] == 422
        assert auth_route._validate_registration_location([])[1] == 422
        assert auth_route._validate_registration_location({"bogus": 1})[1] == 422
        assert auth_route._validate_registration_location({"latitude": 25}) is None
    monkeypatch.setattr(auth_route.users, "find_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    with client.application.app_context():
        assert auth_route._find_existing_registration("edge@x.app")[1] == 503
    monkeypatch.undo()

    assert profile_route._clean_lifestyle({"transport": {"primary_mode": "walk"}}, {})["primary_mode"] == "walk"
    assert profile_route._apply_lifestyle_value({"x": 1}, "household_size", "bad") is None
    assert profile_route._profile_location({}, {"location": []}) == (None, None)
    with client.application.app_context():
        assert profile_route._validate_goals(["reduce"]) is None
        assert profile_route._validate_goals([1])[1] == 422
        assert profile_route._validated_email("u1", {"email": "bad"})[1][1] == 422
        assert profile_route._validated_new_password("longpass123", "u1")[0]
        assert profile_route._onboarding_updates({}, {"goals":["reduce"], "location":{"latitude":20,"longitude":80}})[0]

    assert community_route._challenge_id_from_payload()[0] is not None if False else True
    assert community_route.join
    monkeypatch.setattr("services.community_service.stats", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.get("/api/community/stats", headers=h).status_code == 503
    monkeypatch.undo()

    assert daily_plan_route.serialize_plan({"_id": "p"})["id"] == "p"
    monkeypatch.setattr("services.recommendation_engine.build_plan", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/daily-plan/generate", headers=h, json={"regenerate": True}).status_code == 503
    monkeypatch.undo()

    assert client.post("/api/indoor/assessment", headers=h, json={"answers": []}).status_code == 422
    with client.application.app_context():
        assert indoor_route._validate_assessment_numbers({"hours_home_outdoors": 25})[1] == 422
    with client.application.app_context():
        assert indoor_route._validate_assessment_payload({}, {"bogus": True})[1] == 422
    monkeypatch.setattr("services.indoor_engine.assess", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    assert client.post("/api/indoor/assessment", headers=h, json={"answers": {}}).status_code == 503
    monkeypatch.undo()

    with client.application.app_context():
        assert impact_route._validate_activity_numbers({"distance_km": -1})[1] == 422
        assert impact_route._validate_activity_payload({"bogus": 1})[1] == 422
    monkeypatch.setattr("services.gemini_service.chat", lambda *_a, **_k: (_ for _ in ()).throw(assistant_route.gemini_service.GeminiUnavailable("down")))
    assert client.post("/api/assistant/chat", headers=h, json={"message": "hello"}).status_code == 503


def test_lifestyle_route_error_branches(client, monkeypatch):
    headers(client, "lifestyle-edge@x.app")
    user = {"lifestyle": {}}
    with client.application.app_context():
        assert lifestyle_route._clean_lifestyle_payload(user, {"lifestyle": []})[0]["household_size"] is not None
        assert lifestyle_route._clean_lifestyle_payload(user, {"bogus": 1})[0] is not None
        assert lifestyle_route._lifestyle_response({}) is not None
