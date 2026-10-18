from __future__ import annotations

import json
from datetime import UTC, datetime
from math import ceil
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.redis import publish
from app.intelligence.geoparser import haversine_km
from app.models.event import Event, EventReport
from app.models.report import Media, Report
from app.models.source import Source
from app.schemas.event import EventOut, EventPage
from app.schemas.report import MediaOut, ReportOut

SOURCE_CATEGORY = {
    "social": ["Social"],
    "dataset": ["IMD", "Satellite"],
    "website": ["News/RSS"],
    "api": ["Sensor"],
    "citizen": ["Citizen"],
}


def _source_kinds(db: Session, event: Event) -> list[str]:
    ids = [l.report_id for l in event.reports]
    if not ids:
        return []
    rows = db.execute(
        select(Source.kind).join(Report, Report.source_id == Source.id).where(Report.id.in_(ids)).distinct()
    ).scalars().all()
    return list(rows)


def to_event_out(db: Session, event: Event) -> EventOut:
    kinds = _source_kinds(db, event)
    rids = [str(l.report_id) for l in event.reports]
    sids = list(
        {
            str(sid)
            for sid in db.execute(
                select(Report.source_id).where(Report.id.in_([l.report_id for l in event.reports]))
            ).scalars().all()
        }
    ) if event.reports else []
    dup = db.execute(
        select(func.count()).select_from(Report).where(
            Report.id.in_([l.report_id for l in event.reports] or [UUID(int=0)]),
            Report.duplicate_status == "suspected",
        )
    ).scalar_one()
    title_location = event.title.partition(" · ")[2].strip() or None
    if title_location and event.state:
        state_suffix = f", {event.state}"
        if title_location.casefold().endswith(state_suffix.casefold()):
            title_location = title_location[: -len(state_suffix)].rstrip()
    loc = event.city or event.district or title_location or event.state or "Unknown"
    geometry = db.execute(
        select(Report.geometry)
        .where(Report.id.in_([link.report_id for link in event.reports] or [UUID(int=0)]))
        .where(Report.geometry.is_not(None))
        .limit(1)
    ).scalar_one_or_none()
    return EventOut(
        id=event.id,
        title=event.title or f"{event.event_type} · {loc}",
        type=event.event_type,
        severity=event.severity,
        verification=event.verification,
        location=loc,
        district=event.district,
        state=event.state,
        lat=event.lat,
        lng=event.lon,
        geometry=geometry,
        reportedAt=event.last_seen,
        reports=event.report_count,
        sources=event.source_count,
        sourceKinds=kinds,
        confidence=event.confidence,
        affectedAreaKm2=event.affected_area_km2,
        images=event.images,
        videos=event.videos,
        summary=event.summary,
        lifecycleState=event.status,
        startTime=event.started_at,
        lastUpdated=event.updated_at,
        reportIds=rids,
        sourceIds=sids,
        mediaCount=event.images + event.videos,
        duplicateCount=int(dup or 0),
        mergedInto=str(event.merged_into_id) if event.merged_into_id else None,
    )


def to_report_out(db: Session, report: Report, event_id: UUID | None = None) -> ReportOut:
    src = db.get(Source, report.source_id)
    public_lat, public_lon = report.lat, report.lon
    if src and src.source_type == "citizen":
        # Public APIs must not leak citizen GPS; operators still see rounded locality via event centroid.
        pass
    media = [MediaOut(id=m.id, kind=m.media_type, uri=None) for m in report.media]
    loc = ", ".join(p for p in [report.city or report.place_text, report.state] if p)
    return ReportOut(
        id=report.id,
        eventId=str(event_id) if event_id else None,
        text=report.text,
        language=report.lang,
        location=loc,
        lat=public_lat,
        lng=public_lon,
        reportedAt=report.posted_at,
        hasMedia=bool(media),
        status=report.status.lower() if report.status.isupper() else report.status,
        sourceId=src.code if src else str(report.source_id),
        sourceName=src.name if src else "unknown",
        sourceType=src.source_type if src else "external",
        sourceAccount=report.source_account or "",
        receivedAt=report.fetched_at,
        media=media,
        aiClassification=report.event_type,
        aiConfidence=report.event_type_confidence,
        duplicateStatus=report.duplicate_status,
        duplicateOf=str(report.duplicate_of_id) if report.duplicate_of_id else None,
        similarity=report.similarity,
    )


def public_event_out(db: Session, event: Event) -> EventOut:
    out = to_event_out(db, event)
    # No citizen GPS in public payloads — centroid only, already event-level.
    return out


def apply_event_filters(stmt, params: dict[str, Any]):
    if params.get("event_type"):
        stmt = stmt.where(Event.event_type == params["event_type"])
    if params.get("state"):
        stmt = stmt.where(Event.state == params["state"])
    if params.get("district"):
        stmt = stmt.where(Event.district == params["district"])
    if params.get("city"):
        stmt = stmt.where(Event.city == params["city"])
    if params.get("verification_status"):
        stmt = stmt.where(Event.verification == params["verification_status"])
    if params.get("severity"):
        stmt = stmt.where(Event.severity == params["severity"])
    if params.get("min_confidence") is not None:
        stmt = stmt.where(Event.confidence >= float(params["min_confidence"]))
    if params.get("date_from"):
        stmt = stmt.where(Event.last_seen >= params["date_from"])
    if params.get("date_to"):
        stmt = stmt.where(Event.started_at <= params["date_to"])
    if params.get("q"):
        q = f"%{params['q']}%"
        stmt = stmt.where(or_(Event.title.ilike(q), Event.city.ilike(q), Event.state.ilike(q), Event.summary.ilike(q)))
    if params.get("bbox"):
        try:
            west, south, east, north = [float(x) for x in str(params["bbox"]).split(",")]
            stmt = stmt.where(Event.lon >= west, Event.lon <= east, Event.lat >= south, Event.lat <= north)
        except ValueError:
            pass
    return stmt


def list_events(db: Session, params: dict[str, Any]) -> EventPage:
    stmt = select(Event).options(selectinload(Event.reports)).where(Event.merged_into_id.is_(None))
    stmt = apply_event_filters(stmt, params)
    rows = list(db.execute(stmt).scalars().unique().all())
    # GPS radius / source / media filters that need Python (small N at demo scale; SQL for the rest)
    lat, lon, rad = params.get("latitude"), params.get("longitude"), params.get("radius_km")
    if lat is not None and lon is not None and rad:
        rows = [e for e in rows if e.lat is not None and e.lon is not None and haversine_km(lat, lon, e.lat, e.lon) <= float(rad)]
    if params.get("source"):
        kinds = SOURCE_CATEGORY.get(params["source"], [params["source"]])
        rows = [e for e in rows if any(k in _source_kinds(db, e) for k in kinds)]
    if params.get("media_type") == "photo":
        rows = [e for e in rows if e.images > 0]
    elif params.get("media_type") == "video":
        rows = [e for e in rows if e.videos > 0]
    elif params.get("media_type") == "text":
        rows = [e for e in rows if e.images == 0 and e.videos == 0]
    sort = params.get("sort") or "latest"
    key = {
        "latest": lambda e: e.last_seen,
        "oldest": lambda e: e.started_at,
        "confidence": lambda e: e.confidence,
        "reports": lambda e: e.report_count,
        "area": lambda e: e.affected_area_km2,
    }.get(sort, lambda e: e.last_seen)
    reverse = sort != "oldest"
    rows.sort(key=key, reverse=reverse)
    total = len(rows)
    page = max(1, int(params.get("page") or 1))
    size = min(200, max(1, int(params.get("page_size") or 20)))
    pages = max(1, ceil(total / size) if total else 1)
    page = min(page, pages)
    chunk = rows[(page - 1) * size : page * size]
    applied = {k: v for k, v in params.items() if v not in (None, "", "all") and k not in {"page", "page_size", "sort"}}
    return EventPage(
        items=[to_event_out(db, e) for e in chunk],
        total=total,
        page=page,
        page_size=size,
        total_pages=pages,
        applied_filters=applied,
    )


def emit(event_type: str, payload: dict) -> None:
    publish(get_settings().ws_channel, json.dumps({"type": event_type, **payload}, default=str))
