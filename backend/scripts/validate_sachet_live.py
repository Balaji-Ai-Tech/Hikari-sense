import os
import sys
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import psycopg
from sqlalchemy import func, select

repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

os.environ.setdefault("ENVIRONMENT", "development")
os.environ["DATABASE_URL"] = "postgresql+psycopg://hikari:hikari@localhost:5433/hikari_sachet_dev"
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

from app.core.database import Base, SessionLocal, configure_engine
from app.ingestion.base import _ensure_source, persist_envelope
from app.ingestion.sachet import SachetConnector
from app.models.official_alert import OfficialAlert
from app.models.report import Report
from app.schemas.envelope import IngestionEnvelope
from app.workers.processing_worker import process_raw_message


def ensure_database() -> None:
    admin = psycopg.connect("dbname=postgres user=hikari password=hikari host=localhost port=5433")
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", ("hikari_sachet_dev",))
        if not cur.fetchone():
            cur.execute('CREATE DATABASE "hikari_sachet_dev"')
    admin.close()


def main() -> None:
    ensure_database()
    engine = configure_engine(os.environ["DATABASE_URL"])
    Base.metadata.create_all(bind=engine)

    connector = SachetConnector()
    items = connector.fetch()
    if not items:
        print("LIVE_SACHET_FETCH: no items returned")
        return

    first = items[0]
    print("LIVE_SACHET_FETCH_COUNT", len(items))
    print("LIVE_SACHET_NATIVE_ID", first["native_id"])
    print("LIVE_SACHET_SOURCE_ACCOUNT", first["source_account"])
    print("LIVE_SACHET_POSTED_AT", first["posted_at"].isoformat())
    print("LIVE_SACHET_EXPIRES", first.get("metadata", {}).get("expires"))
    print("LIVE_SACHET_AREA_COUNT", len(first.get("metadata", {}).get("area_descriptions", [])))

    db = SessionLocal()
    try:
        source = _ensure_source(db, connector)
        env = connector.normalize(first)

        initial_alerts = db.execute(select(func.count()).select_from(OfficialAlert)).scalar_one()
        initial_reports = db.execute(select(func.count()).select_from(Report)).scalar_one()
        print("LIVE_DB_INITIAL_ALERTS", initial_alerts)
        print("LIVE_DB_INITIAL_REPORTS", initial_reports)

        first_result = persist_envelope(db, source, env)
        db.commit()
        after_first_alerts = db.execute(select(func.count()).select_from(OfficialAlert)).scalar_one()
        after_first_reports = db.execute(select(func.count()).select_from(Report)).scalar_one()
        print("LIVE_PERSIST_FIRST_RESULT", first_result)
        print("LIVE_DB_AFTER_FIRST_ALERTS", after_first_alerts)
        print("LIVE_DB_AFTER_FIRST_REPORTS", after_first_reports)

        persisted_report = db.execute(select(Report).where(Report.native_id == env.native_id)).scalar_one()
        raw_message = {
            "report_id": str(persisted_report.id),
            "source": "sachet",
            "native_id": env.native_id,
            "raw_ref": env.raw_ref,
            "source_account": env.source_account,
            "metadata": {
                "event": first.get("metadata", {}).get("event"),
                "urgency": first.get("metadata", {}).get("urgency"),
                "severity": first.get("metadata", {}).get("severity"),
                "certainty": first.get("metadata", {}).get("certainty"),
                "expires": first.get("metadata", {}).get("expires"),
                "sender": first.get("metadata", {}).get("sender"),
                "message_type": first.get("metadata", {}).get("message_type"),
                "area_descriptions": first.get("metadata", {}).get("area_descriptions"),
                "headline": first.get("metadata", {}).get("headline"),
                "description": first.get("metadata", {}).get("description"),
                "instruction": first.get("metadata", {}).get("instruction"),
                "references": first.get("metadata", {}).get("references"),
            },
        }
        process_raw_message(db, raw_message, topic="alerts.raw")
        db.commit()
        official = db.execute(select(OfficialAlert).where(OfficialAlert.identifier == env.native_id)).scalar_one()
        print("LIVE_OFFICIAL_SENDER", official.sender)
        print("LIVE_OFFICIAL_MESSAGE_TYPE", official.message_type)
        print("LIVE_OFFICIAL_ISSUED_AT", official.issued_at.isoformat())
        print("LIVE_OFFICIAL_EXPIRES_AT", official.expires_at.isoformat() if official.expires_at else None)
        print("LIVE_OFFICIAL_AREAS", official.areas[:3])

        before_second_process = db.execute(select(func.count()).select_from(OfficialAlert)).scalar_one()
        process_raw_message(db, raw_message, topic="alerts.raw")
        db.commit()
        after_second_process = db.execute(select(func.count()).select_from(OfficialAlert)).scalar_one()
        print("LIVE_DUPLICATE_PROCESS_RESULT", before_second_process == after_second_process)
        print("LIVE_DUPLICATE_ALERT_COUNT", after_second_process)

        observed_at = datetime.now(UTC).replace(microsecond=0)
        report = Report(
            source_id=source.id,
            native_id=f"IN-SACHET-BACKFILL-{uuid4()}",
            posted_at=observed_at,
            fetched_at=observed_at,
            text="Backfill replay validation.",
            status="needs_review",
            source_account="IMD-Test",
        )
        db.add(report)
        db.flush()
        replay_env = IngestionEnvelope(
            report_id=uuid4(),
            source="sachet",
            source_account="IMD-Test",
            native_id=report.native_id,
            fetched_at=observed_at,
            posted_at=observed_at,
            text=report.text,
            raw_ref="https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=test",
            metadata={
                "event": "Rain",
                "urgency": "Immediate",
                "severity": "Severe",
                "certainty": "Observed",
                "expires": (observed_at + timedelta(hours=1)).isoformat(),
                "sender": "IMD-Test",
                "message_type": "Alert",
                "area_descriptions": ["Test district"],
            },
        )
        replay_before = db.execute(select(func.count()).select_from(OfficialAlert)).scalar_one()
        replay_result = persist_envelope(db, source, replay_env)
        db.commit()
        replay_after = db.execute(select(func.count()).select_from(OfficialAlert)).scalar_one()
        print("LIVE_REPLAY_MISSING_ALERT_RESULT", replay_result)
        print("LIVE_REPLAY_MISSING_ALERT_BEFORE", replay_before)
        print("LIVE_REPLAY_MISSING_ALERT_AFTER", replay_after)
    finally:
        db.close()


if __name__ == "__main__":
    main()
