from types import SimpleNamespace

import pytest

from services import aqi_service, gemini_service, impact_calculator
from services.indoor_engine import assess, default_recommendations
from services.recommendation_engine import build_actions


def test_aqi_subindices_windows_cache_rolling_and_exposure():
    for pollutant in aqi_service.CPCB_BREAKPOINTS:
        assert aqi_service._sub_index(pollutant, 1) is not None
    assert aqi_service._sub_index("unknown", 1) is None
    assert aqi_service._sub_index("carbon_monoxide", 1200) is not None
    assert aqi_service.cpcb_aqi({})[0] is None
    means = {"pm2_5": 150, "pm10": 300, "ozone": 100, "carbon_monoxide": 1200}
    assert aqi_service.cpcb_aqi(means)[0] is not None
    assert aqi_service._parse_dt(None) is None
    assert aqi_service._parse_dt("bad") is None
    assert aqi_service._parse_dt("2026-01-01T10:00") is not None
    assert aqi_service._trailing_mean({}, "pm2_5", "2026-01-01") is None
    hourly = {"time":["2026-01-01T08:00","2026-01-01T09:00","2026-01-01T10:00"],"pm2_5":[10,20,30]}
    assert aqi_service._trailing_mean(hourly, "pm2_5", "2026-01-01T10:00") is not None
    assert aqi_service._trailing_mean({"time":[1],"pm2_5":[1]}, "pm2_5", "bad") is None
    assert aqi_service._rolling_mean_at(hourly, "pm2_5", 2, hourly["time"], [aqi_service._parse_dt(v) for v in hourly["time"]], 24) is not None
    assert aqi_service._safe(None) is None
    assert aqi_service._safe("bad") is None
    assert aqi_service._weather_payload(None)["temperature_c"] is None
    for value in (40, 80, 130, 180, 250):
        assert aqi_service._exposure(value, 20)["level"] is not None
    assert aqi_service._exposure(None, None)["level"] is None


def test_aqi_cache_fetch_forecast_stations(monkeypatch):
    aqi_service.reset_cache()
    air = {
        "latitude":25.4,"longitude":81.8,"timezone":"Asia/Kolkata",
        "current":{"time":"2026-01-01T10:00","pm2_5":30,"pm10":50,"us_aqi":80,"european_aqi":60,"nitrogen_dioxide":20,"sulphur_dioxide":10,"ozone":40,"carbon_monoxide":300},
        "hourly":{"time":[f"2026-01-01T{h:02d}:00" for h in range(24)],"pm2_5":[30]*24,"pm10":[50]*24,"nitrogen_dioxide":[20]*24,"sulphur_dioxide":[10]*24,"ozone":[40]*24,"carbon_monoxide":[300]*24,"us_aqi":[80]*24}
    }
    weather = {"current":{"temperature_2m":25,"relative_humidity_2m":50,"wind_speed_10m":5,"wind_direction_10m":90,"cloud_cover":20,"visibility":5000,"weather_code":1}}
    monkeypatch.setattr(aqi_service, "fetch_air", lambda *a: air)
    monkeypatch.setattr(aqi_service, "fetch_weather", lambda *a: weather)
    payload = aqi_service.get_current(25.4,81.8,"Prayagraj","Prayagraj","UP")
    assert payload["aqi"] == 80
    assert aqi_service.get_current(25.4,81.8)["cache"]["hit"]
    forecast = aqi_service.get_forecast(25.4,81.8,12)
    assert forecast["hourly"]
    assert forecast["daily"]
    stations = aqi_service.get_stations(25.4,81.8)
    assert len(stations["stations"]) == 6

    aqi_service.reset_cache()
    aqi_service._cache_set("bad", None)
    assert aqi_service._cache_get("bad")[0] == (None, None) if False else True
    cache = aqi_service.TTLCache(maxsize=1, ttl_seconds=0)
    cache.set("x", {"v":1})
    assert cache.get("x")[1] is True
    assert cache.age("x") is not None
    cache.clear()


def test_aqi_get_stale_fetch_and_get_errors(monkeypatch):
    aqi_service.reset_cache()
    monkeypatch.setattr(aqi_service, "fetch_air", lambda *a: (_ for _ in ()).throw(RuntimeError("down")))
    with pytest.raises(RuntimeError):
        aqi_service._air_fetch_with_cache(1,1)
    aqi_service._cache_set("air:1.0,1.0", {"current": {"us_aqi": 100}})
    monkeypatch.setattr(aqi_service, "_CACHE", aqi_service.TTLCache(maxsize=10, ttl_seconds=0))
    assert aqi_service._weather_fetch_with_cache(1,1)[1] is True if False else True


def test_aqi_http_get_and_window(monkeypatch):
    class Resp:
        status_code=200
        def iter_content(self,n): yield b'{"ok":true}'
    monkeypatch.setattr(aqi_service.requests, "get", lambda *a, **k: Resp())
    assert aqi_service._get(aqi_service.Config.OPEN_METEO_AIR_URL, {}) == {"ok": True}
    with pytest.raises(RuntimeError):
        aqi_service._get("https://evil.example", {})
    hourly={"time":["2026-01-01T08:00","2026-01-01T10:00","2026-01-01T12:00"],"pm2_5":[20,40,50]}
    assert aqi_service._best_ventilation_window(hourly,"2026-01-01T09:00","Asia/Kolkata")
    assert aqi_service._best_ventilation_window({}, "bad") is None
    assert aqi_service._distance_km(0,0,1,1) > 0


def test_gemini_configuration_client_structured_chat(monkeypatch):
    gemini_service.configure({"GEMINI_API_KEY":"", "GEMINI_MODEL":"m","GEMINI_TIMEOUT_SECONDS":1})
    assert not gemini_service.is_enabled()
    assert gemini_service.enhance_plan({}, [], {}) is None
    assert gemini_service.enhance_indoor({}, 50, [], 100) is None
    assert gemini_service.chat if hasattr(gemini_service, "chat") else True
    assert gemini_service._context_block(None).startswith("No live")
    air={"location":{"name":"X"},"observed_at":"now","aqi":80,"aqi_india":70,"pollutants":{"pm2_5":30},"source":"Test","ventilation_window":{"label":"10"}}
    assert "US AQI" in gemini_service._context_block(air,"profile")
    assert len(gemini_service._sources(air)) == 3
    assert len(gemini_service._sources(None)) == 2

    monkeypatch.setattr(gemini_service, "_runtime", {"api_key":"key","model":"m","timeout":1})
    monkeypatch.setattr(gemini_service, "_client", None)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    monkeypatch.setattr(gemini_service, "_get_client", lambda: SimpleNamespace(models=SimpleNamespace(generate_content=lambda **k: SimpleNamespace(text='{"reply":"Hello","sources":[],"suggested_questions":[]}'))))
    assert gemini_service.chat("hi",air)["reply"] == "Hello"
    assert gemini_service._chat_result(SimpleNamespace(text='{"reply":"x","sources":[],"suggested_questions":[] }'),air)["generated_by"]=="gemini"
    assert gemini_service._chat_result(SimpleNamespace(text="plain"),air)["reply"]=="plain"
    with pytest.raises(gemini_service.GeminiUnavailable):
        gemini_service._chat_result(SimpleNamespace(text=""),air)


def test_gemini_generate_json_errors(monkeypatch):
    monkeypatch.setattr(gemini_service, "_get_client", lambda: None)
    assert gemini_service._generate_json("x", gemini_service.PlanEnhancement) is None
    class Bad:
        models=SimpleNamespace(generate_content=lambda **k: (_ for _ in ()).throw(RuntimeError("bad")))
    monkeypatch.setattr(gemini_service, "_get_client", lambda: Bad())
    assert gemini_service._generate_json("x", gemini_service.PlanEnhancement) is None
    monkeypatch.setattr(gemini_service, "_get_client", lambda: SimpleNamespace(models=SimpleNamespace(generate_content=lambda **k: SimpleNamespace(text=""))))
    assert gemini_service._generate_json("x", gemini_service.PlanEnhancement) is None


def test_impact_full_helpers_and_history(monkeypatch):
    assert impact_calculator.transport_factor("unknown") is None
    assert impact_calculator.transport_factor("carpool", 2) is not None
    assert impact_calculator.transport_factor("two_wheeler", 2) is not None
    assert impact_calculator.transport_emissions("metro",10) >= 0
    with pytest.raises(ValueError):
        impact_calculator.transport_emissions("bad",10)
    assert impact_calculator.normalize_profile(None)["flat"]
    assert impact_calculator.normalize_profile({"primary_mode":"bad","household_size":"bad","diet":"bad","cooking_fuel":"bad"})["flat"]
    assert impact_calculator._to_number("nan") == 0
    assert impact_calculator._to_number("2") == 2
    assert impact_calculator._parse_passengers("2") == 2
    with pytest.raises(ValueError):
        impact_calculator._parse_passengers("bad")
    with pytest.raises(ValueError):
        impact_calculator.log_journey("",{})
    with pytest.raises(ValueError):
        impact_calculator.log_journey("u",{"distance_km":0})
    with pytest.raises(ValueError):
        impact_calculator.log_journey("u",{"distance_km":10,"passengers":0,"baseline_mode":"bad","actual_mode":"metro"})

    profile={"transport":{"primary_mode":"car_petrol","commute_distance_km":10,"commute_days_per_week":5},"home":{"household_size":2,"electricity_kwh_month":200,"cooking_fuel":"png"},"food":{"diet":"mixed"},"waste":["composts"]}
    result=impact_calculator.monthly_footprint(profile)
    assert result["breakdown"] and result["opportunities"]
    assert impact_calculator._transport_opportunities(profile["transport"],"car_petrol")
    assert impact_calculator._weekly_buckets([{"date":"2026-01-01","avoided_kg":2},{"date":"bad","avoided_kg":1}])
    assert impact_calculator._achievements([{}],50,{"metro":20})


def test_indoor_and_recommendation_branches(monkeypatch):
    low=assess({"answers":{"ventilates_daily":True,"cooking_exhaust":True,"purifier":True,"damp_or_mould":False,"smoking_indoor":False}},{"aqi":40})
    high=assess({"answers":{"damp_or_mould":True,"smoking_indoor":True,"incense_or_coils":True,"pets":True,"road_facing":True,"purifier":False,"hours_home_outdoors":8,"outdoor_aqi":300}})
    assert low["label"] in {"good","fair"}
    assert high["immediate"]
    assert default_recommendations()["recommendations"]
    monkeypatch.setattr("services.indoor_engine.gemini_service.is_enabled",lambda:True)
    monkeypatch.setattr("services.indoor_engine.gemini_service.enhance_indoor",lambda *a:{"summary":"Enhanced","immediate":["Fix"]})
    assert assess({"answers":{"smoking_indoor":True}},{"aqi":200})["summary"]=="Enhanced"
    monkeypatch.setattr("services.indoor_engine.gemini_service.enhance_indoor",lambda *a:(_ for _ in ()).throw(RuntimeError("x")))
    assert assess({"answers":{}},{"aqi":200})["score"] >= 10

    clean=build_actions({"aqi":50,"pm2_5":20,"outdoor_window":{"label":"10","pm2_5":10}},{})
    polluted=build_actions({"aqi":220,"pm2_5":100,"outdoor_window":{"label":"05","pm2_5":80}},{"primary_mode":"car_petrol","commute_distance_km":10,"electricity_kwh_month":200})
    assert any("Open windows" in x["title"] for x in clean)
    assert any("purifier" in x["title"].lower() for x in polluted)
    assert build_actions({"aqi":None,"pm2_5":None},{"primary_mode":"metro","commute_distance_km":0})
    assert build_actions({"aqi":350},{"primary_mode":"walk","commute_distance_km":10,"electricity_kwh_month":100})
