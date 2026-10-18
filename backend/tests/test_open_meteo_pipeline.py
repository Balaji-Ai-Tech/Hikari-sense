from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import func, select

from app.models.event import Event
from app.models.report import Report
from app.models.source import Source
from app.models.verification import Verification
from app.models.weather_observation import WeatherObservation
from app.workers.processing_worker import process_raw_message
from tests.conftest import auth


def _message(db, *, weather_code: int, observed_at: datetime | None = None):
    source = db.execute(select(Source).where(Source.code == "SRC-OPEN-METEO")).scalar_one_or_none()
    if source is None:
        source = Source(
            code="SRC-OPEN-METEO",
            name="Open-Meteo",
            kind="Sensor",
            source_type="scientific",
            category="api",
            reliability=0.6,
        )
        db.add(source)
        db.flush()
    observed_at = observed_at or datetime.now(UTC).replace(microsecond=0)
    observed_at = observed_at.replace(tzinfo=UTC) if observed_at.tzinfo is None else observed_at.astimezone(UTC)
    report = Report(
        source_id=source.id,
        native_id=f"test-{uuid4()}",
        posted_at=observed_at,
        fetched_at=observed_at,
        text="Open-Meteo model-derived current conditions for Hyderabad.",
        lat=17.4,
        lon=78.45,
        place_text="Hyderabad (Open-Meteo model grid cell)",
        source_account="SRC-OPEN-METEO",
    )
    db.add(report)
    db.flush()
    forecast_times = [
        (observed_at.replace(minute=0, second=0, microsecond=0) + timedelta(hours=offset)).isoformat()
        for offset in (1, 2)
    ]
    return {
        "report_id": str(report.id),
        "source": "open_meteo",
        "metadata": {
            "temperature_c": 27.4,
            "relative_humidity_pct": 66,
            "precipitation_mm": 0,
            "wind_speed_kmh": 2.3,
            "weather_code": weather_code,
        },
        "raw_payload": {
            "hourly": {
                "time": forecast_times,
                "temperature_2m": [28.1, 27.5],
                "relative_humidity_2m": [64, 65],
                "precipitation": [0.0, 0.0],
                "wind_speed_10m": [3.0, 3.2],
                "wind_direction_10m": [180, 190],
                "precipitation_probability": [10, 15],
                "weather_code": [0, 1],
            }
        },
    }, report.id


def test_normal_weather_is_persisted_as_observation_and_duplicate_is_skipped(db, client):
    message, report_id = _message(db, weather_code=0)

    assert process_raw_message(db, message, topic="weather.raw") is None
    db.commit()
    assert db.scalar(select(func.count()).select_from(Event)) == 0
    assert db.scalar(select(func.count()).select_from(WeatherObservation).where(WeatherObservation.record_type == "current")) == 1
    assert db.scalar(select(func.count()).select_from(WeatherObservation).where(WeatherObservation.record_type == "forecast")) == 2
    assert db.get(Report, report_id).status == "OBSERVATION"

    current_response = client.get("/api/v1/weather/observations?record_type=current")
    assert current_response.status_code == 200, current_response.text
    current = current_response.json()["items"][0]
    assert current["reportId"] == str(report_id)
    assert current["recordType"] == "current"
    assert current["temperatureC"] == 27.4
    forecast_response = client.get("/api/v1/weather/observations?record_type=forecast")
    assert forecast_response.status_code == 200, forecast_response.text
    assert len(forecast_response.json()["items"]) == 2

    assert process_raw_message(db, message, topic="weather.raw") is None
    db.commit()
    assert db.scalar(select(func.count()).select_from(WeatherObservation)) == 3

    repeated_forecast, _ = _message(
        db,
        weather_code=0,
        observed_at=db.get(Report, report_id).posted_at,
    )
    assert process_raw_message(db, repeated_forecast, topic="weather.raw") is None
    db.commit()
    assert db.scalar(select(func.count()).select_from(WeatherObservation)) == 3


def test_severe_wmo_signal_enters_existing_review_pipeline_without_self_corroboration(
    db, client
):
    message, report_id = _message(db, weather_code=95)

    event = process_raw_message(db, message, topic="weather.raw")
    assert event is not None
    db.commit()

    assert event.verification in {"needs_review", "low_confidence"}
    verification = db.execute(
        select(Verification).where(Verification.event_id == event.id)
    ).scalar_one()
    assert verification.signals["official_boost"] == 0
    assert db.get(Report, report_id).status == event.verification

    response = client.get(
        f"/api/v1/events/{event.id}",
        headers=auth(client, db, "analyst", "open-meteo.test.analyst"),
    )
    assert response.status_code == 200, response.text
    assert response.json()["id"] == str(event.id)
    assert response.json()["lat"] == 17.4
    assert response.json()["lng"] == 78.45