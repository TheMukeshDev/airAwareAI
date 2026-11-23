from __future__ import annotations

import atexit
import copy
import json
import logging
import threading
import time
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from config import Config

from . import base as _base
from .base import (
    ALLOWED_QUERY_KEYS,
    COLLECTIONS,
    MAX_FETCH_LIMIT,
    MEMORY_OPERATOR_MATCHERS,
    SQL_COMPARISON_OPERATORS,
    SQL_OPERATOR_BUILDERS,
    TABLE,
    TABLE_NAME,
    TABLE_SCHEMA,
    IntegrityConflict,
    RepositoryProtocol,
    StorageUnavailable,
    _append_where_clause,
    _apply_update,
    _comparison_clause,
    _config_value,
    _deserialize,
    _document_matches,
    _equality_clause,
    _exists_clause,
    _expr_for_key,
    _in_clause,
    _inequality_clause,
    _is_operator_expression,
    _is_simple_allowed_key,
    _json,
    _matches,
    _memory_comparison,
    _memory_operator_matches,
    _nested_value,
    _nin_clause,
    _operator_clause,
    _path,
    _serialize,
    _set_path,
    _sql_value,
    _valid_query_key,
    _where,
    set_max_fetch_limit,
    to_oid,
)
from .memory_store import (
    MemoryCollection,
    MemoryCursor,
    MemoryStore,
    _memory_rate_limit_hit,
    _memory_store,
    _rate_limit_lock,
    _rate_limit_memory,
    memory_store,
    reset_memory_store,
    reset_rate_limit_state,
)
from .postgres_store import (
    PostgresCollection,
    PostgresCursor,
    _append_fetch_limit,
    _append_fetch_sort,
    _count,
    _fetch,
    _normalize_sort,
    _raise_if_integrity,
)

try:
    import psycopg
    from psycopg import errors as psycopg_errors
    from psycopg import sql
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool
except ImportError:  # pragma: no cover
    psycopg = None
    psycopg_errors = None
    sql = None
    dict_row = None
    ConnectionPool = None

logger = logging.getLogger(__name__)

_pool = None
_mode = None
_runtime = {"backend": Config.DB_BACKEND, "url": Config.SUPABASE_DB_URL}
_connect_lock = threading.Lock()
_connect_state = {"failures": 0, "next_retry_at": 0.0}

__all__ = [
    "ALLOWED_QUERY_KEYS",
    "COLLECTIONS",
    "ConnectionPool",
    "IntegrityConflict",
    "MAX_FETCH_LIMIT",
    "MEMORY_OPERATOR_MATCHERS",
    "MemoryCollection",
    "MemoryCursor",
    "MemoryStore",
    "PostgresCollection",
    "PostgresCursor",
    "RepositoryProtocol",
    "SQL_COMPARISON_OPERATORS",
    "SimpleNamespace",
    "SQL_OPERATOR_BUILDERS",
    "StorageUnavailable",
    "TABLE",
    "TABLE_NAME",
    "TABLE_SCHEMA",
    "UTC",
    "_append_fetch_limit",
    "_append_fetch_sort",
    "_append_where_clause",
    "_apply_update",
    "_comparison_clause",
    "_config_value",
    "_connect_lock",
    "_connect_state",
    "_count",
    "_deserialize",
    "_document_matches",
    "_equality_clause",
    "_exists_clause",
    "_expr_for_key",
    "_fetch",
    "_in_clause",
    "_inequality_clause",
    "_is_operator_expression",
    "_is_simple_allowed_key",
    "_json",
    "_matches",
    "_memory_comparison",
    "_memory_operator_matches",
    "_memory_rate_limit_hit",
    "_memory_store",
    "_mode",
    "_nested_value",
    "_nin_clause",
    "_normalize_sort",
    "_operator_clause",
    "_path",
    "_pool",
    "_raise_if_integrity",
    "_rate_limit_lock",
    "_rate_limit_memory",
    "_runtime",
    "_serialize",
    "_set_path",
    "_sql_value",
    "_valid_query_key",
    "_where",
    "atexit",
    "close",
    "datetime",
    "collection",
    "configure",
    "connect",
    "copy",
    "dict_row",
    "is_token_revoked",
    "json",
    "logger",
    "memory_store",
    "psycopg",
    "psycopg_errors",
    "rate_limit_hit",
    "reset_memory_store",
    "reset_rate_limit_state",
    "revoke_token",
    "set_max_fetch_limit",
    "sql",
    "storage_mode",
    "threading",
    "time",
    "to_oid",
    "uuid",
]


def configure(config_object):
    """Apply runtime database settings without breaking existing imports."""
    global _pool, _mode, _runtime, _connect_state, MAX_FETCH_LIMIT
    backend = str(_config_value(config_object, "DB_BACKEND", Config.DB_BACKEND)).strip().lower()
    url = str(_config_value(config_object, "SUPABASE_DB_URL", Config.SUPABASE_DB_URL)).strip()
    limit = int(_config_value(config_object, "MAX_FETCH_LIMIT", MAX_FETCH_LIMIT))
    MAX_FETCH_LIMIT = _base.set_max_fetch_limit(limit)
    if backend == _runtime["backend"] and url == _runtime["url"]:
        return
    with _connect_lock:
        if _pool is not None:
            try:
                _pool.close()
            except Exception:
                logger.debug("Failed to close existing pool during reconfigure", exc_info=True)
        _pool = None
        _mode = None
        _runtime = {"backend": backend, "url": url}
        _connect_state = {"failures": 0, "next_retry_at": 0.0}


def _connect_supabase_with_retry():
    if not _runtime["url"] or ConnectionPool is None or psycopg is None:
        global _mode
        _mode = "unconfigured"
        return _mode
    with _connect_lock:
        return _connect_supabase_locked()


def _connect_supabase_locked():
    global _pool, _mode, _connect_state
    if _mode == "supabase" and _pool is not None:
        return _mode
    if time.time() < _connect_state.get("next_retry_at", 0.0):
        raise StorageUnavailable("Supabase Postgres is temporarily unavailable. Please retry shortly.")
    try:
        pool = ConnectionPool(
            conninfo=_runtime["url"],
            min_size=1,
            max_size=5,
            open=True,
            timeout=5,
            kwargs={"row_factory": dict_row, "prepare_threshold": None},
        )
        with pool.connection() as connection:
            connection.execute("select 1")
        _pool = pool
        _mode = "supabase"
        _connect_state = {"failures": 0, "next_retry_at": 0.0}
        return _mode
    except Exception as exc:
        _close_failed_pool()
        raise StorageUnavailable("Supabase Postgres is temporarily unavailable. Please retry shortly.") from exc


def _close_failed_pool():
    global _pool, _mode, _connect_state
    if _pool is not None:
        try:
            _pool.close()
        except Exception:
            logger.debug("Failed to close pool after connection failure", exc_info=True)
    _pool = None
    _mode = None
    failures = min(int(_connect_state.get("failures", 0)) + 1, 6)
    backoff = min(2 ** (failures - 1), 10)
    _connect_state = {"failures": failures, "next_retry_at": time.time() + backoff}


def connect():
    """Connect to the configured backend and return its mode."""
    global _mode
    if _runtime["backend"] == "memory":
        _mode = "memory"
        return _mode
    if _mode == "supabase" and _pool is not None:
        return _mode
    if not _runtime["url"] or ConnectionPool is None or psycopg is None:
        _mode = "unconfigured"
        return _mode
    return _connect_supabase_with_retry()


def close():
    """Close the active Postgres pool and clear the cached mode."""
    global _pool, _mode
    with _connect_lock:
        if _pool is not None:
            try:
                _pool.close()
            except Exception:
                logger.debug("Failed to close pool during shutdown", exc_info=True)
        _pool = None
        _mode = None


atexit.register(close)


def _pool_or_raise():
    mode = connect()
    if mode == "unconfigured" or _pool is None:
        raise StorageUnavailable(
            "Supabase Postgres is not configured. Set SUPABASE_DB_URL in backend/.env."
        )
    if mode != "supabase":
        raise StorageUnavailable("Supabase Postgres is not available.")
    return _pool


def revoke_token(jti, expires_at):
    """Persist a revoked JWT identifier in Postgres."""
    pool = _pool_or_raise()
    with pool.connection() as connection:
        connection.execute(
            sql.SQL(
                "insert into {} (jti, expires_at) values (%s, to_timestamp(%s)) "
                "on conflict (jti) do update set expires_at = excluded.expires_at"
            ).format(sql.Identifier(TABLE_SCHEMA, "airaware_revoked_tokens")),
            [str(jti), float(expires_at)],
        )


def is_token_revoked(jti):
    """Return whether an unexpired revoked JWT identifier exists."""
    pool = _pool_or_raise()
    with pool.connection() as connection:
        row = connection.execute(
            sql.SQL("select 1 from {} where jti = %s and expires_at > now()").format(
                sql.Identifier(TABLE_SCHEMA, "airaware_revoked_tokens")
            ),
            [str(jti)],
        ).fetchone()
    return row is not None


def storage_mode():
    """Return the active storage mode, or ``unavailable`` on connection errors."""
    try:
        return connect()
    except StorageUnavailable:
        return "unavailable"


def rate_limit_hit(bucket, identity, limit, window_seconds):
    """Apply a shared Postgres rate limit, falling back to process-local memory."""
    if storage_mode() != "supabase":
        return _memory_rate_limit_hit(bucket, identity, limit, window_seconds)
    pool = _pool_or_raise()
    statement = sql.SQL(
        "insert into {table} (bucket, identity, window_start, hits) "
        "values (%s, %s, extract(epoch from now())::bigint, 1) "
        "on conflict (bucket, identity) do update set "
        "window_start = case when {table}.window_start + %s <= extract(epoch from now())::bigint "
        "then extract(epoch from now())::bigint else {table}.window_start end, "
        "hits = case when {table}.window_start + %s <= extract(epoch from now())::bigint "
        "then 1 else {table}.hits + 1 end, "
        "updated_at = now() returning hits"
    ).format(table=sql.Identifier(TABLE_SCHEMA, "airaware_rate_limits"))
    with pool.connection() as connection:
        row = connection.execute(
            statement, [str(bucket), str(identity), int(window_seconds), int(window_seconds)]
        ).fetchone()
    return int(row["hits"]) <= int(limit)


class _CollectionProxy:
    def __init__(self, name):
        self.name = name

    def _collection(self):
        mode = connect()
        if mode == "memory":
            return _memory_store[self.name]
        if mode == "supabase":
            return PostgresCollection(self.name)
        raise StorageUnavailable(
            "Supabase Postgres is not configured. Set SUPABASE_DB_URL in backend/.env."
        )

    def __getattr__(self, item):
        return getattr(self._collection(), item)


def collection(name):
    """Return a lazy repository proxy for a known collection name."""
    if name not in COLLECTIONS:
        raise KeyError(f"Unknown collection: {name}")
    return _CollectionProxy(name)
