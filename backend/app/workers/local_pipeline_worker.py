from __future__ import annotations

import logging
import signal
from collections.abc import Callable
from threading import Event, Thread

from app.core import database as database_module

import app.core.kafka as kafka_module
from app.core.kafka import EventBus

RESTART_DELAY_SECONDS = 1
MAX_RESTART_DELAY_SECONDS = 30


def _supervise_worker(name: str, worker: Callable[[Event], None], stop_event: Event) -> None:
    logger = logging.getLogger(__name__)
    retry_delay = RESTART_DELAY_SECONDS
    while not stop_event.is_set():
        try:
            worker(stop_event)
            if stop_event.is_set():
                return
            logger.error("local_worker_exited_unexpectedly", extra={"worker": name})
        except Exception:
            logger.exception("local_worker_crashed", extra={"worker": name})
        if stop_event.wait(retry_delay):
            return
        retry_delay = min(MAX_RESTART_DELAY_SECONDS, retry_delay * 2)


def run_local_pipeline() -> None:
    kafka_module.bus = EventBus(use_kafka=False)

    from app.workers.ingestion_worker import run_ingestion_loop
    from app.workers.processing_worker import run_processing_loop

    logger = logging.getLogger(__name__)
    stop_event = Event()
    workers = {
        "ingestion": run_ingestion_loop,
        "processing": run_processing_loop,
    }
    threads: dict[str, Thread] = {}

    def start_worker(name: str, worker: Callable[[Event], None]) -> Thread:
        thread = Thread(
            target=_supervise_worker,
            args=(name, worker, stop_event),
            name=f"hikari-local-{name}",
            daemon=False,
        )
        thread.start()
        logger.info("local_worker_started", extra={"worker": name})
        return thread

    previous_handlers: dict[int, object] = {}

    def request_stop(_signum, _frame) -> None:
        stop_event.set()

    for signum in (signal.SIGINT, signal.SIGTERM):
        try:
            previous_handlers[signum] = signal.signal(signum, request_stop)
        except (OSError, ValueError):
            pass

    try:
        for name, worker in workers.items():
            threads[name] = start_worker(name, worker)
        logger.info("local_pipeline_started", extra={"bus": "memory"})
        while not stop_event.wait(1):
            for name, thread in tuple(threads.items()):
                if not thread.is_alive():
                    logger.error("local_worker_supervisor_stopped", extra={"worker": name})
                    threads[name] = start_worker(name, workers[name])
    except KeyboardInterrupt:
        stop_event.set()
    finally:
        stop_event.set()
        logger.info("local_pipeline_stopping")
        for thread in threads.values():
            thread.join(timeout=10)
            if thread.is_alive():
                logger.error("local_worker_shutdown_timeout", extra={"worker": thread.name})
        database_module.engine.dispose()
        for signum, handler in previous_handlers.items():
            signal.signal(signum, handler)
        logger.info("local_pipeline_stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_local_pipeline()