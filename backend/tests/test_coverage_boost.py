import json
import runpy
import sys
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from flask import Flask
from flask_limiter import RateLimitExceeded
from google import genai as genai_module
from jwt.exceptions import PyJWTError
from psycopg import sql
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module
import config as config_module
import db as database
import extensions as extensions_module
from config import TestConfig
from extensions import challenge_members, impact_records, indoor_assessments, limiter, token_denylist, users
from services import (
    air_lookup,
    aqi_service,
    community_service,
    gemini_service,
    impact_calculator,
    indoor_engine,
    recommendation_engine,
)
from utils import http as http_utils
from utils import validation as validation_utils

AIR_PAYLOAD = {
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
        "time": [f"2026-11-18T{h:02d}:00" for h in range(12)],
        "pm2_5": [80, 85, 90, 96, 120, 130, 110, 100, 92, 88, 84, 82],
        "pm10": [150, 160, 170, 180, 200, 210, 190, 185, 175, 170, 165, 160],
        "nitrogen_dioxide": [30, 32, 36, 42, 50, 55, 48, 44, 40, 38, 36, 34],
        "sulphur_dioxide": [8, 9, 10, 12, 14, 15, 13, 12, 11, 10, 10, 9],
        "ozone": [50, 52, 55, 60, 65, 70, 68, 64, 60, 58, 56, 54],
        "carbon_monoxide": [700, 750, 800, 900, 1000, 1100, 1000, 950, 900, 880, 860, 840],
        "us_aqi": [150, 155, 158, 162, 175, 180, 170, 168, 165, 160, 158, 156],
    },
}

WEATHER_PAYLOAD = {
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


def _copy(value):
    return json.loads(json.dumps(value))


@pytest.fixture()
def client(monkeypatch):
    database.reset_memory_store()
    database.reset_rate_limit_state()
    token_denylist._entries.clear()
    limiter.reset()
    aqi_service.reset_cache()
    monkeypatch.setattr(gemini_service, "_client", None)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    monkeypatch.setattr(gemini_service, "_runtime", {"api_key": "", "model": "m", "timeout": 1})
    monkeypatch.setattr("services.aqi_service.fetch_air", lambda lat, lng: _copy(AIR_PAYLOAD))
    monkeypatch.setattr("services.aqi_service.fetch_weather", lambda lat, lng: _copy(WEATHER_PAYLOAD))
    application = app_module.create_app(TestConfig)
    application.config.update(TESTING=True)
    yield application.test_client()
    aqi_service.reset_cache()
    limiter.reset()
    database.reset_memory_store()


@pytest.fixture()
def app_context():
    application = app_module.create_app(TestConfig)
    with application.app_context():
        yield application


def _auth(client, email="boost@airaware.app", name="Boost Tester"):
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "testpass123"},
    )
    assert response.status_code == 201, response.get_json()
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


class FakeCursor:
    def __init__(self, row=None, rows=None, rowcount=0):
        self._row = row
        self._rows = rows if rows is not None else []
        self.rowcount = rowcount
        self.calls = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        return self

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, params=None):
        return self._cursor.execute(statement, params)


class FakePool:
    def __init__(self, row=None, rows=None, rowcount=0):
        self.row = row
        self.rows = rows if rows is not None else []
        self.rowcount = rowcount
        self.cursors = []
        self.closed = False

    def connection(self):
        cursor = FakeCursor(self.row, self.rows, self.rowcount)
        self.cursors.append(cursor)
        return FakeConnection(cursor)

    def execute(self, statement, params=None):
        cursor = FakeCursor(self.row, self.rows, self.rowcount)
        self.cursors.append(cursor)
        return cursor.execute(statement, params)

    def close(self):
        self.closed = True


def _pool_ctx(pool):
    @contextmanager
    def connection():
        yield pool

    return SimpleNamespace(connection=connection)


def test_db_serialization_and_deserialization_branches():
    naive = datetime(2026, 1, 2, 3, 4, 5)
    aware = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    assert database._serialize(naive).endswith("Z")
    assert database._serialize(aware).endswith("Z")
    assert database._serialize({"a": [naive, 1]})["a"][0].endswith("Z")
    document = database._deserialize(
        {"observed_at": "2026-01-02T03:04:05Z", "created_at": "bad-date", "nested": [{"updated_at": "2026-01-02T03:04:05"}]}
    )
    assert isinstance(document["observed_at"], datetime)
    assert document["created_at"] == "bad-date"
    assert isinstance(document["nested"][0]["updated_at"], datetime)
    assert database._json({"a": naive}) == '{"a": "2026-01-02T03:04:05Z"}'


def test_db_query_clause_builders():
    params = []
    assert database._path("a.b.c") == ["a", "b", "c"]
    assert database._is_simple_allowed_key("email")
    assert not database._is_simple_allowed_key("a.b")
    assert database._sql_value(naive_value()).endswith("Z")
    assert database._sql_value(datetime(2026, 1, 2, tzinfo=UTC)).endswith("Z")
    assert database._expr_for_key("_id") == "id"
    assert database._expr_for_key("nested.path") is None
    assert "data->>'email'" in database._comparison_clause("email", "$gt", 1, params)
    assert "(data #> %s::text[])" in database._comparison_clause("nested.value", "$lt", 1, params)
    assert "(data #> %s::text[])" in database._equality_clause("nested.value", 1, params)
    assert "IS NULL" in database._exists_clause("nested.value", False, params)
    assert "IS DISTINCT FROM" in database._inequality_clause("nested.value", "$ne", 1, params)
    assert " OR " in database._in_clause("email", ["a", "b"], params)
    assert " AND " in database._nin_clause("email", ["a", "b"], params)


def naive_value():
    return datetime(2026, 1, 2, 3, 4, 5)


def test_db_where_builder_paths():
    assert database._where({}) == ("TRUE", [])
    assert database._where({1: "x"}) == ("TRUE", [])
    with pytest.raises(ValueError, match="Unsupported query key"):
        database._where({"bad$key": 1})
    clause, params = database._where({"email": "a@b.c", "n": {"$gte": 1, "$lt": 9}})
    assert "AND" in clause
    assert params[:1] == ["a@b.c"]
    assert "1" in params and "9" in params
    clause, params = database._where({"nested.value": {"$in": [1, 2]}})
    assert "nested" in str(params)
    assert " OR " in clause


def test_db_memory_matchers_and_updates():
    document = {"a": {"b": 2}, "n": 5, "tags": ["x"]}
    assert database._nested_value(document, "a.b") == 2
    assert database._nested_value(document, "a.missing") is None
    assert database._nested_value(None, "a") is None
    assert not database._memory_comparison(None, 1, lambda a, b: a >= b)
    assert database.MEMORY_OPERATOR_MATCHERS["$exists"](None, False)
    assert database.MEMORY_OPERATOR_MATCHERS["$ne"](1, 2)
    assert database._memory_operator_matches(1, "$unknown", 2)
    assert database._document_matches(document, "n", {"$gte": 5})
    assert not database._document_matches(document, "n", 9)
    assert database._matches(document, {"a.b": 2, "n": {"$lt": 6}})
    target = {}
    database._set_path(target, "x.y.z", 3)
    assert target["x"]["y"]["z"] == 3
    updated = database._apply_update(
        {"n": 1, "drop": 2},
        {"$set": {"deep.value": 4}, "$inc": {"n": 2, "deep.count": 1}, "$unset": {"drop": ""}},
    )
    assert updated["deep"] == {"value": 4, "count": 1}
    assert updated["n"] == 3
    assert "drop" not in updated


def test_db_memory_collection_remaining_branches():
    collection = database.MemoryCollection("boost")
    first = collection.insert_one({"n": 1})
    collection.insert_many([{"n": 2}, {"n": 3}])
    assert collection.count_documents() == 3
    assert collection.find_one({"n": 2}, sort=("n", -1))["n"] == 2
    assert collection.find_one({"n": 2}, sort=[("n", 1)])["n"] == 2
    assert collection.delete_one({"n": 999}).deleted_count == 0
    assert collection.update_one({"n": 999}, {"$set": {"x": 1}}).matched_count == 0
    assert collection.update_one({"n": 999}, {"$set": {"x": 1}}, upsert=True).upserted_id
    assert collection.find_one({"x": 1}) is not None
    collection.create_index("n")
    collection.drop()
    assert first.inserted_id


def test_db_configure_connect_close_and_pool_errors(monkeypatch):
    monkeypatch.setattr(database, "_pool", None)
    monkeypatch.setattr(database, "_mode", None)
    monkeypatch.setattr(database, "_runtime", {"backend": "memory", "url": ""})
    monkeypatch.setattr(database, "_connect_state", {"failures": 0, "next_retry_at": 0.0})
    database.configure({"DB_BACKEND": "memory", "SUPABASE_DB_URL": "", "MAX_FETCH_LIMIT": 11})
    assert database.MAX_FETCH_LIMIT == 11
    assert database.connect() == "memory"

    broken = SimpleNamespace(close=lambda: (_ for _ in ()).throw(RuntimeError("nope")))
    monkeypatch.setattr(database, "_pool", broken)
    database.configure({"DB_BACKEND": "postgres", "SUPABASE_DB_URL": "postgres://fake", "MAX_FETCH_LIMIT": 12})
    assert database._pool is None
    database._mode = None
    monkeypatch.setattr(database, "_pool", broken)
    database.close()
    assert database._pool is None

    monkeypatch.setattr(database, "ConnectionPool", None)
    monkeypatch.setattr(database, "psycopg", object())
    monkeypatch.setattr(database, "_runtime", {"backend": "postgres", "url": "postgres://fake"})
    assert database.connect() == "unconfigured"
    monkeypatch.setattr(database, "ConnectionPool", object())
    monkeypatch.setattr(database, "psycopg", None)
    assert database.connect() == "unconfigured"


def test_db_supabase_connect_locked_paths(monkeypatch):
    pool = FakePool()
    monkeypatch.setattr(database, "ConnectionPool", lambda **_kwargs: pool)
    monkeypatch.setattr(database, "psycopg", object())
    monkeypatch.setattr(database, "dict_row", object())
    monkeypatch.setattr(database, "_runtime", {"backend": "postgres", "url": "postgres://fake"})
    monkeypatch.setattr(database, "_pool", None)
    monkeypatch.setattr(database, "_mode", None)
    monkeypatch.setattr(database, "_connect_state", {"failures": 0, "next_retry_at": 0.0})
    assert database.connect() == "supabase"
    assert database._connect_supabase_locked() == "supabase"

    monkeypatch.setattr(database, "_connect_state", {"failures": 0, "next_retry_at": time.time() + 60})
    monkeypatch.setattr(database, "_pool", None)
    monkeypatch.setattr(database, "_mode", None)
    with pytest.raises(database.StorageUnavailable):
        database._connect_supabase_locked()

    class FailingPool:
        def __init__(self, **_kwargs):
            pass

        def close(self):
            raise RuntimeError("close failed")

    monkeypatch.setattr(database, "ConnectionPool", FailingPool)
    monkeypatch.setattr(database, "_connect_state", {"failures": 5, "next_retry_at": 0.0})
    with pytest.raises(database.StorageUnavailable):
        database._connect_supabase_locked()
    assert database._connect_state["failures"] == 6


def test_db_pool_or_raise_and_storage_mode(monkeypatch):
    pool = FakePool()
    monkeypatch.setattr(database, "connect", lambda: "unconfigured")
    with pytest.raises(database.StorageUnavailable, match="Supabase Postgres is not"):
        database._pool_or_raise()
    assert database.storage_mode() == "unconfigured"
    monkeypatch.setattr(database, "connect", lambda: "memory")
    with pytest.raises(database.StorageUnavailable, match="Supabase Postgres is not"):
        database._pool_or_raise()
    monkeypatch.setattr(database, "connect", lambda: "supabase")
    monkeypatch.setattr(database, "_pool", None)
    with pytest.raises(database.StorageUnavailable, match="Supabase Postgres is not"):
        database._pool_or_raise()
    monkeypatch.setattr(database, "_pool", pool)
    assert database._pool_or_raise() is pool
    assert database.storage_mode() == "supabase"


def test_db_memory_rate_limit_window_reset(monkeypatch):
    database.reset_rate_limit_state()
    clock = SimpleNamespace(now=1000.0)
    monkeypatch.setattr(database.time, "time", lambda: clock.now)
    assert database._memory_rate_limit_hit("b", "i", 1, 60)
    assert not database._memory_rate_limit_hit("b", "i", 1, 60)
    clock.now += 61
    assert database._memory_rate_limit_hit("b", "i", 1, 60)
    database.reset_rate_limit_state()


def test_db_fetch_sort_and_limit_helpers(monkeypatch):
    assert database._normalize_sort("a") == [("a", 1)]
    assert database._normalize_sort(("a", -1)) == [("a", -1)]
    assert database._normalize_sort([("a", 1)]) == [("a", 1)]
    pool = FakePool(rows=[{"id": "1", "data": {"t": "2026-01-01T00:00:00Z"}}])
    monkeypatch.setattr(database, "_pool_or_raise", lambda: _pool_ctx(pool))
    rows = database._fetch("users", {}, sort=[("email", 1), ("_id", -1), ("nested.path", 1)], skip=1, limit=4, for_update=True)
    assert rows[0]["t"].startswith("2026")
    assert any("for update" in call[0] for call in pool.cursors[0].calls)
    assert "nested" in str(pool.cursors[0].calls[0][1])
    count_pool = FakePool(row={"total": 2})
    monkeypatch.setattr(database, "_pool_or_raise", lambda: _pool_ctx(count_pool))
    cursor = database.PostgresCursor("users", {})
    cursor.sort([("a", 1)]).skip(-1).limit(2)
    assert cursor.count() == 2
    assert isinstance(list(cursor), list)
    assert isinstance(cursor.to_list(), list)


def test_db_postgres_collection_remaining_branches(monkeypatch):
    empty = FakePool(row=None, rows=[])
    monkeypatch.setattr(database, "_pool_or_raise", lambda: _pool_ctx(empty))
    collection = database.PostgresCollection("users")
    assert collection.update_one({"name": "A"}, {"$set": {"x": 1}}).matched_count == 0
    result = collection.update_one({"name": "A"}, {"$set": {"x": 1}}, upsert=True)
    assert result.upserted_id
    assert collection.delete_one({"name": "A"}).deleted_count == 0
    assert collection.delete_many().deleted_count == 0
    collection.create_index("name")

    class Duplicate(Exception):
        pass

    Duplicate.__name__ = "UniqueViolation"
    with pytest.raises(database.IntegrityConflict):
        database._raise_if_integrity(Duplicate())

    failing = FakePool()
    monkeypatch.setattr(database, "_pool_or_raise", lambda: _pool_ctx(failing))

    def raise_generic(_self, _statement, _params):
        raise RuntimeError("insert failed")

    def raise_duplicate(_self, _statement, _params):
        raise Duplicate()

    monkeypatch.setattr(FakeCursor, "execute", raise_generic)
    with pytest.raises(RuntimeError, match="insert failed"):
        collection.insert_one({"name": "A"})

    monkeypatch.setattr(FakeCursor, "execute", raise_duplicate)
    with pytest.raises(database.IntegrityConflict):
        collection.update_one({"name": "A"}, {"$set": {"x": 2}})
    monkeypatch.undo()
    assert database.collection("users").name == "users"
    monkeypatch.setattr(database, "connect", lambda: "unconfigured")
    with pytest.raises(database.StorageUnavailable):
        database.collection("users").find({})


def test_config_and_extension_edge_branches(monkeypatch):
    monkeypatch.setenv("BOOST_BOOL", "false")
    assert config_module._boolean("BOOST_BOOL", True) is False
    monkeypatch.setenv("BOOST_BOOL", "OFF")
    assert config_module._boolean("BOOST_BOOL", True) is False
    assert extensions_module._rate_limit_key() == "anonymous"
    monkeypatch.setattr(extensions_module.database, "storage_mode", lambda: "supabase")
    monkeypatch.setattr(extensions_module.database, "revoke_token", lambda *_args: None)
    monkeypatch.setattr(extensions_module.database, "is_token_revoked", lambda *_args: True)
    token_denylist.revoke("jti-1", time.time() + 60)
    assert token_denylist.is_revoked("jti-1")

    class BadString(str):
        def encode(self, *_args, **_kwargs):
            raise ValueError("no encode")

    assert not extensions_module.check_password("pw", BadString("$2b$12$bad"))


def test_gemini_configuration_and_structured_paths(monkeypatch):
    monkeypatch.setattr(gemini_service, "_runtime", dict(gemini_service._runtime))
    monkeypatch.setattr(gemini_service, "_client", None)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    gemini_service.configure(SimpleNamespace(GEMINI_API_KEY="key", GEMINI_MODEL="m", GEMINI_TIMEOUT_SECONDS=1))
    assert gemini_service._runtime["api_key"] == "key"
    gemini_service._client = object()
    assert gemini_service._get_client() is not None
    gemini_service._client = None
    gemini_service._client_failed = True
    assert gemini_service._get_client() is None
    assert not gemini_service.is_enabled()
    gemini_service._client_failed = False

    class BadClient:
        models = SimpleNamespace(generate_content=lambda **_kwargs: SimpleNamespace(text='{"title": 1}'))

    monkeypatch.setattr(gemini_service, "_get_client", lambda: BadClient())
    assert gemini_service._generate_json("x", gemini_service.PlanEnhancement) is None

    class ErrorClient:
        models = SimpleNamespace(generate_content=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("bad")))

    monkeypatch.setattr(gemini_service, "_get_client", lambda: ErrorClient())
    assert gemini_service._generate_json("x", gemini_service.PlanEnhancement) is None


def test_gemini_enhance_and_chat_paths(monkeypatch):
    monkeypatch.setattr(gemini_service, "is_enabled", lambda: True)
    enhanced = {
        "title": "New title",
        "summary": "New summary",
        "actions": [
            {"id": "a1", "detail": "Better detail", "why": "Because"},
            {"id": "unknown", "detail": "drop me"},
            "not-a-dict",
        ],
    }
    monkeypatch.setattr(gemini_service, "_generate_json", lambda *_args: enhanced)
    result = gemini_service.enhance_plan(
        {"aqi": 80}, [{"id": "a1", "title": "Original"}, {"id": "a2", "title": "Second"}], {"mode": "metro"}, "Asha"
    )
    assert result["actions"] == [{"id": "a1", "detail": "Better detail", "why": "Because"}]
    assert gemini_service.enhance_indoor({"smoking_indoor": True}, 40, ["Fix"], 220) == enhanced
    monkeypatch.setattr(gemini_service, "_generate_json", lambda *_args: None)
    assert gemini_service.enhance_plan({}, [], {}) is None

    air = {"aqi": 80, "aqi_india": 60, "pollutants": {"pm2_5": 30}, "location": {"name": "X"}}
    context = gemini_service._context_block(air, "profile", "extra line")
    assert "extra line" in context and "User context" in context
    assert len(gemini_service._sources(air)) == 3
    assert len(gemini_service._sources({"aqi": 80})) == 2

    from google.genai import types

    contents = gemini_service._chat_contents(
        types,
        [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}],
        context,
        "question",
    )
    assert len(contents) == 3
    assert contents[1].role == "model"

    plain = gemini_service._chat_result(SimpleNamespace(text="plain answer"), air)
    assert plain["generated_by"] == "gemini" and plain["reply"] == "plain answer"
    structured = gemini_service._chat_result(
        SimpleNamespace(text='{"reply":"ok","sources":[{"title":"S","url":"https://x"}],"suggested_questions":["Q"]}'), air
    )
    assert structured["sources"][0]["title"] == "S"
    assert structured["suggested_questions"] == ["Q"]
    with pytest.raises(gemini_service.GeminiUnavailable):
        gemini_service._chat_result(SimpleNamespace(text='{"reply":"  "}'), air)

    class ChatClient:
        models = SimpleNamespace(generate_content=lambda **_kwargs: SimpleNamespace(text='{"reply":"Hello"}' ))

    monkeypatch.setattr(gemini_service, "_get_client", lambda: ChatClient())
    assert gemini_service.chat("hi", air, history=[{"role": "user", "content": "old"}])["reply"] == "Hello"

    class FailingClient:
        models = SimpleNamespace(generate_content=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("bad")))

    monkeypatch.setattr(gemini_service, "_get_client", lambda: FailingClient())
    with pytest.raises(gemini_service.GeminiUnavailable, match="request failed"):
        gemini_service.chat("hi", air)
    monkeypatch.setattr(gemini_service, "_get_client", lambda: None)
    with pytest.raises(gemini_service.GeminiUnavailable, match="not configured"):
        gemini_service.chat("hi", air)


def test_air_lookup_fallback_and_require_air(monkeypatch, app_context):
    user = {"location": {"latitude": "bad", "longitude": "bad", "city": "X"}}
    seen = {}

    def fake_current(lat, lng, **_kwargs):
        seen["lat"] = lat
        return {"aqi": 40}

    monkeypatch.setattr(aqi_service, "get_current", fake_current)
    assert air_lookup.air_for_user(user)["aqi"] == 40
    assert seen["lat"] == 25.4358
    monkeypatch.setattr(air_lookup, "air_for_user", lambda _user: None)
    assert air_lookup.require_air_for_user(user)[1][1] == 503
    monkeypatch.setattr(air_lookup, "air_for_user", lambda _user: {"aqi": 20})
    assert air_lookup.require_air_for_user(user)[1] is None


def test_aqi_helper_edge_paths(monkeypatch):
    assert aqi_service._sub_index("pm2_5", None) is None
    assert aqi_service._sub_index("unknown", 10) is None
    assert aqi_service._sub_index("pm2_5", 9999) > 500
    assert aqi_service.cpcb_aqi({})[0] is None
    assert aqi_service.cpcb_aqi({"unknown": 1})[0] is None
    assert aqi_service._parse_dt(datetime(2026, 1, 1)) is not None
    assert aqi_service._parse_dt(123) is None
    assert aqi_service._trailing_mean({"time": ["2026-01-01T00:00"], "pm2_5": [1]}, "pm2_5", "bad") is None
    assert aqi_service._trailing_mean({"time": ["a", "b"], "pm2_5": [1]}, "pm2_5", "bad") is None
    assert aqi_service._trailing_window([], None, 24) == []
    assert aqi_service._safe(object()) is None
    assert aqi_service._window_slot_is_future(None, None, 48)
    assert not aqi_service._window_slot_is_future(datetime(2026, 1, 3), datetime(2026, 1, 1), 1)
    hourly = {"time": ["2026-01-01T00:00", "2026-01-01T01:00", "bad", "2026-01-01T03:00"],
              "pm2_5": [10, 20, None, 30]}
    assert aqi_service._best_ventilation_window(hourly, "2026-01-01T00:00", "IST")["label"].endswith("(IST)")
    assert aqi_service._best_ventilation_window({}, "bad") is None
    assert aqi_service._exposure(None, None)["level"] is None
    for aqi in (50, 100, 150, 200, 400):
        assert aqi_service._exposure(aqi, 40)["level"]

    class BadResponse:
        status_code = 200

        def iter_content(self, _size):
            yield b"x" * (aqi_service.MAX_PROVIDER_BYTES + 1)

    monkeypatch.setattr(aqi_service.requests, "get", lambda *_args, **_kwargs: BadResponse())
    with pytest.raises(RuntimeError, match="too large"):
        aqi_service._get(aqi_service.Config.OPEN_METEO_AIR_URL, {})
    monkeypatch.setattr(aqi_service.requests, "get", lambda *_a, **_k: SimpleNamespace(status_code=500))
    with pytest.raises(RuntimeError, match="unexpected response"):
        aqi_service._get(aqi_service.Config.OPEN_METEO_AIR_URL, {})


def test_aqi_cache_stale_forecast_and_stations(monkeypatch):
    aqi_service.reset_cache()
    air = _copy(AIR_PAYLOAD)
    monkeypatch.setattr(aqi_service, "fetch_air", lambda *_args: air)
    payload = aqi_service.get_current(25.4, 81.8, "Loc", "City", "State")
    assert payload["aqi"] == 162
    assert not payload["cache"]["hit"]
    assert aqi_service.get_current(25.4, 81.8)["cache"]["hit"]
    assert aqi_service.get_forecast(25.4, 81.8, 12)["hourly"]
    monkeypatch.setattr(aqi_service, "_get", lambda *_args, **_kwargs: [_copy(AIR_PAYLOAD) for _ in range(6)])
    assert aqi_service.get_stations(25.4, 81.8)["stations"]

    aqi_service.reset_cache()
    monkeypatch.setattr(aqi_service, "_CACHE", aqi_service.TTLCache(maxsize=10, ttl_seconds=0))
    aqi_service._cache_set("air:25.4,81.8", air)
    monkeypatch.setattr(aqi_service, "fetch_air", lambda *_a: (_ for _ in ()).throw(RuntimeError("down")))
    monkeypatch.setattr(aqi_service, "fetch_weather", lambda *_a: (_ for _ in ()).throw(RuntimeError("down")))
    stale = aqi_service.get_current(25.4, 81.8)
    assert stale["stale"]
    monkeypatch.setattr(aqi_service, "_CACHE", aqi_service.TTLCache(maxsize=1, ttl_seconds=0))
    aqi_service._cache_set("air:1,1", air)
    aqi_service._cache_set("stations:1,1", air)
    monkeypatch.setattr(aqi_service, "fetch_air", lambda *_a: (_ for _ in ()).throw(RuntimeError("down")))
    with pytest.raises(RuntimeError, match="provider unavailable"):
        aqi_service._air_fetch_with_cache(1, 1)

    hourly = air["hourly"]
    parsed = [aqi_service._parse_dt(value) for value in hourly["time"]]
    assert aqi_service._rolling_mean_at(hourly, "pm2_5", 99, hourly["time"], parsed, 24) is None
    assert aqi_service._rolling_mean_at(hourly, "pm2_5", 0, hourly["time"], [None] * len(parsed), 24) is None
    assert aqi_service._forecast_entry(hourly, 0, hourly["time"][0], hourly["time"], parsed)["time"]
    bad_hourly = {"time": hourly["time"], "pm2_5": [None] * len(hourly["time"])}
    assert aqi_service._forecast_series(bad_hourly, bad_hourly["time"], parsed, None, 1)
    aqi_service.reset_cache()


def test_community_service_helpers_and_collections(client, monkeypatch):
    database.reset_memory_store()
    community_service.ensure_seeded()
    users.insert_one({"_id": "u1", "name": "Asha Sharma", "preferences": {"share_aggregate": True, "leaderboard_opt_in": True}})
    users.insert_one({"_id": "u2", "name": "Single", "preferences": {"share_aggregate": False, "leaderboard_opt_in": False}})
    today = datetime.now(UTC).date().isoformat()
    impact_records.insert_one({"user_id": "u1", "date": today, "avoided_kg": 20, "activity_type": "journey"})
    impact_records.insert_one({"user_id": "u2", "date": today, "avoided_kg": 100, "activity_type": "journey"})
    indoor_assessments.insert_one({"user_id": "u1", "created_at": datetime.now(UTC)})

    assert community_service._request_cache() is None
    with client.application.test_request_context("/"):
        assert community_service._request_cache() is not None
        assert community_service._load_collection(users)
        assert community_service._load_collection(users)
        community_service._invalidate_collection_cache()

    class Broken:
        name = "broken"

        def find(self, _query):
            raise RuntimeError("down")

    assert community_service._load_collection(Broken()) == []
    monkeypatch.setattr(community_service.challenges, "insert_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    monkeypatch.setattr(community_service.challenges, "find_one", lambda *_a, **_k: None)
    community_service.ensure_seeded()
    monkeypatch.undo()

    assert community_service._display_name({"name": "Asha Sharma"}) == "Asha S."
    assert community_service._display_name({}) == "Member"
    assert community_service._to_dt("2026-01-01") is not None
    assert community_service._to_dt("bad") is None
    assert not community_service._date_in_window("", None, None)
    assert not community_service._date_in_window("bad", None, None)
    assert community_service._parse_record_date("bad") is None
    assert community_service._category_matches_record(None, {})
    assert community_service._category_matches_record("mobility", {})
    assert community_service._category_matches_record("food", {"category": "food"})
    assert community_service._category_matches_record("indoor_air", {"activity_type": "indoor_air"})
    assert community_service._category_matches_record("other", {"category": "other"})

    users_map = community_service._users_by_id()
    totals = community_service._totals_by_user(users_map, True, True)
    assert totals == {"u1": 20.0}
    assert community_service._member_count(users_map, True) == 1
    assert [community_service._score_label(value) for value in (90, 70, 40, 10)] == [
        "Leading", "Strong", "Building", "Emerging"]
    challenge = {"id": "window-smart", "category": "indoor_air", "starts_at": None, "ends_at": None}
    assert community_service._challenge_checkins("u1", challenge, None, None) == 1
    challenge = {"id": "clean-commute-week", "category": "mobility", "starts_at": None, "ends_at": None}
    assert community_service._challenge_checkins("u1", challenge, None, None) == 1

    monkeypatch.setattr(community_service, "personal_summary", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    stats = community_service.stats("u1")
    assert stats["your_avoided_kg"] == 0.0
    monkeypatch.undo()

    assert community_service.leaderboard("u1", "bad", "bad")["page"] == 1
    assert community_service.leaderboard("u1", 99, 2)["entries"] == []


def test_community_service_challenge_join_and_progress(client, monkeypatch):
    database.reset_memory_store()
    community_service.ensure_seeded()
    users.insert_one({"_id": "u1", "name": "Asha"})
    with pytest.raises(LookupError):
        community_service.join_challenge("u1", "missing")
    joined = community_service.join_challenge("u1", "clean-commute-week")
    assert joined["challenge"]["joined"]

    def fail_insert(*_args, **_kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(community_service.challenge_members, "insert_one", fail_insert)
    monkeypatch.setattr(community_service.challenge_members, "find_one", lambda *_a, **_k: {"challenge_id": "clean-commute-week"})
    assert community_service.join_challenge("u1", "clean-commute-week")["challenge"]
    monkeypatch.setattr(community_service.challenge_members, "find_one", lambda *_a, **_k: None)
    with pytest.raises(RuntimeError):
        community_service.join_challenge("u1", "clean-commute-week")
    monkeypatch.undo()

    indoor = {"id": "window-smart", "category": "indoor_air", "target_kg": 0, "starts_at": None, "ends_at": None}
    indoor_assessments.insert_one({"user_id": "u1", "created_at": datetime.now(UTC)})
    challenge_members.insert_one({"challenge_id": "window-smart", "user_id": "u1"})
    entry = community_service.list_challenges("u1")["challenges"]
    assert any(item["id"] == "window-smart" for item in entry)
    monkeypatch.setattr(community_service.challenge_members, "update_one", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("down")))
    community_service._indoor_challenge_progress(indoor, {"u1"}, None, None, [], None)
    monkeypatch.undo()

    challenge = {"id": "x", "category": "mobility", "target_kg": 0, "starts_at": None, "ends_at": None}
    item, _assessments = community_service._challenge_item(challenge, {}, {}, {}, [], datetime.now(UTC))
    assert item["days_left"] is None and item["progress_pct"] == 0


def test_config_and_database_remaining_branches(monkeypatch):
    monkeypatch.setenv("BOOST_BOOL", "YES")
    assert config_module._boolean("BOOST_BOOL") is True
    monkeypatch.setenv("BOOST_BOOL", "0")
    assert config_module._boolean("BOOST_BOOL") is False
    monkeypatch.setattr(database, "_runtime", {"backend": "supabase", "url": "", "options": {}})
    assert database._connect_supabase_with_retry() == "unconfigured"

    class BrokenPool:
        def close(self):
            raise RuntimeError("close failed")

    broken = BrokenPool()
    monkeypatch.setattr(database, "_pool", broken, raising=False)
    monkeypatch.setattr(database, "_connect_state", {"failures": 0, "next_retry_at": 0.0})
    database._close_failed_pool()
    assert database._pool is None
    assert database._connect_state["failures"] == 1

    statement, args = database._append_fetch_sort(sql.SQL("select 1"), [], [("_id", -1)])
    assert statement is not None
    assert args == []
    monkeypatch.setattr(
        database,
        "connect",
        lambda: (_ for _ in ()).throw(database.StorageUnavailable("down")),
    )
    assert database.storage_mode() == "unavailable"


def test_extensions_and_utility_remaining_branches(monkeypatch):
    assert token_denylist.is_revoked(None) is False
    assert extensions_module.check_password("pw", "") is False
    assert http_utils.iso(None) is None
    assert http_utils.iso(datetime(2026, 1, 1, 12)) == "2026-01-01T12:00:00Z"
    assert http_utils.iso("2026-01-01") == "2026-01-01"
    monkeypatch.setattr(http_utils, "verify_jwt_in_request", lambda: None)
    monkeypatch.setattr(http_utils, "get_jwt_identity", lambda: None)
    with app_module.app.test_request_context("/"):
        assert http_utils.require_auth(lambda _user: "ok")()[1] == 401

    assert validation_utils.parse_bool(1) is True
    assert validation_utils.parse_bool(0) is False
    assert validation_utils.ensure_json_object(None, lambda _msg, _status: {"error": "bad"}) == (
        None,
        {"error": "bad"},
    )
    with pytest.raises(ValueError, match="ISO"):
        validation_utils.validate_iso_date(123)
    with pytest.raises(ValueError, match="range"):
        validation_utils.validate_iso_date("1800-01-01")
    with app_module.app.test_request_context("/"):
        assert validation_utils.validate_coordinates("bad", 0)[2] is not None
        assert validation_utils.validate_coordinates(0, "bad")[2] is not None


def test_app_configuration_helpers(monkeypatch):
    probe = Flask("probe")
    probe.config.update(TESTING=False, FLASK_ENV="development", JWT_SECRET_KEY="short")
    monkeypatch.setattr(app_module, "USING_GENERATED_SECRET", True)
    app_module._validate_production_config(probe)
    probe.config["FRONTEND_URL"] = "https://airaware.test/"
    app_module._configure_cors(probe)
    monkeypatch.setattr(database, "connect", lambda: (_ for _ in ()).throw(database.StorageUnavailable("down")))
    app_module._configure_services(probe)
    assert probe.extensions["flask-jwt-extended"] is not None


def test_app_error_handler_callables(app_context):
    handlers = app_module.app.error_handler_spec[None][None]
    assert handlers[PyJWTError](RuntimeError("bad token"))[1] == 401
    assert handlers[database.StorageUnavailable](database.StorageUnavailable("down"))[1] == 503
    assert handlers[gemini_service.GeminiUnavailable](gemini_service.GeminiUnavailable("down"))[1] == 503
    handler_500 = next(iter(app_module.app.error_handler_spec[None][500].values()))
    assert handler_500(RuntimeError("boom"))[1] == 500
    assert handlers[Exception](RuntimeError("boom"))[1] == 500
    with app_module.app.test_request_context("/"):
        rate = app_module.app.error_handler_spec[None][429][RateLimitExceeded]
        response = rate(SimpleNamespace(retry_after=7))
        assert response.status_code == 429
        assert response.headers["Retry-After"] == "7"


def test_invalid_token_uses_jwt_invalid_loader(client):
    response = client.get("/api/community/stats", headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401
    assert "invalid" in response.get_json()["error"].lower()


def test_app_script_entrypoint(monkeypatch):
    calls = {}
    monkeypatch.setattr(app_module.Flask, "run", lambda _self, **kwargs: calls.update(kwargs))
    monkeypatch.setenv("FLASK_DEBUG", "yes")
    backend_dir = Path(__file__).resolve().parent.parent
    runpy.run_path(str(backend_dir / "app.py"), run_name="__main__")
    assert calls == {"host": "127.0.0.1", "port": 5000, "debug": True}
    calls.clear()
    runpy.run_path(str(backend_dir / "main.py"), run_name="__main__")
    assert calls == {"host": "127.0.0.1", "port": 5000, "debug": True}


def test_gemini_client_initialization_and_v1beta_fallback(monkeypatch):
    monkeypatch.setattr(gemini_service, "_runtime", {"api_key": "k", "model": "m", "timeout": 0.001})
    monkeypatch.setattr(gemini_service, "_client", None)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    assert gemini_service._get_client() is not None
    assert gemini_service.is_enabled()
    first = gemini_service._client
    assert gemini_service._get_client() is first

    monkeypatch.setattr(genai_module, "Client", lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("bad")))
    gemini_service._client = None
    gemini_service._client_failed = False
    assert gemini_service._get_client() is None
    assert gemini_service._client_failed

    class FakeConfig:
        def __init__(self, **kwargs):
            if "http_options" in kwargs:
                raise RuntimeError("v1beta unsupported")

    class Schema(BaseModel):
        title: str

    generated = SimpleNamespace(text='{"title":"x"}')
    fake_client = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_kwargs: generated))
    monkeypatch.setattr(gemini_service, "_client", fake_client)
    monkeypatch.setattr(gemini_service, "_client_failed", False)
    types_module = sys.modules["google.genai"]
    monkeypatch.setattr(types_module, "GenerateContentConfig", FakeConfig, raising=False)
    assert gemini_service._generate_json("prompt", Schema) == {"title": "x"}

    chat_response = SimpleNamespace(text='{"reply":"ok","sources":[],"suggested_questions":[]}')
    monkeypatch.setattr(gemini_service, "_client", SimpleNamespace(models=SimpleNamespace(generate_content=lambda **_k: chat_response)))
    assert gemini_service.chat("hello")["reply"] == "ok"

    def raise_unavailable(**_kwargs):
        raise gemini_service.GeminiUnavailable("nope")

    monkeypatch.setattr(gemini_service, "_client", SimpleNamespace(models=SimpleNamespace(generate_content=raise_unavailable)))
    with pytest.raises(gemini_service.GeminiUnavailable):
        gemini_service.chat("hello")


def test_impact_calculator_remaining_branches(monkeypatch):
    database.configure(SimpleNamespace(DB_BACKEND="memory", SUPABASE_DB_URL="", MAX_FETCH_LIMIT=100))
    database.reset_memory_store()
    assert impact_calculator.normalize_profile({"waste": "recycle"}) is not None
    with pytest.raises(ValueError, match="distance_km"):
        impact_calculator._validate_journey({"distance_km": "bad"})
    with pytest.raises(ValueError, match="baseline_mode"):
        impact_calculator._validate_journey({"distance_km": 5, "baseline_mode": "bad"})
    with pytest.raises(ValueError, match="actual_mode"):
        impact_calculator._validate_journey({"distance_km": 5, "baseline_mode": "metro", "actual_mode": "bad"})

    profile = {
        "transport": {"commute_distance_km": 10, "commute_days_per_week": 5},
        "home": {"cooking_fuel": "electricity", "household_size": 2},
        "food": {"diet": "mixed"},
        "waste": "composts",
    }
    result = impact_calculator.monthly_footprint(profile)
    assert result["total_kg_per_month"] >= 0
    assert impact_calculator._transport_opportunities({"commute_distance_km": 10, "commute_days_per_week": 5}, "car_petrol")
    assert impact_calculator._transport_opportunities({"commute_distance_km": 10, "commute_days_per_week": 0}, "car_petrol") == []

    today = datetime.now(UTC).date().isoformat()
    impact_records.insert_one(
        {"_id": "r1", "user_id": "u", "date": today, "created_at": datetime.now(UTC), "avoided_kg": 2}
    )
    real_find = impact_records.find
    calls = []

    def flaky_find(query):
        calls.append(query)
        if len(calls) == 1:
            raise RuntimeError("down")
        return real_find(query)

    monkeypatch.setattr(impact_records, "find", flaky_find)
    assert impact_calculator.personal_summary("u")["period_days"] == 30
    monkeypatch.undo()
    assert impact_calculator.history("u", "bad", "bad")["page"] == 1
    monkeypatch.setattr(impact_records, "count_documents", lambda *_a: (_ for _ in ()).throw(RuntimeError("down")))
    fallback = impact_calculator.history("u", 1, 8)
    assert fallback["records"][0]["id"] == "r1"
    assert isinstance(fallback["records"][0]["created_at"], str)


def test_recommendation_engine_remaining_branches(monkeypatch):
    assert recommendation_engine._aqi_band(None) == "unknown"
    assert recommendation_engine._alert(None) is None
    assert recommendation_engine._alert(301)["level"] == "severe"
    assert recommendation_engine._alert(201)["level"] == "high"
    assert recommendation_engine._alert(151)["level"] == "elevated"
    assert recommendation_engine._context_numbers(1.0) >= {"1.0"}
    assert recommendation_engine._context_numbers({"a": 1}) == {"1"}
    assert recommendation_engine._context_numbers([1, 2]) == {"1", "2"}
    assert recommendation_engine._safe_text("orig", "", {"orig"}) == "orig"
    assert recommendation_engine._safe_text("orig", "bad 9", {"1"}) == "orig"
    assert recommendation_engine._plan_title("good").startswith("Good")
    actions = [{"id": "a", "detail": "old detail", "why": "old why"}]
    title, summary = recommendation_engine._enhanced_plan_text(
        "Good air today - make the most of it",
        "US AQI is 162 today",
        {"title": "Good air today - make the most of it", "summary": "US AQI is 162 today",
         "actions": [{"id": "a", "detail": "new detail", "why": "new why"}]},
        {"aqi": 162},
        actions,
    )
    assert title.startswith("Good")
    assert summary.startswith("US AQI")
    assert actions[0]["detail"] == "new detail"
    monkeypatch.setattr(gemini_service, "is_enabled", lambda: False)
    with pytest.raises(gemini_service.GeminiUnavailable):
        recommendation_engine.build_plan({"aqi": 20}, {})


def test_indoor_engine_remaining_branches():
    assert indoor_engine._flag(" YES ") is True
    assert indoor_engine._flag(None) is False
    assert indoor_engine._outdoor_aqi({"outdoor_aqi": "bad"}, None) is None
    score, fixes = indoor_engine._score_outdoor_exposure(50, [], {"purifier": "no", "hours_home_outdoors": "bad"}, 200)
    assert score == 42 and fixes
    score, fixes = indoor_engine._score_outdoor_exposure(50, [], {"purifier": False, "hours_home_outdoors": "6"}, 200)
    assert score == 38 and len(fixes) == 2

