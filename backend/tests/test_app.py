import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import db as database
from app import create_app
from config import TestConfig

AIR_RESPONSE = {
    "latitude": 25.4,
    "longitude": 81.8,
    "timezone": "Asia/Kolkata",
    "current": {
        "time": "2026-11-18T09:00",
        "pm10": 180.0,
        "pm2_5": 96.0,
        "carbon_monoxide": 900.0,
        "nitrogen_dioxide": 42.0,
        "sulphur_dioxide": 12.0,
        "ozone": 60.0,
        "us_aqi": 162,
        "european_aqi": 110,
        "dust": 20.0,
        "uv_index": 4.0,
    },
    "hourly": {
        "time": [f"2026-11-18T{h:02d}:00" for h in range(0, 12)],
        "pm2_5": [80, 85, 90, 96, 120, 130, 110, 100, 92, 88, 84, 82],
        "pm10": [150, 160, 170, 180, 200, 210, 190, 185, 175, 170, 165, 160],
        "nitrogen_dioxide": [30, 32, 36, 42, 50, 55, 48, 44, 40, 38, 36, 34],
        "sulphur_dioxide": [8, 9, 10, 12, 14, 15, 13, 12, 11, 10, 10, 9],
        "ozone": [50, 52, 55, 60, 65, 70, 68, 64, 60, 58, 56, 54],
        "carbon_monoxide": [700, 750, 800, 900, 1000, 1100, 1000, 950, 900, 880, 860, 840],
        "us_aqi": [150, 155, 158, 162, 175, 180, 170, 168, 165, 160, 158, 156],
    },
}

WEATHER_RESPONSE = {
    "current": {
        "time": "2026-11-18T09:00",
        "temperature_2m": 24.5,
        "relative_humidity_2m": 58,
        "wind_speed_10m": 8.2,
        "wind_direction_10m": 270,
        "cloud_cover": 20,
        "visibility": 4000,
        "weather_code": 1,
    }
}


def _reset_caches():
    try:
        from services import aqi_service
        if hasattr(aqi_service, "reset_cache"):
            aqi_service.reset_cache()
    except Exception:
        pass
    try:
        import services.gemini_service as gs
        gs._client = None
        gs._client_failed = False
    except Exception:
        pass


@pytest.fixture()
def app(monkeypatch):
    database.reset_memory_store()
    _reset_caches()
    monkeypatch.setattr("services.aqi_service.fetch_air", lambda lat, lng: json.loads(json.dumps(AIR_RESPONSE)))
    monkeypatch.setattr("services.aqi_service.fetch_weather", lambda lat, lng: json.loads(json.dumps(WEATHER_RESPONSE)))
    monkeypatch.setattr("services.gemini_service.is_enabled", lambda: True)
    monkeypatch.setattr(
        "services.gemini_service.enhance_plan",
        lambda *args, **kwargs: {
            "title": "Gemini test plan",
            "summary": "A plan generated for the test suite.",
            "actions": [],
        },
    )
    application = create_app(TestConfig)
    application.config.update(TESTING=True)
    yield application
    _reset_caches()


@pytest.fixture()
def client(app):
    return app.test_client()


def auth_headers(client, email="tester@airaware.app", name="Test User"):
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "testpass123"},
    )
    assert response.status_code == 201, response.get_json()
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "healthy"


def test_register_and_login(client):
    headers = auth_headers(client)
    profile = client.get("/api/profile", headers=headers)
    assert profile.status_code == 200
    assert profile.get_json()["user"]["email"] == "tester@airaware.app"

    login = client.post("/api/auth/login", json={"email": "tester@airaware.app", "password": "testpass123"})
    assert login.status_code == 200
    assert login.get_json()["access_token"]

    bad = client.post("/api/auth/login", json={"email": "tester@airaware.app", "password": "wrong"})
    assert bad.status_code == 401


def test_duplicate_email_rejected(client):
    auth_headers(client)
    again = client.post(
        "/api/auth/register",
        json={"name": "Another", "email": "tester@airaware.app", "password": "testpass123"},
    )
    assert again.status_code == 409


def test_onboarding_sets_location(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/profile/onboarding",
        headers=headers,
        json={
            "location": {"city": "Delhi", "state": "Delhi", "latitude": 28.61, "longitude": 77.21},
            "lifestyle": {
                "household_type": "apartment",
                "household_size": 3,
                "cooking_fuel": "png",
                "primary_mode": "metro",
                "commute_distance_km": 14,
                "commute_days_per_week": 5,
            },
            "goals": ["reduce_exposure", "reduce_emissions"],
        },
    )
    assert response.status_code == 200
    user = response.get_json()["user"]
    assert user["onboarding_complete"] is True
    assert user["location"]["city"] == "Delhi"
    assert user["preferences"]["goal"] == "reduce_exposure"


def test_air_quality_current_and_forecast(client):
    headers = auth_headers(client)
    current = client.get("/api/air-quality/current?latitude=25.44&longitude=81.85", headers=headers)
    assert current.status_code == 200
    payload = current.get_json()
    assert payload["aqi"] == 162
    assert payload["pollutants"]["pm2_5"] == 96.0
    assert payload["aqi_india"] is not None
    assert payload["source"].startswith("Open-Meteo")
    assert payload["ventilation_window"]["label"]

    forecast = client.get("/api/air-quality/forecast?hours=6", headers=headers)
    assert forecast.status_code == 200
    body = forecast.get_json()
    assert len(body["hourly"]) <= 6
    assert body["daily"]


def test_lifestyle_analysis_and_impact_flow(client):
    headers = auth_headers(client)
    saved = client.post(
        "/api/lifestyle",
        headers=headers,
        json={
            "transport": {
                "primary_mode": "car_petrol",
                "commute_distance_km": 12,
                "commute_days_per_week": 5,
                "weekly_other_km": 20,
                "flights_per_year": 1,
            },
            "home": {
                "household_size": 4,
                "electricity_kwh_month": 220,
                "cooking_fuel": "lpg",
                "lpg_cylinders_month": 1,
            },
            "food": {"diet": "mixed"},
            "waste": ["segregates_waste"],
        },
    )
    assert saved.status_code == 200
    analysis = saved.get_json()["analysis"]
    assert analysis["total_kg_per_month"] > 0
    assert len(analysis["breakdown"]) == 5
    assert analysis["factor_version"] == "v1-dev"

    logged = client.post(
        "/api/impact/log",
        headers=headers,
        json={"distance_km": 10, "baseline_mode": "car_petrol", "actual_mode": "metro"},
    )
    assert logged.status_code == 201
    record = logged.get_json()["record"]
    assert record["avoided_kg"] > 0

    summary = client.get("/api/impact/personal?period=30d", headers=headers)
    assert summary.status_code == 200
    assert summary.get_json()["totals"]["logged_activities"] == 1

    history = client.get("/api/impact/history?page=1&per_page=5", headers=headers)
    assert history.status_code == 200
    assert len(history.get_json()["records"]) == 1


def test_daily_plan_generation_and_toggle(client):
    headers = auth_headers(client)
    today = client.get("/api/daily-plan/today", headers=headers)
    assert today.status_code == 200
    plan = today.get_json()["plan"]
    assert plan["actions"]
    assert plan["context"]["aqi"] == 162

    action_id = plan["actions"][0]["id"]
    toggled = client.patch(
        f"/api/daily-plan/{plan['id']}/actions/{action_id}",
        headers=headers,
        json={"completed": True},
    )
    assert toggled.status_code == 200
    assert toggled.get_json()["plan"]["actions"][0]["completed"] is True

    regenerated = client.post("/api/daily-plan/generate", headers=headers, json={"regenerate": True})
    assert regenerated.status_code == 200
    assert regenerated.get_json()["plan"]["id"]


def test_indoor_assessment(client):
    headers = auth_headers(client)
    response = client.post(
        "/api/indoor/assessment",
        headers=headers,
        json={"answers": {"ventilates_daily": False, "cooking_exhaust": True, "damp_or_mould": True}},
    )
    assert response.status_code == 201
    assessment = response.get_json()["assessment"]
    assert 10 <= assessment["score"] <= 95
    assert assessment["immediate"]

    recs = client.get("/api/indoor/recommendations", headers=headers)
    assert recs.status_code == 200
    assert recs.get_json()["recommendations"]


def test_assistant_requires_live_gemini(client):
    headers = auth_headers(client)
    response = client.post("/api/assistant/chat", headers=headers, json={"message": "When should I open windows?"})
    assert response.status_code == 503
    assert "Gemini" in response.get_json()["error"]

    history = client.get("/api/assistant/history", headers=headers)
    assert history.get_json()["messages"] == []


def test_community_stats_and_challenges(client):
    headers = auth_headers(client)
    stats = client.get("/api/community/stats", headers=headers)
    assert stats.status_code == 200
    assert stats.get_json()["members"] >= 1

    challenges = client.get("/api/community/challenges", headers=headers)
    assert challenges.status_code == 200
    items = challenges.get_json()["challenges"]
    assert items

    joined = client.post("/api/community/challenges/join", headers=headers, json={"challenge_id": items[0]["id"]})
    assert joined.status_code == 200
    assert joined.get_json()["challenge"]["joined"] is True

    board = client.get("/api/community/leaderboard", headers=headers)
    assert board.status_code == 200


def test_protected_route_requires_token(client):
    response = client.get("/api/profile")
    assert response.status_code == 401


# ---- Added tests ----

def test_provider_failure_daily_plan_returns_503(client, monkeypatch):
    headers = auth_headers(client, email="provfail@airaware.app")
    monkeypatch.setattr("services.aqi_service.fetch_air", lambda lat, lng: (_ for _ in ()).throw(RuntimeError("boom")))
    monkeypatch.setattr("services.aqi_service.fetch_weather", lambda lat, lng: (_ for _ in ()).throw(RuntimeError("boom")))
    _reset_caches()
    resp = client.get("/api/daily-plan/today", headers=headers)
    assert resp.status_code == 503
    assert "temporarily unavailable" in resp.get_json().get("error", "").lower()


def test_gemini_failure_returns_503_for_chat_and_plan(client, monkeypatch):
    headers = auth_headers(client, email="gemfail@airaware.app")
    import services.gemini_service as gs
    monkeypatch.setattr(gs, "is_enabled", lambda: True)
    monkeypatch.setattr(gs, "chat", lambda *a, **k: (_ for _ in ()).throw(gs.GeminiUnavailable("down")))
    resp = client.post("/api/assistant/chat", headers=headers, json={"message": "hi"})
    assert resp.status_code == 503

    # plan path: enhance_plan returns None -> build_plan should raise GeminiUnavailable -> route returns 503
    monkeypatch.setattr(gs, "enhance_plan", lambda *a, **k: None)
    # force regeneration
    resp2 = client.post("/api/daily-plan/generate", headers=headers, json={"regenerate": True})
    assert resp2.status_code == 503
    assert "gemini" in resp2.get_json().get("error", "").lower() or "plan" in resp2.get_json().get("error", "").lower()


def test_commute_action_generated_from_flat_lifestyle_keys(client):
    headers = auth_headers(client, email="commute@airaware.app")
    saved = client.post(
        "/api/lifestyle",
        headers=headers,
        json={"primary_mode": "car_petrol", "commute_distance_km": 10},
    )
    assert saved.status_code == 200
    plan = client.get("/api/daily-plan/today", headers=headers).get_json()["plan"]
    titles = " ".join(a.get("title", "").lower() for a in plan.get("actions", []))
    assert "metro" in titles or "bus" in titles
    mobility = [a for a in plan.get("actions", []) if a.get("category") == "mobility"]
    assert mobility and mobility[0].get("co2_saved_kg", 0) > 0


def test_partial_lifestyle_save_preserves_unrelated_fields(client):
    headers = auth_headers(client, email="partial@airaware.app")
    first = client.post(
        "/api/lifestyle",
        headers=headers,
        json={
            "primary_mode": "car_petrol",
            "commute_distance_km": 15,
            "electricity_kwh_month": 300,
            "cooking_fuel": "lpg",
            "diet": "mixed",
        },
    )
    assert first.status_code == 200
    second = client.post("/api/lifestyle", headers=headers, json={"diet": "vegetarian"})
    assert second.status_code == 200
    prof = second.get_json()["profile"]
    assert prof.get("diet") == "vegetarian"
    assert float(prof.get("commute_distance_km", 0)) == 15
    assert float(prof.get("electricity_kwh_month", 0)) == 300
    assert prof.get("primary_mode") == "car_petrol"


def test_leaderboard_excludes_opted_out_users(client):
    h1 = auth_headers(client, email="optin@airaware.app", name="Opt In")
    h2 = auth_headers(client, email="optout@airaware.app", name="Opt Out")
    # opt in user 1
    client.put("/api/profile", headers=h1, json={"preferences": {"leaderboard_opt_in": True, "share_aggregate": True}})
    client.post("/api/impact/log", headers=h1, json={"distance_km": 10, "baseline_mode": "car_petrol", "actual_mode": "metro"})
    # opt out user 2 logs but should not appear
    client.put("/api/profile", headers=h2, json={"preferences": {"leaderboard_opt_in": False}})
    client.post("/api/impact/log", headers=h2, json={"distance_km": 20, "baseline_mode": "car_petrol", "actual_mode": "metro"})

    board = client.get("/api/community/leaderboard", headers=h1)
    assert board.status_code == 200
    entries = board.get_json().get("entries", [])
    names = [e.get("name") for e in entries]
    assert "You" in names  # opt-in user is viewing as self
    assert not any(n.startswith("Opt Out") for n in names)


def test_impact_validation_rejects_bad_values(client):
    headers = auth_headers(client, email="impactbad@airaware.app")
    cases = [
        {"distance_km": -5, "baseline_mode": "car_petrol", "actual_mode": "metro"},
        {"distance_km": 0, "baseline_mode": "car_petrol", "actual_mode": "metro"},
        {"distance_km": 99999, "baseline_mode": "car_petrol", "actual_mode": "metro"},
        {"distance_km": float("nan"), "baseline_mode": "car_petrol", "actual_mode": "metro"},
        {"distance_km": float("inf"), "baseline_mode": "car_petrol", "actual_mode": "metro"},
        {"distance_km": 10, "baseline_mode": "car_petrol", "actual_mode": "metro", "passengers": 0},
        {"distance_km": 10, "baseline_mode": "car_petrol", "actual_mode": "metro", "passengers": 50},
        {"distance_km": 10, "baseline_mode": "car_petrol", "actual_mode": "metro", "date": "2099-01-01"},
        {"distance_km": 10, "baseline_mode": "car_petrol", "actual_mode": "metro", "date": "not-a-date"},
    ]
    for payload in cases:
        resp = client.post("/api/impact/log", headers=headers, json=payload)
        assert resp.status_code == 422, (payload, resp.get_json())


def test_malformed_json_array_bodies_return_4xx(client):
    headers = auth_headers(client, email="malformed@airaware.app")
    endpoints = [
        ("post", "/api/lifestyle"),
        ("post", "/api/impact/log"),
        ("post", "/api/assistant/chat"),
        ("post", "/api/daily-plan/generate"),
        ("put", "/api/profile"),
    ]
    for method, path in endpoints:
        resp = getattr(client, method)(
            path,
            headers={**headers, "Content-Type": "application/json"},
            data="[1,2,3]",
        )
        assert 400 <= resp.status_code < 500, (path, resp.status_code, resp.get_data(as_text=True))


def test_deleted_user_token_rejected(client):
    headers = auth_headers(client, email="deleteme@airaware.app")
    # confirm works
    ok = client.get("/api/profile", headers=headers)
    assert ok.status_code == 200
    deleted = client.delete(
        "/api/profile",
        headers=headers,
        json={"confirm_delete": True, "current_password": "testpass123"},
    )
    assert deleted.status_code == 200
    # token now points to deleted user; protected routes should reject (404/401)
    resp = client.get("/api/profile", headers=headers)
    assert resp.status_code in (401, 404)


def test_idor_cannot_toggle_other_users_plan_action(client):
    h1 = auth_headers(client, email="usera@airaware.app")
    h2 = auth_headers(client, email="userb@airaware.app")
    plan_resp = client.get("/api/daily-plan/today", headers=h1)
    assert plan_resp.status_code == 200
    plan = plan_resp.get_json()["plan"]
    plan_id = plan["id"]
    action_id = plan["actions"][0]["id"]

    # user B tries to toggle user A's plan/action
    resp = client.patch(f"/api/daily-plan/{plan_id}/actions/{action_id}", headers=h2, json={"completed": True})
    assert resp.status_code == 404

    # user A still sees it not completed (or as before)
    plan_a = client.get("/api/daily-plan/today", headers=h1).get_json()["plan"]
    action = next(a for a in plan_a["actions"] if a["id"] == action_id)
    assert action.get("completed") is False


def test_cpcb_breakpoints_o3_co_8h_averaging():
    from services import aqi_service
    # 8 hours of ozone at 60 ug/m3, others low -> O3 sub-index should reflect 60 (51-100 range)

    hourly = {
        "time": [f"2026-11-18T{h:02d}:00" for h in range(12)],
        "pm2_5": [10.0] * 12,
        "pm10": [20.0] * 12,
        "nitrogen_dioxide": [10.0] * 12,
        "sulphur_dioxide": [5.0] * 12,
        "ozone": [20.0, 20.0, 20.0, 20.0, 60.0, 60.0, 60.0, 60.0, 60.0, 60.0, 60.0, 60.0],
        "carbon_monoxide": [300.0, 300.0, 300.0, 300.0, 1200.0, 1200.0, 1200.0, 1200.0, 1200.0, 1200.0, 1200.0, 1200.0],
    }
    observed = "2026-11-18T11:00"
    means = {}
    for p in ("pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide", "ozone", "carbon_monoxide"):
        means[p] = aqi_service._trailing_mean(hourly, p, observed)
    assert means["ozone"] == 60.0
    assert means["carbon_monoxide"] == 1200.0
    idx, primary, subs = aqi_service.cpcb_aqi(means)
    assert subs["ozone"] is not None and 51 <= subs["ozone"] <= 100
    # CO 1200 ug/m3 = 1.2 mg/m3 -> 51-100 range
    assert subs["carbon_monoxide"] is not None and 51 <= subs["carbon_monoxide"] <= 100
    assert idx is not None


def test_ventilation_window_never_in_past():
    from services import aqi_service
    hourly = {
        "time": [
            "2026-11-18T01:00", "2026-11-18T02:00", "2026-11-18T03:00",  # past, very clean
            "2026-11-18T10:00", "2026-11-18T11:00", "2026-11-18T12:00",  # future, moderate
        ],
        "pm2_5": [5.0, 5.0, 5.0, 40.0, 35.0, 50.0],
    }
    window = aqi_service._best_ventilation_window(hourly, observed_at="2026-11-18T09:00", tz_name="Asia/Kolkata")
    assert window is not None
    assert window["date"] == "2026-11-18"
    assert window["start"] >= "09:00" or window["label"].startswith("2026-11-18 1")  # 10:00 or 11:00 window
    assert "01:00" not in window["label"] and "02:00" not in window["label"]
    assert "Asia/Kolkata" in window["label"]


def test_cache_bounded_and_ttl(monkeypatch):
    from services import aqi_service
    aqi_service.reset_cache()
    # small cache to test bound
    aqi_service._CACHE = aqi_service.TTLCache(maxsize=2, ttl_seconds=1)
    for i in range(5):
        aqi_service._cache_set(f"k{i}", {"v": i})
    # only maxsize entries remain
    present = 0
    for i in range(5):
        cached, _ = aqi_service._cache_get(f"k{i}")
        if cached is not None:
            present += 1
    assert present <= 2
    # TTL expiry
    aqi_service._CACHE = aqi_service.TTLCache(maxsize=10, ttl_seconds=0)
    aqi_service._cache_set("ttl", {"v": 1})
    cached, expired = aqi_service._cache_get("ttl")
    assert cached is not None and expired is True
    aqi_service.reset_cache()


def test_forecast_has_stale_and_model_note(client):
    forecast = client.get("/api/air-quality/forecast?hours=6")
    assert forecast.status_code == 200
    body = forecast.get_json()
    assert "stale" in body
    notes = body.get("notes") or []
    assert any("CAMS model" in n or "grid" in n.lower() for n in notes)


def test_primary_pollutant_absent_when_no_india_aqi(monkeypatch):
    from services import aqi_service
    aqi_service.reset_cache()
    # hourly with too few samples in windows -> means None -> no india_aqi
    sparse = {
        "latitude": 25.4,
        "longitude": 81.8,
        "timezone": "Asia/Kolkata",
        "current": {
            "time": "2026-11-18T09:00",
            "pm10": 180.0,
            "pm2_5": 96.0,
            "carbon_monoxide": 900.0,
            "nitrogen_dioxide": 42.0,
            "sulphur_dioxide": 12.0,
            "ozone": 60.0,
            "us_aqi": 162,
        },
        "hourly": {
            "time": ["2026-11-18T09:00"],
            "pm2_5": [96.0],
            "pm10": [180.0],
            "nitrogen_dioxide": [42.0],
            "sulphur_dioxide": [12.0],
            "ozone": [60.0],
            "carbon_monoxide": [900.0],
            "us_aqi": [162],
        },
    }
    monkeypatch.setattr("services.aqi_service.fetch_air", lambda lat, lng: json.loads(json.dumps(sparse)))
    monkeypatch.setattr("services.aqi_service.fetch_weather", lambda lat, lng: json.loads(json.dumps(WEATHER_RESPONSE)))
    payload = aqi_service.get_current(25.4, 81.8)
    assert payload["aqi_india"] is None
    assert payload.get("primary_pollutant") is None
    aqi_service.reset_cache()
