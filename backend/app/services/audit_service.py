from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def record(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    actor_user_id: UUID | None = None,
    actor_name: str = "",
    actor_role: str = "",
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    result: str = "Success",
) -> AuditLog:
    row = AuditLog(
        actor_user_id=actor_user_id,
        actor_name=actor_name,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        before=before,
        after=after,
        reason=reason,
        ip_address=ip,
        user_agent=user_agent,
        result=result,
    )
    db.add(row)
    return row
