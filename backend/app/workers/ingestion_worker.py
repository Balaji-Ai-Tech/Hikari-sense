from __future__ import annotations

import logging
import os
from threading import Event
import time

from app.core.database import SessionLocal
from app.ingestion import all_connectors

log = logging.getLogger(__name__)


def run_ingestion_loop(stop_event: Event | None = None) -> None:
    stop_event = stop_event or Event()
    available = all_connectors()
    selected = {code.strip() for code in os.getenv("INGESTION_CONNECTORS", "").split(",") if code.strip()}
    connectors = [connector for connector in available if not selected or connector.code in selected]
    unknown = selected - {connector.code for connector in available}
    interval = max(60, int(os.getenv("INGESTION_POLL_SECONDS", "900")))
    start_delay = max(0, int(os.getenv("INGESTION_START_DELAY_SECONDS", "15")))
    log.info(
        "ingestion_worker_start",
        extra={
            "sources": [connector.code for connector in connectors],
            "unknown_sources": sorted(unknown),
            "poll_seconds": interval,
            "start_delay_seconds": start_delay,
        },
    )
    if start_delay and stop_event.wait(start_delay):
        return
    failures = {connector.code: 0 for connector in connectors}
    next_run = {connector.code: 0.0 for connector in connectors}
    while not stop_event.is_set():
        now = time.monotonic()
        for connector in connectors:
            if stop_event.is_set():
                break
            if now < next_run[connector.code]:
                continue
            db = SessionLocal()
            try:
                count = connector.ingest(db)
                failures[connector.code] = 0
                next_run[connector.code] = now + interval
                log.info("connector_ran", extra={"code": connector.code, "n": count})
            except Exception:
                db.rollback()
                failures[connector.code] += 1
                retry_delay = min(interval, 60 * 2 ** min(failures[connector.code] - 1, 10))
                next_run[connector.code] = now + retry_delay
                log.exception(
                    "connector_failed",
                    extra={"code": connector.code, "retry_in_seconds": retry_delay},
                )
            finally:
                db.close()
        remaining = [due - time.monotonic() for due in next_run.values() if due > time.monotonic()]
        stop_event.wait(max(1, min(remaining, default=interval)))
    log.info("ingestion_worker_stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_ingestion_loop()
