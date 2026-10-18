from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AlertIn(BaseModel):
    event_id: UUID | None = None
    title: str
    description: str = ""
    severity: str = "medium"
    regions: list[str] = Field(default_factory=list)
    status: str = "scheduled"
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    alert_type: str = ""
    affected_area: str = ""
    instructions: list[str] = Field(default_factory=list)
    recipients: list[str] = Field(default_factory=list)
    channels: list[str] = Field(default_factory=list)


class AlertOut(BaseModel):
    id: UUID
    title: str
    region: str
    detail: str
    severity: str
    issuedAt: datetime | None
    expiresAt: datetime | None
    issuer: str
    eventId: str | None
    instructions: list[str]
    alertType: str
    affectedArea: str
    message: str
    status: str
    recipients: list[str]
    channels: list[str]
    dissemination: str = "No SMS/email sent unless a provider is configured."
