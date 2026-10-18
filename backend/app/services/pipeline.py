from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.kafka import bus
from app.core.metrics import EVENTS_PROCESSED, REPORTS_PROCESSED
from app.intelligence.classifier import classifier
from app.intelligence.dedup import compare_phash, compare_text, text_hash
from app.intelligence.event_clustering import cell
from app.intelligence.geoparser import geoparse, haversine_km
from app.intelligence.verification_engine import score_event
from app.models.event import Event, EventReport
from app.models.model_version import ModelPrediction
from app.models.official_observation import OfficialObservation
from app.models.report import Media, Report
from app.models.source import Source
from app.models.verification import Verification
from app.services.event_service import emit
from app.services.notification_service import notify

log = logging.getLogger(__name__)


def process_report(db: Session, report_id: UUID) -> Event:
    report = db.execute(select(Report).options(selectinload(Report.media)).where(Report.id == report_id)).scalar_one()
    linked_event_id = db.execute(select(EventReport.event_id).where(EventReport.report_id == report_id)).scalar_one_or_none()
    if linked_event_id:
        event = db.get(Event, linked_event_id)
        if event:
            log.info("PROCESSING_DUPLICATE_SKIPPED", extra={"report_id": str(report_id), "event_id": str(event.id)})
            return event

    pred = classifier.predict(report.text, report.media[0].scene_label if report.media else None)
    geo = geoparse(report.text, report.place_text, report.lat, report.lon)
    report.event_type = pred.frontend_type
    report.event_type_confidence = pred.confidence
    report.lang = pred.language
    report.text_hash = text_hash(report.text)
    if geo.lat is not None:
        report.lat = geo.lat
        report.lon = geo.lon
    report.state = geo.state or report.state
    report.district = geo.district or report.district
    report.city = geo.city or report.city
    report.geo_precision = geo.geo_precision
    report.geo_confidence = geo.geo_confidence
    report.status = "PROCESSING"
    db.add(
        ModelPrediction(
            report_id=report.id,
            model_name="weather-classifier",
            model_version=pred.model_version,
            language=pred.language,
            prediction=pred.event_type,
            confidence=pred.confidence,
            extras={"reason": pred.reason, "kind": pred.kind, "disclaimer": pred.disclaimer},
        )
    )
    _dedup(db, report)
    event = _correlate(db, report)
    _verify_event(db, event)
    report.status = event.verification
    REPORTS_PROCESSED.inc()
    EVENTS_PROCESSED.inc()
    emit("REPORT_STATUS_CHANGED", {"report_id": str(report.id), "status": report.status, "event_id": str(event.id)})
    if report.submitted_by_user_id:
        notify(
            db,
            user_id=report.submitted_by_user_id,
            ntype="REPORT_STATUS_CHANGED",
            title="Report updated",
            message=f"Status is now {report.status}. {pred.disclaimer}",
            report_id=report.id,
        )
    settings = get_settings()
    bus.publish(settings.kafka_topic_clean_reports, {"report_id": str(report.id)}, key=str(report.id))
    bus.publish(settings.kafka_topic_events_candidate, {"event_id": str(event.id)}, key=str(event.id))
    bus.publish(
        settings.kafka_topic_events_detected,
        {"event_id": str(event.id), "event_type": event.event_type, "status": event.status, "verification": event.verification},
        key=str(event.id),
    )
    return event


def _dedup(db: Session, report: Report) -> None:
    window = datetime.now(UTC) - timedelta(hours=get_settings().dedup_window_hours)
    others = db.execute(select(Report).options(selectinload(Report.media)).where(Report.id != report.id, Report.posted_at >= window)).scalars().all()
    for other in others:
        hit = compare_text(report.text, other.text) if report.text and other.text else None
        if hit:
            report.duplicate_of_id = other.id
            report.duplicate_status = "suspected"
            report.similarity = hit.score
            return
        for m in report.media:
            if m.sha256 and any(o.sha256 == m.sha256 for o in other.media):
                report.duplicate_of_id = other.id
                report.duplicate_status = "suspected"
                report.similarity = 1.0
                return
            for om in other.media:
                ph = compare_phash(m.phash, om.phash)
                if ph:
                    report.duplicate_of_id = other.id
                    report.duplicate_status = "suspected"
                    report.similarity = ph.score
                    m.authenticity = "recycled_suspected"
                    return


def _correlate(db: Session, report: Report) -> Event:
    loc = report.place_text or report.city or "Unknown"
    ev = Event(
        title=f"{report.event_type} · {loc}",
        event_type=report.event_type or "other",
        lat=report.lat,
        lon=report.lon,
        h3_cell=cell(report.lat, report.lon),
        state=report.state,
        district=report.district,
        city=report.city,
        started_at=report.posted_at,
        last_seen=report.posted_at,
        report_count=0,
        source_count=0,
        status="DETECTED",
        verification="needs_review",
        summary=report.text[:400],
    )
    db.add(ev)
    db.flush()
    _attach(db, ev, report)
    emit("EVENT_CREATED", {"event_id": str(ev.id)})
    log.info("EVENT_CREATED", extra={"event_id": str(ev.id), "report_id": str(report.id)})
    return ev


def _attach(db: Session, event: Event, report: Report) -> None:
    exists = db.execute(
        select(EventReport).where(EventReport.event_id == event.id, EventReport.report_id == report.id)
    ).scalar_one_or_none()
    if not exists:
        db.add(EventReport(event_id=event.id, report_id=report.id))
        db.flush()
    links = db.execute(select(EventReport).where(EventReport.event_id == event.id)).scalars().all()
    rids = [l.report_id for l in links]
    reports = db.execute(select(Report).options(selectinload(Report.media)).where(Report.id.in_(rids))).scalars().all()
    event.report_count = len(reports)
    event.source_count = len({r.source_id for r in reports})
    event.last_seen = max(r.posted_at for r in reports)
    event.started_at = min(r.posted_at for r in reports)
    event.images = sum(1 for r in reports for m in r.media if m.media_type == "image")
    event.videos = sum(1 for r in reports for m in r.media if m.media_type == "video")
    if report.lat is not None and event.lat is not None:
        event.lat = (event.lat * (event.report_count - 1) + report.lat) / event.report_count
        event.lon = (event.lon * (event.report_count - 1) + (report.lon or event.lon)) / event.report_count
    event.status = "CORRELATED" if event.report_count > 1 else "ANALYZED"


def _verify_event(db: Session, event: Event) -> None:
    links = db.execute(select(EventReport).where(EventReport.event_id == event.id)).scalars().all()
    reports = db.execute(
        select(Report).options(selectinload(Report.media), selectinload(Report.source)).where(
            Report.id.in_([l.report_id for l in links])
        )
    ).scalars().all()
    types = [r.source.source_type if r.source else "citizen" for r in reports]
    coords = [(r.lat, r.lon) for r in reports if r.lat is not None and r.lon is not None]
    spread = None
    if len(coords) >= 2:
        spread = max(haversine_km(a[0], a[1], b[0], b[1]) for i, a in enumerate(coords) for b in coords[i + 1 :])
    times = [r.posted_at for r in reports]
    span = (max(times) - min(times)).total_seconds() / 3600 if times else 0
    auth_vals = []
    recycled = False
    for r in reports:
        for m in r.media:
            if m.authenticity == "recycled_suspected":
                recycled = True
                auth_vals.append(0.2)
            else:
                auth_vals.append(0.6 if m.sha256 else 0.4)
    media_avg = sum(auth_vals) / len(auth_vals) if auth_vals else 0.4
    official = db.execute(
        select(OfficialObservation).where(
            OfficialObservation.event_id == event.id,
            OfficialObservation.agency != "Open-Meteo",
        )
    ).first() is not None
    if not official and event.lat is not None:
        near = db.execute(
            select(OfficialObservation).where(OfficialObservation.agency != "Open-Meteo")
        ).scalars().all()
        official = any(
            o.lat is not None
            and haversine_km(event.lat, event.lon or 0, o.lat, o.lon or 0) < 50
            and abs((o.observed_at - event.last_seen).total_seconds()) < 6 * 3600
            for o in near
        )
    sig = score_event(
        source_types=types,
        unique_sources=len(set(types)),
        report_count=len(reports),
        spatial_spread_km=spread,
        time_span_hours=span,
        media_authenticity_avg=media_avg,
        official_agree=official,
        recycled_image=recycled,
    )
    event.confidence = sig.score
    event.verification = "needs_review"
    event.status = "NEEDS_REVIEW"
    db.add(
        Verification(
            event_id=event.id,
            source_reliability=sig.source_reliability,
            corroboration=sig.corroboration,
            spatial_consistency=sig.spatial_consistency,
            temporal_consistency=sig.temporal_consistency,
            media_authenticity=sig.media_authenticity,
            score=sig.score,
            decision=sig.auto_decision,
            signals={
                "official_boost": sig.official_boost,
                "recycled_cap_applied": sig.recycled_cap_applied,
                "disclaimer": sig.disclaimer,
            },
            to_state=event.status,
        )
    )
    log.info(
        "VERIFICATION_COMPLETED",
        extra={"event_id": str(event.id), "verification": event.verification, "score": sig.score},
    )
    emit("EVENT_UPDATED", {"event_id": str(event.id), "verification": event.verification, "score": sig.score})
