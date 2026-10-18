import json
import time
from types import SimpleNamespace
from uuid import uuid4

import pytest
from kafka import KafkaConsumer
from sqlalchemy import func, select

from app.core.config import get_settings
from app.models.event import Event, EventReport
from app.models.model_version import ModelPrediction
from app.models.report import Report
from app.models.verification import Verification
from app.services import report_service
from app.workers.processing_worker import process_raw_message
from tests.conftest import auth


def test_worker_commits_offset_only_after_database_commit(monkeypatch):
    from app.workers import processing_worker

    calls = []

    class Db:
        def commit(self):
            calls.append("database")

    class Consumer:
        def commit(self, offsets):
            calls.append("offset")

    msg = SimpleNamespace(value={"report_id": str(uuid4())}, topic="raw.citizen", partition=0, offset=4)
    monkeypatch.setattr(processing_worker, "process_raw_message", lambda *args, **kwargs: calls.append("process"))

    processing_worker.process_kafka_record(Db(), Consumer(), msg)

    assert calls == ["process", "database", "offset"]


def test_worker_does_not_commit_offset_when_pipeline_fails(monkeypatch):
    from app.workers import processing_worker

    calls = []

    class Db:
        def commit(self):
            calls.append("database")

    class Consumer:
        def commit(self, offsets):
            calls.append("offset")

    def fail_processing(*args, **kwargs):
        raise RuntimeError("pipeline failed")

    msg = SimpleNamespace(value={"report_id": str(uuid4())}, topic="raw.citizen", partition=0, offset=4)
    monkeypatch.setattr(processing_worker, "process_raw_message", fail_processing)

    with pytest.raises(RuntimeError, match="pipeline failed"):
        processing_worker.process_kafka_record(Db(), Consumer(), msg)

    assert calls == []


def test_worker_rejects_envelope_without_a_persisted_report(db):
    assert process_raw_message(db, {"report_id": str(uuid4())}, topic="weather.raw") is None


def test_citizen_report_kafka_worker_pipeline_and_event_api(client, db, monkeypatch):
    settings = get_settings()
    topic = f"test.{settings.kafka_topic_raw_citizen}.{uuid4().hex}"
    test_settings = settings.model_copy(update={"kafka_topic_raw_citizen": topic})
    monkeypatch.setattr(report_service, "get_settings", lambda: test_settings)
    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=settings.kafka_bootstrap_servers.split(","),
        group_id=f"hikari-e2e-{uuid4()}",
        auto_offset_reset="earliest",
        enable_auto_commit=False,
        value_deserializer=lambda payload: json.loads(payload.decode()),
    )
    try:
        headers = auth(client, db, "citizen", "e2e.citizen")
        response = client.post(
            "/api/v1/citizen/reports",
            data={
                "event_type": "heavy_rain",
                "description": "Heavy rainfall flooded roads near Hyderabad test area",
                "latitude": "17.3850",
                "longitude": "78.4867",
                "location_text": "Hyderabad",
            },
            headers=headers,
        )
        assert response.status_code == 200, response.text
        report_id = response.json()["report_id"]
        raw_message = None
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and raw_message is None:
            for records in consumer.poll(timeout_ms=1000).values():
                for record in records:
                    if (record.value or {}).get("report_id") == report_id:
                        raw_message = record.value
                        break
        assert raw_message is not None, f"report {report_id} was not published to {topic}"

        event = process_raw_message(db, raw_message, topic=topic)
        assert event is not None
        db.commit()
        event_id = event.id

        repeated_event = process_raw_message(db, raw_message, topic=topic)
        assert repeated_event is not None
        assert repeated_event.id == event_id
        db.commit()

        db.expire_all()
        report = db.get(Report, report_id)
        event = db.get(Event, event_id)
        assert event is not None and event.report_count == 1
        assert report is not None and report.status == event.verification
        assert db.scalar(select(func.count()).select_from(EventReport).where(EventReport.report_id == report_id)) == 1
        assert db.scalar(select(func.count()).select_from(Verification).where(Verification.event_id == event_id)) == 1
        assert db.scalar(select(func.count()).select_from(ModelPrediction).where(ModelPrediction.report_id == report_id)) == 1

        event_response = client.get(
            f"/api/v1/events/{event_id}",
            headers=auth(client, db, "analyst", "e2e.analyst"),
        )
        assert event_response.status_code == 200, event_response.text
        assert str(event_response.json()["id"]) == str(event_id)
        assert event_response.json()["reports"] == 1
        assert event_response.json()["verification"] == event.verification
    finally:
        consumer.close()