from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

JSONType = JSON().with_variant(JSONB, "postgresql")


class AIAnalysis(Base):
    __tablename__ = "ai_analysis"
    __table_args__ = (UniqueConstraint("report_id", name="uq_ai_analysis_report"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    event_category: Mapped[str] = mapped_column(String(64), default="other")
    summary: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    observed_time: Mapped[str | None] = mapped_column(String(64), nullable=True)
    uncertainty: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_claims: Mapped[list[str]] = mapped_column(JSONType, default=list)
    missing_information: Mapped[list[str]] = mapped_column(JSONType, default=list)
    duplicate_references: Mapped[list[str]] = mapped_column(JSONType, default=list)
    review_priority: Mapped[str] = mapped_column(String(16), default="medium")
    provider: Mapped[str] = mapped_column(String(64), default="disabled")
    model: Mapped[str] = mapped_column(String(128), default="n/a")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    analysis_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONType, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    def to_api_dict(self) -> dict:
        return {
            "id": str(self.id),
            "reportId": str(self.report_id),
            "status": self.status,
            "eventCategory": self.event_category,
            "summary": self.summary,
            "location": self.location,
            "observedTime": self.observed_time,
            "uncertainty": self.uncertainty,
            "evidenceClaims": self.evidence_claims,
            "missingInformation": self.missing_information,
            "duplicateReferences": self.duplicate_references,
            "reviewPriority": self.review_priority,
            "provider": self.provider,
            "model": self.model,
            "confidence": self.confidence,
            "error": self.error,
            "manualReviewAvailable": True,
            "processedAt": self.updated_at.isoformat(),
        }
