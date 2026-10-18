from datetime import UTC, datetime
from uuid import uuid4

from app.core.security import ROLES, Principal, principal_from_payload
from app.models.event import Event


def test_citizen_cannot_list_admin_events(client, db):
    from tests.conftest import auth

    r = client.get("/api/v1/events", headers=auth(client, db, "citizen"))
    assert r.status_code == 403


def test_analyst_cannot_manage_users(client, db):
    from tests.conftest import auth

    r = client.get("/api/v1/users", headers=auth(client, db, "analyst"))
    assert r.status_code == 403


def test_admin_can_list_users(client, db):
    from tests.conftest import auth

    r = client.get("/api/v1/users", headers=auth(client, db, "admin"))
    assert r.status_code == 200


def test_verifier_can_read_queue(client, db):
    from tests.conftest import auth

    r = client.get("/api/v1/verification/queue", headers=auth(client, db, "verifier"))
    assert r.status_code == 200


def test_only_six_authoritative_roles_are_recognized():
    assert set(ROLES) == {"citizen", "analyst", "verifier", "ml_engineer", "system_operator", "admin"}
    old_viewer_claim = principal_from_payload({"sub": str(uuid4()), "roles": ["viewer"]})
    assert old_viewer_claim.roles == []
    assert not old_viewer_claim.has("public:read")


def test_analyst_can_request_evidence_but_cannot_verify_or_reject(client, db):
    from tests.conftest import auth

    now = datetime.now(UTC)
    event = Event(
        title="Flood report",
        event_type="flood",
        started_at=now,
        last_seen=now,
        status="NEEDS_REVIEW",
        verification="needs_review",
    )
    db.add(event)
    db.commit()
    headers = auth(client, db, "analyst")

    for action in ("approve", "reject"):
        denied = client.post(
            "/api/v1/verification/decide",
            json={"eventId": str(event.id), "action": action, "reason": "Human review required"},
            headers=headers,
        )
        assert denied.status_code == 403

    allowed = client.post(
        "/api/v1/verification/decide",
        json={"eventId": str(event.id), "action": "request_evidence", "reason": "Need a clearer location"},
        headers=headers,
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["toState"] == "NEEDS_MORE_EVIDENCE"


def test_ml_engineer_and_system_operator_cannot_verify(client, db):
    from tests.conftest import auth

    event_id = uuid4()
    for role in ("ml_engineer", "system_operator", "citizen"):
        response = client.post(
            "/api/v1/verification/decide",
            json={"eventId": str(event_id), "action": "approve", "reason": "Not authorized"},
            headers=auth(client, db, role),
        )
        assert response.status_code == 403


def test_verifier_can_read_and_act_on_review_queue(client, db):
    principal = Principal(str(uuid4()), "verifier", ["verifier"])
    assert principal.has("verification:queue:read")
    assert principal.has("verification:verify")
    assert principal.has("verification:reject")
    assert not principal.has("rbac:manage")


def test_admin_grants_do_not_apply_to_unknown_permissions():
    administrator = Principal(str(uuid4()), "admin", ["admin"])
    assert administrator.has("verification:verify")
    assert not administrator.has("unregistered:permission")


def test_reviewer_directory_visible_to_review_roles_only(client, db):
    from tests.conftest import auth

    assert client.get("/api/v1/verification/reviewers", headers=auth(client, db, "analyst")).status_code == 200
    assert client.get("/api/v1/verification/reviewers", headers=auth(client, db, "verifier")).status_code == 200
    assert client.get("/api/v1/verification/reviewers", headers=auth(client, db, "citizen")).status_code == 403


def test_backend_role_permission_matrix_is_admin_only(client, db):
    from tests.conftest import auth

    matrix = client.get("/api/v1/rbac/roles", headers=auth(client, db, "admin"))
    assert matrix.status_code == 200
    roles = {row["name"]: set(row["permissions"]) for row in matrix.json()}
    assert set(roles) == {"citizen", "analyst", "verifier", "ml_engineer", "system_operator", "admin"}
    assert "verification:verify" not in roles["analyst"]
    assert "verification:verify" not in roles["ml_engineer"]
    assert "verification:verify" not in roles["system_operator"]
    assert "verification:verify" in roles["verifier"]
    assert "verification:verify" in roles["admin"]
    assert client.get("/api/v1/rbac/roles", headers=auth(client, db, "analyst")).status_code == 403


def test_disabling_user_invalidates_existing_jwt_and_is_audited(client, db):
    from sqlalchemy import select
    from app.models.audit_log import AuditLog
    from app.models.user import User
    from tests.conftest import auth, token_for

    analyst_token = token_for(db, "disable.target", "analyst")
    user = db.execute(select(User).where(User.username == "disable.target")).scalar_one()
    disabled = client.patch(
        f"/api/v1/users/{user.id}/status",
        json={"is_active": False},
        headers=auth(client, db, "admin"),
    )
    assert disabled.status_code == 200
    protected = client.get(
        "/api/v1/verification/queue",
        headers={"Authorization": f"Bearer {analyst_token}"},
    )
    assert protected.status_code == 401
    audit = db.execute(
        select(AuditLog).where(AuditLog.action == "user.status_change", AuditLog.entity_id == str(user.id))
    ).scalar_one()
    assert audit.actor_role == "admin"


def test_missing_token(client):
    r = client.get("/api/v1/events")
    assert r.status_code == 401


def test_dev_login_recovers_from_concurrent_user_insert(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import Mock

    from sqlalchemy.exc import IntegrityError

    from app.api.v1 import auth
    from app.models.user import Role, User
    from app.schemas.auth import DevLogin

    existing_user = User(
        id=uuid4(), username="racing-user", display_name="racing-user", is_active=True
    )
    existing_user.roles = []
    role = Role(id=uuid4(), name="citizen")
    initial_lookup = Mock()
    initial_lookup.scalar_one_or_none.return_value = None
    raced_lookup = Mock()
    raced_lookup.scalar_one_or_none.return_value = existing_user
    role_lookup = Mock()
    role_lookup.scalar_one_or_none.return_value = role
    db = Mock()
    db.execute.side_effect = [initial_lookup, raced_lookup, role_lookup]
    db.flush.side_effect = IntegrityError("insert", {}, RuntimeError("duplicate username"))

    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(environment="test", jwt_expire_minutes=60),
    )
    monkeypatch.setattr(auth, "issue_token", lambda *_args: "test-token")

    response = auth.dev_login(DevLogin(username="racing-user", role="citizen"), db)

    assert response.access_token == "test-token"
    assert response.role == "citizen"
    assert role in existing_user.roles
    db.rollback.assert_called_once()
    db.commit.assert_called_once()
