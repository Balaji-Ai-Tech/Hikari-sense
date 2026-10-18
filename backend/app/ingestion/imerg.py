from typing import Any

from app.ingestion.base import BaseConnector


class ImergConnector(BaseConnector):
    code = "SRC-IMERG"
    name = "NASA IMERG (authorized access only)"
    kind = "Satellite"
    source_type = "scientific"
    category = "dataset"

    def fetch(self) -> list[dict[str, Any]]:
        return []

    def health(self) -> dict[str, Any]:
        return {
            "connector": self.code,
            "status": "NOT_CONFIGURED",
            "note": "No IMERG granules ingested until authorized credentials exist. Not a live government feed.",
        }
