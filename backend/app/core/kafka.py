from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import get_settings
from app.core.metrics import DLQ_COUNT

log = logging.getLogger(__name__)

class EventBus:
    """Kafka when reachable; in-process list otherwise. PostgreSQL remains source of truth."""

    def __init__(self, use_kafka: bool = True) -> None:
        self._producer = None
        self._use_kafka = use_kafka
        self._memory_topics: dict[str, list[dict[str, Any]]] = {}

    def publish(self, topic: str, value: dict[str, Any], key: str | None = None) -> None:
        payload = json.dumps(value, default=str).encode()
        if not self._use_kafka:
            self._memory_topics.setdefault(topic, []).append({"key": key, "value": value})
            return
        try:
            from kafka import KafkaProducer  # type: ignore

            if self._producer is None:
                self._producer = KafkaProducer(
                    bootstrap_servers=get_settings().kafka_bootstrap_servers.split(","),
                    retries=3,
                )
            self._producer.send(topic, payload, key=(key or "").encode() or None)
            self._producer.flush(timeout=2)
            return
        except Exception as exc:
            log.info("kafka_unavailable_using_memory_bus", extra={"error": str(exc), "topic": topic})
        self._memory_topics.setdefault(topic, []).append({"key": key, "value": value})

    def dead_letter(self, topic: str, value: dict[str, Any], error: str) -> None:
        DLQ_COUNT.labels(topic=topic).inc()
        value = {**value, "error": error}
        self.publish(topic, value)

    def drain(self, topic: str) -> list[dict[str, Any]]:
        return self.consume(topic)

    def consume(self, topic: str, *, limit: int | None = None) -> list[dict[str, Any]]:
        queue = self._memory_topics.get(topic, [])
        if not queue or limit is not None and limit <= 0:
            return []
        count = len(queue) if limit is None else min(limit, len(queue))
        messages = queue[:count]
        del queue[:count]
        if not queue:
            self._memory_topics.pop(topic, None)
        return messages


bus = EventBus()
