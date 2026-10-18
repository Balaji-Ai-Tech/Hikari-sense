import pytest


def test_database_engine_rejects_sqlite():
    from app.core.database import _make_engine

    with pytest.raises(ValueError, match="requires PostgreSQL"):
        _make_engine("sqlite+pysqlite:///:memory:")


def test_health_liveness(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "hikari-sense"


def test_ready_reports_dependency_status(client):
    resp = client.get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["postgres"] is True
    assert body["redis"] is True
    assert body["kafka"] in {"optional", "ok", "degraded"}
