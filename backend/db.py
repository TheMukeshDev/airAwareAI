"""Supabase Postgres access with a memory store reserved for tests."""

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

logger = logging.getLogger(__name__)

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



COLLECTIONS = (
    "users",
    "lifestyle_profiles",
    "air_quality_records",
    "daily_plans",
    "activities",
    "impact_records",
    "indoor_assessments",
    "conversations",
    "challenges",
    "challenge_members",
    "community_stats",
    "notifications",
)

TABLE_SCHEMA = "public"
TABLE_NAME = "airaware_documents"
TABLE = f"{TABLE_SCHEMA}.{TABLE_NAME}"


ALLOWED_QUERY_KEYS = {
    "_id",
    "id",
    "user_id",
    "email",
    "date",
    "challenge_id",
    "location_key",
    "updated_at",
    "created_at",
    "name",
    "observed_at",
    "activity_type",
}

MAX_FETCH_LIMIT = max(1, int(getattr(Config, "MAX_FETCH_LIMIT", 5000)))


class StorageUnavailable(RuntimeError):
    pass


class IntegrityConflict(RuntimeError):
    pass


def to_oid(value):
    return value



def _config_value(config, name, default):
    if hasattr(config, "get"):
        return config.get(name, default)
    return getattr(config, name, default)


def _serialize(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    return value


def _deserialize(value):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            parsed = _deserialize(item)
            if isinstance(parsed, str) and (key.endswith("_at") or key in {"observed_at"}):
                try:
                    parsed = datetime.fromisoformat(parsed.replace("Z", "+00:00"))
                except ValueError:
                    logger.debug("Value %r is not an ISO timestamp; keeping it as text", parsed)
            result[key] = parsed
        return result
    if isinstance(value, list):
        return [_deserialize(item) for item in value]
    return value


def _json(value):
    return json.dumps(_serialize(value), ensure_ascii=False)


def _path(key):
    return key.split(".")


def _is_simple_allowed_key(key):
    return key in ALLOWED_QUERY_KEYS and "." not in key


def _sql_value(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")
    return value


def _expr_for_key(key):
    if key == "_id":
        return "id"
    if _is_simple_allowed_key(key):
        return f"data->>'{key}'"
    return None


SQL_COMPARISON_OPERATORS = {"$gte": ">=", "$gt": ">", "$lte": "<=", "$lt": "<", "=": "="}


def _comparison_clause(key, op, value, params):
    operator = SQL_COMPARISON_OPERATORS[op]
    expr = _expr_for_key(key)
    if expr is not None:
        params.append(_sql_value(value))
        return f"{expr} {operator} %s"
    params.extend([_path(key), _json(value)])
    return f"(data #> %s::text[]) {operator} %s::jsonb"


def _equality_clause(key, expected, params):
    expr = _expr_for_key(key)
    if expr is not None:
        params.append(_sql_value(expected))
        return f"{expr} = %s"
    params.extend([_path(key), _json(expected)])
    return "(data #> %s::text[]) = %s::jsonb"


def _exists_clause(key, value, params):
    expr = _expr_for_key(key)
    suffix = "IS NOT NULL" if value else "IS NULL"
    if expr is not None:
        return f"{expr} {suffix}"
    params.append(_path(key))
    return f"(data #> %s::text[]) {suffix}"


def _inequality_clause(key, op, value, params):
    expr = _expr_for_key(key)
    operator = "IS DISTINCT FROM" if op in {"$ne", "$nin"} else "="
    if expr is not None:
        params.append(_sql_value(value))
        return f"{expr} {operator} %s"
    params.extend([_path(key), _json(value)])
    return f"(data #> %s::text[]) {operator} %s::jsonb"


def _operator_clause(key, op, value, params):
    builder = SQL_OPERATOR_BUILDERS[op]
    return builder(key, value, params)


def _in_clause(key, choices, params):
    if not choices:
        return "FALSE"
    parts = [_equality_clause(key, item, params) for item in choices]
    return "(" + " OR ".join(parts) + ")"


def _nin_clause(key, choices, params):
    clauses = [_inequality_clause(key, "$nin", item, params) for item in choices or ()]
    return " AND ".join(clauses) if clauses else "TRUE"


SQL_OPERATOR_BUILDERS = {
    "$exists": lambda key, value, params: _exists_clause(key, value, params),
    "$gt": lambda key, value, params: _comparison_clause(key, "$gt", value, params),
    "$gte": lambda key, value, params: _comparison_clause(key, "$gte", value, params),
    "$lt": lambda key, value, params: _comparison_clause(key, "$lt", value, params),
    "$lte": lambda key, value, params: _comparison_clause(key, "$lte", value, params),
    "$ne": lambda key, value, params: _inequality_clause(key, "$ne", value, params),
    "$nin": lambda key, value, params: _nin_clause(key, value, params),
    "$in": lambda key, value, params: _in_clause(key, value or [], params),
}


def _where(query):
    clauses = []
    params = []
    for key, expected in (query or {}).items():
        if not isinstance(key, str) or not key:
            continue
        if not _valid_query_key(key):
            raise ValueError("Unsupported query key")
        _append_where_clause(clauses, params, key, expected)
    return (" AND ".join(clauses), params) if clauses else ("TRUE", [])


def _valid_query_key(key):
    if key in ALLOWED_QUERY_KEYS or key == "_id":
        return True
    return all(part.replace("_", "").isalnum() for part in key.split("."))


def _is_operator_expression(expected):
    return (
        isinstance(expected, dict)
        and bool(expected)
        and all(str(op).startswith("$") for op in expected)
    )


def _append_where_clause(clauses, params, key, expected):
    if not _is_operator_expression(expected):
        clauses.append(_equality_clause(key, expected, params))
        return
    for op, value in expected.items():
        builder = SQL_OPERATOR_BUILDERS.get(op)
        if builder is not None:
            clauses.append(builder(key, value, params))


def _nested_value(document, key):
    current = document
    for part in key.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _memory_comparison(current, value, compare):
    return current is not None and compare(current, value)


MEMORY_OPERATOR_MATCHERS = {
    "$in": lambda current, value: current in (value or []),
    "$nin": lambda current, value: current not in (value or []),
    "$ne": lambda current, value: current != value,
    "$exists": lambda current, value: (current is not None) == bool(value),
    "$gte": lambda current, value: _memory_comparison(current, value, lambda a, b: a >= b),
    "$gt": lambda current, value: _memory_comparison(current, value, lambda a, b: a > b),
    "$lte": lambda current, value: _memory_comparison(current, value, lambda a, b: a <= b),
    "$lt": lambda current, value: _memory_comparison(current, value, lambda a, b: a < b),
}


def _memory_operator_matches(current, op, value):
    matcher = MEMORY_OPERATOR_MATCHERS.get(op)
    return matcher(current, value) if matcher is not None else True


def _document_matches(document, key, expected):
    current = _nested_value(document, key)
    if not _is_operator_expression(expected):
        return current == expected
    return all(_memory_operator_matches(current, op, value) for op, value in expected.items())


def _matches(document, query):
    return all(_document_matches(document, key, expected) for key, expected in (query or {}).items())


def _set_path(document, key, value):
    target = document
    parts = key.split(".")
    for part in parts[:-1]:
        branch = target.get(part)
        if not isinstance(branch, dict):
            branch = {}
            target[part] = branch
        target = branch
    target[parts[-1]] = copy.deepcopy(value)


def _apply_update(document, update):
    for key, value in update.get("$set", {}).items():
        _set_path(document, key, value)
    for key, value in update.get("$inc", {}).items():
        target = document
        parts = key.split(".")
        for part in parts[:-1]:
            target = target.setdefault(part, {})
        target[parts[-1]] = (target.get(parts[-1]) or 0) + value
    for key in update.get("$unset", {}):
        document.pop(key, None)
    return document


class MemoryCursor:
    def __init__(self, items):
        self._items = list(items)
        self._skip = 0
        self._limit = None
        self._sort_key = None
        self._sort_dir = 1

    def sort(self, key, direction=-1):
        if isinstance(key, list):
            key, direction = key[0][0], key[0][1]
        self._sort_key = key
        self._sort_dir = direction
        return self

    def skip(self, value):
        self._skip = int(value or 0)
        return self

    def limit(self, value):
        self._limit = int(value)
        return self

    def _resolve(self):
        items = list(self._items)
        if self._sort_key:
            items.sort(
                key=lambda item: (item.get(self._sort_key) is None, item.get(self._sort_key)),
                reverse=self._sort_dir < 0,
            )
        items = items[self._skip :]
        if self._limit is not None:
            items = items[: self._limit]
        return [copy.deepcopy(item) for item in items]

    def __iter__(self):
        return iter(self._resolve())

    def count(self):
        return len(self._resolve())

    def to_list(self):
        return self._resolve()


class MemoryCollection:
    def __init__(self, name):
        self.name = name
        self._documents = []
        self._lock = threading.Lock()

    def _normalize(self, document):
        document = copy.deepcopy(document)
        document.setdefault("_id", uuid.uuid4().hex)
        return document

    def insert_one(self, document):
        with self._lock:
            prepared = self._normalize(document)
            self._documents.append(prepared)
            return SimpleNamespace(inserted_id=prepared["_id"])

    def insert_many(self, documents):
        return [self.insert_one(document) for document in documents]

    def find_one(self, query=None, sort=None):
        query = query or {}
        with self._lock:
            matches = [document for document in self._documents if _matches(document, query)]
        if sort:
            order = sort[0] if isinstance(sort, list) else sort
            matches.sort(
                key=lambda item: (item.get(order[0]) is None, item.get(order[0])),
                reverse=order[1] < 0,
            )
        return copy.deepcopy(matches[0]) if matches else None

    def find(self, query=None):
        with self._lock:
            items = [document for document in self._documents if _matches(document, query or {})]
        return MemoryCursor(items)

    def count_documents(self, query=None):
        with self._lock:
            return len([document for document in self._documents if _matches(document, query or {})])

    def update_one(self, query, update, upsert=False):
        with self._lock:
            for document in self._documents:
                if _matches(document, query):
                    _apply_update(document, update)
                    return SimpleNamespace(modified_count=1, matched_count=1)
            if upsert:
                base = {key: value for key, value in query.items() if not isinstance(value, dict)}
                prepared = self._normalize(base)
                _apply_update(prepared, update)
                self._documents.append(prepared)
                return SimpleNamespace(modified_count=0, matched_count=0, upserted_id=prepared["_id"])
        return SimpleNamespace(modified_count=0, matched_count=0)

    def delete_one(self, query):
        with self._lock:
            for index, document in enumerate(self._documents):
                if _matches(document, query):
                    self._documents.pop(index)
                    return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    def delete_many(self, query=None):
        with self._lock:
            before = len(self._documents)
            self._documents = [
                document for document in self._documents if not _matches(document, query or {})
            ]
            return SimpleNamespace(deleted_count=before - len(self._documents))

    def create_index(self, *args, **kwargs):
        return None

    def drop(self):
        with self._lock:
            self._documents = []


_memory_store = {name: MemoryCollection(name) for name in COLLECTIONS}
_pool = None
_mode = None
_runtime = {"backend": Config.DB_BACKEND, "url": Config.SUPABASE_DB_URL}
_connect_lock = threading.Lock()
_connect_state = {"failures": 0, "next_retry_at": 0.0}
_rate_limit_memory = {}
_rate_limit_lock = threading.Lock()


def configure(config_object):
    global _pool, _mode, _runtime, _connect_state, MAX_FETCH_LIMIT
    backend = str(_config_value(config_object, "DB_BACKEND", Config.DB_BACKEND)).strip().lower()
    url = str(_config_value(config_object, "SUPABASE_DB_URL", Config.SUPABASE_DB_URL)).strip()
    MAX_FETCH_LIMIT = max(1, int(_config_value(config_object, "MAX_FETCH_LIMIT", MAX_FETCH_LIMIT)))
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
    global _pool, _mode, _connect_state
    if not _runtime["url"] or ConnectionPool is None or psycopg is None:
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


def revoke_token(jti, expires_at):
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
    pool = _pool_or_raise()
    with pool.connection() as connection:
        row = connection.execute(
            sql.SQL("select 1 from {} where jti = %s and expires_at > now()").format(
                sql.Identifier(TABLE_SCHEMA, "airaware_revoked_tokens")
            ),
            [str(jti)],
        ).fetchone()
    return row is not None


def _memory_rate_limit_hit(bucket, identity, limit, window_seconds):
    now = time.time()
    key = (str(bucket), str(identity))
    with _rate_limit_lock:
        start, hits = _rate_limit_memory.get(key, (now, 0))
        if now - start >= window_seconds:
            start, hits = now, 0
        hits += 1
        _rate_limit_memory[key] = (start, hits)
    return hits <= int(limit)


def rate_limit_hit(bucket, identity, limit, window_seconds):
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


def reset_rate_limit_state():
    with _rate_limit_lock:
        _rate_limit_memory.clear()


def _pool_or_raise():
    mode = connect()
    if mode == "unconfigured" or _pool is None:
        raise StorageUnavailable(
            "Supabase Postgres is not configured. Set SUPABASE_DB_URL in backend/.env."
        )
    if mode != "supabase":
        raise StorageUnavailable("Supabase Postgres is not available.")
    return _pool



def _normalize_sort(sort):
    if not sort:
        return None
    if isinstance(sort, str):
        return [(sort, 1)]
    if isinstance(sort, tuple):
        return [sort]
    return list(sort)


class PostgresCursor:
    def __init__(self, name, query):
        self._name = name
        self._query = query or {}
        self._skip = 0
        self._limit = None
        self._sort = None

    def sort(self, key, direction=-1):
        self._sort = _normalize_sort((key, direction) if not isinstance(key, list) else key)
        return self

    def skip(self, value):
        self._skip = max(0, int(value or 0))
        return self

    def limit(self, value):
        self._limit = max(0, int(value))
        return self

    def _fetch(self):
        return _fetch(self._name, self._query, self._sort, self._skip, self._limit)

    def __iter__(self):
        return iter(self._fetch())

    def count(self):
        return _count(self._name, self._query)

    def to_list(self):
        return self._fetch()


def _fetch(name, query, sort=None, skip=0, limit=None, for_update=False):
    pool = _pool_or_raise()
    clause, params = _where(query)
    statement = sql.SQL("select id, data from {} where collection = %s and {}").format(
        sql.Identifier(TABLE_SCHEMA, TABLE_NAME), sql.SQL(clause)
    )
    args = [name] + params
    order = _normalize_sort(sort)
    if order:
        statement, args = _append_fetch_sort(statement, args, order)
    statement, args = _append_fetch_limit(statement, args, limit, skip)
    if for_update:
        statement = statement + sql.SQL(" for update")
    with pool.connection() as connection:
        rows = connection.execute(statement, args).fetchall()
    return [_deserialize(row["data"]) for row in rows]


def _append_fetch_sort(statement, args, order):
    pieces = []
    for key, direction in order:
        direction_sql = sql.SQL("DESC" if direction < 0 else "ASC")
        if _is_simple_allowed_key(key):
            pieces.append(sql.SQL("data->>{} {}").format(sql.Literal(key), direction_sql))
        elif key == "_id":
            pieces.append(sql.SQL("id {}").format(direction_sql))
        else:
            pieces.append(sql.SQL("data #>> %s::text[] {}").format(direction_sql))
            args.append(_path(key))
    return statement + sql.SQL(" order by ") + sql.SQL(", ").join(pieces), args


def _append_fetch_limit(statement, args, limit, skip):
    effective_limit = MAX_FETCH_LIMIT if limit is None else max(0, int(limit))
    effective_limit = min(effective_limit, MAX_FETCH_LIMIT)
    return statement + sql.SQL(" limit %s offset %s"), args + [effective_limit, max(0, int(skip or 0))]


def _count(name, query):
    pool = _pool_or_raise()
    clause, params = _where(query)
    statement = sql.SQL("select count(*) as total from {} where collection = %s and {}").format(
        sql.Identifier(TABLE_SCHEMA, TABLE_NAME), sql.SQL(clause)
    )
    with pool.connection() as connection:
        row = connection.execute(statement, [name] + params).fetchone()

    return int(row["total"] or 0)


def _raise_if_integrity(exc):
    if psycopg_errors and isinstance(exc, psycopg_errors.UniqueViolation):
        raise IntegrityConflict("Duplicate record.") from exc
    if exc.__class__.__name__ in {"UniqueViolation", "IntegrityError"}:
        raise IntegrityConflict("Duplicate record.") from exc


class PostgresCollection:
    def __init__(self, name):
        self.name = name

    def insert_one(self, document):
        pool = _pool_or_raise()
        prepared = copy.deepcopy(document)
        prepared.setdefault("_id", str(uuid.uuid4()))
        prepared["_id"] = str(prepared["_id"])
        payload = _json(prepared)
        try:
            with pool.connection() as connection:
                connection.execute(
                    sql.SQL(
                        "insert into {} (id, collection, data) values (%s, %s, %s::jsonb) "
                        "on conflict (id) do update set data = excluded.data, updated_at = now()"
                    ).format(sql.Identifier(TABLE_SCHEMA, TABLE_NAME)),
                    [prepared["_id"], self.name, payload],
                )

        except Exception as exc:
            _raise_if_integrity(exc)
            raise
        return SimpleNamespace(inserted_id=prepared["_id"])

    def insert_many(self, documents):
        return [self.insert_one(document) for document in documents]

    def find_one(self, query=None, sort=None):
        rows = _fetch(
            self.name,
            query or {},
            _normalize_sort(sort),
            limit=1,
            for_update=bool(sort is None and query and "_id" in query),
        )
        return rows[0] if rows else None

    def find(self, query=None):
        return PostgresCursor(self.name, query or {})

    def count_documents(self, query=None):
        return _count(self.name, query or {})

    def update_one(self, query, update, upsert=False):
        pool = _pool_or_raise()
        clause, params = _where(query)
        try:
            with pool.connection() as connection:
                row = connection.execute(
                    sql.SQL("select id, data from {} where collection = %s and {} limit 1 for update").format(
                        sql.Identifier(TABLE_SCHEMA, TABLE_NAME), sql.SQL(clause)
                    ),
                    [self.name] + params,
                ).fetchone()

                if row:
                    document = _deserialize(row["data"])
                    _apply_update(document, update)
                    connection.execute(
                        sql.SQL("update {} set data = %s::jsonb, updated_at = now() where id = %s").format(
                            sql.Identifier(TABLE_SCHEMA, TABLE_NAME)
                        ),
                        [_json(document), row["id"]],
                    )

                    return SimpleNamespace(modified_count=1, matched_count=1)
                if not upsert:
                    return SimpleNamespace(modified_count=0, matched_count=0)
                base = {}
                for key, value in (query or {}).items():
                    if not isinstance(value, dict):
                        _set_path(base, key, value)
                _apply_update(base, update)
                base.setdefault("_id", str(uuid.uuid4()))
                base["_id"] = str(base["_id"])
                connection.execute(
                    sql.SQL("insert into {} (id, collection, data) values (%s, %s, %s::jsonb)").format(
                        sql.Identifier(TABLE_SCHEMA, TABLE_NAME)
                    ),
                    [base["_id"], self.name, _json(base)],
                )

                return SimpleNamespace(modified_count=0, matched_count=0, upserted_id=base["_id"])
        except Exception as exc:
            _raise_if_integrity(exc)
            raise

    def delete_one(self, query):
        pool = _pool_or_raise()
        clause, params = _where(query)
        with pool.connection() as connection:
            row = connection.execute(
                sql.SQL(
                    "delete from {0} where id = (select id from {0} "
                    "where collection = %s and {1} limit 1) returning id"
                ).format(sql.Identifier(TABLE_SCHEMA, TABLE_NAME), sql.SQL(clause)),
                [self.name] + params,
            ).fetchone()

        return SimpleNamespace(deleted_count=1 if row else 0)

    def delete_many(self, query=None):
        pool = _pool_or_raise()
        clause, params = _where(query or {})
        with pool.connection() as connection:
            result = connection.execute(
                sql.SQL("delete from {} where collection = %s and {}").format(
                    sql.Identifier(TABLE_SCHEMA, TABLE_NAME), sql.SQL(clause)
                ),
                [self.name] + params,
            )

        return SimpleNamespace(deleted_count=result.rowcount or 0)

    def create_index(self, *args, **kwargs):
        return None

    def drop(self):
        pool = _pool_or_raise()
        with pool.connection() as connection:
            connection.execute(
                sql.SQL("delete from {} where collection = %s").format(sql.Identifier(TABLE_SCHEMA, TABLE_NAME)),
                [self.name],
            )



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
    if name not in COLLECTIONS:
        raise KeyError(f"Unknown collection: {name}")
    return _CollectionProxy(name)


def reset_memory_store():
    for store in _memory_store.values():
        store.drop()


def storage_mode():
    try:
        return connect()
    except StorageUnavailable:
        return "unavailable"
