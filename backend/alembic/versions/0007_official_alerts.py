"""Persist source-attributed public CAP alerts separately from incidents.

Revision ID: 0007_official_alerts
Revises: 0006_weather_forecast_dedupe
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.core.migration_contract import validate_table_contract

revision = "0007_official_alerts"
down_revision = "0006_weather_forecast_dedupe"
branch_labels = None
depends_on = None


_COLUMNS = {
    "id": (sa.Uuid(), False),
    "report_id": (sa.Uuid(), False),
    "identifier": (sa.String(length=255), False),
    "sender": (sa.String(length=255), False),
    "event": (sa.String(length=255), False),
    "urgency": (sa.String(length=32), False),
    "severity": (sa.String(length=32), False),
    "certainty": (sa.String(length=32), False),
    "message_type": (sa.String(length=24), False),
    "issued_at": (sa.DateTime(timezone=True), False),
    "expires_at": (sa.DateTime(timezone=True), True),
    "headline": (sa.Text(), False),
    "description": (sa.Text(), False),
    "instructions": (sa.Text(), False),
    "areas": (postgresql.JSONB(astext_type=sa.Text()), False),
    "references": (postgresql.JSONB(astext_type=sa.Text()), False),
    "source_url": (sa.String(length=512), True),
    "status": (sa.String(length=24), False),
    "created_at": (sa.DateTime(timezone=True), False),
}
_UNIQUE_CONSTRAINTS = {("report_id",)}
_FOREIGN_KEYS = {(('report_id',), 'reports', ('id',), 'CASCADE')}
_INDEXES = {
    "ix_official_alerts_identifier": (("identifier",), True),
    "ix_official_alerts_issued_at": (("issued_at",), False),
    "ix_official_alerts_expires_at": (("expires_at",), False),
    "ix_official_alerts_status": (("status",), False),
}


def _validate(bind, *, indexes=None) -> None:
    validate_table_contract(
        bind,
        "official_alerts",
        columns=_COLUMNS,
        primary_key=("id",),
        unique_constraints=_UNIQUE_CONSTRAINTS,
        foreign_keys=_FOREIGN_KEYS,
        indexes=indexes,
    )


def _ensure_indexes(bind) -> None:
    existing = {item["name"]: item for item in sa.inspect(bind).get_indexes("official_alerts")}
    for name, (columns, unique) in _INDEXES.items():
        index = existing.get(name)
        if index is not None:
            if tuple(index.get("column_names") or ()) != columns or bool(index.get("unique")) != unique:
                raise RuntimeError(f"Index official_alerts.{name} has an incompatible definition")
            continue
        op.create_index(name, "official_alerts", columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    if "official_alerts" not in sa.inspect(bind).get_table_names():
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
        )
    _validate(bind)
    _ensure_indexes(bind)
    _validate(bind, indexes=_INDEXES)


def downgrade() -> None:
    bind = op.get_bind()
    if "official_alerts" not in sa.inspect(bind).get_table_names():
        return
    for name in reversed(tuple(_INDEXES)):
        if name in {item["name"] for item in sa.inspect(bind).get_indexes("official_alerts")}:
            op.drop_index(name, table_name="official_alerts")
    op.drop_table("official_alerts")