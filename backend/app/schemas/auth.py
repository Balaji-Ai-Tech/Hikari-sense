from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    expires_in: int


class DevLogin(BaseModel):
    username: str = "demo"
    role: str = "analyst"


class MeResponse(BaseModel):
    user_id: UUID | str
    username: str
    roles: list[str]


class PageMeta(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int
    applied_filters: dict = Field(default_factory=dict)


class EventFiltersQuery(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None
    event_type: str | None = None
    state: str | None = None
    district: str | None = None
    city: str | None = None
    verification_status: str | None = None
    min_confidence: float | None = None
    source: str | None = None
    media_type: str | None = None
    severity: str | None = None
    q: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    radius_km: float | None = None
    bbox: str | None = None
    page: int = 1
    page_size: int = 20
    sort: str = "latest"
