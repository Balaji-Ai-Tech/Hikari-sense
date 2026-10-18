from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CitizenReportAccepted(BaseModel):
    report_id: UUID
    status: str = "RECEIVED"
    message: str = "Report received"


class CitizenSubmissionOut(BaseModel):
    id: UUID
    hazard: str | None
    description: str
    location: str | None
    lat: float | None = None
    lng: float | None = None
    language: str
    observedAt: datetime
    submittedAt: datetime
    status: str
    media: list[dict] = Field(default_factory=list)
    triage: dict | None = None
    contact: str | None = None
