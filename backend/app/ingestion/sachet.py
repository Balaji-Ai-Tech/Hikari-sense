from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import httpx

from app.core.config import get_settings
from app.ingestion.base import BaseConnector

log = logging.getLogger(__name__)

SACHET_HOST = "sachet.ndma.gov.in"
CAP_NS = "{urn:oasis:names:tc:emergency:cap:1.2}"
MAX_ITEMS_PER_POLL = 8
FETCH_TIMEOUT_SECONDS = 15


class SachetConnector(BaseConnector):
    code = "SRC-SACHET"
    name = "SACHET / NDMA CAP alerts"
    kind = "Official alert"
    source_type = "official"
    category = "api"

    def fetch(self) -> list[dict[str, Any]]:
        response = httpx.get(get_settings().sachet_feed_url, timeout=FETCH_TIMEOUT_SECONDS)
        response.raise_for_status()
        feed = ET.fromstring(response.content)
        now = datetime.now(UTC)
        records: list[dict[str, Any]] = []
        seen: set[str] = set()

        for item in _direct_children(feed.find("channel"), "item")[:MAX_ITEMS_PER_POLL]:
            cap_url = _child_text(item, "link")
            if not _is_sachet_url(cap_url):
                log.warning("SOURCE_ITEM_REJECTED", extra={"source": self.code, "reason": "invalid CAP URL"})
                continue
            try:
                cap_response = httpx.get(cap_url, timeout=FETCH_TIMEOUT_SECONDS)
                cap_response.raise_for_status()
                cap_xml = cap_response.text
                cap = ET.fromstring(cap_response.content)
                parsed = _parse_cap(cap, now)
                if parsed is None or parsed["native_id"] in seen:
                    continue
                seen.add(parsed["native_id"])

                polygon_xml = ""
                polygon_url = parsed.pop("polygon_url")
                if _is_sachet_url(polygon_url):
                    try:
                        polygon_response = httpx.get(polygon_url, timeout=FETCH_TIMEOUT_SECONDS)
                        polygon_response.raise_for_status()
                        polygon_xml = polygon_response.text
                    except httpx.HTTPError as exc:
                        log.warning(
                            "SOURCE_GEOMETRY_FETCH_FAILED",
                            extra={"source": self.code, "external_id": parsed["native_id"], "error": str(exc)},
                        )

                parsed["geo"].update(_polygon_center(polygon_xml))
                parsed["geometry"] = _polygon_geometry(polygon_xml)
                parsed["raw_payload"] = {
                    "cap_xml": cap_xml,
                    "polygon_xml": polygon_xml,
                    "rss_title": _child_text(item, "title"),
                    "rss_pub_date": _child_text(item, "pubDate"),
                }
                records.append(parsed)
            except (httpx.HTTPError, ET.ParseError, ValueError) as exc:
                log.warning(
                    "SOURCE_ITEM_FETCH_FAILED",
                    extra={"source": self.code, "cap_url": cap_url, "error": str(exc)},
                )

        return records


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _direct_children(element: ET.Element | None, name: str) -> list[ET.Element]:
    if element is None:
        return []
    local_name = _local_name(name)
    return [child for child in element if _local_name(child.tag) == local_name]


def _child_text(element: ET.Element | None, name: str) -> str:
    matches = _direct_children(element, name)
    return (matches[0].text or "").strip() if matches else ""


def _cap_text(element: ET.Element | None, name: str) -> str:
    return _child_text(element, f"{CAP_NS}{name}")


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def _is_sachet_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.hostname == SACHET_HOST


def _parse_cap(root: ET.Element, now: datetime) -> dict[str, Any] | None:
    identifier = _cap_text(root, "identifier")
    status = _cap_text(root, "status")
    message_type = _cap_text(root, "msgType")
    scope = _cap_text(root, "scope")
    sent_value = _cap_text(root, "sent")
    if not identifier or status != "Actual" or scope != "Public" or message_type != "Alert":
        return None

    infos = _direct_children(root, f"{CAP_NS}info")
    info = next((candidate for candidate in infos if _cap_text(candidate, "language").startswith("en")), None)
    if info is None and infos:
        info = infos[0]
    if info is None:
        return None

    sent_at = _parse_datetime(sent_value)
    expiry_value = _cap_text(info, "expires")
    if expiry_value and _parse_datetime(expiry_value) <= now:
        return None

    area_descriptions = [
        _cap_text(area, "areaDesc")
        for area in _direct_children(info, f"{CAP_NS}area")
        if _cap_text(area, "areaDesc")
    ]
    parameters = _direct_children(info, f"{CAP_NS}parameter")
    polygon_url = next(
        (
            _cap_text(parameter, "value")
            for parameter in parameters
            if _cap_text(parameter, "valueName").casefold() == "polygon url"
        ),
        "",
    )
    headline = _cap_text(info, "headline") or _cap_text(info, "event")
    description = _cap_text(info, "description")
    instruction = _cap_text(info, "instruction")
    sender = _cap_text(root, "senderName") or _cap_text(root, "sender")
    severity = _cap_text(info, "severity")
    area_text = "; ".join(area_descriptions)
    text = ". ".join(
        part
        for part in (
            headline,
            description,
            f"Area: {area_text}" if area_text else "",
            f"Official CAP severity: {severity}" if severity else "",
            f"Issued by {sender}" if sender else "",
            "Official alert; human verification required",
        )
        if part
    )
    return {
        "source": "sachet",
        "native_id": identifier,
        "source_account": sender or "SACHET / NDMA",
        "text": text[:4000],
        "posted_at": sent_at,
        "geo": {"place_text": area_text or None},
        "raw_ref": _cap_text(info, "web") or None,
        "metadata": {
            "status": status,
            "message_type": message_type,
            "event": _cap_text(info, "event"),
            "urgency": _cap_text(info, "urgency"),
            "severity": severity,
            "certainty": _cap_text(info, "certainty"),
            "expires": expiry_value,
            "sender": sender,
            "area_descriptions": area_descriptions,
            "headline": headline,
            "description": description,
            "instruction": instruction,
            "references": _cap_text(root, "references").split(" ") if _cap_text(root, "references") else [],
        },
        "polygon_url": polygon_url,
    }


def _polygon_center(polygon_xml: str) -> dict[str, float]:
    if not polygon_xml:
        return {}
    root = ET.fromstring(polygon_xml)
    weighted_lat = 0.0
    weighted_lon = 0.0
    total_area = 0.0
    fallback: list[tuple[float, float]] = []

    for node in root.iter():
        if _local_name(node.tag) != "polygon" or not node.text:
            continue
        points: list[tuple[float, float]] = []
        for pair in node.text.split():
            latitude, longitude = (float(value) for value in pair.split(",", 1))
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise ValueError("SACHET polygon coordinate is outside WGS84 bounds")
            points.append((latitude, longitude))
        if len(points) > 1 and points[0] == points[-1]:
            points.pop()
        fallback.extend(points)
        if len(points) < 3:
            continue

        cross_sum = 0.0
        centroid_lat = 0.0
        centroid_lon = 0.0
        for index, (latitude, longitude) in enumerate(points):
            next_latitude, next_longitude = points[(index + 1) % len(points)]
            cross = longitude * next_latitude - next_longitude * latitude
            cross_sum += cross
            centroid_lon += (longitude + next_longitude) * cross
            centroid_lat += (latitude + next_latitude) * cross
        area_weight = abs(cross_sum)
        if area_weight:
            weighted_lat += centroid_lat / (3 * cross_sum) * area_weight
            weighted_lon += centroid_lon / (3 * cross_sum) * area_weight
            total_area += area_weight

    if total_area:
        return {"lat": weighted_lat / total_area, "lon": weighted_lon / total_area}
    if fallback:
        return {
            "lat": sum(point[0] for point in fallback) / len(fallback),
            "lon": sum(point[1] for point in fallback) / len(fallback),
        }
    return {}


def _polygon_geometry(polygon_xml: str) -> dict[str, Any] | None:
    if not polygon_xml:
        return None
    root = ET.fromstring(polygon_xml)
    polygons: list[list[list[list[float]]]] = []
    for node in root.iter():
        if _local_name(node.tag) != "polygon" or not node.text:
            continue
        ring: list[list[float]] = []
        for pair in node.text.split():
            latitude, longitude = (float(value) for value in pair.split(",", 1))
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise ValueError("SACHET polygon coordinate is outside WGS84 bounds")
            ring.append([longitude, latitude])
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        if len(ring) >= 4:
            signed_area = sum(
                ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]
                for index in range(len(ring) - 1)
            )
            if signed_area < 0:
                ring.reverse()
            polygons.append([ring])
    if not polygons:
        return None
    return {"type": "MultiPolygon", "coordinates": polygons}