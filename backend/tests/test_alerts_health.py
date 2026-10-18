from datetime import UTC, datetime

from app.models.alert import Alert
from tests.conftest import auth


def test_analyst_cannot_create_alert(client, db):
    h = auth(client, db, "analyst")
    r = client.post(
        "/api/v1/alerts",
        json={"title": "x", "description": "y", "severity": "high"},
        headers=h,
    )
    assert r.status_code == 403


def test_admin_creates_alert(client, db):
    h = auth(client, db, "admin")
    r = client.post(
        "/api/v1/alerts",
        json={"title": "Demo", "description": "No SMS", "severity": "low", "status": "scheduled"},
        headers=h,
    )
    assert r.status_code == 200
    assert "No SMS" in r.json()["dissemination"] or r.json()["title"] == "Demo"


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["problem_statement"] == "PS 26069"


def test_vite_fallback_port_is_allowed_by_cors(client):
    r = client.options(
        "/api/v1/public/events",
        headers={
            "Origin": "http://127.0.0.1:5174",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://127.0.0.1:5174"
