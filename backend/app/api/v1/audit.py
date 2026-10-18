from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import Db, require
from app.core.security import Principal
from app.models.audit_log import AuditLog

router = APIRouter(tags=["audit"])


@router.get("/audit")
def list_audit(db: Db, _: Annotated[Principal, Depends(require("audit:read"))]):
    rows = db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(500)).scalars().all()
    return [
        {
            "id": str(r.id),
            "at": r.timestamp.isoformat(),
            "actor": r.actor_name,
            "role": r.actor_role,
            "action": r.action,
            "entity": r.entity_type,
            "entityId": r.entity_id,
            "result": r.result,
            "reason": r.reason,
            "from": (r.before or {}).get("status") if r.before else None,
            "to": (r.after or {}).get("status") if r.after else None,
            "session": r.ip_address or "",
        }
        for r in rows
    ]
