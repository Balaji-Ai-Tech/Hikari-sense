from typing import Any

from app.ingestion.base import BaseConnector


class CitizenConnector(BaseConnector):
    """Citizen reports arrive via POST /api/v1/citizen/reports, not a poll loop."""

    code = "SRC-CITIZEN"
    name = "Citizen reports"
    kind = "Citizen"
    source_type = "citizen"
    category = "citizen"

    def fetch(self) -> list[dict[str, Any]]:
        return []

    def health(self) -> dict[str, Any]:
        return {"connector": self.code, "mode": "push", "live": True}
