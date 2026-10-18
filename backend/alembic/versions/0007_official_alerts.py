"""Persist source-attributed public CAP alerts separately from incidents.

Revision ID: 0007_official_alerts
Revises: 0006_weather_forecast_dedupe
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_official_alerts"
down_revision = "0006_weather_forecast_dedupe"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "official_alerts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("report_id", sa.Uuid(), nullable=False),
        sa.Column("identifier", sa.String(length=255), nullable=False),
        sa.Column("sender", sa.String(length=255), nullable=False),
        sa.Column("event", sa.String(length=255), nullable=False),
        sa.Column("urgency", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("certainty", sa.String(length=32), nullable=False),
        sa.Column("message_type", sa.String(length=24), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("headline", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column("areas", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("references", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source_url", sa.String(length=512), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("report_id"),
        sa.UniqueConstraint("identifier"),
    )
    op.create_index("ix_official_alerts_identifier", "official_alerts", ["identifier"], unique=True)
    op.create_index("ix_official_alerts_issued_at", "official_alerts", ["issued_at"])
    op.create_index("ix_official_alerts_expires_at", "official_alerts", ["expires_at"])
    op.create_index("ix_official_alerts_status", "official_alerts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_official_alerts_status", table_name="official_alerts")
    op.drop_index("ix_official_alerts_expires_at", table_name="official_alerts")
    op.drop_index("ix_official_alerts_issued_at", table_name="official_alerts")
    op.drop_index("ix_official_alerts_identifier", table_name="official_alerts")
    op.drop_table("official_alerts")