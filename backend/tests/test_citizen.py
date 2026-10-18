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


def test_citizen_review_queue_human_decision_and_audit(client, db):
    citizen_headers = auth(client, db, "citizen", "review.alice")
    submitted = client.post(
        "/api/v1/citizen/reports",
        data={"description": "Flood water reached the street", "location_text": "Hyderabad"},
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
    assert verified.json()["eventId"] is None
    assert verified.json()["reportId"] == report_id

    citizen_view = client.get(f"/api/v1/citizen/reports/{report_id}", headers=citizen_headers)
    assert citizen_view.status_code == 200
    assert citizen_view.json()["status"] == "verified"

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
