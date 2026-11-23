from __future__ import annotations

import copy
import uuid
from collections.abc import Mapping
from types import SimpleNamespace
from typing import Any

from .base import RepositoryProtocol


def _database():
    import db

    return db


def _normalize_sort(sort: Any) -> list[tuple[str, int]] | None:
    if not sort:
        return None
    if isinstance(sort, str):
        return [(sort, 1)]
    if isinstance(sort, tuple):
        return [sort]
    return list(sort)


def _sql_table(database_module):
    return database_module.sql.Identifier(
        database_module.TABLE_SCHEMA, database_module.TABLE_NAME
    )


def _fetch(
    name: str,
    query: Mapping[str, Any] | None,
    sort: Any = None,
    skip: int = 0,
    limit: int | None = None,
    for_update: bool = False,
) -> list[dict[str, Any]]:
    database = _database()
    pool = database._pool_or_raise()
    clause, params = database._where(query)
    statement = database.sql.SQL("select id, data from {} where collection = %s and {}").format(
        _sql_table(database), database.sql.SQL(clause)
    )
    args = [name] + params
    order = database._normalize_sort(sort)
    if order:
        statement, args = database._append_fetch_sort(statement, args, order)
    statement, args = database._append_fetch_limit(statement, args, limit, skip)
    if for_update:
        statement = statement + database.sql.SQL(" for update")
    with pool.connection() as connection:
        rows = connection.execute(statement, args).fetchall()
    return [database._deserialize(row["data"]) for row in rows]


def _append_fetch_sort(statement, args: list[Any], order: list[tuple[str, int]]):
    database = _database()
    pieces = []
    for key, direction in order:
        direction_sql = database.sql.SQL("DESC" if direction < 0 else "ASC")
        if database._is_simple_allowed_key(key):
            pieces.append(database.sql.SQL("data->>{} {}").format(database.sql.Literal(key), direction_sql))
        elif key == "_id":
            pieces.append(database.sql.SQL("id {}").format(direction_sql))
        else:
            pieces.append(database.sql.SQL("data #>> %s::text[] {}").format(direction_sql))
            args.append(database._path(key))
    return statement + database.sql.SQL(" order by ") + database.sql.SQL(", ").join(pieces), args


def _append_fetch_limit(statement, args: list[Any], limit: int | None, skip: int):
    database = _database()
    effective_limit = database.MAX_FETCH_LIMIT if limit is None else max(0, int(limit))
    effective_limit = min(effective_limit, database.MAX_FETCH_LIMIT)
    return (
        statement + database.sql.SQL(" limit %s offset %s"),
        args + [effective_limit, max(0, int(skip or 0))],
    )


def _count(name: str, query: Mapping[str, Any] | None) -> int:
    database = _database()
    pool = database._pool_or_raise()
    clause, params = database._where(query)
    statement = database.sql.SQL(
        "select count(*) as total from {} where collection = %s and {}"
    ).format(_sql_table(database), database.sql.SQL(clause))
    with pool.connection() as connection:
        row = connection.execute(statement, [name] + params).fetchone()
    return int(row["total"] or 0)


def _raise_if_integrity(exc: Exception) -> None:
    database = _database()
    if database.psycopg_errors and isinstance(exc, database.psycopg_errors.UniqueViolation):
        raise database.IntegrityConflict("Duplicate record.") from exc
    if exc.__class__.__name__ in {"UniqueViolation", "IntegrityError"}:
        raise database.IntegrityConflict("Duplicate record.") from exc


class PostgresCursor:
    """Postgres-backed cursor that lazily opens the configured pool."""

    def __init__(self, name: str, query: Mapping[str, Any] | None) -> None:
        self._name = name
        self._query = query or {}
        self._skip = 0
        self._limit: int | None = None
        self._sort: list[tuple[str, int]] | None = None

    def sort(self, key: str | list[tuple[str, int]], direction: int = -1) -> PostgresCursor:
        sort_value = (key, direction) if not isinstance(key, list) else key
        self._sort = _database()._normalize_sort(sort_value)
        return self

    def skip(self, value: int | None) -> PostgresCursor:
        self._skip = max(0, int(value or 0))
        return self

    def limit(self, value: int) -> PostgresCursor:
        self._limit = max(0, int(value))
        return self

    def _fetch(self) -> list[dict[str, Any]]:
        return _database()._fetch(self._name, self._query, self._sort, self._skip, self._limit)

    def __iter__(self):
        return iter(self._fetch())

    def count(self) -> int:
        return _database()._count(self._name, self._query)

    def to_list(self) -> list[dict[str, Any]]:
        return self._fetch()


class PostgresCollection(RepositoryProtocol):
    """Document repository backed by a Supabase Postgres JSONB table."""

    def __init__(self, name: str) -> None:
        self.name = name

    def insert_one(self, document: Mapping[str, Any]) -> Any:
        database = _database()
        pool = database._pool_or_raise()
        prepared = copy.deepcopy(dict(document))
        prepared.setdefault("_id", str(uuid.uuid4()))
        prepared["_id"] = str(prepared["_id"])
        payload = database._json(prepared)
        try:
            with pool.connection() as connection:
                connection.execute(
                    database.sql.SQL(
                        "insert into {} (id, collection, data) values (%s, %s, %s::jsonb) "
                        "on conflict (id) do update set data = excluded.data, updated_at = now()"
                    ).format(_sql_table(database)),
                    [prepared["_id"], self.name, payload],
                )
        except Exception as exc:
            database._raise_if_integrity(exc)
            raise
        return SimpleNamespace(inserted_id=prepared["_id"])

    def insert_many(self, documents: list[Mapping[str, Any]]) -> list[Any]:
        return [self.insert_one(document) for document in documents]

    def find_one(self, query: Mapping[str, Any] | None = None, sort: Any = None) -> Any:
        database = _database()
        rows = database._fetch(
            self.name,
            query or {},
            database._normalize_sort(sort),
            limit=1,
            for_update=bool(sort is None and query and "_id" in query),
        )
        return rows[0] if rows else None

    def find(self, query: Mapping[str, Any] | None = None) -> PostgresCursor:
        return PostgresCursor(self.name, query or {})

    def count_documents(self, query: Mapping[str, Any] | None = None) -> int:
        return _database()._count(self.name, query or {})

    def update_one(
        self,
        query: Mapping[str, Any],
        update: Mapping[str, Any],
        upsert: bool = False,
    ) -> Any:
        database = _database()
        pool = database._pool_or_raise()
        clause, params = database._where(query)
        try:
            with pool.connection() as connection:
                row = connection.execute(
                    database.sql.SQL(
                        "select id, data from {} where collection = %s and {} limit 1 for update"
                    ).format(_sql_table(database), database.sql.SQL(clause)),
                    [self.name] + params,
                ).fetchone()
                if row:
                    return self._update_existing(database, connection, row, update)
                if not upsert:
                    return SimpleNamespace(modified_count=0, matched_count=0)
                return self._insert_upsert(database, connection, query, update)
        except Exception as exc:
            database._raise_if_integrity(exc)
            raise

    def _update_existing(self, database, connection, row: Mapping[str, Any], update: Mapping[str, Any]) -> Any:
        document = database._deserialize(row["data"])
        database._apply_update(document, update)
        connection.execute(
            database.sql.SQL("update {} set data = %s::jsonb, updated_at = now() where id = %s").format(
                _sql_table(database)
            ),
            [database._json(document), row["id"]],
        )
        return SimpleNamespace(modified_count=1, matched_count=1)

    def _insert_upsert(self, database, connection, query: Mapping[str, Any], update: Mapping[str, Any]) -> Any:
        base: dict[str, Any] = {}
        for key, value in (query or {}).items():
            if not isinstance(value, dict):
                database._set_path(base, key, value)
        database._apply_update(base, update)
        base.setdefault("_id", str(uuid.uuid4()))
        base["_id"] = str(base["_id"])
        connection.execute(
            database.sql.SQL("insert into {} (id, collection, data) values (%s, %s, %s::jsonb)").format(
                _sql_table(database)
            ),
            [base["_id"], self.name, database._json(base)],
        )
        return SimpleNamespace(modified_count=0, matched_count=0, upserted_id=base["_id"])

    def delete_one(self, query: Mapping[str, Any]) -> Any:
        database = _database()
        pool = database._pool_or_raise()
        clause, params = database._where(query)
        with pool.connection() as connection:
            row = connection.execute(
                database.sql.SQL(
                    "delete from {0} where id = (select id from {0} "
                    "where collection = %s and {1} limit 1) returning id"
                ).format(_sql_table(database), database.sql.SQL(clause)),
                [self.name] + params,
            ).fetchone()
        return SimpleNamespace(deleted_count=1 if row else 0)

    def delete_many(self, query: Mapping[str, Any] | None = None) -> Any:
        database = _database()
        pool = database._pool_or_raise()
        clause, params = database._where(query or {})
        with pool.connection() as connection:
            result = connection.execute(
                database.sql.SQL("delete from {} where collection = %s and {}").format(
                    _sql_table(database), database.sql.SQL(clause)
                ),
                [self.name] + params,
            )
        return SimpleNamespace(deleted_count=result.rowcount or 0)

    def create_index(self, *args: Any, **kwargs: Any) -> None:
        return None

    def drop(self) -> None:
        database = _database()
        pool = database._pool_or_raise()
        with pool.connection() as connection:
            connection.execute(
                database.sql.SQL("delete from {} where collection = %s").format(_sql_table(database)),
                [self.name],
            )
