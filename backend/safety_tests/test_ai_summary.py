from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1 import ai
from app.core.config import Settings
from app.core.database import _make_engine
from app.models.official_alert import OfficialAlert
from app.models.weather_observation import WeatherObservation
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
        model = statement.column_descriptions[0]["entity"]
        return FakeResult(self.weather if model is WeatherObservation else self.alerts)


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
    application.include_router(ai.router, prefix="/api/v1")
    database = FakeDatabase()
    application.dependency_overrides[deps.get_db] = lambda: database
    monkeypatch.setattr(ai, "rate_hit", lambda *args, **kwargs: (True, 1))
    with TestClient(application) as test_client:
        test_client.database = database
        yield test_client


def _summary(_facts):
    return disaster_summary.DisasterSummaryContent(
        summary="A public rainfall alert is active.",
        precautions=["Avoid flooded underpasses."],
    )


def test_summary_uses_public_sources_and_returns_source_timestamps(client, monkeypatch):
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
    result = response.json()
    assert result["status"] == "completed"
    assert result["advisory"] is True
    assert {source["name"] for source in result["sources"]} == {"Open-Meteo", "SACHET / NDMA"}
    assert all(source["latestAt"] for source in result["sources"])
    assert "weather_observations" in captured and "official_sachet_alerts" in captured


def test_invalid_and_oversized_input_are_rejected(client):
    invalid = client.post("/api/v1/ai/analyze", json={"prompt": "fetch a URL"})
    oversized = client.post("/api/v1/ai/analyze", content=b" " * 1100, headers={"content-type": "application/json"})

    assert invalid.status_code == 422
    assert oversized.status_code == 413


def test_stale_sources_are_identified_in_response_and_provider_facts(client, monkeypatch):
    old = datetime.now(UTC) - timedelta(days=3)
    client.database.weather = [_weather(old)]
    client.database.alerts = [_alert(old)]
    captured = {}

    def generate(facts):
        captured.update(facts)
        return _summary(facts)

    monkeypatch.setattr(disaster_summary, "generate_disaster_summary", generate)
    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 200
    assert [source["status"] for source in response.json()["sources"]] == ["stale", "stale"]
    assert any("older than" in text.casefold() for text in response.json()["limitations"])
    assert captured["weather_observations"][0]["stale"] is True
    assert captured["official_sachet_alerts"][0]["stale"] is True


def test_empty_sources_do_not_call_the_provider(client, monkeypatch):
    def fail_if_called(_facts):
        raise AssertionError("provider must not run without source data")

    monkeypatch.setattr(disaster_summary, "generate_disaster_summary", fail_if_called)
    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 200
    assert response.json()["status"] == "empty"


@pytest.mark.parametrize(
    ("exception", "status_code", "message"),
    [
        (RuntimeError("provider unavailable"), 502, "Gemini summary provider failed."),
        (disaster_summary.GeminiQuotaExceeded(), 429, "free-tier quota or rate limit"),
        (disaster_summary.GeminiModelUnavailable(), 503, "GEMINI_MODEL"),
    ],
)
def test_provider_errors_are_actionable_and_do_not_leak_details(
    client, monkeypatch, exception, status_code, message
):
    client.database.weather = [_weather(datetime.now(UTC))]

    def fail(_facts):
        raise exception

    monkeypatch.setattr(disaster_summary, "generate_disaster_summary", fail)
    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == status_code
    assert message.casefold() in response.json()["detail"].casefold()
    assert "provider unavailable" not in response.json()["detail"]


def test_public_rate_limit_stops_provider_requests(client, monkeypatch):
    client.database.weather = [_weather(datetime.now(UTC))]
    monkeypatch.setattr(ai, "rate_hit", lambda *args, **kwargs: (False, 6))
    monkeypatch.setattr(
        disaster_summary,
        "generate_disaster_summary",
        lambda _facts: pytest.fail("provider must not be called after rate limiting"),
    )

    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


def test_provider_timeout_returns_gateway_timeout(client, monkeypatch):
    client.database.weather = [_weather(datetime.now(UTC))]
    monkeypatch.setattr(
        disaster_summary,
        "generate_disaster_summary",
        lambda _facts: (_ for _ in ()).throw(httpx.ReadTimeout("private provider detail")),
    )

    response = client.post("/api/v1/ai/analyze", json={})

    assert response.status_code == 504
    assert response.json()["detail"] == "Gemini summary request timed out. Retry later."


def test_unavailable_configured_model_does_not_fall_back(monkeypatch):
    called = {}

    class FakeResponse:
        status_code = 404

        @staticmethod
        def json():
            return {"error": {"status": "NOT_FOUND", "message": "model not found"}}

    monkeypatch.setattr(
        disaster_summary,
        "get_settings",
        lambda: SimpleNamespace(
            gemini_api_key="test-key",
            gemini_model="gemini-3.5-flash-lite",
            gemini_timeout_seconds=3,
        ),
    )

    def fake_post(url, **kwargs):
        called["url"] = url
        called["headers"] = kwargs["headers"]
        return FakeResponse()

    monkeypatch.setattr(disaster_summary.httpx, "post", fake_post)
    with pytest.raises(disaster_summary.GeminiModelUnavailable):
        disaster_summary.generate_disaster_summary({"weather_observations": []})

    assert "gemini-3.5-flash-lite:generateContent" in called["url"]
    assert called["headers"]["x-goog-api-key"] == "test-key"


def test_production_cors_allows_only_explicit_https_origins():
    settings = Settings(
        environment="production",
        cors_origins="https://hikari.vercel.app,http://localhost:5173,https://*.vercel.app",
    )

    assert settings.cors_origin_list == ["https://hikari.vercel.app"]


def test_render_postgresql_url_uses_installed_psycopg_driver():
    engine = _make_engine("postgresql://user:password@localhost:5432/hikari")
    try:
        assert engine.dialect.driver == "psycopg"
    finally:
        engine.dispose()