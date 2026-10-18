from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.models.event import Event
from app.models.official_alert import OfficialAlert
from app.models.report import Report
from app.models.source import Source
from app.ingestion.base import persist_envelope
from app.schemas.envelope import IngestionEnvelope
from app.workers.processing_worker import process_raw_message
from tests.conftest import auth


def test_official_cap_flood_reaches_reviewable_event_api_with_source_location(db, client):
    source = Source(
        code="SRC-SACHET",
        name="SACHET / NDMA CAP alerts",
        kind="Official alert",
        source_type="official",
        category="api",
        reliability=0.6,
    )
    db.add(source)
    db.flush()
    observed_at = datetime.now(UTC).replace(microsecond=0)
    report = Report(
        source_id=source.id,
        native_id=f"IN-SACHET-TEST-{uuid4()}",
        posted_at=observed_at,
        fetched_at=observed_at,
        text="River Ganga is in severe flood situation at the official gauge.",
        lat=27.49,
        lon=79.37,
        geometry={"type": "MultiPolygon", "coordinates": [[[[79.3, 27.4], [79.4, 27.4], [79.4, 27.5], [79.3, 27.4]]]]},
        place_text="Ganga, Dabri, Shahjahanpur, Uttar Pradesh",
        source_account="CWC",
    )
    db.add(report)
    db.flush()
    event = process_raw_message(
        db,
        {
            "report_id": str(report.id),
            "source": "sachet",
            "native_id": report.native_id,
            "raw_ref": "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=test",
            "source_account": "CWC",
            "metadata": {
                "severity": "Severe",
                "event": "Flood",
                "message_type": "Alert",
                "urgency": "Immediate",
                "certainty": "Observed",
                "expires": (observed_at + timedelta(hours=2)).isoformat(),
                "sender": "CWC",
                "headline": "River Ganga flood warning",
                "description": "Severe flood at official gauge.",
                "instruction": "Follow local authority guidance.",
                "area_descriptions": ["Dabri, Shahjahanpur, Uttar Pradesh"],
                "references": [],
            },
        },
        topic="alerts.raw",
    )
    assert event is not None
    db.commit()

    assert event.event_type == "flood"
    assert event.severity == "high"
    assert event.verification in {"needs_review", "low_confidence"}
    assert event.city is None
    assert event.state == "Uttar Pradesh"

    response = client.get(
        f"/api/v1/events/{event.id}",
        headers=auth(client, db, "analyst", "sachet.test.analyst"),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["type"] == "flood"
    assert body["severity"] == "high"
    assert body["verification"] in {"needs_review", "low_confidence"}
    assert body["location"] == "Ganga, Dabri, Shahjahanpur"
    assert body["state"] == "Uttar Pradesh"
    assert body["lat"] == 27.49
    assert body["lng"] == 79.37
    assert body["geometry"] == report.geometry
    assert db.get(Event, event.id) is not None
    alert = db.query(OfficialAlert).filter_by(identifier=report.native_id).one()
    assert alert.sender == "CWC"
    assert alert.severity == "Severe"
    assert alert.areas == ["Dabri, Shahjahanpur, Uttar Pradesh"]
    assert alert.status == "active"
    official_response = client.get("/api/v1/official-alerts")
    assert official_response.status_code == 200, official_response.text
    official = official_response.json()["items"][0]
    assert official["sourceRecordId"] == report.native_id
    assert official["issuer"] == "CWC"
    assert official["expiresAt"] is not None

    process_raw_message(
        db,
        {
            "report_id": str(report.id),
            "source": "sachet",
            "native_id": report.native_id,
            "metadata": {"severity": "Severe", "event": "Flood", "message_type": "Alert"},
        },
        topic="alerts.raw",
    )
    db.commit()
    assert db.query(OfficialAlert).filter_by(identifier=report.native_id).count() == 1


def test_existing_sachet_report_replays_only_missing_official_alert(db, monkeypatch):
    source = Source(
        code="SRC-SACHET",
        name="SACHET / NDMA CAP alerts",
        kind="Official alert",
        source_type="official",
        category="api",
        reliability=0.6,
    )
    db.add(source)
    db.flush()
    observed_at = datetime.now(UTC).replace(microsecond=0)
    report = Report(
        source_id=source.id,
        native_id=f"IN-SACHET-BACKFILL-{uuid4()}",
        posted_at=observed_at,
        fetched_at=observed_at,
        text="An existing SACHET CAP alert already processed for human review.",
        status="needs_review",
        source_account="IMD-Test",
    )
    db.add(report)
    db.flush()
    envelope = IngestionEnvelope(
        report_id=uuid4(),
        source="sachet",
        source_account="IMD-Test",
        native_id=report.native_id,
        fetched_at=observed_at,
        posted_at=observed_at,
        text=report.text,
        raw_ref="https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=test",
        metadata={
            "event": "Rain",
            "urgency": "Immediate",
            "severity": "Severe",
            "certainty": "Observed",
            "expires": (observed_at + timedelta(hours=1)).isoformat(),
            "sender": "IMD-Test",
            "message_type": "Alert",
            "area_descriptions": ["Test district"],
        },
    )
    published = []
    monkeypatch.setattr("app.ingestion.base.bus.publish", lambda topic, value, key=None: published.append((topic, value, key)))

    assert persist_envelope(db, source, envelope) is False
    assert [topic for topic, _, _ in published] == ["alerts.raw", "observations.normalized"]
    replay = published[0][1]
    assert replay["report_id"] == str(report.id)
    assert process_raw_message(db, replay, topic="alerts.raw") is None
    db.commit()
    assert db.query(OfficialAlert).filter_by(identifier=report.native_id).count() == 1
    assert db.query(Event).count() == 0

    published.clear()
    assert persist_envelope(db, source, envelope) is False
    assert published == []