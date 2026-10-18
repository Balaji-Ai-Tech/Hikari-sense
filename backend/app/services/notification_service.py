from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.metrics import NOTIFICATION_COUNT
from app.core.redis import publish
from app.models.notification import Notification


def notify(
    db: Session,
    *,
    user_id: UUID,
    ntype: str,
    title: str,
    message: str,
    report_id: UUID | None = None,
) -> Notification:
    row = Notification(user_id=user_id, report_id=report_id, type=ntype, title=title, message=message)
    db.add(row)
    NOTIFICATION_COUNT.labels(type=ntype).inc()
    publish(
        get_settings().ws_channel,
        json.dumps(
            {
                "type": "NOTIFICATION_CREATED",
                "user_id": str(user_id),
                "report_id": str(report_id) if report_id else None,
                "title": title,
            }
        ),
    )
    return row
