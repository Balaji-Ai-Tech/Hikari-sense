import logging
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.ingestion import base
from app.ingestion import firms
from app.models.report import Report
from app.models.source import Source
from app.workers import processing_worker


FIRMS_CSV = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
17.3850,78.4867,340.2,0.5,0.4,2026-10-02,1423,N,VIIRS,n,2.0NRT,290.1,3.4,D
"""


def test_firms_fetch_normalizes_stable_observation_identity(monkeypatch, caplog):
    secret = "TEST_SECRET_FIRMS_KEY"
    monkeypatch.setattr(firms, "get_settings", lambda: SimpleNamespace(firms_map_key=secret))
    request_urls = []

    def fake_get(url, **kwargs):
        request_urls.append(url)
        logging.getLogger("httpx").info("HTTP Request: GET %s HTTP/1.1 200 OK", url)
        logging.getLogger("httpcore").debug("send request %s", url)
        return SimpleNamespace(text=FIRMS_CSV, raise_for_status=lambda: None)

    monkeypatch.setattr(
        firms.httpx,
        "get",
        fake_get,
    )
    connector = firms.FirmsConnector()

    with caplog.at_level(logging.DEBUG):
        observation = connector.fetch()[0]
        repeated = connector.fetch()[0]

    assert observation["native_id"] == repeated["native_id"]
    assert observation["source_account"] == "NASA FIRMS N/VIIRS"
    assert observation["posted_at"].isoformat() == "2026-10-02T14:23:00+00:00"
    assert observation["geo"] == {"lat": 17.385, "lon": 78.4867}
    assert observation["metadata"]["confidence"] == "n"
    assert observation["metadata"]["satellite"] == "N"
    assert observation["metadata"]["instrument"] == "VIIRS"
    assert observation["metadata"]["frp_mw"] == 3.4
    assert "not a confirmed incident" in observation["text"]
    assert len(request_urls) == 2
    assert all(url.endswith("/68,5,98,40/1") for url in request_urls)
    assert secret not in caplog.text


def test_firms_fetch_is_disabled_without_map_key(monkeypatch):
    monkeypatch.setattr(firms, "get_settings", lambda: SimpleNamespace(firms_map_key=""))

    def unexpected_request(*args, **kwargs):
        pytest.fail("FIRMS must not make a request without a MAP_KEY")

    monkeypatch.setattr(firms.httpx, "get", unexpected_request)

    assert firms.FirmsConnector().fetch() == []


def test_firms_http_errors_do_not_expose_map_key(monkeypatch, caplog):
    secret = "TEST_SECRET_FIRMS_KEY"
    monkeypatch.setattr(firms, "get_settings", lambda: SimpleNamespace(firms_map_key=secret))
    request = firms.httpx.Request(
        "GET",
        f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{secret}/VIIRS_NOAA21_NRT/{firms.FIRMS_AREA}/1",
    )
    response = firms.httpx.Response(403, request=request)
    monkeypatch.setattr(
        firms.httpx,
        "get",
        lambda *args, **kwargs: SimpleNamespace(text="", raise_for_status=response.raise_for_status),
    )

    with pytest.raises(RuntimeError, match="403") as error, caplog.at_level(logging.DEBUG):
        firms.FirmsConnector().fetch()

    assert secret not in str(error.value)
    assert secret not in caplog.text


def test_firms_timeout_errors_do_not_expose_map_key(monkeypatch, caplog):
    secret = "TEST_SECRET_FIRMS_KEY"
    monkeypatch.setattr(firms, "get_settings", lambda: SimpleNamespace(firms_map_key=secret))
    monkeypatch.setattr(
        firms.httpx,
        "get",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            firms.httpx.ConnectTimeout(f"request timed out for {kwargs.get('url', secret)}")
        ),
    )

    with pytest.raises(RuntimeError, match="ConnectTimeout") as error, caplog.at_level(logging.DEBUG):
        firms.FirmsConnector().fetch()

    assert secret not in str(error.value)
    assert secret not in caplog.text


def test_firms_ingest_deduplicates_stable_external_id(db, monkeypatch):
    monkeypatch.setattr(firms, "get_settings", lambda: SimpleNamespace(firms_map_key="test-map-key"))
    monkeypatch.setattr(base, "get_settings", get_settings)
    monkeypatch.setattr(
        firms.httpx,
        "get",
        lambda *args, **kwargs: SimpleNamespace(text=FIRMS_CSV, raise_for_status=lambda: None),
    )
    monkeypatch.setattr(base.bus, "publish", lambda *args, **kwargs: None)
    connector = firms.FirmsConnector()

    assert connector.ingest(db) == 1
    assert connector.ingest(db) == 0

    source = db.execute(select(Source).where(Source.code == connector.code)).scalar_one()
    assert db.scalar(select(func.count()).select_from(Report).where(Report.source_id == source.id)) == 1


def test_firms_ingest_without_key_does_not_mark_source_live(db, monkeypatch):
    monkeypatch.setattr(firms, "get_settings", lambda: SimpleNamespace(firms_map_key=""))
    connector = firms.FirmsConnector()

    assert connector.ingest(db) == 0

    source = db.execute(select(Source).where(Source.code == connector.code)).scalar_one()
    assert source.is_live is False
    assert source.health_label == "NOT_CONFIGURED"
    assert source.health.status == "NOT_CONFIGURED"
    assert source.health.last_success is None


def test_touch_health_initializes_missing_health_counters():
    class SessionDouble:
        def add(self, _row):
            pass

    source = SimpleNamespace(id=uuid4(), health=None, health_label="NOT_CONFIGURED", is_live=False)

    base._touch_health(
        SessionDouble(),
        source,
        ok=True,
        received=2,
        processed=1,
        latency_ms=12.345,
    )

    assert source.health.records_received == 2
    assert source.health.records_processed == 1
    assert source.health.error_count == 0
    assert source.health.latency_ms == 12.35


def test_firms_message_is_stored_as_observation_not_event(monkeypatch):
    report = SimpleNamespace(status="RECEIVED", posted_at=SimpleNamespace(isoformat=lambda: "2026-10-02T14:23:00+00:00"))

    class Db:
        def get(self, model, report_id):
            return report

    monkeypatch.setattr(
        processing_worker,
        "process_report",
        lambda *args: pytest.fail("FIRMS observations must not enter incident processing"),
    )

    result = processing_worker.process_raw_message(Db(), {"report_id": str(uuid4()), "source": "firms"})

    assert result is None
    assert report.status == "OBSERVATION"