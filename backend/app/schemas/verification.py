from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DecisionIn(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)
    target_event_id: UUID | None = None


class DecisionOut(BaseModel):
    id: UUID
    eventId: UUID | None = None
    reportId: UUID | None = None
    action: str
    reason: str
    decidedAt: datetime
    decidedBy: str
    fromState: str | None
    toState: str | None
    targetEventId: UUID | None = None
    score: float | None = None
    signals: dict = Field(default_factory=dict)
