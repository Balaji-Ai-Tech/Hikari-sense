from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx

from app.core.config import get_settings
from app.ingestion.base import BaseConnector
from app.schemas.envelope import IngestionEnvelope


class YouTubeConnector(BaseConnector):
    code = "SRC-YOUTUBE"
    name = "YouTube Data API"
    kind = "Social"
    category = "social"

    def fetch(self) -> list[dict[str, Any]]:
        key = get_settings().youtube_api_key
        if not key:
            return [
                {
                    "source": "youtube",
                    "native_id": "demo-yt-1",
                    "text": "SAMPLE DATASET — not live YouTube ingestion. Waterlogging reported in Hyderabad streets.",
                    "posted_at": datetime.now(UTC),
                    "source_account": "sample",
                }
            ]
        r = httpx.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={"part": "snippet", "q": "India flood rain IMD", "maxResults": 5, "key": key, "type": "video"},
            timeout=15,
        )
        r.raise_for_status()
        items = []
        for it in r.json().get("items", []):
            sn = it.get("snippet", {})
            items.append(
                {
                    "source": "youtube",
                    "native_id": it.get("id", {}).get("videoId") or str(uuid4()),
                    "text": f"{sn.get('title', '')}. {sn.get('description', '')}"[:2000],
                    "posted_at": datetime.now(UTC),
                    "source_account": sn.get("channelTitle", "youtube"),
                }
            )
        return items

    def health(self) -> dict[str, Any]:
        live = bool(get_settings().youtube_api_key)
        return {
            "connector": self.code,
            "configured": live,
            "note": "Live only when YOUTUBE_API_KEY is set. Otherwise SAMPLE dataset.",
        }
