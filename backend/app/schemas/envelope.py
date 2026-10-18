from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

SourceName = Literal["x", "news", "youtube", "citizen", "imd", "sachet", "open_meteo", "imerg", "firms", "sample"]


class EnvelopeGeo(BaseModel):
    lat: float | None = None
    lon: float | None = None
    place_text: str | None = None


class EnvelopeMedia(BaseModel):
    uri: str
    type: Literal["image", "video", "other"] = "image"
    sha256: str | None = None
    phash: str | None = None


class IngestionEnvelope(BaseModel):
    """Canonical ingestion envelope (UTC)."""

    report_id: UUID
    source: SourceName
    source_account: str = ""
    native_id: str
    fetched_at: datetime
    posted_at: datetime
    text: str = ""
    lang: str = "en"
    hashtags: list[str] = Field(default_factory=list)
    geo: EnvelopeGeo = Field(default_factory=EnvelopeGeo)
    geometry: dict[str, Any] | None = None
    media: list[EnvelopeMedia] = Field(default_factory=list)
    raw_ref: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    raw_payload: dict[str, Any] = Field(default_factory=dict)
