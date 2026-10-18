from datetime import UTC, datetime
from typing import Any

from app.ingestion.base import BaseConnector


class SocialConnector(BaseConnector):
    """Licensed/authorized social APIs only. No X/Twitter scraping."""

    code = "SRC-SOCIAL-SAMPLE"
    name = "Licensed/sample social dataset"
    kind = "Social"
    category = "social"

    def fetch(self) -> list[dict[str, Any]]:
        return [
            {
                "source": "sample",
                "native_id": "sample-social-1",
                "text": "SAMPLE DATASET — not live social ingestion. Heavy rain and waterlogging near Hitech City.",
                "posted_at": datetime.now(UTC),
                "geo": {"place_text": "Hitech City"},
                "hashtags": ["IMD"],
            }
        ]

    def health(self) -> dict[str, Any]:
        return {
            "connector": self.code,
            "status": "DEMO",
            "note": "Never claim live social ingestion. X/Twitter is not scraped.",
        }
