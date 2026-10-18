"""Allow human verification records to apply directly to citizen reports.

Revision ID: 0003_verification_report_only
Revises: 0002_report_geometry
Create Date: 2026-10-05
"""

from alembic import op

revision = "0003_verification_report_only"
down_revision = "0002_report_geometry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("verifications", "event_id", nullable=True)


def downgrade() -> None:
    op.alter_column("verifications", "event_id", nullable=False)