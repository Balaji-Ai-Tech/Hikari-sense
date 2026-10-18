import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.source import Source, SourceHealth
from app.schemas.source import SourceHealthOut, SourceOut


def _is_stale(last_success: datetime | None) -> bool:
    if last_success is None:
        return True
    if last_success.tzinfo is None:
        last_success = last_success.replace(tzinfo=UTC)
    poll_seconds = max(60, int(os.getenv("INGESTION_POLL_SECONDS", "900")))
    stale_after = timedelta(seconds=poll_seconds * 2)
    return last_success < datetime.now(UTC) - stale_after


def list_sources(db: Session) -> list[SourceOut]:
    rows = db.execute(select(Source)).scalars().all()
    out = []
    for s in rows:
        h = s.health
        status = "offline"
        if s.health_label == "CONNECTED":
            status = "degraded" if _is_stale(h.last_success if h else None) else "connected"
        elif s.health_label == "DEGRADED":
            status = "degraded"
        elif s.health_label == "DEMO":
            status = "receiving"
        last = h.last_success.strftime("%H:%M") if h and h.last_success else "—"
        description = s.description
        if s.health_label != "DEMO" and description.startswith("SYNTHETIC/DEMO source record"):
            description = s.name
        out.append(
            SourceOut(
                id=s.code,
                name=s.name,
                kind=s.kind,
                status=status,
                reliability=s.reliability,
                throughput=f"{h.records_processed}/processed" if h else "0",
                lastSync=last,
                description=description,
                health=s.health_label,
            )
        )
    return out


def health_rows(db: Session) -> list[SourceHealthOut]:
    rows = db.execute(select(Source)).scalars().all()
    result = []
    for s in rows:
        h = s.health
        stale = s.health_label == "CONNECTED" and _is_stale(h.last_success if h else None)
        result.append(
            SourceHealthOut(
                source_id=s.id,
                code=s.code,
                status="STALE" if stale else s.health_label,
                last_success=h.last_success if h else None,
                last_failure=h.last_failure if h else None,
                latency_ms=h.latency_ms if h else 0,
                records_received=h.records_received if h else 0,
                records_processed=h.records_processed if h else 0,
                error_count=h.error_count if h else 0,
                last_error=h.last_error if h else None,
                is_live=s.is_live and s.health_label == "CONNECTED" and not stale,
                note="Live only when a connector is configured and succeeding. DEMO/NOT_CONFIGURED are not government feeds.",
            )
        )
    return result
