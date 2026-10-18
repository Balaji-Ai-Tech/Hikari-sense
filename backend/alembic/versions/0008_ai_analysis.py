"""Persist structured AI findings for reports.

Revision ID: 0008_ai_analysis
Revises: 0007_official_alerts
Create Date: 2026-10-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.core.migration_contract import validate_table_contract


revision = "0008_ai_analysis"
down_revision = "0007_official_alerts"
branch_labels = None
depends_on = None


_COLUMNS = {
    "id": (sa.Uuid(), False),
    "report_id": (sa.Uuid(), False),
    "status": (sa.String(length=32), False),
    "event_category": (sa.String(length=64), False),
    "summary": (sa.Text(), False),
    "location": (sa.String(length=255), True),
    "observed_time": (sa.String(length=64), True),
    "uncertainty": (sa.Text(), True),
    "evidence_claims": (postgresql.JSONB(astext_type=sa.Text()), False),
    "missing_information": (postgresql.JSONB(astext_type=sa.Text()), False),
    "duplicate_references": (postgresql.JSONB(astext_type=sa.Text()), False),
    "review_priority": (sa.String(length=16), False),
    "provider": (sa.String(length=64), False),
    "model": (sa.String(length=128), False),
    "confidence": (sa.Float(), True),
    "metadata": (postgresql.JSONB(astext_type=sa.Text()), False),
    "error": (sa.Text(), True),
    "created_at": (sa.DateTime(timezone=True), False),
    "updated_at": (sa.DateTime(timezone=True), False),
}


def _validate(bind) -> None:
    validate_table_contract(
        bind,
        "ai_analysis",
        columns=_COLUMNS,
        primary_key=("id",),
        unique_constraints={("report_id",)},
        foreign_keys={(('report_id',), 'reports', ('id',), 'CASCADE')},
        indexes={},
    )


def upgrade() -> None:
    bind = op.get_bind()
    if "ai_analysis" not in sa.inspect(bind).get_table_names():
        op.create_table(
            "ai_analysis",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("report_id", sa.Uuid(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("event_category", sa.String(length=64), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("location", sa.String(length=255), nullable=True),
            sa.Column("observed_time", sa.String(length=64), nullable=True),
            sa.Column("uncertainty", sa.Text(), nullable=True),
            sa.Column("evidence_claims", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("missing_information", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("duplicate_references", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("review_priority", sa.String(length=16), nullable=False),
            sa.Column("provider", sa.String(length=64), nullable=False),
            sa.Column("model", sa.String(length=128), nullable=False),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("report_id", name="uq_ai_analysis_report"),
        )
    _validate(bind)


def downgrade() -> None:
    bind = op.get_bind()
    if "ai_analysis" in sa.inspect(bind).get_table_names():
        _validate(bind)
        op.drop_table("ai_analysis")