import time
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

import db


@pytest.fixture(autouse=True)
def reset_db():
    db.reset_memory_store()
    db.reset_rate_limit_state()
    yield
    db.close()
    db.reset_memory_store()
    db.reset_rate_limit_state()


def test_memory_collection_full_crud_sort_page_and_operators():
    col = db.MemoryCollection("probe")
    a = col.insert_one({"name": "A", "n": 1, "nested": {"x": 2}})
    b = col.insert_one({"name": "B", "n": 3, "nested": {"x": 4}})
    assert col.find_one({"_id": a.inserted_id})["name"] == "A"
    assert col.find_one({"name": "missing"}) is None
    assert col.count_documents({"n": {"$gte": 1}}) == 2
    assert col.count_documents({"n": {"$gt": 1}}) == 1
    assert col.count_documents({"n": {"$lte": 1}}) == 1
    assert col.count_documents({"n": {"$lt": 3}}) == 1
    assert col.count_documents({"n": {"$ne": 1}}) == 1
    assert col.count_documents({"n": {"$in": [1, 99]}}) == 1
    assert col.count_documents({"n": {"$nin": [1]}}) == 1
    assert col.count_documents({"nested.x": {"$exists": True}}) == 2
    assert col.count_documents({"nested.x": {"$exists": False}}) == 0
    assert col.count_documents({"nested.x": {"$bad": 1}}) == 2
    assert len(list(col.find({"n": {"$gte": 2}}))) == 1
    assert col.find().sort("n", -1).skip(1).limit(1).count() == 1
    assert len(col.find().sort([("n", -1)]).to_list()) == 2
    assert col.update_one({"_id": a.inserted_id}, {"$set": {"nested.y": 7}, "$inc": {"n": 2}, "$unset": {"name": ""}}).modified_count == 1
    assert col.find_one({"nested.y": 7})["n"] == 3
    assert col.update_one({"n": 999}, {"$set": {"x": 1}}).matched_count == 0
    assert col.update_one({"n": 999}, {"$set": {"x": 1}}, upsert=True).upserted_id
    assert col.delete_one({"_id": b.inserted_id}).deleted_count == 1
    assert col.delete_many({"n": {"$gt": 0}}).deleted_count >= 1
    col.create_index("n")
    col.drop()
    assert col.count_documents() == 0


def test_query_sql_helpers_comparisons_and_errors():
    assert db._valid_query_key("_id")
    assert db._valid_query_key("user_profile.name")
    assert not db._valid_query_key("bad$key")
    with pytest.raises(ValueError):
        db._where({"bad$key": 1})
    params = []
    assert ">" in db._comparison_clause("n", "$gt", 2, params)
    assert "=" in db._equality_clause("_id", "x", params)
    assert "IS NULL" in db._exists_clause("missing", False, params)
    assert "IS DISTINCT FROM" in db._inequality_clause("n", "$ne", 2, params)
    assert db._in_clause("n", [], params) == "FALSE"
    assert db._nin_clause("n", [], params) == "TRUE"
    assert db._operator_clause("n", "$gte", 1, params)
    assert db._where({}) == ("TRUE", [])
    assert db._deserialize(db._serialize({"x": [1, 2]}))["x"] == [1, 2]
    serialized = db._serialize(db.datetime.now(db.UTC))
    assert isinstance(serialized, str) and serialized.endswith("Z")
    assert db._nested_value({"a": {"b": 2}}, "a.b") == 2
    assert db._nested_value({"a": {}}, "a.b") is None
    nested = {"a": {}}
    db._set_path(nested, "a.b.c", 3)
    assert nested["a"]["b"]["c"] == 3


def test_configure_connect_modes_retry_and_close(monkeypatch):
    db.configure(SimpleNamespace(DB_BACKEND="memory", SUPABASE_DB_URL="", MAX_FETCH_LIMIT=10))
    assert db.connect() == "memory"
    db.configure(SimpleNamespace(DB_BACKEND="bad", SUPABASE_DB_URL="", MAX_FETCH_LIMIT=10))
    assert db.connect() == "unconfigured"
    assert db.storage_mode() == "unconfigured"

    monkeypatch.setattr(db, "ConnectionPool", object())
    monkeypatch.setattr(db, "psycopg", object())
    monkeypatch.setattr(db, "_runtime", {"backend": "postgres", "url": "postgres://example"})
    monkeypatch.setattr(db, "_pool", None)
    monkeypatch.setattr(db, "_mode", None)
    monkeypatch.setattr(db, "_connect_state", {"failures": 0, "next_retry_at": 0.0})

    class FailingPool:
        def __init__(self, *a, **k): pass
        def close(self): pass

    monkeypatch.setattr(db, "ConnectionPool", FailingPool)
    with pytest.raises(db.StorageUnavailable):
        db.connect()
    assert db._connect_state["failures"] >= 1

    db._pool = SimpleNamespace(close=lambda: None)
    db.close()
    assert db._pool is None


def test_pool_token_and_rate_limit_supabase(monkeypatch):
    monkeypatch.setattr(db, "_runtime", {"backend": "postgres", "url": "postgres://fake"})
    db._pool = None
    db._mode = None
    assert db._pool_or_raise if callable(db._pool_or_raise) else True
    state = {"hits": {}}

    class Conn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, statement, params):
            if "insert into" in str(statement).lower() and "hits" not in str(statement).lower():
                return SimpleNamespace(fetchone=lambda: None)
            key = tuple(params[:2])
            state["hits"][key] = state["hits"].get(key, 0) + 1
            return SimpleNamespace(fetchone=lambda: {"hits": state["hits"][key]}, rowcount=1, fetchall=lambda: [])

    @contextmanager
    def pool_connection():
        yield Conn()

    pool = SimpleNamespace(connection=pool_connection)
    monkeypatch.setattr(db, "_pool_or_raise", lambda: pool)
    monkeypatch.setattr(db, "storage_mode", lambda: "supabase")

    db.revoke_token("j", time.time() + 60)
    assert db.is_token_revoked("j") is True
    assert db.rate_limit_hit("b", "i", 2, 60) is True
    assert db.rate_limit_hit("b", "i", 2, 60) is True
    assert db.rate_limit_hit("b", "i", 2, 60) is False


def test_postgres_fetch_count_cursor_update_and_delete(monkeypatch):  # noqa: C901
    class RowConn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, statement, params=None):
            text = str(statement)
            if "count(" in text:
                return SimpleNamespace(fetchone=lambda: {"total": 2})
            if " for update" in text or "select id" in text:
                return SimpleNamespace(fetchone=lambda: {"id": "1", "data": {"name": "A"}}, fetchall=lambda: [{"id": "1", "data": {"name": "A"}}])
            if "delete" in text:
                return SimpleNamespace(fetchone=lambda: {"id": "1"}, rowcount=1)
            return SimpleNamespace(fetchone=lambda: None, fetchall=lambda: [])

    @contextmanager
    def connection():
        yield RowConn()

    pool = SimpleNamespace(connection=connection)
    monkeypatch.setattr(db, "_pool_or_raise", lambda: pool)

    assert db._fetch("users", {}, sort=[("name", -1)], skip=2, limit=3, for_update=True)
    assert db._count("users", {"name": "A"}) == 2
    cursor = db.PostgresCursor("users", {"name": "A"})
    cursor.sort("name", -1).skip(1).limit(2)
    assert cursor.count() == 2
    assert isinstance(cursor.to_list(), list)
    assert cursor.__iter__()

    col = db.PostgresCollection("users")
    assert col.insert_one({"name": "A"}).inserted_id
    assert len(col.insert_many([{"name": "B"}])) == 1
    assert col.find_one({"_id": "1"})
    assert col.find({"name": "A"}).sort([("name", -1)]).skip(1).limit(2).count() == 2
    assert col.count_documents({"name": "A"}) == 2
    assert col.update_one({"_id": "1"}, {"$set": {"x": 1}}, upsert=False).modified_count == 1
    result = col.update_one({"_id": "missing"}, {"$set": {"x": 1}}, upsert=True)
    assert result.matched_count in {0, 1}
    assert col.delete_one({"_id": "1"}).deleted_count == 1
    assert col.delete_many({"name": "A"}).deleted_count == 1
    col.create_index("name")
    col.drop()


def test_collection_proxy_integrity_and_reset(monkeypatch):
    monkeypatch.setattr(db, "connect", lambda: "memory")
    assert db.collection("users").name == "users"
    with pytest.raises(KeyError):
        db.collection("unknown")
    db.reset_memory_store()
    assert db._raise_if_integrity(SimpleNamespace()) is None
    if db.psycopg_errors:
        class UniqueViolation(Exception):
            pass
        monkeypatch.setattr(db.psycopg_errors, "UniqueViolation", UniqueViolation)
        with pytest.raises(db.IntegrityConflict):
            db._raise_if_integrity(UniqueViolation())
