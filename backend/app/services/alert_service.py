from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import Principal
from app.models.alert import Alert
from app.services import audit_service
from app.services.event_service import emit
from app.schemas.alert import AlertIn, AlertOut


def to_out(a: Alert) -> AlertOut:
    region = ", ".join(a.regions) if a.regions else a.affected_area
    return AlertOut(
        id=a.id,
        title=a.title,
        region=region,
        detail=a.description,
        severity=a.severity,
        issuedAt=a.starts_at,
        expiresAt=a.ends_at,
        issuer=a.issuer,
        eventId=str(a.event_id) if a.event_id else None,
        instructions=a.instructions or [],
        alertType=a.alert_type,
        affectedArea=a.affected_area,
        message=a.description,
        status=_ui_status(a.status),
        recipients=a.recipients or [],
        channels=a.channels or [],
    )


def _ui_status(s: str) -> str:
    return {"active": "active", "expired": "expired", "cancelled": "cancelled"}.get(s, s)


def save(db: Session, principal: Principal, body: AlertIn, alert_id: UUID | None = None, ip: str | None = None) -> Alert:
    row = db.get(Alert, alert_id) if alert_id else Alert()
    if alert_id and not row:
        raise AppError("ALERT_NOT_FOUND", "Alert was not found", 404)
    before = {"status": row.status, "title": row.title} if alert_id else None
    row.event_id = body.event_id
    row.title = body.title
    row.description = body.description
    row.severity = body.severity
    row.regions = body.regions
    row.status = body.status
    row.starts_at = body.starts_at
    row.ends_at = body.ends_at
    row.alert_type = body.alert_type
    row.affected_area = body.affected_area
    row.instructions = body.instructions
    row.recipients = body.recipients
    row.channels = body.channels
    db.add(row)
    db.flush()
    audit_service.record(
        db,
        action="alert.save" if alert_id else "alert.create",
        entity_type="Alert",
        entity_id=str(row.id),
        actor_name=principal.username,
        actor_role=principal.role,
        before=before,
        after={"status": row.status, "title": row.title},
        ip=ip,
    )
    db.commit()
    db.refresh(row)
    emit("ALERT_CREATED" if not alert_id else "ALERT_UPDATED", {"alert_id": str(row.id)})
    return row


def set_status(db: Session, principal: Principal, alert_id: UUID, status: str, ip: str | None = None) -> Alert:
    row = db.get(Alert, alert_id)
    if not row:
        raise AppError("ALERT_NOT_FOUND", "Alert was not found", 404)
    before = {"status": row.status}
    row.status = status
    audit_service.record(
        db,
        action=f"alert.{status}",
        entity_type="Alert",
        entity_id=str(row.id),
        actor_name=principal.username,
        actor_role=principal.role,
        before=before,
        after={"status": status},
        ip=ip,
    )
    db.commit()
    return row
