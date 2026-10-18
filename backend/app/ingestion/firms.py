import csv
import hashlib
import io
import logging
import math
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import get_settings
from app.ingestion.base import BaseConnector

FIRMS_AREA = "68,5,98,40"


class FirmsConnector(BaseConnector):
    code = "SRC-FIRMS"
    name = "NASA FIRMS"
    kind = "Satellite"
    source_type = "scientific"
    category = "dataset"

    def fetch(self) -> list[dict[str, Any]]:
        key = get_settings().firms_map_key
        if not key:
            return []
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        try:
            response = httpx.get(
                f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_NOAA21_NRT/{FIRMS_AREA}/1",
                timeout=30,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else type(exc).__name__
            raise RuntimeError(f"NASA FIRMS request failed ({status})") from None
        reader = csv.DictReader(io.StringIO(response.text))
        required = {"latitude", "longitude", "acq_date", "acq_time", "satellite", "instrument"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            if not response.text.strip():
                return []
            raise ValueError("NASA FIRMS response is missing required CSV columns")

        observations = []
        for row in reader:
            latitude = _finite_number(row.get("latitude"), "latitude")
            longitude = _finite_number(row.get("longitude"), "longitude")
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise ValueError("NASA FIRMS returned coordinates outside WGS84 bounds")
            observed_at = _acquired_at(row.get("acq_date"), row.get("acq_time"))
            satellite = (row.get("satellite") or "").strip()
            instrument = (row.get("instrument") or "").strip()
            if not satellite or not instrument:
                raise ValueError("NASA FIRMS row is missing satellite or instrument attribution")
            identity = "|".join(
                (
                    satellite,
                    instrument,
                    observed_at.isoformat(),
                    f"{latitude:.5f}",
                    f"{longitude:.5f}",
                    (row.get("version") or "").strip(),
                )
            )
            confidence = (row.get("confidence") or "").strip()
            metadata = {
                "latitude": latitude,
                "longitude": longitude,
                "confidence": confidence,
                "satellite": satellite,
                "instrument": instrument,
                "acquisition_date": observed_at.date().isoformat(),
                "acquisition_time": observed_at.strftime("%H%M"),
                "brightness_kelvin": _optional_number(row.get("bright_ti4")),
                "frp_mw": _optional_number(row.get("frp")),
                "scan_km": _optional_number(row.get("scan")),
                "track_km": _optional_number(row.get("track")),
                "daynight": (row.get("daynight") or "").strip() or None,
                "version": (row.get("version") or "").strip() or None,
            }
            observations.append(
                {
                    "source": "firms",
                    "source_account": f"NASA FIRMS {satellite}/{instrument}",
                    "native_id": f"firms-{hashlib.sha256(identity.encode()).hexdigest()}",
                    "text": (
                        f"NASA FIRMS satellite thermal observation; confidence {confidence or 'unknown'}; "
                        f"satellite {satellite}, instrument {instrument}. Observation only; not a confirmed incident."
                    ),
                    "posted_at": observed_at,
                    "geo": {"lat": latitude, "lon": longitude},
                    "metadata": metadata,
                    "raw_payload": {key: value for key, value in row.items() if key},
                }
            )
        return observations

    def health(self) -> dict[str, Any]:
        return {
            "connector": self.code,
            "configured": bool(get_settings().firms_map_key),
            "status": "CONNECTED" if get_settings().firms_map_key else "NOT_CONFIGURED",
        }


def _finite_number(value: Any, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"NASA FIRMS returned an invalid {field}") from exc
    if not math.isfinite(number):
        raise ValueError(f"NASA FIRMS returned an invalid {field}")
    return number


def _optional_number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return _finite_number(value, "numeric metadata")


def _acquired_at(acquisition_date: str | None, acquisition_time: str | None) -> datetime:
    try:
        day = datetime.strptime(acquisition_date or "", "%Y-%m-%d").date()
        time_text = (acquisition_time or "").strip().zfill(4)
        hour, minute = int(time_text[:2]), int(time_text[2:])
        if hour > 23 or minute > 59:
            raise ValueError
        return datetime(day.year, day.month, day.day, hour, minute, tzinfo=UTC)
    except ValueError as exc:
        raise ValueError("NASA FIRMS returned an invalid acquisition timestamp") from exc
