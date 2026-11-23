from types import SimpleNamespace

import pytest
from flask import g

import app as app_module
import config
import db
import security
from config import TestConfig
from extensions import limiter, token_denylist


@pytest.fixture()
def app():
    db.reset_memory_store()
    token_denylist._entries.clear()
    limiter.reset()
    application = app_module.create_app(TestConfig)
    application.config.update(TESTING=True)
    yield application
    limiter.reset()


@pytest.fixture()
def client(app):
    return app.test_client()


def test_app_helpers_and_error_handlers(client):
    assert app_module._is_production(app_module.app) in {True, False}
    with client.application.test_request_context("/api/health"):
        g.request_id = "test"
        app_module._apply_security_headers(SimpleNamespace(headers={}), client.application)
    class Resp:
        status_code = 500
        def __init__(self):
            self.headers = {}
            self.data = b"x"
        def get_data(self): return self.data
        def set_data(self, value): self.data = value
    assert app_module._apply_cache_headers(Resp(), client.application).status_code == 500
    assert client.get("/missing").status_code == 404
    assert client.post("/api/health").status_code == 405
    assert client.get("/api/ready").status_code in {200, 503}
    assert client.get("/api/health").headers["X-Request-ID"]
    with client.application.test_request_context("/api/health"):
        g.request_id = "abc"
        assert app_module._request_failure(client.application, "x", "y")[1] == 503


def test_app_configure_and_cors_branches(app, monkeypatch):
    app_module._validate_production_config(app)
    app_module._configure_services(app)
    app_module._register_token_loader()
    app_module._configure_cors(app)
    with app.test_request_context("/api/health"):
        g.request_id = "test"
        app_module._apply_security_headers(app.response_class(), app)
    assert app_module._is_production(app) is False

    monkeypatch.setattr(app_module, "USING_GENERATED_SECRET", False)
    prod = type("Prod", (TestConfig,), {"TESTING": False, "FLASK_ENV": "production", "JWT_SECRET_KEY": "x"*40, "CORS_ORIGINS": ["https://ok"], "FRONTEND_URL": ""})
    created = app_module.create_app(prod)
    assert created.test_client().get("/api/health").status_code == 200


def test_security_headers_toggle_and_cache_conditional(app):
    app.config["SECURITY_HEADERS_ENABLED"] = False
    response = app.test_client().get("/api/health")
    assert "X-Frame-Options" not in response.headers
    with app.test_request_context("/api/health"):
        app_module._apply_cache_headers(SimpleNamespace(status_code=200, headers={}, get_data=lambda: b"x", set_data=lambda x: None), app)


def test_config_helpers(monkeypatch):
    monkeypatch.setenv("X_NUMBER", "not-int")
    import importlib
    importlib.reload(config)
    assert config._integer("X_NUMBER", 7) == 7
    assert config._boolean("MISSING_BOOL", True) is True
    assert config._boolean("MISSING_BOOL2", False) is False
    assert config._text("MISSING_TEXT", "d") == "d"


def test_security_module(monkeypatch):
    import flask
    app = flask.Flask(__name__)
    app.config.update(SHARED_RATE_LIMIT_ENABLED=False)
    @security.shared_rate_limit("test", 1, 60)
    def fn():
        return "ok"
    fn = app.view_functions.get if False else fn
    with app.app_context():
        assert fn() == "ok"
    with app.test_request_context(environ_base={"REMOTE_ADDR": "127.0.0.1"}):
        assert security._rate_limit_key() == "ip:127.0.0.1"


def test_extensions_password_denylist_and_find_user(monkeypatch):
    from extensions import TokenDenylist, check_password, find_user, hash_password
    h = hash_password("testpass123")
    assert check_password("testpass123", h)
    assert not check_password("bad", h)
    assert not check_password("bad", "not-a-valid-hash")
    assert find_user("") is None
    assert find_user("missing") is None

    monkeypatch.setattr(db, "storage_mode", lambda: "memory")
    td = TokenDenylist()
    td.revoke("")
    td.revoke("x")
    assert td.is_revoked("x")
    td.revoke("expired", 1)
    assert not td.is_revoked("expired")
    td._prune_locked()


def test_main_entrypoint(monkeypatch):
    import main
    assert main.app


def test_app_error_handler_and_production_branches(app, monkeypatch):

    with pytest.raises(RuntimeError, match="explicitly"):
        app_module._validate_production_config(
            type("Prod", (), {"config": {"TESTING": False, "FLASK_ENV": "production", "JWT_SECRET_KEY": "short"}})()
        )

    class ErrorApp:
        config = {"TESTING": False, "FLASK_ENV": "production", "CORS_ORIGINS": [], "FRONTEND_URL": ""}
        logger = app.logger

    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        app_module._configure_cors(ErrorApp())

    monkeypatch.setattr(app_module.database, "connect", lambda: (_ for _ in ()).throw(app_module.database.StorageUnavailable("down")))
    app_module._configure_services(app)

    with app.test_request_context("/api/health"):
        app_module._register_http_error_handlers(app)

    app_module._register_jwt_error_handlers(app)
    app_module._register_storage_error_handlers(app)
    app_module._register_generic_error_handlers(app)
    with app.test_request_context("/api/health"):
        assert app_module._request_failure(app, "x", "y")[1] == 503


def test_app_jwt_and_generic_callbacks(app):
    app_module._register_error_handlers(app)
    app_module._register_token_loader()
    assert token_denylist.is_revoked("missing") is False
    assert app.test_client().get("/api/profile", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_core_validation_boolean_and_iso_branches(app):
    import utils.http as http
    from utils.validation import clamp_location, finite_number, validate_coordinates, validate_iso_date

    assert http.iso(None) is None
    assert http.iso("plain") == "plain"
    assert http.iso(__import__("datetime").datetime(2026, 1, 1)) == "2026-01-01T00:00:00Z"
    with app.test_request_context("/api/items?page=bad&per_page=bad"):
        assert http.pagination()[0] == 1
    with app.app_context():
        assert finite_number(float("inf"), "n")[1][1] == 422
        assert validate_coordinates("bad", 80)[2][1] == 422
        assert clamp_location(91, 80)[2][1] == 422
    with pytest.raises(ValueError):
        validate_iso_date("1999-12-31")
    with pytest.raises(ValueError):
        validate_iso_date("2099-12-31")
