"""Placeholders — verification and notifications currently run in-process after commit."""

from app.workers.processing_worker import run_processing_loop

if __name__ == "__main__":
    run_processing_loop()
