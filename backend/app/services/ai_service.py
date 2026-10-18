from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.intelligence.provider import AIAnalysisRequest, AIAnalysisPayload, get_ai_provider
from app.models.ai_analysis import AIAnalysis
from app.models.report import Report


def _build_request(report: Report) -> AIAnalysisRequest:
    return AIAnalysisRequest(
        report_id=str(report.id),
        report_text=report.text or "",
        location=report.place_text or report.city or report.state or None,
        event_type=report.event_type,
        source_account=report.source_account,
        metadata={
            "lat": report.lat,
            "lon": report.lon,
            "status": report.status,
            "event_type": report.event_type,
            "source_type": report.source_id if report.source_id else None,
        },
    )


def _save_analysis(db: Session, report_id: UUID, payload: AIAnalysisPayload) -> AIAnalysis:
    analysis = db.execute(select(AIAnalysis).where(AIAnalysis.report_id == report_id)).scalar_one_or_none()
    if analysis is None:
        analysis = AIAnalysis(report_id=report_id)
        db.add(analysis)
    analysis.status = payload.status
    analysis.event_category = payload.event_category
    analysis.summary = payload.summary or "AI analysis recorded."
    analysis.location = payload.location
    analysis.observed_time = payload.observed_time
    analysis.uncertainty = payload.uncertainty or None
    analysis.evidence_claims = payload.evidence_claims
    analysis.missing_information = payload.missing_information
    analysis.duplicate_references = payload.duplicate_references
    analysis.review_priority = payload.review_priority
    analysis.provider = payload.provider
    analysis.model = payload.model
    analysis.confidence = payload.confidence
    analysis.error = payload.error
    analysis.analysis_metadata = {
        "processed_at": payload.processed_at,
        "manual_review_available": payload.manual_review_available,
    }
    db.flush()
    return analysis


def _coerce_payload(payload, request) -> AIAnalysisPayload:
    if isinstance(payload, AIAnalysisPayload):
        return payload
    if isinstance(payload, dict):
        payload = {**payload, "provider": str(payload.get("provider") or "unknown"), "model": str(payload.get("model") or "n/a")}
        return AIAnalysisPayload.model_validate(payload)
    raise TypeError("AI provider returned an unsupported payload type")


def run_ai_analysis_for_report(db: Session, report_id: UUID) -> dict:
    report = db.get(Report, report_id)
    if report is None:
        raise AppError("REPORT_NOT_FOUND", "Report was not found", 404)

    provider = get_ai_provider()
    request = _build_request(report)
    is_disabled = getattr(provider, "is_disabled", lambda: False)()

    if is_disabled:
        payload = _coerce_payload(provider.analyze(request), request)
        analysis = _save_analysis(db, report.id, payload)
        db.commit()
        return analysis.to_api_dict()

    try:
        payload = _coerce_payload(provider.analyze(request), request)
    except Exception as exc:  # pragma: no cover - exercised through monkeypatching provider in tests
        payload = AIAnalysisPayload(
            status="failed",
            summary="AI analysis failed and manual review remains available.",
            location=request.location,
            provider="openai_compatible",
            model="n/a",
            confidence=0.0,
            error=str(exc),
            manual_review_available=True,
        )

    analysis = _save_analysis(db, report.id, payload)
    if payload.status == "completed" and payload.confidence is not None:
        report.event_type = payload.event_category
        report.event_type_confidence = float(payload.confidence)
    db.commit()
    return analysis.to_api_dict()


def get_ai_analysis_for_report(db: Session, report_id: UUID) -> dict:
    analysis = db.execute(select(AIAnalysis).where(AIAnalysis.report_id == report_id)).scalar_one_or_none()
    if analysis is None:
        return {
            "status": "not_started",
            "reportId": str(report_id),
            "manualReviewAvailable": True,
        }
    return analysis.to_api_dict()
