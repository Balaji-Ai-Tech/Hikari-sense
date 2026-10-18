from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import Db, require
from app.core.security import Principal
from app.services import analytics_service
from app.services.event_service import list_events
from app.models.alert import Alert
from sqlalchemy import select

router = APIRouter(tags=["analytics"])


def _params(
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    event_type: str | None = None,
    state: str | None = None,
    verification_status: str | None = None,
) -> dict:
    return {k: v for k, v in locals().items()}


@router.get("/stats/timeseries")
def timeseries(db: Db, _: Annotated[Principal, Depends(require("analytics:read"))], params: Annotated[dict, Depends(_params)]):
    return analytics_service.timeseries(db, params)


@router.get("/stats/by-type")
def by_type(db: Db, _: Annotated[Principal, Depends(require("analytics:read"))], params: Annotated[dict, Depends(_params)]):
    return analytics_service.by_type(db, params)


@router.get("/stats/by-region")
def by_region(db: Db, _: Annotated[Principal, Depends(require("analytics:read"))], params: Annotated[dict, Depends(_params)]):
    return analytics_service.by_region(db, params)


@router.get("/stats/verification-funnel")
def funnel(db: Db, _: Annotated[Principal, Depends(require("analytics:read"))], params: Annotated[dict, Depends(_params)]):
    return analytics_service.verification_funnel(db, params)


@router.get("/stats/source-reliability")
def reliability(db: Db, _: Annotated[Principal, Depends(require("analytics:read"))]):
    return analytics_service.source_reliability(db)


@router.get("/stats/kpis")
def kpis(db: Db, _: Annotated[Principal, Depends(require("analytics:read"))]):
    events = list_events(db, {"page": 1, "page_size": 500}).items
    alerts = db.execute(select(Alert).where(Alert.status == "active")).scalars().all()
    live = [e for e in events if e.verification not in {"rejected", "merged"}]
    pending = [e for e in events if e.verification in {"needs_review", "low_confidence", "escalated"}]
    high = [e for e in live if e.severity in {"high", "critical"}]
    verified = [e for e in events if e.verification == "verified"]
    labels = [
        ("Total Reports", sum(e.reports for e in events)),
        ("Live Events", len(live)),
        ("Verified Events", len(verified)),
        ("Pending Verification", len(pending)),
        ("High Severity", len(high)),
        ("Active Alerts", len(alerts)),
    ]
    return [{"label": k, "value": f"{v:,}", "hint": "derived", "spark": [v]} for k, v in labels]


@router.get("/stats/ingestion")
def ingestion(db: Db, _: Annotated[Principal, Depends(require("analytics:read"))]):
    """Hourly counts from stored reports — not a simulated series."""
    from collections import defaultdict
    from app.models.report import Report

    rows = db.execute(select(Report)).scalars().all()
    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {"citizen": 0, "official": 0, "media": 0})
    for r in rows:
        hour = r.posted_at.strftime("%H:00")
        src = (r.source.source_type if r.source else "external") if hasattr(r, "source") else "external"
        if src == "citizen":
            buckets[hour]["citizen"] += 1
        elif src == "official":
            buckets[hour]["official"] += 1
        else:
            buckets[hour]["media"] += 1
    return [{"hour": h, **v} for h, v in sorted(buckets.items())]
