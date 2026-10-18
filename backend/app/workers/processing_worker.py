"""Python consumers (milestone 1). Apache Flink is the scale-out path, not a blocker."""

from __future__ import annotations

import json
import logging
import math
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.core.kafka import bus
from app.models.event import Event
from app.models.official_alert import OfficialAlert
from app.models.report import Report
from app.models.weather_observation import WeatherObservation
from app.services.pipeline import process_report
from sqlalchemy import select

log = logging.getLogger(__name__)

CAP_SEVERITY = {
    "minor": "low",
    "moderate": "medium",
    "severe": "high",
    "extreme": "critical",
}


def raw_input_topics(settings: Settings) -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(
            (
                settings.kafka_topic_raw_citizen,
                settings.kafka_topic_raw_news,
                settings.kafka_topic_raw_official,
                settings.kafka_topic_raw_social,
                settings.kafka_topic_raw_gridded,
                settings.kafka_topic_weather_raw,
                settings.kafka_topic_alerts_raw,
                settings.kafka_topic_citizen_raw,
                settings.kafka_topic_satellite_raw,
            )
        )
    )


def process_raw_message(db: Session, value: dict[str, Any], *, topic: str | None = None) -> Event | None:
    report_id = value.get("report_id")
    if not report_id:
        log.warning("raw_message_missing_report_id", extra={"topic": topic})
        return None

    report_key = str(report_id)
    try:
        report_uuid = UUID(report_key)
    except ValueError:
        log.warning("RAW_EVENT_REJECTED", extra={"report_id": report_key, "topic": topic})
        return None
    if db.get(Report, report_uuid) is None:
        log.warning("RAW_EVENT_REJECTED", extra={"report_id": report_key, "topic": topic})
        return None

    log.info("RAW_CONSUMED", extra={"report_id": report_key, "topic": topic})
    log.info("PROCESSING_STARTED", extra={"report_id": report_key})
    if value.get("source") == "open_meteo":
        return _process_open_meteo_observation(db, value, report_uuid)
    if value.get("source") == "firms":
        return _process_firms_observation(db, report_uuid)
    if value.get("source") == "sachet":
        report = db.get(Report, report_uuid)
        already_processed = bool(report and report.status != "RECEIVED")
        alert_exists = db.execute(
            select(OfficialAlert.id).where(OfficialAlert.identifier == str(value.get("native_id") or ""))
        ).scalar_one_or_none()
        _persist_sachet_alert(db, value, report_uuid)
        if already_processed and not alert_exists:
            log.info(
                "SACHET_ALERT_BACKFILL_COMPLETED",
                extra={"report_id": report_key, "native_id": value.get("native_id")},
            )
            return None
    event = process_report(db, report_uuid)
    if value.get("source") == "sachet":
        severity = CAP_SEVERITY.get(str((value.get("metadata") or {}).get("severity", "")).casefold())
        if severity:
            event.severity = severity
            log.info(
                "CAP_SEVERITY_APPLIED",
                extra={"report_id": report_key, "event_id": str(event.id), "severity": severity},
            )
    log.info(
        "PROCESSING_COMPLETED",
        extra={"report_id": report_key, "event_id": str(event.id), "verification": event.verification},
    )
    return event


def _persist_sachet_alert(db: Session, value: dict[str, Any], report_id: UUID) -> None:
    report = db.get(Report, report_id)
    metadata = value.get("metadata")
    if report is None or not isinstance(metadata, dict):
        log.warning("SACHET_ALERT_REJECTED", extra={"report_id": str(report_id)})
        return
    identifier = str(value.get("native_id") or "")
    if not identifier:
        log.warning("SACHET_ALERT_REJECTED", extra={"report_id": str(report_id), "reason": "missing identifier"})
        return
    if db.execute(select(OfficialAlert.id).where(OfficialAlert.identifier == identifier)).scalar_one_or_none():
        return
    expires_value = metadata.get("expires")
    expires_at = _parse_weather_time(expires_value) if expires_value else None
    if expires_at and expires_at <= datetime.now(UTC):
        report.status = "EXPIRED_ALERT"
        return
    areas = metadata.get("area_descriptions")
    references = metadata.get("references")
    db.add(
        OfficialAlert(
            report_id=report_id,
            identifier=identifier,
            sender=str(metadata.get("sender") or value.get("source_account") or "SACHET / NDMA"),
            event=str(metadata.get("event") or ""),
            urgency=str(metadata.get("urgency") or "Unknown"),
            severity=str(metadata.get("severity") or "Unknown"),
            certainty=str(metadata.get("certainty") or "Unknown"),
            message_type=str(metadata.get("message_type") or "Alert"),
            issued_at=report.posted_at,
            expires_at=expires_at,
            headline=str(metadata.get("headline") or ""),
            description=str(metadata.get("description") or ""),
            instructions=str(metadata.get("instruction") or ""),
            areas=[str(area) for area in areas] if isinstance(areas, list) else [],
            references=[str(reference) for reference in references] if isinstance(references, list) else [],
            source_url=report.raw_ref,
            status="active",
        )
    )


def _process_firms_observation(db: Session, report_id: UUID) -> None:
    report = db.get(Report, report_id)
    if report is None:
        return None
    report.status = "OBSERVATION"
    log.info(
        "SOURCE_OBSERVATION_STORED",
        extra={"report_id": str(report_id), "source": "firms", "observed_at": report.posted_at.isoformat()},
    )
    return None


def _process_open_meteo_observation(db: Session, value: dict[str, Any], report_id: UUID) -> Event | None:
    report = db.get(Report, report_id)
    metadata = value.get("metadata")
    if report is None or not isinstance(metadata, dict):
        log.warning("RAW_EVENT_REJECTED", extra={"report_id": str(report_id), "source": "open_meteo"})
        return None

    try:
        weather_code = int(metadata["weather_code"])
        temperature = float(metadata["temperature_c"])
        precipitation = float(metadata["precipitation_mm"])
        wind_kmh = float(metadata["wind_speed_kmh"])
        humidity = metadata.get("relative_humidity_pct")
        humidity = float(humidity) if humidity is not None else None
    except (KeyError, TypeError, ValueError):
        report.status = "REJECTED"
        log.warning("RAW_EVENT_REJECTED", extra={"report_id": str(report_id), "source": "open_meteo"})
        return None

    if report.lat is None or report.lon is None or not -90 <= report.lat <= 90 or not -180 <= report.lon <= 180:
        report.status = "REJECTED"
        log.warning("RAW_EVENT_REJECTED", extra={"report_id": str(report_id), "source": "open_meteo"})
        return None

    report.status = "OBSERVATION"
    _store_weather_row(
        db,
        report,
        record_type="current",
        observed_at=report.posted_at,
        temperature=temperature,
        humidity=humidity,
        precipitation=precipitation,
        wind_kmh=wind_kmh,
        weather_code=weather_code,
    )

    raw_payload = value.get("raw_payload")
    hourly = raw_payload.get("hourly") if isinstance(raw_payload, dict) else None
    if isinstance(hourly, dict):
        times = hourly.get("time")
        if not isinstance(times, list) or len(times) > 48:
            raise ValueError("Open-Meteo hourly forecast has an invalid time series")
        fields = {
            "temperature_2m": hourly.get("temperature_2m"),
            "relative_humidity_2m": hourly.get("relative_humidity_2m"),
            "precipitation": hourly.get("precipitation"),
            "wind_speed_10m": hourly.get("wind_speed_10m"),
            "wind_direction_10m": hourly.get("wind_direction_10m"),
            "precipitation_probability": hourly.get("precipitation_probability"),
            "weather_code": hourly.get("weather_code"),
        }
        if any(not isinstance(values, list) or len(values) != len(times) for values in fields.values()):
            raise ValueError("Open-Meteo hourly forecast variables have inconsistent lengths")
        for index, time_value in enumerate(times):
            forecast_at = _parse_weather_time(time_value)
            if forecast_at < report.posted_at:
                continue
            forecast_code = _optional_weather_number(fields["weather_code"][index], "weather_code")
            if forecast_code is not None and not forecast_code.is_integer():
                raise ValueError("Open-Meteo hourly weather code is not an integer")
            forecast_humidity = _optional_weather_number(
                fields["relative_humidity_2m"][index], "relative_humidity_2m"
            )
            forecast_probability = _optional_weather_number(
                fields["precipitation_probability"][index], "precipitation_probability"
            )
            if forecast_humidity is not None and not 0 <= forecast_humidity <= 100:
                raise ValueError("Open-Meteo hourly humidity is outside 0-100 percent")
            if forecast_probability is not None and not 0 <= forecast_probability <= 100:
                raise ValueError("Open-Meteo precipitation probability is outside 0-100 percent")
            _store_weather_row(
                db,
                report,
                record_type="forecast",
                observed_at=forecast_at,
                temperature=_optional_weather_number(fields["temperature_2m"][index], "temperature_2m"),
                humidity=forecast_humidity,
                precipitation=_optional_weather_number(fields["precipitation"][index], "precipitation"),
                wind_kmh=_optional_weather_number(fields["wind_speed_10m"][index], "wind_speed_10m"),
                wind_direction=_optional_weather_number(fields["wind_direction_10m"][index], "wind_direction_10m"),
                precipitation_probability=forecast_probability,
                weather_code=int(forecast_code) if forecast_code is not None else None,
            )

    hazard_text = {
        65: "heavy rainfall",
        67: "heavy rainfall",
        82: "heavy rainfall",
        95: "thunderstorm",
        96: "thunderstorm with hail",
        97: "severe thunderstorm",
        99: "thunderstorm with heavy hail",
    }.get(weather_code)
    if hazard_text is None:
        report.status = "OBSERVATION"
        log.info(
            "SOURCE_OBSERVATION_STORED",
            extra={"report_id": str(report_id), "source": "open_meteo", "weather_code": weather_code},
        )
        return None

    report.text = (
        f"Open-Meteo model-derived {hazard_text} signal at {report.place_text or 'Open-Meteo grid cell'}; "
        f"WMO weather code {weather_code}, precipitation {precipitation} mm, "
        f"wind {wind_kmh} km/h, humidity {humidity}%. Requires human verification."
    )
    db.flush()
    return process_report(db, report_id)


def _store_weather_row(
    db: Session,
    report: Report,
    *,
    record_type: str,
    observed_at: datetime,
    temperature: float | None,
    humidity: float | None,
    precipitation: float | None,
    wind_kmh: float | None,
    weather_code: int | None,
    wind_direction: float | None = None,
    precipitation_probability: float | None = None,
) -> None:
    existing = db.execute(
        select(WeatherObservation).where(
            WeatherObservation.provider == "Open-Meteo",
            WeatherObservation.record_type == record_type,
            WeatherObservation.observed_at == observed_at,
            WeatherObservation.lat == report.lat,
            WeatherObservation.lon == report.lon,
        )
    ).scalar_one_or_none()
    values = {
        "report_id": report.id,
        "temperature_c": temperature,
        "humidity": humidity,
        "precipitation_mm": precipitation,
        "wind_ms": wind_kmh / 3.6 if wind_kmh is not None else None,
        "wind_direction_deg": wind_direction,
        "precipitation_probability_pct": precipitation_probability,
        "weather_code": weather_code,
    }
    if existing:
        prior_report = db.get(Report, existing.report_id) if existing.report_id else None
        if prior_report is None or prior_report.fetched_at <= report.fetched_at:
            for field, value in values.items():
                setattr(existing, field, value)
        return
    db.add(
        WeatherObservation(
            provider="Open-Meteo",
            record_type=record_type,
            observed_at=observed_at,
            lat=report.lat,
            lon=report.lon,
            **values,
        )
    )


def _optional_weather_number(value: Any, field: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"Open-Meteo returned an invalid {field}")
    return float(value)


def _parse_weather_time(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("Open-Meteo returned an invalid forecast timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Open-Meteo returned an invalid forecast timestamp") from exc
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def process_kafka_record(db: Session, consumer, msg) -> Event | None:
    event = process_raw_message(db, msg.value or {}, topic=msg.topic)
    db.commit()
    from kafka.structs import OffsetAndMetadata, TopicPartition

    consumer.commit({TopicPartition(msg.topic, msg.partition): OffsetAndMetadata(msg.offset + 1, "")})
    return event


def run_processing_loop() -> None:
    settings = get_settings()
    topics = raw_input_topics(settings)
    log.info("processing_worker_start", extra={"topics": topics, "ps": "26069"})
    while True:
        processed = 0
        consumer = None
        try:
            from kafka import KafkaConsumer

            consumer = KafkaConsumer(
                *topics,
                bootstrap_servers=settings.kafka_bootstrap_servers.split(","),
                group_id="hikari-processing",
                enable_auto_commit=False,
                auto_offset_reset="earliest",
                value_deserializer=lambda b: json.loads(b.decode()),
            )
            while True:
                records = consumer.poll(timeout_ms=5000, max_records=1)
                for topic_partition, messages in records.items():
                    msg = messages[0]
                    db = SessionLocal()
                    try:
                        process_kafka_record(db, consumer, msg)
                        processed += 1
                    except Exception as exc:
                        db.rollback()
                        bus.dead_letter(settings.kafka_topic_dlq_processing, msg.value or {}, str(exc))
                        log.exception("processing_failed", extra={"topic": msg.topic, "offset": msg.offset})
                        consumer.seek(topic_partition, msg.offset)
                        time.sleep(5)
                    finally:
                        db.close()
        except Exception as exc:
            log.info("kafka_consumer_fallback", extra={"error": str(exc), "topics": topics})
            for topic in topics:
                for item in bus.drain(topic):
                    db = SessionLocal()
                    try:
                        process_raw_message(db, item.get("value") or {}, topic=topic)
                        db.commit()
                        processed += 1
                    except Exception as process_exc:
                        db.rollback()
                        bus.dead_letter(
                            settings.kafka_topic_dlq_processing,
                            item.get("value") or {},
                            str(process_exc),
                        )
                        log.exception("processing_failed", extra={"topic": topic})
                    finally:
                        db.close()
        finally:
            if consumer is not None:
                consumer.close()
        time.sleep(5 if processed == 0 else 1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_processing_loop()
