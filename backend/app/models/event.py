from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_event_type", "event_type"),
        Index("ix_events_state", "state"),
        Index("ix_events_status", "status"),
        Index("ix_events_started_at", "started_at"),
        Index("ix_events_dashboard", "event_type", "state", "status", "started_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), default="")
    event_type: Mapped[str] = mapped_column(String(64))
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    h3_cell: Mapped[str | None] = mapped_column(String(32), nullable=True)
    state: Mapped[str | None] = mapped_column(String(128), nullable=True)
    district: Mapped[str | None] = mapped_column(String(128), nullable=True)
    city: Mapped[str | None] = mapped_column(String(128), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    report_count: Mapped[int] = mapped_column(Integer, default=0)
    source_count: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), default="DETECTED")
    verification: Mapped[str] = mapped_column(String(32), default="needs_review")
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    summary: Mapped[str] = mapped_column(Text, default="")
    affected_area_km2: Mapped[float] = mapped_column(Float, default=0)
    images: Mapped[int] = mapped_column(Integer, default=0)
    videos: Mapped[int] = mapped_column(Integer, default=0)
    merged_into_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )
    reports: Mapped[list[EventReport]] = relationship(back_populates="event", cascade="all, delete-orphan")


class EventReport(Base):
    __tablename__ = "event_reports"
    __table_args__ = (UniqueConstraint("event_id", "report_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    event: Mapped[Event] = relationship(back_populates="reports")
    report: Mapped["Report"] = relationship()  # noqa: F821
