from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base

JSONType = JSON().with_variant(JSONB, "postgresql")


class Verification(Base):
    __tablename__ = "verifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"), index=True, nullable=True)
    report_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("reports.id"), nullable=True)
    source_reliability: Mapped[float] = mapped_column(Float, default=0)
    corroboration: Mapped[float] = mapped_column(Float, default=0)
    spatial_consistency: Mapped[float] = mapped_column(Float, default=0)
    temporal_consistency: Mapped[float] = mapped_column(Float, default=0)
    media_authenticity: Mapped[float] = mapped_column(Float, default=0)
    score: Mapped[float] = mapped_column(Float, default=0)
    decision: Mapped[str] = mapped_column(String(32), default="NEEDS_REVIEW")
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    signals: Mapped[dict] = mapped_column(JSONType, default=dict)
    from_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
