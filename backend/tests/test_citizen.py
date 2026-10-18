from io import BytesIO
from types import SimpleNamespace

from app.models.report import Media, Report
from app.models.source import Source
from tests.conftest import auth, token_for


def test_citizen_submit_and_own_only(client, db):
    h = auth(client, db, "citizen", "alice")
    files = {"files": ("flood.jpg", BytesIO(b"\xff\xd8\xff\xd9fakejpeg"), "image/jpeg")}
    data = {
        "description": "Water entered houses and the road is flooded in Hyderabad",
        "location_text": "Hyderabad",
        "latitude": "17.385",
        "longitude": "78.4867",
    }
    r = client.post("/api/v1/citizen/reports", data=data, files=files, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "RECEIVED"
    rid = body["report_id"]
    mine = client.get("/api/v1/citizen/reports", headers=h)
    assert mine.status_code == 200
    assert any(str(x["id"]) == rid for x in mine.json())
    bob = {"Authorization": f"Bearer {token_for(db, 'bob', 'citizen')}"}
    other = client.get(f"/api/v1/citizen/reports/{rid}", headers=bob)
    assert other.status_code == 403
    own_detail = client.get(f"/api/v1/citizen/reports/{rid}", headers=h)
    assert own_detail.status_code == 200
    assert own_detail.json()["aiClassification"] is None
    assert own_detail.json()["aiConfidence"] is None
    assert own_detail.json()["duplicateOf"] is None
    assert own_detail.json()["eventId"] is None
    assert mine.json()[0]["triage"] is None


def test_reject_bad_file(client, db):
    h = auth(client, db, "citizen", "alice2")
    files = {"files": ("note.exe", BytesIO(b"MZ"), "application/x-msdownload")}
    r = client.post(
        "/api/v1/citizen/reports",
        data={"description": "test file", "location_text": "Delhi"},
        files=files,
        headers=h,
    )
    assert r.status_code == 400


def test_reject_invalid_citizen_coordinates(client, db):
    response = client.post(
        "/api/v1/citizen/reports",
        data={
            "description": "Flood report",
            "location_text": "Hyderabad",
            "latitude": "91",
            "longitude": "78.4",
        },
        headers=auth(client, db, "citizen", "invalid.coordinates"),
    )
    assert response.status_code == 400
    assert "INVALID_COORDINATES" in response.text


def test_citizen_review_queue_human_decision_and_audit(client, db):
    citizen_headers = auth(client, db, "citizen", "review.alice")
    submitted = client.post(
        "/api/v1/citizen/reports",
        data={
            "description": "Flood water reached the street",
            "event_type": "flood",
            "location_text": "Hyderabad",
        },
        headers=citizen_headers,
    )
    assert submitted.status_code == 200, submitted.text
    report_id = submitted.json()["report_id"]

    denied_queue = client.get("/api/v1/verification/reports/queue", headers=citizen_headers)
    assert denied_queue.status_code == 403

    analyst_headers = auth(client, db, "analyst")
    queue = client.get("/api/v1/verification/reports/queue", headers=analyst_headers)
    assert queue.status_code == 200, queue.text
    assert any(str(report["id"]) == report_id for report in queue.json()["items"])

    start = client.post(
        f"/api/v1/verification/reports/{report_id}/decide",
        json={"action": "start_review", "reason": "Begin analyst review"},
        headers=analyst_headers,
    )
    assert start.status_code == 200, start.text
    assert start.json()["toState"] == "UNDER_REVIEW"

    analyst_verify = client.post(
        f"/api/v1/verification/reports/{report_id}/decide",
        json={"action": "verify", "reason": "Analyst cannot make final decision"},
        headers=analyst_headers,
    )
    assert analyst_verify.status_code == 403

    verifier_headers = auth(client, db, "verifier")
    verified = client.post(
        f"/api/v1/verification/reports/{report_id}/decide",
        json={"action": "verify", "reason": "Evidence reviewed and corroborated"},
        headers=verifier_headers,
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["eventId"] is not None
    assert verified.json()["reportId"] == report_id

    citizen_view = client.get(f"/api/v1/citizen/reports/{report_id}", headers=citizen_headers)
    assert citizen_view.status_code == 200
    assert citizen_view.json()["status"] == "verified"
    own_reports = client.get("/api/v1/citizen/reports", headers=citizen_headers)
    own_report = next(item for item in own_reports.json() if item["id"] == report_id)
    assert own_report["status"] == "VERIFIED"
    assert own_report["hazard"] == "flood"

    history = client.get(
        f"/api/v1/verification/reports/{report_id}/decisions",
        headers=verifier_headers,
    )
    assert history.status_code == 200
    assert [decision["action"] for decision in history.json()] == ["verify", "start_review"]

    report_audit = client.get(
        f"/api/v1/verification/reports/{report_id}/audit",
        headers=analyst_headers,
    )
    assert report_audit.status_code == 200
    assert any(entry["action"] == "verification.report.verify" for entry in report_audit.json())

    audit = client.get("/api/v1/audit", headers=auth(client, db, "admin"))
    assert audit.status_code == 200
    assert any(entry["action"] == "verification.report.verify" for entry in audit.json())


def test_report_approval_publishes_one_verified_incident_and_is_idempotent(
    client, db, monkeypatch
):
    from sqlalchemy import func, select
    from app.models.audit_log import AuditLog
    from app.models.event import Event, EventReport
    from app.models.verification import Verification
    from app.models.user import User
    from app.services import report_service
    from app.core.kafka import bus
    from tests.conftest import token_for

    monkeypatch.setattr(report_service, "get_storage", lambda: object())
    monkeypatch.setattr(bus, "publish", lambda *_args, **_kwargs: None)

    citizen_headers = auth(client, db, "citizen", "map.owner")
    submitted = client.post(
        "/api/v1/citizen/reports",
        data={
            "description": "Flood water covered the road in Hyderabad",
            "event_type": "flood",
            "location_text": "Hyderabad",
            "latitude": "17.385",
            "longitude": "78.4867",
        },
        headers=citizen_headers,
    )
    report_id = submitted.json()["report_id"]
    report = db.get(Report, report_id)
    report.status = "UNDER_REVIEW"
    db.commit()
    verifier_headers = auth(client, db, "verifier", "map.verifier")
    verifier = db.execute(select(User).where(User.username == "map.verifier")).scalar_one()

    pending = client.get("/api/v1/public/events")
    assert pending.status_code == 200
    assert all(str(item["id"]) != report_id for item in pending.json()["items"])

    decision = client.post(
        f"/api/v1/verification/reports/{report_id}/decide",
        json={"action": "verify", "reason": "Evidence and location reviewed"},
        headers=verifier_headers,
    )
    assert decision.status_code == 200, decision.text
    event_id = decision.json()["eventId"]
    assert event_id
    incident = db.get(Event, event_id)
    assert incident.verification == "verified"
    assert incident.lat == 17.385 and incident.lon == 78.4867
    assert db.scalar(select(EventReport).where(EventReport.report_id == report.id)).event_id == incident.id

    published = client.get("/api/v1/public/events")
    assert published.status_code == 200
    item = next(item for item in published.json()["items"] if item["id"] == event_id)
    assert item["verification"] == "verified"
    assert item["lat"] == 17.39 and item["lng"] == 78.49
    assert item["reportIds"] == [] and item["sourceIds"] == []
    details = client.get(f"/api/v1/events/{event_id}", headers=verifier_headers)
    assert details.status_code == 200
    assert details.json()["verification"] == "verified"
    linked_reports = client.get(
        f"/api/v1/events/{event_id}/reports", headers=verifier_headers
    )
    assert linked_reports.status_code == 200
    assert linked_reports.json()[0]["status"] == "verified"

    repeated = client.post(
        f"/api/v1/verification/reports/{report_id}/decide",
        json={"action": "verify", "reason": "Evidence and location reviewed"},
        headers=verifier_headers,
    )
    assert repeated.status_code == 200
    assert repeated.json()["id"] == decision.json()["id"]
    assert db.scalar(select(EventReport).where(EventReport.report_id == report.id)).event_id == incident.id
    assert db.scalar(
        select(func.count()).select_from(Verification).where(Verification.report_id == report.id)
    ) == 1
    audit = db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "Report",
            AuditLog.entity_id == str(report.id),
            AuditLog.action == "verification.report.verify",
        )
    ).scalar_one()
    assert audit.actor_user_id == verifier.id


def test_rejection_updates_only_own_report_and_never_publishes_event(client, db):
    from datetime import UTC, datetime
    from sqlalchemy import select
    from app.models.audit_log import AuditLog
    from app.models.event import Event, EventReport
    from app.models.user import User
    from app.models.verification import Verification
    from tests.conftest import token_for

    token_for(db, "reject.owner", "citizen")
    citizen = db.execute(select(User).where(User.username == "reject.owner")).scalar_one()
    source = db.query(Source).filter(Source.code == "SRC-CITIZEN").one()
    now = datetime.now(UTC)
    report = Report(
        source_id=source.id,
        native_id="rejected-report-lifecycle",
        submitted_by_user_id=citizen.id,
        source_account=citizen.username,
        posted_at=now,
        fetched_at=now,
        text="Unsubstantiated flood report",
        event_type="flood",
        status="UNDER_REVIEW",
        lat=17.385,
        lon=78.4867,
    )
    event = Event(
        title="Flood · Hyderabad",
        event_type="flood",
        lat=17.385,
        lon=78.4867,
        started_at=now,
        last_seen=now,
        report_count=1,
        source_count=1,
        status="NEEDS_REVIEW",
        verification="needs_review",
    )
    db.add_all([report, event])
    db.flush()
    db.add(EventReport(event_id=event.id, report_id=report.id))
    db.commit()
    verifier_headers = auth(client, db, "verifier", "reject.verifier")
    verifier = db.execute(select(User).where(User.username == "reject.verifier")).scalar_one()

    response = client.post(
        f"/api/v1/verification/reports/{report.id}/decide",
        json={"action": "reject", "reason": "Evidence does not support the reported event"},
        headers=verifier_headers,
    )
    assert response.status_code == 200, response.text
    db.expire_all()
    assert db.get(Report, report.id).status == "REJECTED"
    assert db.get(Event, event.id).verification == "rejected"
    assert db.scalar(
        select(Verification).where(Verification.report_id == report.id)
    ).decided_by == verifier.id
    audit = db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "Report",
            AuditLog.entity_id == str(report.id),
            AuditLog.action == "verification.report.reject",
        )
    ).scalar_one()
    assert audit.actor_user_id == verifier.id

    published = client.get("/api/v1/public/events")
    assert all(item["id"] != str(event.id) for item in published.json()["items"])
    owner_headers = auth(client, db, "citizen", "reject.owner")
    own = client.get("/api/v1/citizen/reports", headers=owner_headers)
    assert next(item for item in own.json() if item["id"] == str(report.id))["status"] == "REJECTED"


def test_concurrent_conflicting_report_decisions_commit_only_one(client, db, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from datetime import UTC, datetime
    from threading import Barrier
    from sqlalchemy import func, select
    from app.core.database import SessionLocal
    from app.core.security import Principal
    from app.models.event import EventReport
    from app.models.user import User
    from app.models.verification import Verification
    from app.services import verification_service
    from tests.conftest import token_for

    token_for(db, "concurrent.verifier", "verifier")
    verifier = db.execute(select(User).where(User.username == "concurrent.verifier")).scalar_one()
    source = db.query(Source).filter(Source.code == "SRC-CITIZEN").one()
    now = datetime.now(UTC)
    report = Report(
        source_id=source.id,
        native_id="concurrent-report-decision",
        posted_at=now,
        fetched_at=now,
        text="Concurrent decision test",
        event_type="flood",
        status="UNDER_REVIEW",
    )
    db.add(report)
    db.commit()
    principal = Principal(str(verifier.id), verifier.username, ["verifier"])
    barrier = Barrier(2)
    monkeypatch.setattr(verification_service, "emit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(verification_service.bus, "publish", lambda *_args, **_kwargs: None)

    def decide(action: str) -> str | int:
        session = SessionLocal()
        try:
            barrier.wait(timeout=10)
            verification_service.decide_report(
                session,
                principal,
                report.id,
                action,
                "Concurrent decision test",
            )
            return "committed"
        except Exception as exc:
            if getattr(exc, "status_code", None) == 409:
                return 409
            raise
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(decide, ["verify", "reject"]))

    assert outcomes.count("committed") == 1
    assert outcomes.count(409) == 1
    db.expire_all()
    persisted = db.get(Report, report.id)
    assert persisted.status in {"VERIFIED", "REJECTED"}
    assert db.scalar(
        select(func.count()).select_from(Verification).where(
            Verification.report_id == report.id,
            Verification.decided_by.is_not(None),
        )
    ) == 1
    link_count = db.scalar(
        select(func.count()).select_from(EventReport).where(EventReport.report_id == report.id)
    )
    assert link_count == (1 if persisted.status == "VERIFIED" else 0)


def test_failed_report_approval_commit_leaves_no_incident_or_decision(client, db, monkeypatch):
    from datetime import UTC, datetime
    import pytest
    from sqlalchemy import func, select
    from app.core.security import Principal
    from app.models.audit_log import AuditLog
    from app.models.event import Event, EventReport
    from app.models.user import User
    from app.models.verification import Verification
    from app.services import verification_service
    from tests.conftest import token_for

    token_for(db, "commit.failure.verifier", "verifier")
    verifier = db.execute(
        select(User).where(User.username == "commit.failure.verifier")
    ).scalar_one()
    source = db.query(Source).filter(Source.code == "SRC-CITIZEN").one()
    now = datetime.now(UTC)
    report = Report(
        source_id=source.id,
        native_id="failed-approval-commit",
        posted_at=now,
        fetched_at=now,
        text="Commit failure test",
        event_type="flood",
        status="UNDER_REVIEW",
        lat=17.385,
        lon=78.4867,
    )
    db.add(report)
    db.commit()
    principal = Principal(str(verifier.id), verifier.username, ["verifier"])

    def fail_commit():
        raise RuntimeError("simulated database commit failure")

    monkeypatch.setattr(db, "commit", fail_commit)
    try:
        with pytest.raises(RuntimeError, match="simulated database commit failure"):
            verification_service.decide_report(
                db,
                principal,
                report.id,
                "verify",
                "Commit failure test",
            )
    finally:
        db.rollback()
    db.expire_all()

    assert db.get(Report, report.id).status == "UNDER_REVIEW"
    assert db.scalar(select(func.count()).select_from(Event)) == 0
    assert db.scalar(
        select(func.count()).select_from(EventReport).where(EventReport.report_id == report.id)
    ) == 0
    assert db.scalar(
        select(func.count()).select_from(Verification).where(Verification.report_id == report.id)
    ) == 0
    assert db.scalar(
        select(func.count()).select_from(AuditLog).where(
            AuditLog.entity_type == "Report", AuditLog.entity_id == str(report.id)
        )
    ) == 0


def test_pending_and_rejected_reports_never_enter_public_verified_events(client, db):
    from datetime import UTC, datetime
    from app.models.event import Event, EventReport
    from app.models.verification import Verification

    source = db.query(Source).filter(Source.code == "SRC-CITIZEN").one()
    now = datetime.now(UTC)
    pending = Report(
        source_id=source.id,
        native_id="pending-public-filter",
        posted_at=now,
        fetched_at=now,
        text="Pending report",
        event_type="flood",
        status="UNDER_REVIEW",
        lat=17.385,
        lon=78.4867,
    )
    rejected = Report(
        source_id=source.id,
        native_id="rejected-public-filter",
        posted_at=now,
        fetched_at=now,
        text="Rejected report",
        event_type="flood",
        status="REJECTED",
        lat=17.385,
        lon=78.4867,
    )
    db.add_all([pending, rejected])
    db.flush()
    ai_only = Event(
        title="AI recommendation",
        event_type="flood",
        lat=17.385,
        lon=78.4867,
        started_at=now,
        last_seen=now,
        status="CORROBORATED",
        verification="verified",
    )
    rejected_event = Event(
        title="Rejected event",
        event_type="flood",
        lat=17.385,
        lon=78.4867,
        started_at=now,
        last_seen=now,
        status="REJECTED",
        verification="rejected",
    )
    db.add_all([ai_only, rejected_event])
    db.flush()
    db.add_all(
        [
            EventReport(event_id=ai_only.id, report_id=pending.id),
            EventReport(event_id=rejected_event.id, report_id=rejected.id),
            Verification(event_id=ai_only.id, decision="AUTO_VERIFIED", score=0.99),
        ]
    )
    db.commit()

    response = client.get("/api/v1/public/events")
    assert response.status_code == 200
    assert str(ai_only.id) not in {item["id"] for item in response.json()["items"]}
    assert str(rejected_event.id) not in {item["id"] for item in response.json()["items"]}


def test_citizen_media_is_owner_and_review_role_protected(client, db, monkeypatch):
    from app.api.v1 import media as media_api

    citizen_headers = auth(client, db, "citizen", "media.owner")
    submitted = client.post(
        "/api/v1/citizen/reports",
        data={"description": "Photo evidence", "location_text": "Hyderabad"},
        headers=citizen_headers,
    )
    report_id = submitted.json()["report_id"]
    report = db.get(Report, report_id)
    media = Media(report_id=report.id, uri="file://media/evidence.jpg", media_type="image", filename="evidence.jpg")
    db.add(media)
    db.commit()
    monkeypatch.setattr(media_api, "get_storage", lambda: SimpleNamespace(get_bytes=lambda _: b"image-data"))

    owner_response = client.get(f"/api/v1/media/{media.id}", headers=citizen_headers)
    assert owner_response.status_code == 200
    assert owner_response.content == b"image-data"

    other_citizen = {"Authorization": f"Bearer {token_for(db, 'media.other', 'citizen')}"}
    other_response = client.get(f"/api/v1/media/{media.id}", headers=other_citizen)
    assert other_response.status_code == 403

    analyst_response = client.get(f"/api/v1/media/{media.id}", headers=auth(client, db, "analyst"))
    assert analyst_response.status_code == 200
    operator_response = client.get(f"/api/v1/media/{media.id}", headers=auth(client, db, "system_operator"))
    assert operator_response.status_code == 403


def test_nearby_source_evidence_is_context_not_automatic_corroboration(client, db):
    citizen_headers = auth(client, db, "citizen", "evidence.owner")
    submitted = client.post(
        "/api/v1/citizen/reports",
        data={
            "description": "Flooded road near the river",
            "location_text": "Hyderabad",
            "latitude": "17.385",
            "longitude": "78.4867",
        },
        headers=citizen_headers,
    )
    assert submitted.status_code == 200
    report_id = submitted.json()["report_id"]
    report = db.get(Report, report_id)
    source = Source(
        code="SRC-FIRMS",
        name="NASA FIRMS",
        kind="Satellite",
        source_type="scientific",
        category="dataset",
        reliability=0.88,
        is_live=True,
        health_label="CONNECTED",
    )
    db.add(source)
    db.flush()
    db.add(
        Report(
            source_id=source.id,
            native_id="firms-nearby-1",
            posted_at=report.posted_at,
            fetched_at=report.fetched_at,
            text="Satellite thermal observation",
            status="OBSERVATION",
            lat=17.39,
            lon=78.49,
        )
    )
    db.commit()

    evidence = client.get(
        f"/api/v1/verification/reports/{report_id}/evidence",
        headers=auth(client, db, "analyst"),
    )
    assert evidence.status_code == 200, evidence.text
    firms = next(item for item in evidence.json() if item["sourceCode"] == "SRC-FIRMS")
    assert firms["distanceKm"] < 1
    assert firms["minutesApart"] == 0
    assert firms["classification"] == "POTENTIAL_CONTEXT"
    assert "not automatic corroboration" in firms["note"]

    denied = client.get(f"/api/v1/verification/reports/{report_id}/evidence", headers=citizen_headers)
    assert denied.status_code == 403


def test_duplicate_resolution_requires_verifier_and_is_audited(client, db):
    from datetime import UTC, datetime
    from sqlalchemy import select
    from app.models.audit_log import AuditLog

    source = db.query(Source).filter(Source.code == "SRC-CITIZEN").one()
    report = Report(
        source_id=source.id,
        native_id="duplicate-audit-test",
        posted_at=datetime.now(UTC),
        fetched_at=datetime.now(UTC),
        text="Duplicate test report",
        status="needs_review",
    )
    db.add(report)
    db.commit()

    path = f"/api/v1/reports/{report.id}/duplicate?resolution=merged"
    denied = client.post(path, headers=auth(client, db, "analyst"))
    assert denied.status_code == 403

    accepted = client.post(path, headers=auth(client, db, "verifier"))
    assert accepted.status_code == 200
    assert accepted.json()["duplicateStatus"] == "merged"
    entry = db.execute(
        select(AuditLog).where(AuditLog.action == "duplicate.resolve", AuditLog.entity_id == str(report.id))
    ).scalar_one()
    assert entry.actor_role == "verifier"


def test_report_review_queue_combines_filters_and_paginates(client, db):
    from datetime import UTC, datetime, timedelta

    source = db.query(Source).filter(Source.code == "SRC-CITIZEN").one()
    now = datetime.now(UTC)
    reports = []
    for index in range(3):
        report = Report(
            source_id=source.id,
            native_id=f"queue-filter-{index}",
            posted_at=now - timedelta(minutes=index),
            fetched_at=now,
            created_at=now - timedelta(minutes=index),
            text=f"Flood report {index}",
            place_text="Hyderabad" if index < 2 else "Warangal",
            event_type="flood",
            event_type_confidence=0.8,
            status="RECEIVED",
            lat=17.385,
            lon=78.4867,
        )
        db.add(report)
        db.flush()
        if index < 2:
            db.add(
                Media(
                    report_id=report.id,
                    uri=f"file://media/queue-filter-{index}.jpg",
                    media_type="image",
                    filename=f"queue-filter-{index}.jpg",
                )
            )
        reports.append(report)
    db.commit()

    headers = auth(client, db, "analyst")
    params = {
        "status": "received",
        "event_type": "flood",
        "location": "Hyderabad",
        "has_media": "true",
        "ai_confidence_min": "0.7",
        "priority": "low",
        "page_size": "1",
    }
    first = client.get("/api/v1/verification/reports/queue", params={**params, "page": 1}, headers=headers)
    second = client.get("/api/v1/verification/reports/queue", params={**params, "page": 2}, headers=headers)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["total"] == 2
    assert first.json()["total_pages"] == 2
    assert first.json()["page"] == 1
    assert second.json()["page"] == 2
    assert first.json()["items"][0]["id"] != second.json()["items"][0]["id"]
    assert first.json()["items"][0]["priority"] == "low"

    invalid_range = client.get(
        "/api/v1/verification/reports/queue",
        params={"ai_confidence_min": "0.9", "ai_confidence_max": "0.2"},
        headers=headers,
    )
    assert invalid_range.status_code == 422


def test_admin_assignment_reassignment_unassignment_and_workload_are_audited(client, db):
    from datetime import UTC, datetime
    from sqlalchemy import select
    from app.models.audit_log import AuditLog
    from app.models.user import User

    source = db.query(Source).filter(Source.code == "SRC-CITIZEN").one()
    report = Report(
        source_id=source.id,
        native_id="assignment-history-test",
        posted_at=datetime.now(UTC),
        fetched_at=datetime.now(UTC),
        text="Report awaiting reviewer assignment",
        status="RECEIVED",
    )
    db.add(report)
    db.commit()

    token_for(db, "reviewer.one", "verifier")
    token_for(db, "reviewer.two", "analyst")
    reviewer_one = db.execute(select(User).where(User.username == "reviewer.one")).scalar_one()
    reviewer_two = db.execute(select(User).where(User.username == "reviewer.two")).scalar_one()
    admin_headers = auth(client, db, "admin")

    denied = client.put(
        f"/api/v1/verification/reports/{report.id}/assignment",
        json={"reviewer_id": str(reviewer_one.id), "reason": "Unauthorized assignment"},
        headers=auth(client, db, "analyst"),
    )
    assert denied.status_code == 403

    directory = client.get("/api/v1/verification/reviewers", headers=admin_headers)
    assert directory.status_code == 200
    assert {item["username"] for item in directory.json()} >= {"reviewer.one", "reviewer.two"}

    assigned = client.put(
        f"/api/v1/verification/reports/{report.id}/assignment",
        json={"reviewer_id": str(reviewer_one.id), "reason": "Initial assignment"},
        headers=admin_headers,
    )
    assert assigned.status_code == 200, assigned.text
    assert len(assigned.json()) == 1
    assert assigned.json()[0]["active"] is True

    assigned_queue = client.get(
        "/api/v1/verification/reports/queue",
        params={"reviewer_id": str(reviewer_one.id)},
        headers=admin_headers,
    )
    assert assigned_queue.status_code == 200
    assert assigned_queue.json()["total"] == 1
    assert assigned_queue.json()["items"][0]["reviewer_id"] == str(reviewer_one.id)
    assert assigned_queue.json()["items"][0]["reviewer_name"] == "reviewer.one"

    workload = client.get("/api/v1/verification/reviewers", headers=admin_headers).json()
    reviewer_workload = next(item for item in workload if item["id"] == str(reviewer_one.id))
    assert reviewer_workload["active_assignments"] == 1

    reassigned = client.put(
        f"/api/v1/verification/reports/{report.id}/assignment",
        json={"reviewer_id": str(reviewer_two.id), "reason": "Reassign to analyst"},
        headers=admin_headers,
    )
    assert reassigned.status_code == 200
    assert len(reassigned.json()) == 2
    assert reassigned.json()[0]["active"] is True
    assert reassigned.json()[1]["active"] is False

    unassigned = client.put(
        f"/api/v1/verification/reports/{report.id}/assignment",
        json={"reviewer_id": None, "reason": "Return to unassigned queue"},
        headers=admin_headers,
    )
    assert unassigned.status_code == 200
    assert len(unassigned.json()) == 2
    assert all(entry["active"] is False for entry in unassigned.json())

    audit_rows = db.execute(
        select(AuditLog).where(
            AuditLog.action == "verification.assignment.change",
            AuditLog.entity_id == str(report.id),
        )
    ).scalars().all()
    assert len(audit_rows) == 3
    assert all(entry.actor_role == "admin" for entry in audit_rows)
