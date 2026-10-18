from __future__ import annotations

import logging
from time import perf_counter
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.kafka import bus
from app.core.metrics import CONNECTOR_FAILURE, CONNECTOR_SUCCESS
from app.models.source import Source, SourceHealth
from app.models.official_alert import OfficialAlert
from app.models.report import Report
from app.schemas.envelope import IngestionEnvelope
from sqlalchemy import select

log = logging.getLogger(__name__)


class BaseConnector(ABC):
    code: str
    name: str
    kind: str
    source_type: str = "external"
    category: str = "website"

    @abstractmethod
    def fetch(self) -> list[dict[str, Any]]:
        ...

    def normalize(self, raw: dict[str, Any]) -> IngestionEnvelope:
        now = datetime.now(UTC)
        return IngestionEnvelope(
            report_id=uuid4(),
            source=raw.get("source", "sample"),
            source_account=str(raw.get("source_account") or self.code),
            native_id=str(raw.get("native_id") or uuid4()),
            fetched_at=now,
            posted_at=raw.get("posted_at") or now,
            text=raw.get("text") or "",
            lang=raw.get("lang") or "en",
            hashtags=raw.get("hashtags") or [],
            geo=raw.get("geo") or {},
            geometry=raw.get("geometry"),
            media=raw.get("media") or [],
            raw_ref=raw.get("raw_ref"),
            metadata=raw.get("metadata") or {},
            raw_payload=raw.get("raw_payload") or {},
        )

    def health(self) -> dict[str, Any]:
        return {"connector": self.code, "configured": True}

    def metadata(self) -> dict[str, str]:
        return {"code": self.code, "name": self.name, "kind": self.kind}

    def ingest(self, db: Session) -> int:
        src = _ensure_source(db, self)
        connector_health = self.health()
        if connector_health.get("configured") is False:
            src.is_live = False
            src.health_label = "NOT_CONFIGURED"
            health = src.health or SourceHealth(source_id=src.id)
            if src.health is None:
                db.add(health)
                src.health = health
            health.status = "NOT_CONFIGURED"
            health.updated_at = datetime.now(UTC)
            db.commit()
            log.info("SOURCE_FETCH_SKIPPED", extra={"source": self.code, "reason": "not configured"})
            return 0
        started = perf_counter()
        log.info("SOURCE_FETCH_STARTED", extra={"source": self.code})
        try:
            items = self.fetch()
            n = 0
            for raw in items:
                env = self.normalize(raw)
                if persist_envelope(db, src, env):
                    n += 1
            _touch_health(
                db,
                src,
                ok=True,
                received=len(items),
                processed=n,
                latency_ms=(perf_counter() - started) * 1000,
            )
            db.commit()
            CONNECTOR_SUCCESS.labels(self.code).inc()
            log.info(
                "SOURCE_FETCH_COMPLETED",
                extra={
                    "source": self.code,
                    "records_received": len(items),
                    "records_published": n,
                    "duration_ms": round((perf_counter() - started) * 1000, 2),
                },
            )
            return n
        except Exception as exc:
            db.rollback()
            src = _ensure_source(db, self)
            _touch_health(
                db,
                src,
                ok=False,
                error=str(exc),
                latency_ms=(perf_counter() - started) * 1000,
            )
            CONNECTOR_FAILURE.labels(self.code).inc()
            bus.dead_letter(get_settings().kafka_topic_dlq_processing, {"connector": self.code}, str(exc))
            db.commit()
            log.exception(
                "SOURCE_FETCH_FAILED",
                extra={"source": self.code, "duration_ms": round((perf_counter() - started) * 1000, 2)},
            )
            raise


def _ensure_source(db: Session, c: BaseConnector) -> Source:
    src = db.execute(select(Source).where(Source.code == c.code)).scalar_one_or_none()
    if src:
        src.name = c.name
        src.kind = c.kind
        src.source_type = c.source_type
        src.category = c.category
        src.description = c.name
        return src
    src = Source(
        code=c.code,
        name=c.name,
        kind=c.kind,
        source_type=c.source_type,
        category=c.category,
        reliability=0.6,
        health_label="NOT_CONFIGURED",
        is_live=False,
        description=c.name,
    )
    db.add(src)
    db.flush()
    health = SourceHealth(source_id=src.id, status="NOT_CONFIGURED")
    db.add(health)
    src.health = health
    return src


def _touch_health(
    db: Session,
    src: Source,
    *,
    ok: bool,
    received: int = 0,
    processed: int = 0,
    error: str | None = None,
    latency_ms: float | None = None,
) -> None:
    h = src.health or SourceHealth(
        source_id=src.id,
        latency_ms=0,
        records_received=0,
        records_processed=0,
        error_count=0,
    )
    if src.health is None:
        db.add(h)
        src.health = h
    now = datetime.now(UTC)
    h.updated_at = now
    if latency_ms is not None:
        h.latency_ms = round(latency_ms, 2)
    src.is_live = ok
    if ok:
        h.last_success = now
        h.records_received += received
        h.records_processed += processed
        src.health_label = "CONNECTED"
        h.status = src.health_label
    else:
        h.last_failure = now
        h.error_count += 1
        h.last_error = error
        src.health_label = "FAILED"
        h.status = "FAILED"


def persist_envelope(db: Session, src: Source, env: IngestionEnvelope) -> bool:
    existing = db.execute(
        select(Report).where(Report.source_id == src.id, Report.native_id == env.native_id)
    ).scalar_one_or_none()
    if existing:
        if env.geometry and existing.geometry != env.geometry:
            existing.geometry = env.geometry
            if existing.lat is None and env.geo.lat is not None and env.geo.lon is not None:
                existing.lat = env.geo.lat
                existing.lon = env.geo.lon
            db.flush()
        if env.source == "sachet" and existing.status != "RECEIVED":
            alert_exists = db.execute(
                select(OfficialAlert.id).where(OfficialAlert.identifier == env.native_id)
            ).scalar_one_or_none()
            if not alert_exists:
                replay = env.model_copy(update={"report_id": existing.id})
                payload = replay.model_dump(mode="json")
                bus.publish(get_settings().kafka_topic_alerts_raw, payload, key=str(existing.id))
                bus.publish(
                    get_settings().kafka_topic_observations_normalized,
                    {
                        "event_id": str(existing.id),
                        "source": replay.source,
                        "timestamp": replay.posted_at.isoformat(),
                        "text": replay.text,
                        "location": replay.geo.model_dump(mode="json"),
                        "raw": payload,
                    },
                    key=str(existing.id),
                )
                log.info(
                    "SOURCE_RECORD_REPLAYED",
                    extra={"source": env.source, "native_id": env.native_id},
                )
        return False
    report = Report(
        id=env.report_id,
        source_id=src.id,
        native_id=env.native_id,
        posted_at=env.posted_at,
        fetched_at=env.fetched_at,
        text=env.text,
        lang=env.lang,
        hashtags=env.hashtags,
        geometry=env.geometry,
        lat=env.geo.lat,
        lon=env.geo.lon,
        place_text=env.geo.place_text,
        status="RECEIVED",
        source_account=env.source_account,
        raw_ref=env.raw_ref,
    )
    db.add(report)
    db.flush()
    topic = {
        "news": get_settings().kafka_topic_raw_news,
        "youtube": get_settings().kafka_topic_raw_news,
        "citizen": get_settings().kafka_topic_citizen_raw,
        "imd": get_settings().kafka_topic_raw_official,
        "sachet": get_settings().kafka_topic_alerts_raw,
        "open_meteo": get_settings().kafka_topic_weather_raw,
        "imerg": get_settings().kafka_topic_satellite_raw,
        "firms": get_settings().kafka_topic_satellite_raw,
        "x": get_settings().kafka_topic_raw_social,
        "sample": get_settings().kafka_topic_raw_social,
    }.get(env.source, get_settings().kafka_topic_raw_news)
    db.commit()
    bus.publish(topic, env.model_dump(mode="json"), key=str(env.report_id))
    log.info("RAW_PUBLISHED", extra={"report_id": str(env.report_id), "topic": topic})
    if env.source in {"open_meteo", "sachet", "citizen", "firms"}:
        normalized = {
            "event_id": str(env.report_id),
            "source": env.source,
            "timestamp": (env.posted_at or datetime.now(UTC)).isoformat(),
            "text": env.text,
            "location": env.geo,
            "raw": env.model_dump(mode="json"),
        }
        bus.publish(get_settings().kafka_topic_observations_normalized, normalized, key=str(env.report_id))
    return True
