from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.api.deps import Db, require
from app.core.errors import AppError
from app.core.security import Principal
from app.models.alert import Alert
from app.schemas.alert import AlertIn
from app.services.alert_service import save, set_status, to_out

router = APIRouter(tags=["alerts"])


@router.get("/alerts")
def list_alerts(db: Db, _: Annotated[Principal, Depends(require("alerts:read"))]):
    rows = db.execute(select(Alert).order_by(Alert.created_at.desc())).scalars().all()
    return [to_out(a) for a in rows]


@router.get("/public/alerts")
def public_alerts(db: Db):
    rows = db.execute(select(Alert).where(Alert.status == "active")).scalars().all()
    return [to_out(a) for a in rows]


@router.get("/alerts/{alert_id}")
def get_alert(alert_id: UUID, db: Db, _: Annotated[Principal, Depends(require("alerts:read"))]):
    row = db.get(Alert, alert_id)
    if not row:
        raise AppError("ALERT_NOT_FOUND", "Alert was not found", 404)
    return to_out(row)


@router.post("/alerts")
def create_alert(
    body: AlertIn,
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(require("alerts:manage"))],
):
    return to_out(save(db, principal, body, ip=request.client.host if request.client else None))


@router.put("/alerts/{alert_id}")
def update_alert(
    alert_id: UUID,
    body: AlertIn,
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(require("alerts:manage"))],
):
    return to_out(save(db, principal, body, alert_id, ip=request.client.host if request.client else None))


@router.post("/alerts/{alert_id}/activate")
def activate(alert_id: UUID, request: Request, db: Db, principal: Annotated[Principal, Depends(require("alerts:manage"))]):
    return to_out(set_status(db, principal, alert_id, "active", ip=request.client.host if request.client else None))


@router.post("/alerts/{alert_id}/deactivate")
def deactivate(alert_id: UUID, request: Request, db: Db, principal: Annotated[Principal, Depends(require("alerts:manage"))]):
    return to_out(set_status(db, principal, alert_id, "cancelled", ip=request.client.host if request.client else None))
