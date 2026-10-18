from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WeatherObservation(Base):
    __tablename__ = "weather_observations"
    __table_args__ = (
        UniqueConstraint("report_id", "record_type", "observed_at", name="uq_weather_observation_report_time"),
        UniqueConstraint(
            "provider", "record_type", "observed_at", "lat", "lon", name="uq_weather_observation_grid_time"
        ),
        Index("ix_weather_observations_type_time", "record_type", "observed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("reports.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(64), default="open-meteo")
    record_type: Mapped[str] = mapped_column(String(24), default="current")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    precipitation_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_direction_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    precipitation_probability_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class GriddedRainfall(Base):
    __tablename__ = "gridded_rainfall"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(64), default="imerg")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    rainfall_mm: Mapped[float] = mapped_column(Float)
    is_synthetic: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
