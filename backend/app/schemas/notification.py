from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: UUID
    user_id: UUID
    report_id: UUID | None
    type: str
    title: str
    message: str
    read: bool
    created_at: datetime
