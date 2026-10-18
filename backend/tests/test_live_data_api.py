from datetime import UTC, datetime
import json
import time

import pytest

from app.api.v1 import weather
from app.core import redis as redis_module
from app.models.report import Report
from app.models.source import Source


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def _forecast(latitude: float, longitude: float):
    return {
        "latitude": latitude,
        "longitude": longitude,
        "timezone": "Asia/Kolkata",
        "current": {"time": "2026-10-13T10:00", "temperature_2m": 29.0},
        "hourly": {"time": ["2026-10-13T10:00", "2026-10-13T11:00"], "temperature_2m": [29.0, 30.0]},
        "daily": {"time": ["2026-10-13", "2026-10-14"], "temperature_2m_min": [22.0, 23.0]},
    }


@pytest.fixture(autouse=True)
def _disable_shared_cache_and_rate_limit(monkeypatch):
    monkeypatch.setattr(weather, "cache_get", lambda _key: None)
    monkeypatch.setattr(weather, "cache_set", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(weather, "rate_hit", lambda *_args, **_kwargs: (True, 1))


def test_live_weather_fetches_each_requested_location(client, monkeypatch):
    requests = []

    def get(url, *, params, **_kwargs):
        requests.append((url, params.copy()))
        return FakeResponse(_forecast(float(params["latitude"]), float(params["longitude"])))

    monkeypatch.setattr(weather.httpx, "get", get)

    delhi = client.get("/api/v1/weather/live?latitude=28.6139&longitude=77.2090&location=Delhi")
    london = client.get("/api/v1/weather/live?latitude=51.5072&longitude=-0.1276&location=London")

    assert delhi.status_code == london.status_code == 200
    assert delhi.json()["requested"] == {"latitude": 28.6139, "longitude": 77.209}
    assert london.json()["requested"] == {"latitude": 51.5072, "longitude": -0.1276}
    assert [request[1]["latitude"] for request in requests] == [28.6139, 51.5072]
    assert delhi.json()["current"]["temperature_2m"] == 29.0


def test_live_weather_rejects_invalid_coordinates_and_provider_shape(client, monkeypatch):
    invalid_coordinates = client.get("/api/v1/weather/live?latitude=91&longitude=0")
    assert invalid_coordinates.status_code == 422

    monkeypatch.setattr(weather.httpx, "get", lambda *_args, **_kwargs: FakeResponse({"current": {}}))
    malformed_response = client.get("/api/v1/weather/live?latitude=0&longitude=0")
    assert malformed_response.status_code == 502


def test_live_weather_refresh_bypasses_recent_cache(client, monkeypatch):
    cached_data = weather._validate_live_forecast(
        _forecast(28.6, 77.2), 28.6, 77.2, "Delhi"
    )
    monkeypatch.setattr(
        weather,
        "cache_get",
        lambda _key: json.dumps({"cachedAt": time.time(), "data": cached_data}),
    )
    calls = []

    def get(_url, *, params, **_kwargs):
        calls.append(params)
        payload = _forecast(float(params["latitude"]), float(params["longitude"]))
        payload["current"]["temperature_2m"] = 31.0
        return FakeResponse(payload)

    monkeypatch.setattr(weather.httpx, "get", get)
    url = "/api/v1/weather/live?latitude=28.6&longitude=77.2&location=Delhi"

    cached = client.get(url)
    refreshed = client.get(f"{url}&refresh=true")

    assert cached.json()["current"]["temperature_2m"] == 29.0
    assert refreshed.json()["current"]["temperature_2m"] == 31.0
    assert len(calls) == 1


def test_live_weather_timeout_retries_once_then_returns_504(client, monkeypatch):
    calls = 0

    def timeout(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        raise weather.httpx.TimeoutException("upstream timeout")

    monkeypatch.setattr(weather.httpx, "get", timeout)
    response = client.get("/api/v1/weather/live?latitude=12.9&longitude=77.6")

    assert response.status_code == 504
    assert calls == 2


def test_live_weather_preserves_upstream_rate_limit(client, monkeypatch):
    def rate_limited(*_args, **_kwargs):
        request = weather.httpx.Request("GET", "https://api.open-meteo.com/v1/forecast")
        response = weather.httpx.Response(429, headers={"Retry-After": "45"}, request=request)
        response.raise_for_status()

    monkeypatch.setattr(weather.httpx, "get", rate_limited)
    response = client.get("/api/v1/weather/live?latitude=12.9&longitude=77.6")

    assert response.status_code == 429
    assert response.headers["retry-after"] == "45"
    assert "rate limit" in response.json()["error"]["message"].lower()


def test_location_search_returns_validated_place_results(client, monkeypatch):
    monkeypatch.setattr(
        weather.httpx,
        "get",
        lambda *_args, **_kwargs: FakeResponse(
            {
                "results": [
                    {
                        "id": 1,
                        "name": "Hyderabad",
                        "latitude": 17.385,
                        "longitude": 78.4867,
                        "country": "India",
                        "admin1": "Telangana",
                    },
                    {"name": "Invalid", "latitude": 91, "longitude": 0},
                ]
            }
        ),
    )

    response = client.get("/api/v1/weather/locations?q=Hyderabad")

    assert response.status_code == 200
    assert response.json()["items"] == [
        {
            "id": 1,
            "name": "Hyderabad",
            "latitude": 17.385,
            "longitude": 78.4867,
            "country": "India",
            "countryCode": None,
            "admin1": "Telangana",
            "admin2": None,
            "admin3": None,
            "timezone": None,
        }
    ]


def test_firms_observations_are_exposed_as_separate_satellite_records(db, client):
    source = Source(
        code="SRC-FIRMS",
        name="NASA FIRMS",
        kind="Satellite",
        source_type="scientific",
        category="dataset",
        health_label="NOT_CONFIGURED",
    )
    db.add(source)
    db.flush()
    db.add(
        Report(
            source_id=source.id,
            native_id="firms-real-format-id",
            posted_at=datetime(2026, 10, 13, 4, 0, tzinfo=UTC),
            fetched_at=datetime(2026, 10, 13, 4, 5, tzinfo=UTC),
            text="Satellite thermal observation; observation only.",
            lat=17.4,
            lon=78.5,
            status="OBSERVATION",
            source_account="NASA FIRMS N/VIIRS",
        )
    )
    db.commit()

    response = client.get("/api/v1/satellite/observations")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["sourceRecordId"] == "firms-real-format-id"
    assert payload["items"][0]["status"] == "OBSERVATION"
    assert payload["items"][0]["latitude"] == 17.4
    assert payload["source"]["status"] == "NOT_CONFIGURED"


def test_memory_rate_limit_fallback_expires(monkeypatch):
    memory = redis_module.MemoryStore()
    ticks = iter([100, 100, 160, 160])

    def redis_unavailable():
        raise RuntimeError("Redis unavailable")

    monkeypatch.setattr(redis_module, "_memory", memory)
    monkeypatch.setattr(redis_module, "get_redis", redis_unavailable)
    monkeypatch.setattr(redis_module.time, "monotonic", lambda: next(ticks))

    assert redis_module.rate_hit("weather:test-rate-window", 1) == (True, 1)
    assert redis_module.rate_hit("weather:test-rate-window", 1) == (False, 2)
    assert redis_module.rate_hit("weather:test-rate-window", 1) == (True, 1)