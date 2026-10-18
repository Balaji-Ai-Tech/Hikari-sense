from __future__ import annotations

import time
from threading import Lock
from typing import Any

import redis

from app.core.config import get_settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


def ping_redis() -> bool:
    try:
        return bool(get_redis().ping())
    except Exception:
        return False


class MemoryStore:
    """Fallback when Redis is unavailable. Not a source of truth."""

    def __init__(self) -> None:
        self._kv: dict[str, str] = {}
        self._lists: dict[str, list[str]] = {}
        self._expires: dict[str, float] = {}
        self._lock = Lock()

    def setex(self, key: str, ttl: int, value: str) -> None:
        with self._lock:
            self._kv[key] = value
            self._expires[key] = time.monotonic() + ttl

    def get(self, key: str) -> str | None:
        with self._lock:
            self._purge(key)
            return self._kv.get(key)

    def incr(self, key: str) -> int:
        with self._lock:
            self._purge(key)
            n = int(self._kv.get(key, "0")) + 1
            self._kv[key] = str(n)
            return n

    def expire(self, key: str, ttl: int) -> None:
        with self._lock:
            if key in self._kv:
                self._expires[key] = time.monotonic() + ttl

    def _purge(self, key: str) -> None:
        expires_at = self._expires.get(key)
        if expires_at is not None and expires_at <= time.monotonic():
            self._kv.pop(key, None)
            self._expires.pop(key, None)


_memory = MemoryStore()


def cache_get(key: str) -> str | None:
    try:
        return get_redis().get(key)
    except Exception:
        return _memory.get(key)


def cache_set(key: str, value: str, ttl: int = 60) -> None:
    try:
        get_redis().setex(key, ttl, value)
    except Exception:
        _memory.setex(key, ttl, value)


def rate_hit(key: str, limit: int, window_sec: int = 60) -> tuple[bool, int]:
    try:
        r = get_redis()
        n = r.incr(key)
        if n == 1:
            r.expire(key, window_sec)
        return n <= limit, n
    except Exception:
        n = _memory.incr(key)
        if n == 1:
            _memory.expire(key, window_sec)
        return n <= limit, n


def publish(channel: str, payload: str) -> None:
    try:
        get_redis().publish(channel, payload)
    except Exception:
        pass
