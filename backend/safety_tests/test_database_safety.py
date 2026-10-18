import os
import subprocess
import sys
from pathlib import Path

from types import SimpleNamespace

import pytest
from sqlalchemy import Integer
from sqlalchemy.dialects import postgresql

from app.core import database_safety
from app.core import migration_contract
from app.core.database_safety import (
    validated_test_database_system_identifier,
    validated_test_database_url,
    verify_test_database_identity,
)


def _environment(**overrides: str) -> dict[str, str]:
    values = {
        "TEST_DATABASE_URL": "postgresql+psycopg://hikari_test:pass@localhost:5432/hikari_test",
        "HIKARI_TEST_DATABASE_DISPOSABLE": "1",
        "HIKARI_TEST_DATABASE_SYSTEM_IDENTIFIER": "123456789",
    }
    values.update(overrides)
    return values


def test_accepts_explicit_local_disposable_test_database():
    url = "postgresql+psycopg://hikari_test:pass@localhost:5432/hikari_test"

    assert validated_test_database_url(_environment()) == url


def test_rejects_inherited_database_url_without_explicit_test_target():
    try:
        validated_test_database_url({"DATABASE_URL": "postgresql://user:pass@localhost:5432/hikari_sachet_dev"})
    except RuntimeError as exc:
        assert "TEST_DATABASE_URL" in str(exc)
    else:
        raise AssertionError("An inherited DATABASE_URL must not be accepted")


def test_rejects_non_test_database_name():
    try:
        validated_test_database_url(
            _environment(TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/hikari_sachet_dev")
        )
    except RuntimeError as exc:
        assert "exactly hikari_test" in str(exc)
    else:
        raise AssertionError("A non-test database must not be accepted")


def test_rejects_remote_test_database():
    try:
        validated_test_database_url(
            _environment(TEST_DATABASE_URL="postgresql://user:pass@db.example:5432/hikari_test")
        )
    except RuntimeError as exc:
        assert "hosted on this machine" in str(exc)
    else:
        raise AssertionError("A remote database must not be accepted")


def test_requires_disposable_database_opt_in():
    try:
        validated_test_database_url(_environment(HIKARI_TEST_DATABASE_DISPOSABLE="0"))
    except RuntimeError as exc:
        assert "HIKARI_TEST_DATABASE_DISPOSABLE=1" in str(exc)
    else:
        raise AssertionError("The destructive-test opt-in must be explicit")


def test_requires_approved_postgresql_cluster_identifier():
    assert validated_test_database_system_identifier(_environment()) == "123456789"
    with pytest.raises(RuntimeError, match="SYSTEM_IDENTIFIER"):
        validated_test_database_system_identifier(_environment(HIKARI_TEST_DATABASE_SYSTEM_IDENTIFIER=""))


def test_identity_check_rejects_a_different_database_or_cluster(monkeypatch):
    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, _statement):
            return SimpleNamespace(one=lambda: ("hikari_test", "hikari_test", "987654321"))

    class FakeEngine:
        def connect(self):
            return FakeConnection()

        def dispose(self):
            pass

    monkeypatch.setattr(database_safety, "create_engine", lambda *_args, **_kwargs: FakeEngine())
    with pytest.raises(RuntimeError, match="approved disposable test instance"):
        verify_test_database_identity("postgresql+psycopg://user:pass@localhost/hikari_test", "123456789")


def test_schema_contract_rejects_unexpected_non_unique_index(monkeypatch):
    class FakeInspector:
        def get_table_names(self):
            return ["sample"]

        def get_columns(self, _table_name):
            return [{"name": "id", "type": Integer(), "nullable": False}]

        def get_pk_constraint(self, _table_name):
            return {"constrained_columns": ["id"]}

        def get_unique_constraints(self, _table_name):
            return []

        def get_foreign_keys(self, _table_name):
            return []

        def get_indexes(self, _table_name):
            return [{"name": "unexpected_idx", "column_names": ["id"], "unique": False}]

    bind = SimpleNamespace(dialect=postgresql.dialect())
    monkeypatch.setattr(migration_contract, "inspect", lambda _bind: FakeInspector())

    with pytest.raises(RuntimeError, match="Unexpected indexes"):
        migration_contract.validate_table_contract(
            bind,
            "sample",
            columns={"id": (Integer(), False)},
            primary_key=("id",),
            unique_constraints=set(),
            foreign_keys=set(),
            indexes={},
        )


def test_pytest_fixture_rejects_inherited_database_before_database_import():
    backend_root = Path(__file__).resolve().parents[1]
    environment = os.environ.copy()
    environment["DATABASE_URL"] = "postgresql://user:pass@localhost:5433/hikari_sachet_dev"
    environment.pop("TEST_DATABASE_URL", None)
    environment.pop("HIKARI_TEST_DATABASE_DISPOSABLE", None)
    script = """
import runpy
import sys

try:
    runpy.run_path('tests/conftest.py')
except RuntimeError as exc:
    assert 'TEST_DATABASE_URL' in str(exc)
    assert 'app.core.database' not in sys.modules
else:
    raise AssertionError('Unsafe inherited database URL was accepted')
"""

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=backend_root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr