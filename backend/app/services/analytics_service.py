from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.source import Source
from app.models.verification import Verification
from app.services.event_service import apply_event_filters, list_events


def timeseries(db: Session, params: dict) -> list[dict]:
    page = list_events(db, {**params, "page": 1, "page_size": 500})
    buckets: dict[str, int] = defaultdict(int)
    for e in page.items:
        buckets[e.reportedAt.date().isoformat()] += 1
    return [{"t": k, "v": v} for k, v in sorted(buckets.items())]


def by_type(db: Session, params: dict) -> list[dict]:
    page = list_events(db, {**params, "page": 1, "page_size": 500})
    c: dict[str, int] = defaultdict(int)
    for e in page.items:
        c[e.type] += 1
    return [{"name": k, "value": v} for k, v in sorted(c.items())]


def by_region(db: Session, params: dict) -> list[dict]:
    page = list_events(db, {**params, "page": 1, "page_size": 500})
    c: dict[str, int] = defaultdict(int)
    for e in page.items:
        c[e.state or "Unknown"] += 1
    return [{"name": k, "value": v} for k, v in sorted(c.items(), key=lambda x: -x[1])]


def verification_funnel(db: Session, params: dict) -> list[dict]:
    page = list_events(db, {**params, "page": 1, "page_size": 500})
    c: dict[str, int] = defaultdict(int)
    for e in page.items:
        c[e.verification] += 1
    order = ["low_confidence", "needs_review", "corroborated", "verified", "rejected", "merged"]
    return [{"stage": s, "count": c.get(s, 0)} for s in order]


def source_reliability(db: Session) -> list[dict]:
    rows = db.execute(select(Source)).scalars().all()
    return [{"name": s.name, "value": s.reliability, "health": s.health_label, "live": s.is_live} for s in rows]
