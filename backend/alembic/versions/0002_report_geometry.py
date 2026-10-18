"""Persist source-provided report geometry.

Revision ID: 0002_report_geometry
Revises: 0001_initial
Create Date: 2026-10-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002_report_geometry"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "geometry" not in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("reports")}:
        op.add_column("reports", sa.Column("geometry", JSONB(), nullable=True))


def downgrade() -> None:
    if "geometry" in {column["name"] for column in sa.inspect(op.get_bind()).get_columns("reports")}:
        op.drop_column("reports", "geometry")