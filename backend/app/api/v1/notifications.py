from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import Db, require
from app.core.errors import AppError
from app.core.security import Principal
from app.models.notification import Notification
from app.schemas.notification import NotificationOut

router = APIRouter(tags=["notifications"])


def _uid(principal: Principal) -> UUID | None:
    try:
        return UUID(principal.user_id)
    except Exception:
        return None


@router.get("/notifications")
def list_notes(db: Db, principal: Annotated[Principal, Depends(require("notifications:own"))]):
    uid = _uid(principal)
    q = select(Notification).order_by(Notification.created_at.desc())
    if uid and "admin" not in principal.roles:
        q = q.where(Notification.user_id == uid)
    rows = db.execute(q.limit(200)).scalars().all()
    return [NotificationOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/notifications/{note_id}/read")
def mark_read(note_id: UUID, db: Db, principal: Annotated[Principal, Depends(require("notifications:own"))]):
    row = db.get(Notification, note_id)
    if not row:
        raise AppError("NOTIFICATION_NOT_FOUND", "Notification was not found", 404)
    if str(row.user_id) != principal.user_id and "admin" not in principal.roles:
        raise AppError("FORBIDDEN", "Not your notification", 403)
    row.read = True
    db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def read_all(db: Db, principal: Annotated[Principal, Depends(require("notifications:own"))]):
    uid = _uid(principal)
    if not uid:
        return {"ok": True}
    rows = db.execute(select(Notification).where(Notification.user_id == uid, Notification.read.is_(False))).scalars().all()
    for r in rows:
        r.read = True
    db.commit()
    return {"ok": True, "updated": len(rows)}
