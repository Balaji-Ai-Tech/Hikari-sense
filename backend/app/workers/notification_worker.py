"""Notifications are persisted in-process; this worker is reserved for channel adapters (SMS/email)."""

import time

if __name__ == "__main__":
    while True:
        time.sleep(60)
