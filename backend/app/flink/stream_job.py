"""Local Flink-compatible transformation logic for the HIKARI MVP.

This is intentionally implementable without a live Docker runtime. The actual
Flink cluster deployment remains pending on a Docker-enabled machine, but the
logic below matches the intended stream contract and is testable locally.
"""

from __future__ import annotations

from collections import OrderedDict
from typing import Any


def normalize_weather_record(record: dict[str, Any]) -> dict[str, Any]:
    meta = record.get("geo", {}) if isinstance(record, dict) else {}
    current = record.get("current", {}) if isinstance(record, dict) else {}
    return {
        "event_type": "rainfall",
        "source": "open_meteo",
        "lat": meta.get("lat"),
        "lon": meta.get("lon"),
        "timestamp": record.get("posted_at") or record.get("timestamp"),
        "temperature_c": current.get("temperature_2m"),
        "precipitation_mm": current.get("precipitation"),
        "wind_kph": current.get("wind_speed_10m"),
        "humidity_pct": current.get("relative_humidity_2m"),
        "status": "NORMALIZED",
    }


def normalize_alert_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_type": record.get("event_type") or "alert",
        "source": record.get("source") or "sachet",
        "lat": record.get("lat"),
        "lon": record.get("lon"),
        "timestamp": record.get("posted_at") or record.get("timestamp"),
        "severity": record.get("severity") or "medium",
        "status": "NORMALIZED",
    }


def normalize_citizen_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_type": record.get("event_type") or "other",
        "source": "citizen",
        "lat": record.get("lat"),
        "lon": record.get("lon"),
        "timestamp": record.get("posted_at") or record.get("timestamp"),
        "description": record.get("text") or record.get("description"),
        "status": "NORMALIZED",
    }


def deduplicate_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in records:
        key = (
            str(item.get("source")),
            str(item.get("event_type")),
            str(item.get("lat")),
            str(item.get("lon")),
            str(item.get("timestamp")),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def classify_event(record: dict[str, Any]) -> dict[str, Any]:
    event_type = str(record.get("event_type") or "other").lower()
    mapping = {
        "flood": "flood",
        "rain": "heavy rainfall",
        "rainfall": "heavy rainfall",
        "storm": "thunderstorm",
        "heat": "heatwave",
        "wind": "strong wind",
        "fire": "wildfire",
        "landslide": "landslide",
        "cyclone": "cyclone",
        "fog": "fog",
        "dust": "dust storm",
        "lightning": "lightning",
    }
    return OrderedDict(
        {
            "event_id": record.get("event_id") or record.get("native_id"),
            "event_type": mapping.get(event_type, event_type or "other"),
            "confidence": 0.72 if event_type else 0.5,
            "status": "DETECTED",
        }
    )


def pipeline(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for record in records:
        if record.get("source") == "open_meteo":
            normalized.append(normalize_weather_record(record))
        elif record.get("source") == "sachet":
            normalized.append(normalize_alert_record(record))
        elif record.get("source") == "citizen":
            normalized.append(normalize_citizen_record(record))
        else:
            normalized.append(record)
    deduped = deduplicate_records(normalized)
    return [classify_event(item) for item in deduped]
