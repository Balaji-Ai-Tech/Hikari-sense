import math
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import get_settings
from app.ingestion.base import BaseConnector


class OpenMeteoConnector(BaseConnector):
    code = "SRC-OPEN-METEO"
    name = "Open-Meteo"
    kind = "Sensor"
    source_type = "scientific"
    category = "api"

    def fetch(self) -> list[dict[str, Any]]:
        settings = get_settings()
        base = settings.open_meteo_base_url.rstrip("/")
        response = httpx.get(
            f"{base}/forecast",
            params={
                "latitude": settings.open_meteo_latitude,
                "longitude": settings.open_meteo_longitude,
                "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
                "hourly": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code",
                "forecast_hours": 24,
                "timezone": "UTC",
            },
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("current"), dict):
            raise ValueError("Open-Meteo response is missing its current conditions object")

        current = payload["current"]
        hourly = payload.get("hourly")
        if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
            raise ValueError("Open-Meteo response is missing its hourly forecast")
        forecast_times = hourly["time"]
        forecast_temperatures = hourly.get("temperature_2m")
        if (
            not forecast_times
            or not isinstance(forecast_temperatures, list)
            or len(forecast_temperatures) != len(forecast_times)
            or len(forecast_times) > 48
        ):
            raise ValueError("Open-Meteo response has invalid hourly forecast arrays")
        for variable in (
            "relative_humidity_2m",
            "precipitation",
            "wind_speed_10m",
            "wind_direction_10m",
            "precipitation_probability",
            "weather_code",
        ):
            values = hourly.get(variable)
            if not isinstance(values, list) or len(values) != len(forecast_times):
                raise ValueError(f"Open-Meteo response has invalid hourly {variable} values")
        for time_value in forecast_times:
            _parse_observed_at(time_value)

        latitude = _finite_number(payload.get("latitude"), "latitude")
        longitude = _finite_number(payload.get("longitude"), "longitude")
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise ValueError("Open-Meteo returned coordinates outside WGS84 bounds")
        observed_at = _parse_observed_at(current.get("time"))
        now = datetime.now(UTC)
        if observed_at > now.replace(microsecond=0) + timedelta(minutes=15):
            raise ValueError("Open-Meteo observation timestamp is in the future")
        if (now - observed_at).total_seconds() > 2 * 60 * 60:
            raise ValueError("Open-Meteo observation is older than two hours")

        temperature = _finite_number(current.get("temperature_2m"), "temperature_2m")
        precipitation = _finite_number(current.get("precipitation"), "precipitation")
        wind_speed = _finite_number(current.get("wind_speed_10m"), "wind_speed_10m")
        weather_code = _finite_number(current.get("weather_code"), "weather_code")
        if not weather_code.is_integer() or weather_code < 0:
            raise ValueError("Open-Meteo returned an invalid WMO weather code")
        humidity = current.get("relative_humidity_2m")
        humidity = _finite_number(humidity, "relative_humidity_2m") if humidity is not None else None
        if humidity is not None and not 0 <= humidity <= 100:
            raise ValueError("Open-Meteo returned relative humidity outside 0-100 percent")

        code = int(weather_code)
        text = (
            f"Open-Meteo model-derived current conditions for {settings.open_meteo_location_name}: "
            f"temperature {temperature} C, precipitation {precipitation} mm, "
            f"wind {wind_speed} km/h, WMO weather code {code}."
        )
        return [
            {
                "source": "open_meteo",
                "native_id": f"om-{latitude:.4f}-{longitude:.4f}-{observed_at.isoformat()}",
                "text": text,
                "posted_at": observed_at,
                "geo": {
                    "lat": latitude,
                    "lon": longitude,
                    "place_text": f"{settings.open_meteo_location_name} (Open-Meteo model grid cell)",
                },
                "metadata": {
                    "temperature_c": temperature,
                    "relative_humidity_pct": humidity,
                    "precipitation_mm": precipitation,
                    "wind_speed_kmh": wind_speed,
                    "weather_code": code,
                    "timezone": payload.get("timezone"),
                },
                "raw_payload": payload,
            }
        ]


def _finite_number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"Open-Meteo returned an invalid {field}")
    return float(value)


def _parse_observed_at(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("Open-Meteo response is missing current.time")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Open-Meteo returned an invalid current.time") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
