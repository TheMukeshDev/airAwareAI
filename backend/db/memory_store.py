from __future__ import annotations

import copy
import threading
import time
import uuid
from collections.abc import Mapping
from types import SimpleNamespace
from typing import Any

from .base import COLLECTIONS, RepositoryProtocol


def _database():
    import db

    return db


class MemoryCursor:
    """In-memory cursor with the same fluent API as the Postgres cursor."""

    def __init__(self, items: list[dict[str, Any]]) -> None:
        self._items = list(items)
        self._skip = 0
        self._limit: int | None = None
        self._sort_key: str | None = None
        self._sort_dir = 1

    def sort(self, key: str | list[tuple[str, int]], direction: int = -1) -> MemoryCursor:
        if isinstance(key, list):
            key, direction = key[0][0], key[0][1]
        self._sort_key = key
        self._sort_dir = direction
        return self

    def skip(self, value: int | None) -> MemoryCursor:
        self._skip = int(value or 0)
        return self

    def limit(self, value: int) -> MemoryCursor:
        self._limit = int(value)
        return self

    def _resolve(self) -> list[dict[str, Any]]:
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

    def count(self) -> int:
        return len(self._resolve())

    def to_list(self) -> list[dict[str, Any]]:
        return self._resolve()


class MemoryCollection(RepositoryProtocol):
    """Thread-safe document collection used by tests and local development."""

    def __init__(self, name: str) -> None:
        self.name = name
        self._documents: list[dict[str, Any]] = []
        self._lock = threading.Lock()

    def _normalize(self, document: Mapping[str, Any]) -> dict[str, Any]:
        prepared = copy.deepcopy(dict(document))
        prepared.setdefault("_id", uuid.uuid4().hex)
        return prepared

    def insert_one(self, document: Mapping[str, Any]) -> Any:
        with self._lock:
            prepared = self._normalize(document)
            self._documents.append(prepared)
            return SimpleNamespace(inserted_id=prepared["_id"])

    def insert_many(self, documents: list[Mapping[str, Any]]) -> list[Any]:
        return [self.insert_one(document) for document in documents]

    def find_one(self, query: Mapping[str, Any] | None = None, sort: Any = None) -> Any:
        query = query or {}
        with self._lock:
            matches = [document for document in self._documents if _database()._matches(document, query)]
        if sort:
            order = sort[0] if isinstance(sort, list) else sort
            matches.sort(
                key=lambda item: (item.get(order[0]) is None, item.get(order[0])),
                reverse=order[1] < 0,
            )
        return copy.deepcopy(matches[0]) if matches else None

    def find(self, query: Mapping[str, Any] | None = None) -> MemoryCursor:
        with self._lock:
            items = [
                document for document in self._documents if _database()._matches(document, query or {})
            ]
        return MemoryCursor(items)

    def count_documents(self, query: Mapping[str, Any] | None = None) -> int:
        with self._lock:
            return len(
                [document for document in self._documents if _database()._matches(document, query or {})]
            )

    def update_one(
        self,
        query: Mapping[str, Any],
        update: Mapping[str, Any],
        upsert: bool = False,
    ) -> Any:
        with self._lock:
            for document in self._documents:
                if _database()._matches(document, query):
                    _database()._apply_update(document, update)
                    return SimpleNamespace(modified_count=1, matched_count=1)
            if upsert:
                base = {key: value for key, value in query.items() if not isinstance(value, dict)}
                prepared = self._normalize(base)
                _database()._apply_update(prepared, update)
                self._documents.append(prepared)
                return SimpleNamespace(modified_count=0, matched_count=0, upserted_id=prepared["_id"])
        return SimpleNamespace(modified_count=0, matched_count=0)

    def delete_one(self, query: Mapping[str, Any]) -> Any:
        with self._lock:
            for index, document in enumerate(self._documents):
                if _database()._matches(document, query):
                    self._documents.pop(index)
                    return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    def delete_many(self, query: Mapping[str, Any] | None = None) -> Any:
        with self._lock:
            before = len(self._documents)
            self._documents = [
                document for document in self._documents if not _database()._matches(document, query or {})
            ]
            return SimpleNamespace(deleted_count=before - len(self._documents))

    def create_index(self, *args: Any, **kwargs: Any) -> None:
        return None

    def drop(self) -> None:
        with self._lock:
            self._documents = []


class MemoryStore:
    """Owns all in-memory collections and the process-local rate limit table."""

    def __init__(self, names: tuple[str, ...] = COLLECTIONS) -> None:
        self.collections = {name: MemoryCollection(name) for name in names}
        self.rate_limits: dict[tuple[str, str], tuple[float, int]] = {}
        self.rate_limit_lock = threading.Lock()

    def reset(self) -> None:
        for store in self.collections.values():
            store.drop()

    def reset_rate_limits(self) -> None:
        with self.rate_limit_lock:
            self.rate_limits.clear()

    def rate_limit_hit(self, bucket: str, identity: str, limit: int, window_seconds: int) -> bool:
        """Return whether a request is within the in-memory rate limit."""
        now = time.time()
        key = (str(bucket), str(identity))
        with self.rate_limit_lock:
            start, hits = self.rate_limits.get(key, (now, 0))
            if now - start >= window_seconds:
                start, hits = now, 0
            hits += 1
            self.rate_limits[key] = (start, hits)
        return hits <= int(limit)


memory_store = MemoryStore()

_memory_store = memory_store.collections
_rate_limit_memory = memory_store.rate_limits
_rate_limit_lock = memory_store.rate_limit_lock


def _memory_rate_limit_hit(bucket: str, identity: str, limit: int, window_seconds: int) -> bool:
    return memory_store.rate_limit_hit(bucket, identity, limit, window_seconds)


def reset_memory_store() -> None:
    memory_store.reset()


def reset_rate_limit_state() -> None:
    memory_store.reset_rate_limits()
