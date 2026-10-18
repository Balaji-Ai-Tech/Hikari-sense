from typing import Any

from app.core.config import get_settings
from app.ingestion.base import BaseConnector


class OfficialConnector(BaseConnector):
    """IMD/SACHET only via configured official endpoints — never scrape restricted systems."""

    code = "SRC-IMD"
    name = "Official meteorological feeds"
    kind = "IMD"
    source_type = "official"
    category = "api"

    def fetch(self) -> list[dict[str, Any]]:
        s = get_settings()
        if not s.imd_base_url and not s.sachet_base_url:
            return []
        # Compliant HTTP GET against an operator-configured official base URL only.
        import httpx

        out: list[dict[str, Any]] = []
        for base, source in ((s.imd_base_url, "imd"), (s.sachet_base_url, "sachet")):
            if not base:
                continue
            r = httpx.get(base, timeout=15)
            r.raise_for_status()
            payload = r.json() if "json" in r.headers.get("content-type", "") else {"text": r.text[:2000]}
            out.append(
                {
                    "source": source,
                    "native_id": str(payload.get("id") or base),
                    "text": str(payload)[:2000],
                }
            )
        return out

    def health(self) -> dict[str, Any]:
        s = get_settings()
        configured = bool(s.imd_base_url or s.sachet_base_url)
        return {
            "connector": self.code,
            "configured": configured,
            "status": "CONNECTED" if configured else "NOT_CONFIGURED",
            "note": "Never reported healthy unless IMD_BASE_URL or SACHET_BASE_URL is set.",
        }
