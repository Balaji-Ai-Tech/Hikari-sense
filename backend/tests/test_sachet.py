from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.ingestion import base, sachet
from app.ingestion.sachet import SachetConnector


class FakeResponse:
    def __init__(self, content):
        self.content = content.encode() if isinstance(content, str) else content
        self.text = self.content.decode()

    def raise_for_status(self):
        return None


def _cap_payload(*, expires: datetime | None = None, msg_type: str = "Alert"):
    now = datetime.now(UTC).replace(microsecond=0)
    expiry = expires or now + timedelta(hours=1)
    return f"""<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
      <cap:identifier>IN-SACHET-TEST-001</cap:identifier>
      <cap:sender>CWC</cap:sender>
      <cap:sent>{now.isoformat()}</cap:sent>
      <cap:status>Actual</cap:status><cap:msgType>{msg_type}</cap:msgType><cap:scope>Public</cap:scope>
      <cap:info><cap:language>en-IN</cap:language><cap:category>Met</cap:category>
        <cap:event>Flood</cap:event><cap:urgency>Expected</cap:urgency><cap:severity>Severe</cap:severity>
        <cap:certainty>Observed</cap:certainty><cap:expires>{expiry.isoformat()}</cap:expires>
        <cap:headline>Severe flooding near Kamtaul</cap:headline>
        <cap:description>River Adhwara is in severe flood situation.</cap:description>
        <cap:area><cap:areaDesc>Darbhanga, Bihar</cap:areaDesc></cap:area>
        <cap:parameter><cap:valueName>Polygon URL</cap:valueName>
          <cap:value>https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=IN-SACHET-TEST-001</cap:value>
        </cap:parameter>
      </cap:info>
    </cap:alert>"""


def _setup_http(monkeypatch, cap_xml, polygon_xml=""):
    monkeypatch.setattr(
        sachet,
        "get_settings",
        lambda: SimpleNamespace(sachet_feed_url="https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"),
    )
    feed = """<rss version="2.0"><channel><item>
      <title>Severe flooding near Kamtaul</title>
      <pubDate>Sat, 03 Oct 2026 02:25:00 GMT</pubDate>
      <link>https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=IN-SACHET-TEST-001</link>
    </item></channel></rss>"""
    responses = {
        "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml": FakeResponse(feed),
        "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=IN-SACHET-TEST-001": FakeResponse(cap_xml),
        "https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=IN-SACHET-TEST-001": FakeResponse(polygon_xml),
    }
    monkeypatch.setattr(sachet.httpx, "get", lambda url, **kwargs: responses[url])


def test_fetch_parses_active_cap_alert_and_polygon_centroid(monkeypatch):
    polygon = "<alert><polygon>26,85 26,86 27,86 27,85 26,85</polygon></alert>"
    _setup_http(monkeypatch, _cap_payload(), polygon)

    [record] = SachetConnector().fetch()

    assert record["source"] == "sachet"
    assert record["native_id"] == "IN-SACHET-TEST-001"
    assert record["metadata"]["severity"] == "Severe"
    assert record["geo"]["place_text"] == "Darbhanga, Bihar"
    assert record["geo"]["lat"] == pytest.approx(26.5)
    assert record["geo"]["lon"] == pytest.approx(85.5)
    assert record["geometry"] == {
        "type": "MultiPolygon",
        "coordinates": [[[[85, 26], [86, 26], [86, 27], [85, 27], [85, 26]]]],
    }
    ring = record["geometry"]["coordinates"][0][0]
    signed_area = sum(
        ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]
        for index in range(len(ring) - 1)
    )
    assert signed_area > 0
    assert "flood" in record["text"].lower()
    assert record["raw_payload"]["cap_xml"]


@pytest.mark.parametrize(
    ("expires", "msg_type"),
    [
        (datetime.now(UTC) - timedelta(minutes=1), "Alert"),
        (datetime.now(UTC) + timedelta(hours=1), "Update"),
        (datetime.now(UTC) + timedelta(hours=1), "Cancel"),
    ],
)
def test_fetch_discards_expired_and_non_alert_cap_messages(monkeypatch, expires, msg_type):
    _setup_http(
        monkeypatch,
        _cap_payload(expires=expires, msg_type=msg_type),
    )

    assert SachetConnector().fetch() == []


def test_persisting_the_same_cap_identifier_is_idempotent(db, monkeypatch):
    from app.ingestion.base import _ensure_source, persist_envelope
    from app.models.report import Report
    from sqlalchemy import select

    polygon = "<alert><polygon>26,85 26,86 27,86 27,85 26,85</polygon></alert>"
    _setup_http(monkeypatch, _cap_payload(), polygon)
    [record] = SachetConnector().fetch()
    connector = SachetConnector()
    envelope = connector.normalize(record)
    source = _ensure_source(db, connector)
    published = []
    monkeypatch.setattr(base.bus, "publish", lambda topic, value, key=None: published.append(topic))

    assert persist_envelope(db, source, envelope) is True
    persisted = db.execute(select(Report).where(Report.native_id == envelope.native_id)).scalar_one()
    persisted.geometry = None
    db.flush()
    assert persist_envelope(db, source, envelope) is False
    assert persisted.geometry == envelope.geometry
    assert published.count("alerts.raw") == 1
    assert published.count("observations.normalized") == 1