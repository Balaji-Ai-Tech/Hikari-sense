from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1 import ai_summary
from app.services import disaster_summary


class FakeResult:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class FakeDatabase:
    def __init__(self, weather=None, alerts=None):
        self.weather = weather or []
        self.alerts = alerts or []

    def execute(self, statement):
        entity = statement.column_descriptions[0]["entity"]
        if entity.__name__ == "WeatherObservation":
            return FakeResult(self.weather)
        return FakeResult(self.alerts)


def _weather(observed_at):
    return SimpleNamespace(
        observed_at=observed_at,
        lat=17.385,
        lon=78.4867,
        temperature_c=28.0,
        precipitation_mm=1.2,
        wind_ms=4.0,
        humidity=72.0,
        weather_code=61,
    )


def _alert(issued_at):
    return SimpleNamespace(
        issued_at=issued_at,
        expires_at=issued_at + timedelta(days=7),
        headline="Heavy rainfall warning",
        event="Rain",
        severity="Moderate",
        urgency="Expected",
        areas=["Hyderabad"],
        instructions="Avoid flooded underpasses.",
    )


@pytest.fixture
def client(monkeypatch):
    application = FastAPI()
    application.include_router(ai_summary.router, prefix="/api/v1")
    database = FakeDatabase()
    application.dependency_overrides[deps.get_db] = lambda: database
    monkeypatch.setattr(ai_summary, "rate_hit", lambda *args, **kwargs: (True, 1))
    with TestClient(application) as test_client:
        test_client.database = database
        yield test_client


def _summary(_facts):
    return disaster_summary.DisasterSummaryContent(
        summary="A public rainfall alert is active.",
        precautions=["Avoid flooded underpasses."],
    )


def test_summary_uses_public_weather_and_sachet_data(client, monkeypatch):
    now = datetime.now(UTC)
    client.database.weather = [_weather(now - timedelta(minutes=20))]
    client.database.alerts = [_alert(now - timedelta(minutes=10))]
    captured = {}

    def generate(facts):
        captured.update(facts)
        return _summary(facts)

    monkeypatch.setattr(disaster_summary, "generate_disaster_summary", generate)
    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["advisory"] is True
    assert {source["name"] for source in body["sources"]} == {"Open-Meteo", "SACHET / NDMA"}
    assert all(source["latestAt"] for source in body["sources"])
    assert set(captured) == {"weather_observations", "official_sachet_alerts"}


def test_empty_sources_do_not_call_gemini(client, monkeypatch):
    monkeypatch.setattr(
        disaster_summary,
        "generate_disaster_summary",
        lambda _facts: pytest.fail("provider must not run without public source data"),
    )

    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 200
    assert response.json()["status"] == "empty"


def test_stale_source_is_reported_to_ui_and_provider(client, monkeypatch):
    stale_at = datetime.now(UTC) - timedelta(days=3)
    client.database.weather = [_weather(stale_at)]
    captured = {}

    def generate(facts):
        captured.update(facts)
        return _summary(facts)

    monkeypatch.setattr(disaster_summary, "generate_disaster_summary", generate)
    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 200
    assert response.json()["sources"][0]["status"] == "stale"
    assert captured["weather_observations"][0]["stale"] is True


@pytest.mark.parametrize(
    ("body", "expected_status"),
    [({"prompt": "query arbitrary source"}, 422), ("x" * 1100, 413)],
)
def test_invalid_or_oversized_requests_are_rejected(client, body, expected_status):
    if isinstance(body, str):
        response = client.post(
            "/api/v1/ai/analyze",
            content=body,
            headers={"content-type": "application/json"},
        )
    else:
        response = client.post("/api/v1/ai/analyze", json=body)

    assert response.status_code == expected_status


def test_public_rate_limit_stops_summary(client, monkeypatch):
    monkeypatch.setattr(ai_summary, "rate_hit", lambda *args, **kwargs: (False, 6))
    monkeypatch.setattr(
        disaster_summary,
        "create_disaster_summary",
        lambda _db: pytest.fail("summary must not run after rate limiting"),
    )

    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


def test_gemini_quota_failure_is_safe_and_actionable(client, monkeypatch):
    client.database.weather = [_weather(datetime.now(UTC))]
    monkeypatch.setattr(
        ai_summary,
        "create_disaster_summary",
        lambda _db: (_ for _ in ()).throw(disaster_summary.GeminiQuotaExceeded()),
    )

    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 429
    assert "quota" in response.json()["detail"].casefold()