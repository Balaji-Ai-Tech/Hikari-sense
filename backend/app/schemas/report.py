from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MediaOut(BaseModel):
    id: UUID | str
    kind: str
    uri: str | None = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    eventId: str | None
    text: str
    language: str
    location: str
    lat: float | None
    lng: float | None
    reportedAt: datetime
    hasMedia: bool
    status: str
    sourceId: str
    sourceName: str
    sourceType: str
    sourceAccount: str
    receivedAt: datetime
    media: list[MediaOut]
    aiClassification: str | None
    aiConfidence: float | None
    duplicateStatus: str
    duplicateOf: str | None = None
    similarity: float | None = None
    translation: str | None = None
    aiDisclaimer: str = "SUGGESTION ONLY — HUMAN REVIEWER MAKES THE FINAL DECISION."
