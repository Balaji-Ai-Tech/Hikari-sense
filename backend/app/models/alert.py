from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base

JSONType = JSON().with_variant(JSONB, "postgresql")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    regions: Mapped[list] = mapped_column(JSONType, default=list)
    status: Mapped[str] = mapped_column(String(32), default="scheduled")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    alert_type: Mapped[str] = mapped_column(String(64), default="")
    affected_area: Mapped[str] = mapped_column(String(255), default="")
    instructions: Mapped[list] = mapped_column(JSONType, default=list)
    recipients: Mapped[list] = mapped_column(JSONType, default=list)
    channels: Mapped[list] = mapped_column(JSONType, default=list)
    issuer: Mapped[str] = mapped_column(String(128), default="HIKARI SENSE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
