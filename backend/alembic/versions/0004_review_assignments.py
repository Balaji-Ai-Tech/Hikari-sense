"""Persist reviewer assignment and reassignment history.

Revision ID: 0004_review_assignments
Revises: 0003_verification_report_only
Create Date: 2026-10-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_review_assignments"
down_revision = "0003_verification_report_only"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "review_assignments" not in tables:
        op.create_table(
            "review_assignments",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("report_id", sa.Uuid(), nullable=False),
            sa.Column("reviewer_id", sa.Uuid(), nullable=False),
            sa.Column("assigned_by_user_id", sa.Uuid(), nullable=True),
            sa.Column("assigned_by_role", sa.String(length=64), nullable=False),
            sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("unassigned_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("unassigned_by_user_id", sa.Uuid(), nullable=True),
            sa.Column("unassigned_by_role", sa.String(length=64), nullable=True),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["unassigned_by_user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    existing = {index["name"] for index in sa.inspect(bind).get_indexes("review_assignments")}
    indexes = (
        ("ix_review_assignments_report_id", ["report_id"], False, None),
        ("ix_review_assignments_reviewer_id", ["reviewer_id"], False, None),
        ("ix_review_assignments_reviewer_active", ["reviewer_id", "unassigned_at"], False, None),
        (
            "uq_review_assignments_one_active_per_report",
            ["report_id"],
            True,
            sa.text("unassigned_at IS NULL"),
        ),
    )
    for name, columns, unique, predicate in indexes:
        if name not in existing:
            options = {"postgresql_where": predicate} if predicate is not None else {}
            op.create_index(name, "review_assignments", columns, unique=unique, **options)


def downgrade() -> None:
    op.drop_index("uq_review_assignments_one_active_per_report", table_name="review_assignments")
    op.drop_index("ix_review_assignments_reviewer_active", table_name="review_assignments")
    op.drop_index("ix_review_assignments_reviewer_id", table_name="review_assignments")
    op.drop_index("ix_review_assignments_report_id", table_name="review_assignments")
    op.drop_table("review_assignments")