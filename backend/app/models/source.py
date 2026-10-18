from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(64))  # IMD, Citizen, News/RSS, Satellite, Social, Sensor
    source_type: Mapped[str] = mapped_column(String(32), default="external")  # official|citizen|external|scientific
    category: Mapped[str] = mapped_column(String(32), default="website")  # social|dataset|website|api|citizen
    reliability: Mapped[float] = mapped_column(Float, default=0.5)
    description: Mapped[str] = mapped_column(Text, default="")
    is_live: Mapped[bool] = mapped_column(default=False)
    health_label: Mapped[str] = mapped_column(String(32), default="DEMO")  # CONNECTED|DEGRADED|FAILED|NOT_CONFIGURED|DEMO
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    health: Mapped[SourceHealth | None] = relationship(back_populates="source", uselist=False)


class SourceHealth(Base):
    __tablename__ = "source_health"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id"), unique=True)
    status: Mapped[str] = mapped_column(String(32), default="NOT_CONFIGURED")
    last_success: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failure: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    latency_ms: Mapped[float] = mapped_column(Float, default=0)
    records_received: Mapped[int] = mapped_column(Integer, default=0)
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    source: Mapped[Source] = relationship(back_populates="health")
