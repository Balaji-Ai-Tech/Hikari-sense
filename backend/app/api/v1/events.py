from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import Db, require
from app.core.errors import AppError
from app.core.security import Principal
from app.models.event import Event
from app.services.event_service import list_events, to_event_out, to_report_out
from app.models.event import EventReport
from app.models.report import Report
from sqlalchemy import select
from sqlalchemy.orm import selectinload

router = APIRouter(tags=["events"])


def _params(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    event_type: str | None = None,
    state: str | None = None,
    district: str | None = None,
    city: str | None = None,
    verification_status: str | None = None,
    min_confidence: float | None = None,
    source: str | None = None,
    media_type: str | None = None,
    severity: str | None = None,
    q: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    radius_km: float | None = None,
    bbox: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort: str = "latest",
) -> dict:
    return {k: v for k, v in locals().items()}


@router.get("/events")
def get_events(
    db: Db,
    _: Annotated[Principal, Depends(require("events:read"))],
    params: Annotated[dict, Depends(_params)],
):
    return list_events(db, params)


@router.get("/public/events")
def public_events(db: Db, params: Annotated[dict, Depends(_params)]):
    """Public map: event centroids only — no citizen GPS or account fields."""
    page = list_events(db, params, verified_only=True)
    items = []
    for e in page.items:
        update = {
            "reportIds": [],
            "sourceIds": [],
            "summary": e.summary[:180],
        }
        if "Citizen" in e.sourceKinds and e.lat is not None and e.lng is not None:
            update["lat"] = round(e.lat, 2)
            update["lng"] = round(e.lng, 2)
        items.append(e.model_copy(update=update))
    return page.model_copy(update={"items": items})


@router.get("/events/{event_id}")
def get_event(event_id: UUID, db: Db, _: Annotated[Principal, Depends(require("events:read"))]):
    ev = db.get(Event, event_id)
    if not ev:
        raise AppError("EVENT_NOT_FOUND", "Event was not found", 404)
    db.refresh(ev)
    ev = db.execute(select(Event).options(selectinload(Event.reports)).where(Event.id == event_id)).scalar_one()
    return to_event_out(db, ev)


@router.get("/events/{event_id}/reports")
def event_reports(event_id: UUID, db: Db, _: Annotated[Principal, Depends(require("reports:read:all"))]):
    links = db.execute(select(EventReport).where(EventReport.event_id == event_id)).scalars().all()
    reports = db.execute(
        select(Report).options(selectinload(Report.media)).where(Report.id.in_([l.report_id for l in links] or [UUID(int=0)]))
    ).scalars().all()
    return [to_report_out(db, r, event_id) for r in reports]
