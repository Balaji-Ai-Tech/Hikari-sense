from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.event import Event, EventReport
from app.models.report import Report
from app.models.source import Source
from app.models.user import User
from app.services.verification_service import report_queue
from tests.conftest import auth


def test_report_queue_supports_combined_filters_pagination_and_ordering(client, db):
    source = db.execute(select(Source).where(Source.code == "SRC-CITIZEN")).scalar_one()
    now = datetime.now(UTC)
    reports = [
        Report(
            source_id=source.id,
            native_id=f"report-{index}",
            posted_at=now - timedelta(minutes=index),
            fetched_at=now,
            text="flooded road",
            status="NEEDS_REVIEW",
            city="Hyderabad",
            state="Telangana",
            event_type="flood",
            lat=17.3,
            lon=78.4,
        )
        for index in range(3)
    ]
    db.add_all(reports)
    db.flush()
    event = Event(
        title="flood",
        event_type="flood",
        lat=17.3,
        lon=78.4,
        state="Telangana",
        city="Hyderabad",
        started_at=now,
        last_seen=now,
        status="NEEDS_REVIEW",
        verification="needs_review",
        report_count=3,
        source_count=1,
        summary="s",
    )
    db.add(event)
    db.flush()
    db.add_all(EventReport(event_id=event.id, report_id=report.id) for report in reports)
    db.commit()

    result = report_queue(
        db,
        status="needs_review",
        event_type="flood",
        severity=None,
        location="Hyderabad",
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(hours=1),
        has_media=False,
        ai_confidence_min=None,
        ai_confidence_max=None,
        source="citizen",
        priority="normal",
        page=2,
        page_size=1,
    )

    assert result["total"] == 3
    assert result["total_pages"] == 3
    assert result["page"] == 2
    assert result["page_size"] == 1
    assert [report.native_id for report in result["items"]] == ["report-1"]


def test_report_queue_rejects_invalid_pagination(client, db):
    response = client.get(
        "/api/v1/verification/reports/queue?page=0&page_size=25",
        headers=auth(client, db, "analyst"),
    )
    assert response.status_code == 422


def test_approve_creates_audit_and_notification(client, db):
    src = db.query(Source).first()
    now = datetime.now(UTC)
    from tests.conftest import token_for
    from sqlalchemy import select
    from app.models.user import User

    token_for(db, "citizen.notify", "citizen")
    citizen = db.execute(select(User).where(User.username == "citizen.notify")).scalar_one()
    report = Report(
        source_id=src.id,
        native_id="v1",
        submitted_by_user_id=citizen.id,
        posted_at=now,
        fetched_at=now,
        text="flooded road",
        status="needs_review",
        city="Hyderabad",
        state="Telangana",
        event_type="flood",
        lat=17.3,
        lon=78.4,
    )
    db.add(report)
    db.flush()
    ev = Event(
        title="flood",
        event_type="flood",
        lat=17.3,
        lon=78.4,
        state="Telangana",
        city="Hyderabad",
        started_at=now,
        last_seen=now,
        status="NEEDS_REVIEW",
        verification="needs_review",
        report_count=1,
        source_count=1,
        summary="s",
    )
    db.add(ev)
    db.flush()
    db.add(EventReport(event_id=ev.id, report_id=report.id))
    db.commit()
    h = auth(client, db, "verifier")
    r = client.post(
        f"/api/v1/admin/events/{ev.id}/approve",
        json={"reason": "Corroborated by multiple sources"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    audit = client.get("/api/v1/audit", headers=auth(client, db, "admin"))
    assert audit.status_code == 200
    actions = [a["action"] for a in audit.json()]
    assert any("approve" in a for a in actions)
    notes = client.get("/api/v1/notifications", headers=auth(client, db, "citizen", "citizen.notify"))
    assert notes.status_code == 200
    assert len(notes.json()) >= 1
