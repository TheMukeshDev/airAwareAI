import sys
import time
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module
import db as database
from config import Config, TestConfig
from extensions import TokenDenylist, _rate_limit_key, limiter, token_denylist
from routes.map_tiles import TILE_URL

FAKE_KEY = "test-only-key-not-a-secret"


class FakeResponse:
    def __init__(self, status=200, body=b"png-bytes", content_type="image/png"):
        self.status_code = status
        self.headers = {"Content-Type": content_type}
        self._body = body
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.closed = True

    def iter_content(self, chunk_size=8192):
        yield self._body


class FakeGet:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def __call__(self, url, params=None, timeout=None, stream=False):
        self.calls.append({"url": url, "params": params, "timeout": timeout, "stream": stream})
        if self.error:
            raise self.error
        return self.response


@pytest.fixture()
def app(monkeypatch):
    database.reset_memory_store()
    database.reset_rate_limit_state()
    token_denylist._entries.clear()
    limiter.reset()
    monkeypatch.setattr(Config, "CARTO_API_KEY", FAKE_KEY)
    monkeypatch.setattr("services.aqi_service.get_current", lambda *a, **k: {"aqi": 42})
    monkeypatch.setattr("services.aqi_service.get_forecast", lambda *a, **k: {"hourly": []})
    monkeypatch.setattr("services.aqi_service.get_stations", lambda *a, **k: {"stations": []})
    application = app_module.create_app(TestConfig)
    application.config.update(TESTING=True)
    yield application
    limiter.reset()
    token_denylist._entries.clear()
    database.reset_memory_store()
    database.reset_rate_limit_state()


@pytest.fixture()
def client(app):
    return app.test_client()


def auth_headers(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Target Tester", "email": "targets@airaware.app", "password": "testpass123"},
    )
    assert response.status_code == 201, response.get_json()
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def test_tile_route_uses_server_key_and_cache_headers(client, monkeypatch):
    fake = FakeGet(FakeResponse())
    monkeypatch.setattr("routes.map_tiles.requests.get", fake)

    response = client.get("/api/map/tiles/dark_all/3/4/5.png")

    assert response.status_code == 200
    assert response.data == b"png-bytes"
    assert response.headers["Content-Type"] == "image/png"
    assert response.headers["Cache-Control"] == f"public, max-age={Config.CARTO_TILE_CACHE_SECONDS}"
    assert response.headers["ETag"]
    assert fake.calls == [
        {
            "url": "https://a.basemaps.cartocdn.com/dark_all/3/4/5.png",
            "params": {"key": FAKE_KEY},
            "timeout": Config.CARTO_TILE_TIMEOUT_SECONDS,
            "stream": True,
        }
    ]


def test_tile_url_contract(client, monkeypatch):
    assert TILE_URL == "/api/map/tiles/dark_all/{z}/{x}/{y}.png"
    monkeypatch.setattr("routes.map_tiles.requests.get", FakeGet(FakeResponse()))
    assert client.get(TILE_URL.format(z=0, x=0, y=0)).status_code == 200


@pytest.mark.parametrize(
    "path",
    [
        "/api/map/tiles/evil/3/4/5.png",
        "/api/map/tiles/dark_all/21/4/5.png",
        "/api/map/tiles/dark_all/3/8/5.png",
        "/api/map/tiles/dark_all/3/4/8.png",
    ],
)
def test_tile_route_rejects_bad_style_or_coordinates(client, monkeypatch, path):
    fake = FakeGet(FakeResponse())
    monkeypatch.setattr("routes.map_tiles.requests.get", fake)
    assert client.get(path).status_code == 404
    assert fake.calls == []


@pytest.mark.parametrize(
    "fake",
    [
        FakeGet(FakeResponse(status=503)),
        FakeGet(FakeResponse(content_type="text/html")),
        FakeGet(FakeResponse(body=b"x" * 32)),
        FakeGet(error=requests.Timeout("upstream timeout")),
    ],
)
def test_tile_route_maps_upstream_failures_to_502(client, monkeypatch, fake):
    monkeypatch.setattr("routes.map_tiles.requests.get", fake)
    client.application.config["CARTO_TILE_MAX_BYTES"] = 16
    response = client.get("/api/map/tiles/dark_all/1/0/0.png")
    assert response.status_code == 502
    assert "temporarily unavailable" in response.get_json()["error"]


def test_rate_limit_identity_ignores_client_spoofing(app):
    remote = {"REMOTE_ADDR": "192.0.2.10"}
    with app.test_request_context(
        environ_base=remote,
        headers={
            "X-Real-IP": "198.51.100.1",
            "X-Forwarded-For": "198.51.100.2",
        },
    ):
        assert _rate_limit_key() == "ip:192.0.2.10"

    with app.test_request_context(
        environ_base=remote,
        headers={
            "X-Real-IP": "198.51.100.1",
            "X-Forwarded-For": "198.51.100.2",
            "X-Vercel-Forwarded-For": "203.0.113.7, 10.0.0.1",
        },
    ):
        assert _rate_limit_key() == "ip:203.0.113.7"


def test_spoofed_headers_cannot_bypass_login_rate_limit():
    database.reset_memory_store()
    limiter.reset()
    limited_config = type(
        "SpoofLimitedConfig",
        (TestConfig,),
        {"RATELIMIT_ENABLED": True, "RATELIMIT_DEFAULT": None, "RATELIMIT_STORAGE_URI": "memory://"},
    )
    limited = app_module.create_app(limited_config)
    limited.config.update(TESTING=True)
    client = limited.test_client()
    statuses = [
        client.post(
            "/api/auth/login",
            headers={
                "X-Real-IP": f"198.51.100.{index + 1}",
                "X-Forwarded-For": f"203.0.113.{index + 1}",
            },
            json={"email": "nobody@airaware.app", "password": "wrongpass123"},
        ).status_code
        for index in range(6)
    ]
    assert statuses == [401, 401, 401, 401, 401, 429]
    limiter.reset()


def test_shared_denylist_is_visible_to_other_instances(monkeypatch):
    store = {}

    def revoke(jti, expires_at):
        store[jti] = expires_at

    def revoked(jti):
        return store.get(jti, 0) > time.time()

    monkeypatch.setattr(database, "storage_mode", lambda: "supabase")
    monkeypatch.setattr(database, "revoke_token", revoke)
    monkeypatch.setattr(database, "is_token_revoked", revoked)

    first = TokenDenylist()
    second = TokenDenylist()
    first.revoke("shared-jti", time.time() + 60)

    assert second.is_revoked("shared-jti") is True
    first.revoke("expired-jti", time.time() - 1)
    assert second.is_revoked("expired-jti") is False


def test_denylist_memory_fallback_without_supabase(monkeypatch):
    monkeypatch.setattr(database, "storage_mode", lambda: "memory")

    def fail(*_args, **_kwargs):
        raise AssertionError("Postgres denylist must not be used in memory mode")

    monkeypatch.setattr(database, "revoke_token", fail)
    monkeypatch.setattr(database, "is_token_revoked", fail)

    denylist = TokenDenylist()
    denylist.revoke("memory-jti")
    assert denylist.is_revoked("memory-jti") is True


def test_postgres_rate_limit_counter_is_shared(monkeypatch):
    state = {"hits": {}}

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, _statement, params):
            key = (params[0], params[1])
            state["hits"][key] = state["hits"].get(key, 0) + 1
            hits = state["hits"][key]
            return SimpleNamespace(fetchone=lambda: {"hits": hits})

    @contextmanager
    def connection():
        yield Connection()

    monkeypatch.setattr(database, "storage_mode", lambda: "supabase")
    monkeypatch.setattr(database, "_pool_or_raise", lambda: SimpleNamespace(connection=connection))

    assert database.rate_limit_hit("bucket", "ip:203.0.113.9", 2, 60) is True
    assert database.rate_limit_hit("bucket", "ip:203.0.113.9", 2, 60) is True
    assert database.rate_limit_hit("bucket", "ip:203.0.113.9", 2, 60) is False
    assert database.rate_limit_hit("bucket", "ip:203.0.113.10", 2, 60) is True


def test_shared_guard_blocks_high_risk_endpoints(client, monkeypatch):
    headers = auth_headers(client)
    monkeypatch.setattr(database, "rate_limit_hit", lambda *_args: False)

    assert client.post("/api/daily-plan/generate", headers=headers, json={}).status_code == 429
    assert (
        client.post(
            "/api/indoor/assessment",
            headers=headers,
            json={"answers": {"ventilates_daily": True}},
        ).status_code
        == 429
    )
    assert client.get("/api/community/stats", headers=headers).status_code == 429


def test_public_air_quality_cache_headers_and_conditional_get(client):
    response = client.get("/api/air-quality/current")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, max-age=1"
    etag = response.headers["ETag"]
    assert etag

    cached = client.get("/api/air-quality/current", headers={"If-None-Match": etag})
    assert cached.status_code == 304
    assert cached.headers["ETag"] == etag
    assert cached.data == b""


def test_authenticated_air_quality_response_is_private(client):
    headers = auth_headers(client)
    response = client.get("/api/air-quality/current", headers=headers)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, max-age=1"
    assert response.headers["ETag"]


def test_production_cors_guard(monkeypatch):
    monkeypatch.setattr(app_module, "USING_GENERATED_SECRET", False)
    base = {
        "TESTING": False,
        "FLASK_ENV": "production",
        "JWT_SECRET_KEY": "x" * 40,
        "FRONTEND_URL": "",
        "DB_BACKEND": "memory",
        "SUPABASE_DB_URL": "",
    }
    no_origins = type("NoOriginsConfig", (TestConfig,), {**base, "CORS_ORIGINS": []})
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        app_module.create_app(no_origins)

    allowed = type("AllowedConfig", (TestConfig,), {**base, "CORS_ORIGINS": ["https://app.example"]})
    response = app_module.create_app(allowed).test_client().get(
        "/api/health", headers={"Origin": "https://evil.example"}
    )
    assert response.status_code == 200
    assert "Access-Control-Allow-Origin" not in response.headers


def test_fetch_limit_uses_configured_cap(monkeypatch):
    captured = {}

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, _statement, params):
            captured["params"] = params
            return SimpleNamespace(fetchall=lambda: [])

    @contextmanager
    def connection():
        yield Connection()

    monkeypatch.setattr(database, "MAX_FETCH_LIMIT", 7)
    monkeypatch.setattr(database, "_pool_or_raise", lambda: SimpleNamespace(connection=connection))
    database._fetch("users", {})
    assert captured["params"][-2] == 7
