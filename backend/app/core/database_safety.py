from __future__ import annotations

import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url


def validated_test_database_url(environ: dict[str, str] | None = None) -> str:
    values = os.environ if environ is None else environ
    url = values.get("TEST_DATABASE_URL")
    if not url:
        raise RuntimeError("TEST_DATABASE_URL must explicitly identify the disposable test database")
    if values.get("HIKARI_TEST_DATABASE_DISPOSABLE") != "1":
        raise RuntimeError("Set HIKARI_TEST_DATABASE_DISPOSABLE=1 only for a disposable test database")

    try:
        parsed = make_url(url)
    except Exception as exc:
        raise RuntimeError("TEST_DATABASE_URL is invalid") from exc

    if parsed.drivername.split("+")[0] != "postgresql":
        raise RuntimeError("The test database must use PostgreSQL")
    if parsed.database != "hikari_test":
        raise RuntimeError("The test database name must be exactly hikari_test")
    if parsed.host not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("The test database must be hosted on this machine")
    if parsed.username != "hikari_test":
        raise RuntimeError("The test database user must be exactly hikari_test")

    return url


def validated_test_database_system_identifier(environ: dict[str, str] | None = None) -> str:
    values = os.environ if environ is None else environ
    identifier = values.get("HIKARI_TEST_DATABASE_SYSTEM_IDENTIFIER", "")
    if not identifier.isdecimal():
        raise RuntimeError("HIKARI_TEST_DATABASE_SYSTEM_IDENTIFIER must identify the isolated PostgreSQL cluster")
    return identifier


def verify_test_database_identity(url: str, expected_system_identifier: str) -> None:
    engine: Engine = create_engine(url, pool_pre_ping=False)
    try:
        with engine.connect() as connection:
            database, username, system_identifier = connection.execute(
                text(
                    "SELECT current_database(), current_user, "
                    "(SELECT system_identifier::text FROM pg_control_system())"
                )
            ).one()
    except Exception as exc:
        raise RuntimeError("Unable to verify the isolated PostgreSQL test database identity") from exc
    finally:
        engine.dispose()

    if database != "hikari_test" or username != "hikari_test":
        raise RuntimeError("Connected PostgreSQL database/user does not match the disposable test target")
    if str(system_identifier) != expected_system_identifier:
        raise RuntimeError("Connected PostgreSQL cluster does not match the approved disposable test instance")