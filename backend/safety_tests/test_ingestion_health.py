from types import SimpleNamespace
from threading import Event

import pytest

from app.ingestion.base import _touch_health
from app.core.kafka import EventBus
from app.workers import local_pipeline_worker
from app.workers import ingestion_worker
from app.workers import processing_worker


@pytest.mark.parametrize("ok", [True, False])
def test_first_fetch_health_counters_are_initialized_before_flush(ok: bool):
    health = SimpleNamespace(
        latency_ms=None,
        records_received=None,
        records_processed=None,
        error_count=None,
        last_success=None,
        last_failure=None,
        last_error=None,
        updated_at=None,
    )
    source = SimpleNamespace(health=health, is_live=False, health_label="NOT_CONFIGURED")
    db = SimpleNamespace(add=lambda _: None)

    _touch_health(db, source, ok=ok, received=0, processed=0, error="upstream unavailable")

    assert health.records_received == 0
    assert health.records_processed == 0
    assert health.error_count == (0 if ok else 1)
    assert source.health_label == ("CONNECTED" if ok else "FAILED")


def test_memory_processor_drains_a_shared_topic_without_database_access(monkeypatch):
    bus = EventBus(use_kafka=False)
    bus.publish("weather.raw", {"report_id": "synthetic"})
    processed = []

    class Session:
        def commit(self):
            processed.append("commit")

        def rollback(self):
            processed.append("rollback")

        def close(self):
            processed.append("close")

    monkeypatch.setattr(processing_worker, "bus", bus)
    monkeypatch.setattr(processing_worker, "SessionLocal", Session)
    monkeypatch.setattr(
        processing_worker,
        "process_raw_message",
        lambda _db, value, *, topic: processed.append((topic, value["report_id"])),
    )

    assert processing_worker.drain_memory_topics(["weather.raw"]) == 1
    assert processed == [("weather.raw", "synthetic"), "commit", "close"]
    assert bus.drain("weather.raw") == []


def test_supervisor_restarts_worker_after_a_transient_crash(monkeypatch):
    stop_event = Event()
    attempts = []

    def worker(stop: Event) -> None:
        attempts.append("run")
        if len(attempts) == 1:
            raise RuntimeError("temporary failure")
        stop.set()

    monkeypatch.setattr(local_pipeline_worker, "RESTART_DELAY_SECONDS", 0)

    local_pipeline_worker._supervise_worker("test", worker, stop_event)

    assert attempts == ["run", "run"]


def test_ingestion_loop_exits_when_stop_event_is_set(monkeypatch):
    monkeypatch.setattr(ingestion_worker, "all_connectors", lambda: [])
    stop_event = Event()
    stop_event.set()

    ingestion_worker.run_ingestion_loop(stop_event)


def test_memory_processing_loop_exits_when_stop_event_is_set(monkeypatch):
    monkeypatch.setattr(processing_worker, "bus", EventBus(use_kafka=False))
    stop_event = Event()
    stop_event.set()

    processing_worker.run_processing_loop(stop_event)