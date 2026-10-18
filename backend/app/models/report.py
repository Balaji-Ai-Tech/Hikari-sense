from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base

JSONType = JSON().with_variant(JSONB, "postgresql")


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_event_type", "event_type"),
        Index("ix_reports_state", "state"),
        Index("ix_reports_district", "district"),
        Index("ix_reports_city", "city"),
        Index("ix_reports_status", "status"),
        Index("ix_reports_source_id", "source_id"),
        Index("ix_reports_posted_at", "posted_at"),
        Index("ix_reports_source_native", "source_id", "native_id", unique=True),
        Index("ix_reports_dashboard", "event_type", "state", "status", "posted_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id"))
    native_id: Mapped[str] = mapped_column(String(255))
    submitted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    text: Mapped[str] = mapped_column(Text, default="")
    lang: Mapped[str] = mapped_column(String(16), default="en")
    hashtags: Mapped[list] = mapped_column(JSONType, default=list)
    geometry: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    geo_precision: Mapped[str | None] = mapped_column(String(32), nullable=True)
    geo_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    place_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(String(128), nullable=True)
    district: Mapped[str | None] = mapped_column(String(128), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    event_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_type_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="RECEIVED")
    text_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("reports.id"), nullable=True)
    duplicate_status: Mapped[str] = mapped_column(String(32), default="unique")
    similarity: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_account: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    source: Mapped["Source"] = relationship()  # noqa: F821
    media: Mapped[list[Media]] = relationship(back_populates="report", cascade="all, delete-orphan")
    submitter: Mapped["User | None"] = relationship()  # noqa: F821


class Media(Base):
    __tablename__ = "media"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    uri: Mapped[str] = mapped_column(String(512))
    media_type: Mapped[str] = mapped_column(String(32))
    sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    phash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    exif: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    scene_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    authenticity: Mapped[str] = mapped_column(String(32), default="unknown")
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    byte_size: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    report: Mapped[Report] = relationship(back_populates="media")
