from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.ingestion import open_meteo
from app.ingestion.open_meteo import OpenMeteoConnector


def _payload(*, timestamp: str | None = None, latitude: float = 17.4):
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    forecast_times = [(now + timedelta(hours=offset)).isoformat(timespec="minutes") for offset in range(24)]
    return {
        "latitude": latitude,
        "longitude": 78.45,
        "timezone": "UTC",
        "current": {
            "time": timestamp or now.isoformat(),
            "temperature_2m": 27.4,
            "relative_humidity_2m": 66,
            "precipitation": 0,
            "wind_speed_10m": 2.3,
            "weather_code": 0,
        },
        "hourly": {
            "time": forecast_times,
            "temperature_2m": [27.4] * 24,
            "relative_humidity_2m": [66] * 24,
            "precipitation": [0] * 24,
            "wind_speed_10m": [2.3] * 24,
            "wind_direction_10m": [180] * 24,
            "precipitation_probability": [0] * 24,
            "weather_code": [0] * 24,
        },
    }


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def _mock_api(monkeypatch, payload):
    monkeypatch.setattr(
        open_meteo,
        "get_settings",
        lambda: SimpleNamespace(
            open_meteo_base_url="https://api.open-meteo.com/v1",
            open_meteo_latitude=17.385,
            open_meteo_longitude=78.4867,
            open_meteo_location_name="Hyderabad",
        ),
    )
    monkeypatch.setattr(open_meteo.httpx, "get", lambda *args, **kwargs: FakeResponse(payload))


def test_fetch_normalizes_real_response_and_keeps_raw_payload(monkeypatch):
    payload = _payload()
    _mock_api(monkeypatch, payload)

    [record] = OpenMeteoConnector().fetch()

    assert record["source"] == "open_meteo"
    assert record["geo"]["lat"] == payload["latitude"]
    assert record["metadata"]["temperature_c"] == 27.4
    assert record["raw_payload"] == payload
    assert record["posted_at"].tzinfo == UTC
    assert record["native_id"].endswith(record["posted_at"].isoformat())


@pytest.mark.parametrize(
    "payload",
    [
        {},
        _payload(latitude=91),
        _payload(timestamp=(datetime.now(UTC) - timedelta(days=1)).isoformat()),
    ],
)
def test_fetch_rejects_malformed_coordinates_and_stale_observations(monkeypatch, payload):
    _mock_api(monkeypatch, payload)

    with pytest.raises(ValueError):
        OpenMeteoConnector().fetch()


def test_fetch_propagates_http_timeout(monkeypatch):
    monkeypatch.setattr(
        open_meteo,
        "get_settings",
        lambda: SimpleNamespace(
            open_meteo_base_url="https://api.open-meteo.com/v1",
            open_meteo_latitude=17.385,
            open_meteo_longitude=78.4867,
            open_meteo_location_name="Hyderabad",
        ),
    )

    def timeout(*args, **kwargs):
        raise open_meteo.httpx.TimeoutException("timed out")

    monkeypatch.setattr(open_meteo.httpx, "get", timeout)

    with pytest.raises(open_meteo.httpx.TimeoutException):
        OpenMeteoConnector().fetch()