from app.core.config import get_settings
from app.core.kafka import EventBus


def test_hikari_mvp_topics_are_registered():
    settings = get_settings()
    expected = {
        "weather.raw",
        "alerts.raw",
        "citizen.raw",
        "satellite.raw",
        "observations.normalized",
        "events.detected",
        "events.verified",
    }
    assert expected.issubset(set(settings.kafka_topics))


def test_memory_bus_round_trip_for_detected_events():
    bus = EventBus(use_kafka=False)
    topic = "events.detected"
    bus.publish(topic, {"event_id": "evt-001", "event_type": "flood"}, key="evt-001")
    bus.publish(topic, {"event_id": "evt-002", "event_type": "heavy_rain"}, key="evt-002")

    first = bus.consume(topic, limit=1)
    assert first == [{"key": "evt-001", "value": {"event_id": "evt-001", "event_type": "flood"}}]
    assert bus.drain(topic) == [{"key": "evt-002", "value": {"event_id": "evt-002", "event_type": "heavy_rain"}}]
    assert bus.drain(topic) == []


def test_unavailable_kafka_falls_back_to_memory(monkeypatch):
    from app.core.kafka import EventBus

    def unavailable(**_kwargs):
        raise RuntimeError("Kafka is unavailable")

    monkeypatch.setattr("kafka.KafkaProducer", unavailable)
    bus = EventBus()
    bus.publish("citizen.raw", {"report_id": "report-001"}, key="report-001")

    assert bus.consume("citizen.raw") == [
        {"key": "report-001", "value": {"report_id": "report-001"}}
    ]
