from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import get_settings
from app.models.ai_analysis import AIAnalysis
from app.models.report import Report
from app.models.source import Source
from tests.conftest import auth


def _make_report(db, text: str = "Road flooded near the market") -> Report:
    source = db.query(Source).filter(Source.code == "SRC-CITIZEN").one()
    report = Report(
        source_id=source.id,
        native_id="citizen-ai-report-1",
        posted_at=datetime.now(UTC),
        fetched_at=datetime.now(UTC),
        text=text,
        lang="en",
        status="RECEIVED",
        place_text="Hyderabad",
        lat=17.385,
        lon=78.4867,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def test_ai_analysis_persists_structured_output(db, client, monkeypatch):
    report = _make_report(db)

    class DummyProvider:
        def analyze(self, request):
            return {
                "status": "completed",
                "event_category": "flooding",
                "summary": "Waterlogging reported in a busy market area.",
                "location": "Hyderabad",
                "observed_time": "2026-10-14T10:30:00Z",
                "uncertainty": "Time estimated from user report.",
                "evidence_claims": ["Flooding reported near market", "Road blocked"],
                "missing_information": ["Exact depth not provided"],
                "duplicate_references": [],
                "review_priority": "high",
                "provider": "openai_compatible",
                "model": "demo-gpt",
                "confidence": 0.87,
                "error": None,
            }

    monkeypatch.setattr("app.services.ai_service.get_ai_provider", lambda: DummyProvider())

    analyst_headers = auth(client, db, "analyst")
    result = client.post(
        f"/api/v1/ai/reports/{report.id}/analyze",
        headers=analyst_headers,
    )
    assert result.status_code == 200, result.text
    payload = result.json()
    assert payload["status"] == "completed"
    assert payload["eventCategory"] == "flooding"
    assert payload["confidence"] == 0.87

    saved = db.execute(select(AIAnalysis).where(AIAnalysis.report_id == report.id)).scalar_one()
    assert saved.status == "completed"
    assert saved.event_category == "flooding"
    assert saved.provider == "openai_compatible"

    retrieved = client.get(f"/api/v1/ai/reports/{report.id}", headers=analyst_headers)
    assert retrieved.status_code == 200, retrieved.text
    assert retrieved.json()["evidenceClaims"] == ["Flooding reported near market", "Road blocked"]
    assert retrieved.json()["model"] == "demo-gpt"

    citizen = client.get(f"/api/v1/ai/reports/{report.id}", headers=auth(client, db, "citizen"))
    assert citizen.status_code == 403


def test_ai_analysis_disabled_state_is_safe(db, client, monkeypatch):
    report = _make_report(db)
    monkeypatch.setattr(get_settings(), "ai_provider", "disabled")

    result = client.post(
        f"/api/v1/ai/reports/{report.id}/analyze",
        headers=auth(client, db, "analyst"),
    )
    assert result.status_code == 200, result.text
    payload = result.json()
    assert payload["status"] == "disabled"
    assert payload["manualReviewAvailable"] is True


def test_ai_provider_failure_persists_manual_review_fallback(db, client, monkeypatch):
    report = _make_report(db)

    class FailingProvider:
        def is_disabled(self):
            return False

        def analyze(self, request):
            raise RuntimeError("simulated provider outage")

    monkeypatch.setattr("app.services.ai_service.get_ai_provider", lambda: FailingProvider())
    headers = auth(client, db, "analyst")

    response = client.post(f"/api/v1/ai/reports/{report.id}/analyze", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error"] == "simulated provider outage"
    assert payload["manualReviewAvailable"] is True

    saved = db.execute(select(AIAnalysis).where(AIAnalysis.report_id == report.id)).scalar_one()
    assert saved.status == "failed"
    db.refresh(report)
    assert report.status == "RECEIVED"


def test_ai_analysis_requires_permission(db, client):
    report = _make_report(db)
    res = client.post(f"/api/v1/ai/reports/{report.id}/analyze", headers=auth(client, db, "citizen"))
    assert res.status_code == 403
