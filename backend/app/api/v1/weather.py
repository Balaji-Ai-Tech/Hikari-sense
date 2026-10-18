from __future__ import annotations

import hashlib
import json
import logging
import math
import time
from datetime import UTC, datetime
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, select

from app.api.deps import Db
from app.core.config import get_settings
from app.core.redis import cache_get, cache_set, rate_hit
from app.models.official_alert import OfficialAlert
from app.models.report import Report
from app.models.source import Source, SourceHealth
from app.models.weather_observation import WeatherObservation

router = APIRouter(tags=["weather"])
log = logging.getLogger(__name__)
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
LIVE_CACHE_SECONDS = 600


@router.get("/weather/locations")
def search_weather_locations(
    request: Request,
    q: str = Query(min_length=2, max_length=120),
    count: int = Query(default=8, ge=1, le=10),
):
    allowed, _ = rate_hit(f"weather:geocode:{_client_key(request)}", 30)
    if not allowed:
        raise HTTPException(429, "Location search rate limit exceeded.")
    normalized_query = q.strip()
    if len(normalized_query) < 2:
        raise HTTPException(422, "Search for at least two characters.")
    cache_key = f"weather:geocode:{hashlib.sha256(normalized_query.casefold().encode()).hexdigest()}:{count}"
    cached = _cache_read(cache_key, max_age_seconds=3600)
    if cached is not None:
        return cached["data"]
    try:
        response = httpx.get(
            GEOCODING_URL,
            params={"name": normalized_query, "count": count, "language": "en", "format": "json"},
            timeout=8,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("WEATHER_GEOCODING_FAILED", extra={"error": type(exc).__name__})
        raise HTTPException(502, "Open-Meteo location search is unavailable.") from None
    results = payload.get("results", []) if isinstance(payload, dict) else []
    if not isinstance(results, list):
        raise HTTPException(502, "Open-Meteo returned an invalid location response.")
    items = []
    for result in results:
        if not isinstance(result, dict):
            continue
        latitude = _coordinate(result.get("latitude"), -90, 90)
        longitude = _coordinate(result.get("longitude"), -180, 180)
        if latitude is None or longitude is None or not isinstance(result.get("name"), str):
            continue
        items.append(
            {
                "id": result.get("id"),
                "name": result["name"],
                "latitude": latitude,
                "longitude": longitude,
                "country": result.get("country"),
                "countryCode": result.get("country_code"),
                "admin1": result.get("admin1"),
                "admin2": result.get("admin2"),
                "admin3": result.get("admin3"),
                "timezone": result.get("timezone"),
            }
        )
    body = {"items": items, "source": "Open-Meteo Geocoding API"}
    cache_set(cache_key, json.dumps({"cachedAt": time.time(), "data": body}), ttl=3600)
    return body


@router.get("/weather/live")
def live_weather(
    request: Request,
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    location: str | None = Query(default=None, max_length=160),
    refresh: bool = False,
):
    allowed, _ = rate_hit(f"weather:live:{_client_key(request)}", 60)
    if not allowed:
        raise HTTPException(429, "Live weather request rate limit exceeded.")
    cache_key = f"weather:live:{latitude:.4f}:{longitude:.4f}:metric:v1"
    cached = None if refresh else _cache_read(cache_key, max_age_seconds=LIVE_CACHE_SECONDS)
    if cached is not None:
        return {
            **cached["data"],
            "requested": {"latitude": latitude, "longitude": longitude},
            "location": location or cached["data"].get("location"),
        }

    settings = get_settings()
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": (
            "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,"
            "weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
        ),
        "hourly": (
            "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,"
            "weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility"
        ),
        "daily": (
            "temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,"
            "weather_code,wind_speed_10m_max,wind_gusts_10m_max"
        ),
        "forecast_days": 7,
        "timezone": "auto",
    }
    payload = None
    for attempt in range(2):
        try:
            response = httpx.get(f"{settings.open_meteo_base_url.rstrip('/')}/forecast", params=params, timeout=10)
            response.raise_for_status()
            payload = response.json()
            break
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 429:
                retry_after = exc.response.headers.get("Retry-After", "60")
                raise HTTPException(
                    429,
                    "Open-Meteo rate limit reached. Retry after the indicated delay.",
                    headers={"Retry-After": retry_after},
                ) from None
            if status < 500 or attempt == 1:
                log.warning("LIVE_WEATHER_UPSTREAM_FAILED", extra={"status": status})
                raise HTTPException(502, "Open-Meteo forecast is unavailable.") from None
        except httpx.TimeoutException:
            if attempt == 1:
                raise HTTPException(504, "Open-Meteo forecast timed out.") from None
        except (httpx.HTTPError, ValueError) as exc:
            if attempt == 1:
                log.warning("LIVE_WEATHER_UPSTREAM_FAILED", extra={"error": type(exc).__name__})
                raise HTTPException(502, "Open-Meteo forecast is unavailable.") from None
        if attempt == 0:
            time.sleep(0.15)

    body = _validate_live_forecast(payload, latitude, longitude, location)
    cache_set(cache_key, json.dumps({"cachedAt": time.time(), "data": body}), ttl=LIVE_CACHE_SECONDS)
    return body


@router.get("/satellite/observations")
def satellite_observations(db: Db, limit: int = Query(200, ge=1, le=500)):
    rows = db.execute(
        select(Report, SourceHealth.last_success, SourceHealth.records_received,
               SourceHealth.records_processed, SourceHealth.error_count, SourceHealth.last_error)
        .join(Source, Source.id == Report.source_id)
        .outerjoin(SourceHealth, SourceHealth.source_id == Source.id)
        .where(Source.code == "SRC-FIRMS", Report.status == "OBSERVATION")
        .order_by(Report.posted_at.desc())
        .limit(limit)
    ).all()
    health = db.execute(
        select(Source.health_label, SourceHealth.last_success, SourceHealth.records_received,
               SourceHealth.records_processed, SourceHealth.error_count, SourceHealth.last_error)
        .outerjoin(SourceHealth, SourceHealth.source_id == Source.id)
        .where(Source.code == "SRC-FIRMS")
    ).one_or_none()
    now = datetime.now(UTC)
    last_success = health.last_success if health else None
    if last_success and last_success.tzinfo is None:
        last_success = last_success.replace(tzinfo=UTC)
    stale = last_success is None or (now - last_success).total_seconds() > 1800
    persisted = db.scalar(
        select(func.count()).select_from(Report).join(Source, Source.id == Report.source_id)
        .where(Source.code == "SRC-FIRMS", Report.status == "OBSERVATION")
    ) or 0
    return {
        "items": [
            {
                "id": str(report.id),
                "sourceRecordId": report.native_id,
                "observedAt": report.posted_at,
                "latitude": report.lat,
                "longitude": report.lon,
                "location": report.place_text,
                "summary": report.text,
                "sourceAccount": report.source_account or "NASA FIRMS",
                "status": report.status,
            }
            for report, *_ in rows
            if report.lat is not None and report.lon is not None
        ],
        "total": persisted,
        "source": {
            "code": "SRC-FIRMS",
            "status": (
                health.health_label
                if health and health.health_label == "NOT_CONFIGURED"
                else "STALE" if stale and health else (health.health_label if health else "NOT_CONFIGURED")
            ),
            "lastSuccess": last_success,
            "recordsReceived": health.records_received if health else 0,
            "recordsProcessed": health.records_processed if health else 0,
            "errorCount": health.error_count if health else 0,
            "lastError": health.last_error if health else None,
            "recordsPersisted": persisted,
        },
    }


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _cache_read(key: str, *, max_age_seconds: int) -> dict | None:
    value = cache_get(key)
    if not value:
        return None
    try:
        cached = json.loads(value)
        if time.time() - float(cached["cachedAt"]) > max_age_seconds:
            return None
        return cached
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def _coordinate(value: object, minimum: float, maximum: float) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    result = float(value)
    return result if minimum <= result <= maximum else None


def _validate_live_forecast(payload: object, latitude: float, longitude: float, location: str | None) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("current"), dict):
        raise HTTPException(502, "Open-Meteo returned an invalid forecast response.")
    provider_lat = _coordinate(payload.get("latitude"), -90, 90)
    provider_lon = _coordinate(payload.get("longitude"), -180, 180)
    if provider_lat is None or provider_lon is None:
        raise HTTPException(502, "Open-Meteo returned invalid coordinates.")
    for group in ("hourly", "daily"):
        values = payload.get(group)
        if not isinstance(values, dict) or not isinstance(values.get("time"), list):
            raise HTTPException(502, f"Open-Meteo returned invalid {group} forecast data.")
        length = len(values["time"])
        if length == 0 or length > 200:
            raise HTTPException(502, f"Open-Meteo returned invalid {group} forecast data.")
        if any(isinstance(series, list) and len(series) != length for series in values.values()):
            raise HTTPException(502, f"Open-Meteo returned inconsistent {group} forecast fields.")
    return {
        "requested": {"latitude": latitude, "longitude": longitude},
        "coordinates": {"latitude": provider_lat, "longitude": provider_lon},
        "location": location,
        "timezone": payload.get("timezone"),
        "current": payload["current"],
        "hourly": payload["hourly"],
        "daily": payload["daily"],
        "fetchedAt": datetime.now(UTC).isoformat(),
        "provider": "Open-Meteo",
        "attribution": "Open-Meteo; CC BY 4.0",
    }


@router.get("/official-alerts")
def official_alerts(
    db: Db,
    active_only: bool = True,
    limit: int = Query(100, ge=1, le=500),
):
    now = datetime.now(UTC)
    stmt = (
        select(OfficialAlert, Report.lat, Report.lon, Report.place_text)
        .join(Report, Report.id == OfficialAlert.report_id)
        .where(OfficialAlert.status == "active")
    )
    if active_only:
        stmt = stmt.where((OfficialAlert.expires_at.is_(None)) | (OfficialAlert.expires_at > now))
    rows = db.execute(stmt.order_by(OfficialAlert.issued_at.desc()).limit(limit)).all()
    health = db.execute(
        select(Source.health_label, SourceHealth.last_success, SourceHealth.records_received,
               SourceHealth.records_processed, SourceHealth.error_count, SourceHealth.last_error)
        .outerjoin(SourceHealth, SourceHealth.source_id == Source.id)
        .where(Source.code == "SRC-SACHET")
    ).one_or_none()
    last_success = health.last_success if health else None
    if last_success and last_success.tzinfo is None:
        last_success = last_success.replace(tzinfo=UTC)
    stale = last_success is None or (now - last_success).total_seconds() > 1800
    return {
        "items": [
            {
                "id": str(alert.id),
                "reportId": str(alert.report_id),
                "sourceRecordId": alert.identifier,
                "issuer": alert.sender,
                "event": alert.event,
                "urgency": alert.urgency,
                "severity": alert.severity,
                "certainty": alert.certainty,
                "messageType": alert.message_type,
                "issuedAt": alert.issued_at,
                "expiresAt": alert.expires_at,
                "headline": alert.headline,
                "description": alert.description,
                "instructions": alert.instructions,
                "areas": alert.areas,
                "references": alert.references,
                "sourceUrl": alert.source_url,
                "latitude": lat,
                "longitude": lon,
                "location": place_text,
            }
            for alert, lat, lon, place_text in rows
        ],
        "total": len(rows),
        "source": {
            "code": "SRC-SACHET",
            "status": "STALE" if stale else health.health_label,
            "lastSuccess": last_success,
            "recordsReceived": health.records_received if health else 0,
            "recordsProcessed": health.records_processed if health else 0,
            "errorCount": health.error_count if health else 0,
            "lastError": health.last_error if health else None,
            "recordsPersisted": db.scalar(
                select(func.count()).select_from(OfficialAlert).where(OfficialAlert.status == "active")
            ) or 0,
        },
    }


@router.get("/weather/observations")
def weather_observations(
    db: Db,
    record_type: Literal["current", "forecast"] | None = None,
    limit: int = Query(200, ge=1, le=500),
):
    stmt = (
        select(WeatherObservation, Report.native_id, Report.place_text)
        .join(Report, Report.id == WeatherObservation.report_id)
        .join(Source, Source.id == Report.source_id)
        .where(Source.code == "SRC-OPEN-METEO")
    )
    if record_type:
        stmt = stmt.where(WeatherObservation.record_type == record_type)
    rows = db.execute(stmt.order_by(WeatherObservation.observed_at.desc()).limit(limit)).all()
    health = db.execute(
        select(Source.health_label, SourceHealth.last_success, SourceHealth.records_received,
               SourceHealth.records_processed, SourceHealth.error_count, SourceHealth.last_error)
        .outerjoin(SourceHealth, SourceHealth.source_id == Source.id)
        .where(Source.code == "SRC-OPEN-METEO")
    ).one_or_none()
    now = datetime.now(UTC)
    last_success = health.last_success if health else None
    if last_success and last_success.tzinfo is None:
        last_success = last_success.replace(tzinfo=UTC)
    stale = last_success is None or (now - last_success).total_seconds() > 1800
    normalized_count = db.scalar(
        select(func.count())
        .select_from(Report)
        .join(Source, Source.id == Report.source_id)
        .where(Source.code == "SRC-OPEN-METEO")
    ) or 0
    processed_count = db.scalar(
        select(func.count())
        .select_from(WeatherObservation)
        .where(WeatherObservation.report_id.is_not(None), WeatherObservation.record_type == "current")
    ) or 0
    persisted_count = db.scalar(
        select(func.count())
        .select_from(WeatherObservation)
        .where(WeatherObservation.report_id.is_not(None))
    ) or 0
    return {
        "items": [
            {
                "id": str(observation.id),
                "reportId": str(observation.report_id),
                "sourceRecordId": native_id,
                "provider": observation.provider,
                "recordType": observation.record_type,
                "observedAt": observation.observed_at,
                "latitude": observation.lat,
                "longitude": observation.lon,
                "location": place_text,
                "temperatureC": observation.temperature_c,
                "humidityPct": observation.humidity,
                "precipitationMm": observation.precipitation_mm,
                "windSpeedMs": observation.wind_ms,
                "windDirectionDeg": observation.wind_direction_deg,
                "precipitationProbabilityPct": observation.precipitation_probability_pct,
                "weatherCode": observation.weather_code,
                "attribution": "Open-Meteo; CC BY 4.0",
            }
            for observation, native_id, place_text in rows
        ],
        "total": len(rows),
        "source": {
            "code": "SRC-OPEN-METEO",
            "status": "STALE" if stale else health.health_label,
            "lastSuccess": last_success,
            "recordsReceived": health.records_received if health else 0,
            "recordsNormalized": normalized_count,
            "recordsProcessed": processed_count,
            "errorCount": health.error_count if health else 0,
            "lastError": health.last_error if health else None,
            "recordsPersisted": persisted_count,
        },
    }