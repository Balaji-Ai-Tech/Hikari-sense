from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.report import Report
from app.models.source import Source
from tests.conftest import auth


def _event(db: Session, **kw) -> Event:
    src = db.query(Source).first()
    now = datetime.now(UTC)
    r = Report(
        source_id=src.id,
        native_id=kw.get("native", "n1"),
        posted_at=now,
        fetched_at=now,
        text=kw.get("text", "flood"),
        city=kw.get("city", "Hyderabad"),
        state=kw.get("state", "Telangana"),
        event_type=kw.get("type", "flood"),
        status="needs_review",
        lat=17.3,
        lon=78.4,
    )
    db.add(r)
    ev = Event(
        title="t",
        event_type=kw.get("type", "flood"),
        lat=17.3,
        lon=78.4,
        state=kw.get("state", "Telangana"),
        city=kw.get("city", "Hyderabad"),
        started_at=now,
        last_seen=now,
        report_count=1,
        source_count=1,
        confidence=0.5,
        status="NEEDS_REVIEW",
        verification=kw.get("verification", "needs_review"),
        severity="medium",
        summary="s",
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def test_filter_by_state_and_type(client, db):
    _event(db, native="a", type="flood", state="Telangana")
    _event(db, native="b", type="heatwave", state="Rajasthan", city="Jaipur")
    h = auth(client, db, "analyst")
    r = client.get("/api/v1/events", params={"state": "Telangana", "event_type": "flood"}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert all(i["state"] == "Telangana" for i in body["items"])
    assert "applied_filters" in body


def test_public_events_no_auth(client, db):
    _event(db, native="pub")
    r = client.get("/api/v1/public/events")
    assert r.status_code == 200
