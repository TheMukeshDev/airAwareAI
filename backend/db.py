"""Supabase Postgres access with a memory store reserved for tests."""

import atexit
import copy
import json
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from types import SimpleNamespace

from config import Config

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

TABLE = "public.airaware_documents"

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

MAX_FETCH_LIMIT = 5000


class StorageUnavailable(RuntimeError):
    pass


class IntegrityConflict(RuntimeError):
    pass


def to_oid(value):
    return value


def utcnow():
    return datetime.now(UTC)


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
                    pass
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


def _comparison_clause(key, op, value, params):
    expr = _expr_for_key(key)
    if expr is not None:
        operator = {"$gte": ">=", "$gt": ">", "$lte": "<=", "$lt": "<", "=": "="}[op]
        params.append(_sql_value(value))
        return f"{expr} {operator} %s"
    # Fallback to jsonb path for non-indexed/complex keys (still no user identifiers interpolated except not possible; use path params)
    operator = {"$gte": ">=", "$gt": ">", "$lte": "<=", "$lt": "<", "=": "="}[op]
    params.extend([_path(key), _json(value)])
    return f"(data #> %s::text[]) {operator} %s::jsonb"


def _equality_clause(key, expected, params):
    expr = _expr_for_key(key)
    if expr is not None:
        params.append(_sql_value(expected))
        return f"{expr} = %s"
    params.extend([_path(key), _json(expected)])
    return "(data #> %s::text[]) = %s::jsonb"


def _where(query):
    clauses = []
    params = []
    for key, expected in (query or {}).items():
        if not isinstance(key, str) or not key:
            continue
        # Only allow keys that are either in allowlist/simple or safe dotted paths built from literals in code paths we control.
        # For safety, reject unknown keys with dots unless explicitly allowed simple; but some callers might not use dotted keys.
        if "." in key and key not in ALLOWED_QUERY_KEYS:
            # permit dotted keys only if every segment is alnum/underscore? but still can't make indexable; use jsonb path safely via params
            pass
        if key not in ALLOWED_QUERY_KEYS and key != "_id":
            # Disallow unknown keys to avoid unindexable/unexpected predicates; callers should only query known fields.
            # But be permissive for simple internal keys that may appear (e.g. starts_at comparisons not typical). Raise for safety? No, better to still support via jsonb path if key chars safe.
            if not all(part.replace("_", "").isalnum() for part in key.split(".")):
                raise ValueError("Unsupported query key")
        if isinstance(expected, dict) and expected and all(str(op).startswith("$") for op in expected):
            for op, value in expected.items():
                if op == "$in":
                    choices = value or []
                    if not choices:
                        clauses.append("FALSE")
                        continue
                    parts = []
                    for item in choices:
                        parts.append(_equality_clause(key, item, params))
                    clauses.append("(" + " OR ".join(parts) + ")")
                elif op == "$nin":
                    for item in value or []:
                        expr = _expr_for_key(key)
                        if expr is not None:
                            params.append(_sql_value(item))
                            clauses.append(f"{expr} IS DISTINCT FROM %s")
                        else:
                            params.extend([_path(key), _json(item)])
                            clauses.append("(data #> %s::text[]) IS DISTINCT FROM %s::jsonb")
                elif op == "$ne":
                    expr = _expr_for_key(key)
                    if expr is not None:
                        params.append(_sql_value(value))
                        clauses.append(f"{expr} IS DISTINCT FROM %s")
                    else:
                        params.extend([_path(key), _json(value)])
                        clauses.append("(data #> %s::text[]) IS DISTINCT FROM %s::jsonb")
                elif op == "$exists":
                    expr = _expr_for_key(key)
                    if expr is not None:
                        clauses.append(f"{expr} IS NOT NULL" if value else f"{expr} IS NULL")
                    else:
                        params.append(_path(key))
                        clauses.append("(data #> %s::text[]) IS NOT NULL" if value else "(data #> %s::text[]) IS NULL")
                elif op in {"$gte", "$gt", "$lte", "$lt"}:
                    clauses.append(_comparison_clause(key, op, value, params))
            continue
        clauses.append(_equality_clause(key, expected, params))
    return (" AND ".join(clauses), params) if clauses else ("TRUE", [])


def _matches(document, query):
    for key, expected in (query or {}).items():
        current = document
        for part in key.split("."):
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                current = None
                break
        if isinstance(expected, dict) and expected and all(str(op).startswith("$") for op in expected):
            for op, value in expected.items():
                if op == "$in" and current not in (value or []):
                    return False
                if op == "$nin" and current in (value or []):
                    return False
                if op == "$ne" and current == value:
                    return False
                if op == "$exists" and ((current is not None) != bool(value)):
                    return False
                if op == "$gte" and (current is None or current < value):
                    return False
                if op == "$gt" and (current is None or current <= value):
                    return False
                if op == "$lte" and (current is None or current > value):
                    return False
                if op == "$lt" and (current is None or current >= value):
                    return False
            continue
        if current != expected:
            return False
    return True


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


def configure(config_object):
    global _pool, _mode, _runtime, _connect_state
    backend = str(_config_value(config_object, "DB_BACKEND", Config.DB_BACKEND)).strip().lower()
    url = str(_config_value(config_object, "SUPABASE_DB_URL", Config.SUPABASE_DB_URL)).strip()
    if backend == _runtime["backend"] and url == _runtime["url"]:
        return
    with _connect_lock:
        if _pool is not None:
            try:
                _pool.close()
            except Exception:
                pass
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
        if _mode == "supabase" and _pool is not None:
            return _mode
        now = time.time()
        if now < _connect_state.get("next_retry_at", 0.0):
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
            if _pool is not None:
                try:
                    _pool.close()
                except Exception:
                    pass
            _pool = None
            _mode = None
            failures = min(int(_connect_state.get("failures", 0)) + 1, 6)
            backoff = min(2 ** (failures - 1), 10)
            _connect_state = {"failures": failures, "next_retry_at": time.time() + backoff}
            raise StorageUnavailable("Supabase Postgres is temporarily unavailable. Please retry shortly.") from exc



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
                pass
        _pool = None
        _mode = None


atexit.register(close)


def close():
    global _pool, _mode
    with _connect_lock:
        if _pool is not None:
            try:
                _pool.close()
            except Exception:
                pass
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


@contextmanager
def transaction():
    pool = _pool_or_raise()
    with pool.connection() as connection:
        with connection.transaction():
            yield connection


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
        sql.Identifier(TABLE), sql.SQL(clause)
    )
    args = [name] + params
    order = _normalize_sort(sort)
    if order:
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
        statement = statement + sql.SQL(" order by ") + sql.SQL(", ").join(pieces)
    effective_limit = MAX_FETCH_LIMIT if limit is None else max(0, int(limit))
    if effective_limit > MAX_FETCH_LIMIT:
        effective_limit = MAX_FETCH_LIMIT
    statement = statement + sql.SQL(" limit %s offset %s")
    args.extend([effective_limit, max(0, int(skip or 0))])
    if for_update:
        statement = statement + sql.SQL(" for update")
    with pool.connection() as connection:
        rows = connection.execute(statement, args).fetchall()

    return [_deserialize(row["data"]) for row in rows]


def _count(name, query):
    pool = _pool_or_raise()
    clause, params = _where(query)
    statement = sql.SQL("select count(*) as total from {} where collection = %s and {}").format(
        sql.Identifier(TABLE), sql.SQL(clause)
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
                    ).format(sql.Identifier(TABLE)),
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
                        sql.Identifier(TABLE), sql.SQL(clause)
                    ),
                    [self.name] + params,
                ).fetchone()

                if row:
                    document = _deserialize(row["data"])
                    _apply_update(document, update)
                    connection.execute(
                        sql.SQL("update {} set data = %s::jsonb, updated_at = now() where id = %s").format(
                            sql.Identifier(TABLE)
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
                        sql.Identifier(TABLE)
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
                ).format(sql.Identifier(TABLE), sql.SQL(clause)),
                [self.name] + params,
            ).fetchone()

        return SimpleNamespace(deleted_count=1 if row else 0)

    def delete_many(self, query=None):
        pool = _pool_or_raise()
        clause, params = _where(query or {})
        with pool.connection() as connection:
            result = connection.execute(
                sql.SQL("delete from {} where collection = %s and {}").format(
                    sql.Identifier(TABLE), sql.SQL(clause)
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
                sql.SQL("delete from {} where collection = %s").format(sql.Identifier(TABLE)),
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
