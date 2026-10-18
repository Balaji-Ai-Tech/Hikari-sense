from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base

JSONType = JSON().with_variant(JSONB, "postgresql")


class OfficialAlert(Base):
    __tablename__ = "official_alerts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), unique=True)
    identifier: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    sender: Mapped[str] = mapped_column(String(255), default="SACHET / NDMA")
    event: Mapped[str] = mapped_column(String(255), default="")
    urgency: Mapped[str] = mapped_column(String(32), default="Unknown")
    severity: Mapped[str] = mapped_column(String(32), default="Unknown")
    certainty: Mapped[str] = mapped_column(String(32), default="Unknown")
    message_type: Mapped[str] = mapped_column(String(24), default="Alert")
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    headline: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    areas: Mapped[list[str]] = mapped_column(JSONType, default=list)
    references: Mapped[list[str]] = mapped_column(JSONType, default=list)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))