from __future__ import annotations

import logging
from datetime import UTC, datetime
from math import isfinite
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.kafka import bus
from app.core.security import Principal
from app.core.storage import get_storage, safe_filename, sniff_kind
from app.core.errors import AppError
from app.intelligence.media_analysis import analyze_image, analyze_video, malware_scan_hook
from app.models.media import Media
from app.models.report import Report
from app.models.source import Source
from app.services import audit_service, notification_service

log = logging.getLogger(__name__)


def citizen_source(db: Session) -> Source:
    src = db.execute(select(Source).where(Source.code == "SRC-CITIZEN")).scalar_one_or_none()
    if src:
        return src
    src = Source(
        code="SRC-CITIZEN",
        name="Citizen reports",
        kind="Citizen",
        source_type="citizen",
        category="citizen",
        reliability=0.45,
        health_label="CONNECTED",
        is_live=True,
        description="Live citizen submissions via API",
    )
    db.add(src)
    db.flush()
    return src


def submit_citizen_report(
    db: Session,
    principal: Principal,
    *,
    description: str,
    event_type: str | None,
    latitude: float | None,
    longitude: float | None,
    location_text: str | None,
    occurred_at: datetime | None,
    files: list[tuple[str, str, bytes]],
    ip: str | None,
    user_agent: str | None,
) -> Report:
    settings = get_settings()
    if (latitude is None) != (longitude is None):
        raise AppError("INVALID_COORDINATES", "Latitude and longitude must be provided together", 400)
    if latitude is not None and longitude is not None and (
        not isfinite(latitude)
        or not isfinite(longitude)
        or not -90 <= latitude <= 90
        or not -180 <= longitude <= 180
    ):
        raise AppError("INVALID_COORDINATES", "Coordinates are outside valid latitude/longitude ranges", 400)
    if len(files) > settings.max_upload_files:
        raise AppError("TOO_MANY_FILES", "Too many media files", 400)
    for name, mime, data in files:
        if len(data) > settings.max_upload_bytes:
            raise AppError("FILE_TOO_LARGE", f"{name} exceeds size limit", 400)
        if sniff_kind(mime, name) is None:
            raise AppError("INVALID_FILE_TYPE", f"Unsupported file type: {name}", 400)
        if not malware_scan_hook(data, name):
            raise AppError("FILE_REJECTED", "File failed content validation", 400)

    src = citizen_source(db)
    storage = get_storage()
    now = datetime.now(UTC)
    report = Report(
        source_id=src.id,
        native_id=str(uuid4()),
        submitted_by_user_id=UUID(principal.user_id) if _is_uuid(principal.user_id) else None,
        posted_at=occurred_at or now,
        fetched_at=now,
        text=description,
        lang="en",
        lat=latitude,
        lon=longitude,
        place_text=location_text,
        event_type=event_type,
        status="RECEIVED",
        source_account=principal.username,
    )
    db.add(report)
    db.flush()
    for name, mime, data in files:
        kind = sniff_kind(mime, name) or "image"
        analysis = analyze_image(data) if kind == "image" else analyze_video(data, name)
        uri = storage.put("media", data, mime or "application/octet-stream", suffix="-" + safe_filename(name))
        db.add(
            Media(
                report_id=report.id,
                uri=uri,
                media_type=kind,
                sha256=analysis.get("sha256"),
                phash=analysis.get("phash"),
                exif=analysis.get("exif"),
                scene_label=analysis.get("scene_label"),
                authenticity=analysis.get("authenticity", "unknown"),
                filename=safe_filename(name),
                byte_size=len(data),
            )
        )
    audit_service.record(
        db,
        action="citizen.submit",
        entity_type="Report",
        entity_id=str(report.id),
        actor_user_id=UUID(principal.user_id) if _is_uuid(principal.user_id) else None,
        actor_name=principal.username,
        actor_role=principal.role,
        after={"status": "RECEIVED"},
        ip=ip,
        user_agent=user_agent,
    )
    if _is_uuid(principal.user_id):
        notification_service.notify(
            db,
            user_id=UUID(principal.user_id),
            ntype="REPORT_RECEIVED",
            title="Report received",
            message="Your weather report was received and queued for analysis.",
            report_id=report.id,
        )
    db.commit()
    db.refresh(report)
    log.info("REPORT_RECEIVED", extra={"report_id": str(report.id), "source": "citizen"})
    bus.publish(
        settings.kafka_topic_raw_citizen,
        {"report_id": str(report.id), "source": "citizen", "native_id": report.native_id},
        key=str(report.id),
    )
    log.info("RAW_PUBLISHED", extra={"report_id": str(report.id), "topic": settings.kafka_topic_raw_citizen})
    return report


def _is_uuid(v: str) -> bool:
    try:
        UUID(v)
        return True
    except Exception:
        return False
