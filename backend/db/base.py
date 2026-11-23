from __future__ import annotations

import copy
import json
import logging
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any, Protocol

from config import Config

logger = logging.getLogger(__name__)

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

SQL_COMPARISON_OPERATORS = {"$gte": ">=", "$gt": ">", "$lte": "<=", "$lt": "<", "=": "="}


class StorageUnavailable(RuntimeError):
    """Raised when the configured Postgres backend cannot serve a request."""


class IntegrityConflict(RuntimeError):
    """Raised when a write conflicts with a uniqueness constraint."""


class RepositoryProtocol(Protocol):
    """Storage operations shared by the in-memory and Postgres repositories."""

    name: str

    def insert_one(self, document: Mapping[str, Any]) -> Any: ...

    def insert_many(self, documents: list[Mapping[str, Any]]) -> list[Any]: ...

    def find_one(self, query: Mapping[str, Any] | None = None, sort: Any = None) -> Any: ...

    def find(self, query: Mapping[str, Any] | None = None) -> Any: ...

    def count_documents(self, query: Mapping[str, Any] | None = None) -> int: ...

    def update_one(
        self,
        query: Mapping[str, Any],
        update: Mapping[str, Any],
        upsert: bool = False,
    ) -> Any: ...

    def delete_one(self, query: Mapping[str, Any]) -> Any: ...

    def delete_many(self, query: Mapping[str, Any] | None = None) -> Any: ...

    def create_index(self, *args: Any, **kwargs: Any) -> None: ...

    def drop(self) -> None: ...


def set_max_fetch_limit(value: int) -> int:
    """Update and return the shared maximum document fetch limit."""
    global MAX_FETCH_LIMIT
    MAX_FETCH_LIMIT = max(1, int(value))
    return MAX_FETCH_LIMIT


def to_oid(value: Any) -> Any:
    """Return an identifier in its storage-neutral form."""
    return value


def _config_value(config: Any, name: str, default: Any) -> Any:
    if hasattr(config, "get"):
        return config.get(name, default)
    return getattr(config, name, default)


def _serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    return value


def _deserialize(value: Any) -> Any:
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


def _json(value: Any) -> str:
    return json.dumps(_serialize(value), ensure_ascii=False)


def _path(key: str) -> list[str]:
    return key.split(".")


def _is_simple_allowed_key(key: str) -> bool:
    return key in ALLOWED_QUERY_KEYS and "." not in key


def _sql_value(value: Any) -> Any:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.isoformat().replace("+00:00", "Z")
    return value


def _expr_for_key(key: str) -> str | None:
    if key == "_id":
        return "id"
    if _is_simple_allowed_key(key):
        return f"data->>'{key}'"
    return None


def _comparison_clause(key: str, op: str, value: Any, params: list[Any]) -> str:
    operator = SQL_COMPARISON_OPERATORS[op]
    expr = _expr_for_key(key)
    if expr is not None:
        params.append(_sql_value(value))
        return f"{expr} {operator} %s"
    params.extend([_path(key), _json(value)])
    return f"(data #> %s::text[]) {operator} %s::jsonb"


def _equality_clause(key: str, expected: Any, params: list[Any]) -> str:
    expr = _expr_for_key(key)
    if expr is not None:
        params.append(_sql_value(expected))
        return f"{expr} = %s"
    params.extend([_path(key), _json(expected)])
    return "(data #> %s::text[]) = %s::jsonb"


def _exists_clause(key: str, value: Any, params: list[Any]) -> str:
    expr = _expr_for_key(key)
    suffix = "IS NOT NULL" if value else "IS NULL"
    if expr is not None:
        return f"{expr} {suffix}"
    params.append(_path(key))
    return f"(data #> %s::text[]) {suffix}"


def _inequality_clause(key: str, op: str, value: Any, params: list[Any]) -> str:
    expr = _expr_for_key(key)
    operator = "IS DISTINCT FROM" if op in {"$ne", "$nin"} else "="
    if expr is not None:
        params.append(_sql_value(value))
        return f"{expr} {operator} %s"
    params.extend([_path(key), _json(value)])
    return f"(data #> %s::text[]) {operator} %s::jsonb"


def _operator_clause(key: str, op: str, value: Any, params: list[Any]) -> str:
    builder = SQL_OPERATOR_BUILDERS[op]
    return builder(key, value, params)


def _in_clause(key: str, choices: list[Any], params: list[Any]) -> str:
    if not choices:
        return "FALSE"
    parts = [_equality_clause(key, item, params) for item in choices]
    return "(" + " OR ".join(parts) + ")"


def _nin_clause(key: str, choices: list[Any], params: list[Any]) -> str:
    clauses = [_inequality_clause(key, "$nin", item, params) for item in choices or ()]
    return " AND ".join(clauses) if clauses else "TRUE"


SQL_OPERATOR_BUILDERS: dict[str, Callable[..., str]] = {
    "$exists": lambda key, value, params: _exists_clause(key, value, params),
    "$gt": lambda key, value, params: _comparison_clause(key, "$gt", value, params),
    "$gte": lambda key, value, params: _comparison_clause(key, "$gte", value, params),
    "$lt": lambda key, value, params: _comparison_clause(key, "$lt", value, params),
    "$lte": lambda key, value, params: _comparison_clause(key, "$lte", value, params),
    "$ne": lambda key, value, params: _inequality_clause(key, "$ne", value, params),
    "$nin": lambda key, value, params: _nin_clause(key, value, params),
    "$in": lambda key, value, params: _in_clause(key, value or [], params),
}


def _valid_query_key(key: str) -> bool:
    if key in ALLOWED_QUERY_KEYS or key == "_id":
        return True
    return all(part.replace("_", "").isalnum() for part in key.split("."))


def _is_operator_expression(expected: Any) -> bool:
    return (
        isinstance(expected, dict)
        and bool(expected)
        and all(str(op).startswith("$") for op in expected)
    )


def _append_where_clause(clauses: list[str], params: list[Any], key: str, expected: Any) -> None:
    if not _is_operator_expression(expected):
        clauses.append(_equality_clause(key, expected, params))
        return
    for op, value in expected.items():
        builder = SQL_OPERATOR_BUILDERS.get(op)
        if builder is not None:
            clauses.append(builder(key, value, params))


def _where(query: Mapping[str, Any] | None) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    for key, expected in (query or {}).items():
        if not isinstance(key, str) or not key:
            continue
        if not _valid_query_key(key):
            raise ValueError("Unsupported query key")
        _append_where_clause(clauses, params, key, expected)
    return (" AND ".join(clauses), params) if clauses else ("TRUE", [])


def _nested_value(document: Any, key: str) -> Any:
    current = document
    for part in key.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _memory_comparison(current: Any, value: Any, compare: Callable[[Any, Any], bool]) -> bool:
    return current is not None and compare(current, value)


MEMORY_OPERATOR_MATCHERS: dict[str, Callable[[Any, Any], bool]] = {
    "$in": lambda current, value: current in (value or []),
    "$nin": lambda current, value: current not in (value or []),
    "$ne": lambda current, value: current != value,
    "$exists": lambda current, value: (current is not None) == bool(value),
    "$gte": lambda current, value: _memory_comparison(current, value, lambda a, b: a >= b),
    "$gt": lambda current, value: _memory_comparison(current, value, lambda a, b: a > b),
    "$lte": lambda current, value: _memory_comparison(current, value, lambda a, b: a <= b),
    "$lt": lambda current, value: _memory_comparison(current, value, lambda a, b: a < b),
}


def _memory_operator_matches(current: Any, op: str, value: Any) -> bool:
    matcher = MEMORY_OPERATOR_MATCHERS.get(op)
    return matcher(current, value) if matcher is not None else True


def _document_matches(document: Any, key: str, expected: Any) -> bool:
    current = _nested_value(document, key)
    if not _is_operator_expression(expected):
        return current == expected
    return all(_memory_operator_matches(current, op, value) for op, value in expected.items())


def _matches(document: Any, query: Mapping[str, Any] | None) -> bool:
    return all(_document_matches(document, key, expected) for key, expected in (query or {}).items())


def _set_path(document: dict[str, Any], key: str, value: Any) -> None:
    target = document
    parts = key.split(".")
    for part in parts[:-1]:
        branch = target.get(part)
        if not isinstance(branch, dict):
            branch = {}
            target[part] = branch
        target = branch
    target[parts[-1]] = copy.deepcopy(value)


def _apply_update(document: dict[str, Any], update: Mapping[str, Any]) -> dict[str, Any]:
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
