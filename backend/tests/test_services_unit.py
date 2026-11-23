import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import gemini_service
from services.indoor_engine import assess
from services.recommendation_engine import build_actions
from utils.validation import (
    bounded_number,
    bounded_text,
    ensure_json_object,
    finite_number,
    parse_bool,
    validate_coordinates,
    validate_iso_date,
)


@pytest.fixture()
def app_context():
    from app import create_app
    from config import TestConfig

    app = create_app(TestConfig)
    with app.app_context():
        yield app


def test_validation_helpers_cover_coercion_and_failures(app_context):
    assert parse_bool(" YES ") is True
    assert parse_bool("off") is False
    assert parse_bool("maybe", True) is True
    assert finite_number("2.5", "x")[0] == 2.5
    assert finite_number("nan", "x")[1][1] == 422
    assert validate_coordinates(25, 80)[:2] == (25.0, 80.0)
    assert validate_coordinates(91, 80)[2][1] == 422
    assert ensure_json_object([])[1][1] == 400
    assert bounded_text(" a\n b ", "name", 10)[0] == "a b"
    assert bounded_text("", "name", 10, allow_empty=False)[1][1] == 422
    assert bounded_number(4, "n", 0, 3)[1][1] == 422
    assert validate_iso_date("2020-01-02") == "2020-01-02"
    with pytest.raises(ValueError):
        validate_iso_date("not-a-date")


def test_indoor_engine_tailors_low_and_high_risk_answers(monkeypatch):
    monkeypatch.setattr(gemini_service, "is_enabled", lambda: False)
    low = assess({"answers": {"ventilates_daily": True, "cooking_exhaust": True, "purifier": True}})
    high = assess(
        {"answers": {"damp_or_mould": True, "smoking_indoor": True, "incense_or_coils": True, "hours_home_outdoors": 8}},
        {"aqi": 220},
    )
    assert low["label"] in {"good", "fair"}
    assert high["label"] in {"needs_attention", "poor"}
    assert high["outdoor_aqi"] == 220
    assert high["immediate"]


def test_recommendation_actions_cover_clean_and_polluted_paths(monkeypatch):
    monkeypatch.setattr(gemini_service, "is_enabled", lambda: False)
    clean = build_actions({"aqi": 50, "pm2_5": 20, "outdoor_window": {"label": "09:00"}}, {})
    polluted = build_actions(
        {"aqi": 220, "pm2_5": 100, "outdoor_window": {"label": "05:00"}},
        {"primary_mode": "car_petrol", "commute_distance_km": 10, "electricity_kwh_month": 200},
    )
    assert any("Open windows" in item["title"] for item in clean)
    assert any("purifier" in item["title"].lower() for item in polluted)
    assert any("metro" in item["title"].lower() for item in polluted)
    assert all(item["id"].startswith("a") for item in polluted)


def test_gemini_structured_and_chat_fallbacks(monkeypatch):
    monkeypatch.setattr(gemini_service, "_client", None)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    monkeypatch.setattr(gemini_service, "_runtime", {"api_key": "", "model": "m", "timeout": 1})
    assert gemini_service.is_enabled() is False
    assert gemini_service.enhance_plan({}, [], {}) is None
    assert gemini_service._context_block(None).startswith("No live")
    assert len(gemini_service._sources({"aqi_india": 50})) == 3

    response = SimpleNamespace(text='{"reply":" Hello ","sources":[],"suggested_questions":[]}')
    result = gemini_service._chat_result(response, None)
    assert result["reply"] == "Hello"
    assert result["generated_by"] == "gemini"
    with pytest.raises(gemini_service.GeminiUnavailable):
        gemini_service._chat_result(SimpleNamespace(text=""), None)
