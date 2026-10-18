from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx

from app.ingestion.base import BaseConnector
from app.schemas.envelope import EnvelopeGeo, IngestionEnvelope


class RssConnector(BaseConnector):
    code = "SRC-NEWS-RSS"
    name = "Public news RSS (not IMD)"
    kind = "News/RSS"
    category = "website"
    feeds = (
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    )

    def fetch(self) -> list[dict[str, Any]]:
        import feedparser

        out: list[dict[str, Any]] = []
        for url in self.feeds:
            parsed = feedparser.parse(url)
            for e in parsed.entries[:8]:
                out.append(
                    {
                        "source": "news",
                        "native_id": e.get("id") or e.get("link") or str(uuid4()),
                        "text": f"{e.get('title', '')}. {e.get('summary', '')}"[:2000],
                        "posted_at": datetime.now(UTC),
                        "source_account": url,
                    }
                )
        return out

    def normalize(self, raw: dict[str, Any]) -> IngestionEnvelope:
        env = super().normalize(raw)
        env.source = "news"
        env.geo = EnvelopeGeo(place_text=None)
        return env

    def health(self) -> dict[str, Any]:
        try:
            r = httpx.get(self.feeds[0], timeout=8)
            return {"connector": self.code, "http": r.status_code, "live": r.status_code < 400}
        except Exception as exc:
            return {"connector": self.code, "live": False, "error": str(exc)}
