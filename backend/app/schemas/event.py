from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    type: str
    severity: str
    verification: str
    location: str
    district: str | None
    state: str | None
    lat: float | None
    lng: float | None
    geometry: dict | None = None
    reportedAt: datetime
    reports: int
    sources: int
    sourceKinds: list[str]
    confidence: float
    affectedAreaKm2: float
    images: int
    videos: int
    summary: str
    lifecycleState: str
    startTime: datetime
    lastUpdated: datetime
    reportIds: list[str]
    sourceIds: list[str]
    mediaCount: int
    duplicateCount: int
    mergedInto: str | None = None
    aiDisclaimer: str = "SUGGESTION ONLY — HUMAN REVIEWER MAKES THE FINAL DECISION."


class EventPage(BaseModel):
    items: list[EventOut]
    total: int
    page: int
    page_size: int
    total_pages: int
    applied_filters: dict = Field(default_factory=dict)
