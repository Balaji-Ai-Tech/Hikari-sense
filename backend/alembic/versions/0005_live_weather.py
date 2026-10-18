"""Persist source-linked Open-Meteo current and forecast rows.

Revision ID: 0005_live_weather
Revises: 0004_review_assignments
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_live_weather"
down_revision = "0004_review_assignments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "weather_observations" not in inspector.get_table_names():
        op.create_table(
            "weather_observations",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("report_id", sa.Uuid(), nullable=True),
            sa.Column("provider", sa.String(length=64), nullable=False),
            sa.Column("record_type", sa.String(length=24), server_default="current", nullable=False),
            sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("lat", sa.Float(), nullable=False),
            sa.Column("lon", sa.Float(), nullable=False),
            sa.Column("temperature_c", sa.Float(), nullable=True),
            sa.Column("precipitation_mm", sa.Float(), nullable=True),
            sa.Column("wind_ms", sa.Float(), nullable=True),
            sa.Column("humidity", sa.Float(), nullable=True),
            sa.Column("wind_direction_deg", sa.Float(), nullable=True),
            sa.Column("precipitation_probability_pct", sa.Float(), nullable=True),
            sa.Column("weather_code", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "report_id", "record_type", "observed_at", name="uq_weather_observation_report_time"
            ),
        )
        op.create_index("ix_weather_observations_observed_at", "weather_observations", ["observed_at"])
        op.create_index(
            "ix_weather_observations_type_time", "weather_observations", ["record_type", "observed_at"]
        )
        return

    columns = {column["name"] for column in inspector.get_columns("weather_observations")}
    if "report_id" not in columns:
        op.add_column(
            "weather_observations",
            sa.Column("report_id", sa.Uuid(), sa.ForeignKey("reports.id"), nullable=True),
        )
    if "record_type" not in columns:
        op.add_column(
            "weather_observations",
            sa.Column("record_type", sa.String(length=24), server_default="current", nullable=False),
        )
    for name, type_ in (
        ("wind_direction_deg", sa.Float()),
        ("precipitation_probability_pct", sa.Float()),
        ("weather_code", sa.Integer()),
    ):
        if name not in columns:
            op.add_column("weather_observations", sa.Column(name, type_, nullable=True))

    constraints = {constraint.get("name") for constraint in sa.inspect(bind).get_unique_constraints("weather_observations")}
    if "uq_weather_observation_report_time" not in constraints:
        op.create_unique_constraint(
            "uq_weather_observation_report_time",
            "weather_observations",
            ["report_id", "record_type", "observed_at"],
        )
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("weather_observations")}
    if "ix_weather_observations_type_time" not in indexes:
        op.create_index(
            "ix_weather_observations_type_time", "weather_observations", ["record_type", "observed_at"]
        )


def downgrade() -> None:
    op.drop_index("ix_weather_observations_type_time", table_name="weather_observations")
    op.drop_constraint("uq_weather_observation_report_time", "weather_observations", type_="unique")
    op.drop_column("weather_observations", "weather_code")
    op.drop_column("weather_observations", "precipitation_probability_pct")
    op.drop_column("weather_observations", "wind_direction_deg")
    op.drop_column("weather_observations", "record_type")
    op.drop_column("weather_observations", "report_id")