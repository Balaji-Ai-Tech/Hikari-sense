from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.config import get_settings
from app.intelligence.geoparser import haversine_km

try:
    import h3
except ImportError:  # pragma: no cover
    h3 = None


@dataclass
class ClusterKey:
    h3_cell: str | None
    event_type: str
    window_start: datetime


def cell(lat: float | None, lon: float | None, res: int | None = None) -> str | None:
    if lat is None or lon is None:
        return None
    r = res if res is not None else get_settings().h3_resolution
    if h3 is None:
        return f"grid:{round(lat, 1)}:{round(lon, 1)}"
    try:
        return h3.latlng_to_cell(lat, lon, r)
    except Exception:
        return f"grid:{round(lat, 1)}:{round(lon, 1)}"


def same_event(
    event_type: str,
    lat: float | None,
    lon: float | None,
    when: datetime,
    other_type: str,
    other_lat: float | None,
    other_lon: float | None,
    other_when: datetime,
) -> bool:
    """Deterministic 10 km / 3 h correlation. Interface is ready for ST-DBSCAN/HDBSCAN."""
    s = get_settings()
    if event_type != other_type:
        return False
    if abs((when - other_when).total_seconds()) > s.cluster_window_hours * 3600:
        return False
    if lat is None or lon is None or other_lat is None or other_lon is None:
        return cell(lat, lon) is not None and cell(lat, lon) == cell(other_lat, other_lon)
    return haversine_km(lat, lon, other_lat, other_lon) <= s.cluster_radius_km


def cluster_reports(reports: list[dict]) -> list[list[dict]]:
    """Greedy clustering. Replace with ST-DBSCAN without changing the Event contract."""
    groups: list[list[dict]] = []
    for r in reports:
        placed = False
        for g in groups:
            seed = g[0]
            if same_event(
                r["event_type"],
                r.get("lat"),
                r.get("lon"),
                r["posted_at"],
                seed["event_type"],
                seed.get("lat"),
                seed.get("lon"),
                seed["posted_at"],
            ):
                g.append(r)
                placed = True
                break
        if not placed:
            groups.append([r])
    return groups
