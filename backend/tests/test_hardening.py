import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module
import db as database
from config import TestConfig
from db import IntegrityConflict
from extensions import limiter, token_denylist, users


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
        json={"name": "Security Tester", "email": "security@airaware.app", "password": "testpass123"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def test_security_headers_on_health(client):
    response = client.get("/api/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers.get("X-Request-ID")


def test_cors_allows_only_configured_origins(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"

    blocked = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in blocked.headers


def test_logout_revokes_access_token(client):
    headers = auth_headers(client)
    assert client.get("/api/profile", headers=headers).status_code == 200

    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    denied = client.get("/api/profile", headers=headers)
    assert denied.status_code == 401


def test_duplicate_registration_returns_409(client, monkeypatch):
    def conflict(_document):
        raise IntegrityConflict("Duplicate record.")

    monkeypatch.setattr(users, "insert_one", conflict)
    response = client.post(
        "/api/auth/register",
        json={"name": "Duplicate", "email": "duplicate@airaware.app", "password": "testpass123"},
    )
    assert response.status_code == 409


def test_deleted_user_cannot_use_existing_token(client):
    headers = auth_headers(client)
    users.delete_one({"email": "security@airaware.app"})
    denied = client.get("/api/profile", headers=headers)
    assert denied.status_code == 401


def test_production_requires_explicit_jwt_secret(monkeypatch):
    monkeypatch.setattr(app_module, "USING_GENERATED_SECRET", True)
    monkeypatch.setattr(app_module.Config, "FLASK_ENV", "production")
    prod_config = type(
        "ProductionLikeConfig",
        (TestConfig,),
        {"TESTING": False, "FLASK_ENV": "production", "JWT_SECRET_KEY": "too-short"},
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        app_module.create_app(prod_config)


def test_login_is_rate_limited():
    database.reset_memory_store()
    limiter.reset()
    limited_config = type(
        "LimitedConfig",
        (TestConfig,),
        {"RATELIMIT_ENABLED": True, "RATELIMIT_DEFAULT": None, "RATELIMIT_STORAGE_URI": "memory://"},
    )
    limited = app_module.create_app(limited_config)
    limited.config.update(TESTING=True)
    client = limited.test_client()
    statuses = [
        client.post(
            "/api/auth/login",
            json={"email": "nobody@airaware.app", "password": "wrongpass123"},
        ).status_code
        for _ in range(6)
    ]
    assert statuses[:5] == [401] * 5
    assert statuses[5] == 429
    limiter.reset()


def test_postgres_table_identifier_is_schema_qualified():
    assert database.TABLE == "public.airaware_documents"
    assert (
        database.sql.Identifier(database.TABLE_SCHEMA, database.TABLE_NAME).as_string(None)
        == '"public"."airaware_documents"'
    )
    assert "sql.Identifier(TABLE)" not in Path(database.__file__).read_text()
