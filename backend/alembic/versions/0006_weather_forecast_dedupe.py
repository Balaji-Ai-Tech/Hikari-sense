"""Deduplicate forecast rows by provider, grid cell, and valid time.

Revision ID: 0006_weather_forecast_dedupe
Revises: 0005_live_weather
Create Date: 2026-10-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_weather_forecast_dedupe"
down_revision = "0005_live_weather"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    constraints = {item.get("name") for item in sa.inspect(bind).get_unique_constraints("weather_observations")}
    if "uq_weather_observation_grid_time" not in constraints:
        op.create_unique_constraint(
            "uq_weather_observation_grid_time",
            "weather_observations",
            ["provider", "record_type", "observed_at", "lat", "lon"],
        )


def downgrade() -> None:
    op.drop_constraint("uq_weather_observation_grid_time", "weather_observations", type_="unique")