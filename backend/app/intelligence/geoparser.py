from __future__ import annotations

import math
import re
from dataclasses import dataclass

GAZETTEER: list[dict] = [
    {"city": "Hyderabad", "district": "Hyderabad", "state": "Telangana", "lat": 17.385, "lon": 78.4867},
    {"city": "Warangal", "district": "Warangal", "state": "Telangana", "lat": 17.9689, "lon": 79.5941},
    {"city": "Chennai", "district": "Chennai", "state": "Tamil Nadu", "lat": 13.0827, "lon": 80.2707},
    {"city": "Bengaluru", "district": "Bengaluru Urban", "state": "Karnataka", "lat": 12.9716, "lon": 77.5946},
    {"city": "Mumbai", "district": "Mumbai", "state": "Maharashtra", "lat": 19.076, "lon": 72.8777},
    {"city": "Pune", "district": "Pune", "state": "Maharashtra", "lat": 18.5204, "lon": 73.8567},
    {"city": "Nagpur", "district": "Nagpur", "state": "Maharashtra", "lat": 21.1458, "lon": 79.0882},
    {"city": "Ahmedabad", "district": "Ahmedabad", "state": "Gujarat", "lat": 23.0225, "lon": 72.5714},
    {"city": "Surat", "district": "Surat", "state": "Gujarat", "lat": 21.1702, "lon": 72.8311},
    {"city": "Jaipur", "district": "Jaipur", "state": "Rajasthan", "lat": 26.9124, "lon": 75.7873},
    {"city": "Jodhpur", "district": "Jodhpur", "state": "Rajasthan", "lat": 26.2389, "lon": 73.0243},
    {"city": "Delhi", "district": "New Delhi", "state": "Delhi", "lat": 28.6139, "lon": 77.209},
    {"city": "Lucknow", "district": "Lucknow", "state": "Uttar Pradesh", "lat": 26.8467, "lon": 80.9462},
    {"city": "Varanasi", "district": "Varanasi", "state": "Uttar Pradesh", "lat": 25.3176, "lon": 82.9739},
    {"city": "Patna", "district": "Patna", "state": "Bihar", "lat": 25.5941, "lon": 85.1376},
    {"city": "Kolkata", "district": "Kolkata", "state": "West Bengal", "lat": 22.5726, "lon": 88.3639},
    {"city": "Bhubaneswar", "district": "Khordha", "state": "Odisha", "lat": 20.2961, "lon": 85.8245},
    {"city": "Visakhapatnam", "district": "Visakhapatnam", "state": "Andhra Pradesh", "lat": 17.6868, "lon": 83.2185},
    {"city": "Vijayawada", "district": "NTR", "state": "Andhra Pradesh", "lat": 16.5062, "lon": 80.648},
    {"city": "Kochi", "district": "Ernakulam", "state": "Kerala", "lat": 9.9312, "lon": 76.2673},
    {"city": "Thiruvananthapuram", "district": "Thiruvananthapuram", "state": "Kerala", "lat": 8.5241, "lon": 76.9366},
    {"city": "Guwahati", "district": "Kamrup Metropolitan", "state": "Assam", "lat": 26.1445, "lon": 91.7362},
    {"city": "Bhopal", "district": "Bhopal", "state": "Madhya Pradesh", "lat": 23.2599, "lon": 77.4126},
    {"city": "Indore", "district": "Indore", "state": "Madhya Pradesh", "lat": 22.7196, "lon": 75.8577},
    {"city": "Chandigarh", "district": "Chandigarh", "state": "Chandigarh", "lat": 30.7333, "lon": 76.7794},
    {"city": "Amritsar", "district": "Amritsar", "state": "Punjab", "lat": 31.634, "lon": 74.8723},
    {"city": "Srinagar", "district": "Srinagar", "state": "Jammu and Kashmir", "lat": 34.0837, "lon": 74.7973},
    {"city": "Ranchi", "district": "Ranchi", "state": "Jharkhand", "lat": 23.3441, "lon": 85.3096},
    {"city": "Raipur", "district": "Raipur", "state": "Chhattisgarh", "lat": 21.2514, "lon": 81.6296},
    {"city": "Panaji", "district": "North Goa", "state": "Goa", "lat": 15.4909, "lon": 73.8278},
    {"city": "Puri", "district": "Puri", "state": "Odisha", "lat": 19.8135, "lon": 85.8312},
    {"city": "Hitech City", "district": "Hyderabad", "state": "Telangana", "lat": 17.4483, "lon": 78.3915},
]


@dataclass
class GeoResult:
    lat: float | None
    lon: float | None
    state: str | None
    district: str | None
    city: str | None
    geo_precision: str
    geo_confidence: float
    place_text: str | None


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = math.radians
    dlat = r(b_lat - a_lat)
    dlon = r(b_lon - a_lon)
    h = math.sin(dlat / 2) ** 2 + math.cos(r(a_lat)) * math.cos(r(b_lat)) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def geoparse(
    text: str,
    place_text: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    exif_lat: float | None = None,
    exif_lon: float | None = None,
) -> GeoResult:
    """GPS from the citizen is stored but not treated as public truth. EXIF is a consistency signal only."""
    blob = _norm(f"{place_text or ''} {text or ''}")
    match = None
    for row in GAZETTEER:
        names = [row["city"], row["district"], row["state"]]
        if any(_norm(n) in blob for n in names if n):
            match = row
            precision = "CITY" if _norm(row["city"]) in blob else "DISTRICT" if _norm(row["district"]) in blob else "STATE"
            break
    if lat is not None and lon is not None:
        nearest = min(GAZETTEER, key=lambda r: haversine_km(lat, lon, r["lat"], r["lon"]))
        dist = haversine_km(lat, lon, nearest["lat"], nearest["lon"])
        has_explicit_locality = match is not None and precision != "STATE"
        city = nearest["city"] if dist < 40 else (match["city"] if has_explicit_locality else None)
        district = nearest["district"] if dist < 80 else (match["district"] if has_explicit_locality else None)
        state = match["state"] if match and precision == "STATE" else nearest["state"] if dist < 250 else (match["state"] if match else None)
        return GeoResult(
            lat=lat,
            lon=lon,
            state=state,
            district=district,
            city=city,
            geo_precision="GPS",
            geo_confidence=0.9 if dist < 40 else 0.6,
            place_text=place_text or city,
        )
    if match:
        return GeoResult(
            lat=match["lat"],
            lon=match["lon"],
            state=match["state"],
            district=match["district"],
            city=match["city"],
            geo_precision="CITY",
            geo_confidence=0.7,
            place_text=place_text or match["city"],
        )
    if exif_lat is not None and exif_lon is not None:
        # Consistency only — do not publish EXIF GPS as public location automatically.
        return GeoResult(None, None, None, None, None, "LOCALITY", 0.2, place_text)
    return GeoResult(None, None, None, None, None, "STATE", 0.1, place_text)
