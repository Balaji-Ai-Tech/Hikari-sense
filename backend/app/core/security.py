from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi import Request
from jwt import PyJWKClient

from app.core.config import get_settings

ROLES = (
    "citizen",
    "analyst",
    "verifier",
    "ml_engineer",
    "system_operator",
    "admin",
)

PERMISSIONS: dict[str, frozenset[str]] = {
    "public:read": frozenset(ROLES),
    "events:read": frozenset({"analyst", "verifier", "ml_engineer", "system_operator", "admin"}),
    "reports:create": frozenset({"citizen", "admin"}),
    "reports:read:own": frozenset({"citizen", "admin"}),
    "reports:read:all": frozenset({"analyst", "verifier", "admin"}),
    "reports:read:ai": frozenset({"analyst", "verifier", "ml_engineer", "admin"}),
    "reports:update:own": frozenset({"citizen", "admin"}),
    "reports:update:review": frozenset({"analyst", "verifier", "admin"}),
    "reports:delete": frozenset({"admin"}),
    "citizen:submit": frozenset({"citizen", "admin"}),
    "citizen:own": frozenset({"citizen", "admin"}),
    "media:upload": frozenset({"citizen", "admin"}),
    "media:read:own": frozenset({"citizen", "admin"}),
    "media:read:review": frozenset({"analyst", "verifier", "admin"}),
    "media:read:ai": frozenset({"ml_engineer", "admin"}),
    "verification:queue:read": frozenset({"analyst", "verifier", "admin"}),
    "verification:read": frozenset({"analyst", "verifier", "admin"}),
    "verification:start_review": frozenset({"analyst", "verifier", "admin"}),
    "verification:verify": frozenset({"verifier", "admin"}),
    "verification:reject": frozenset({"verifier", "admin"}),
    "verification:request_evidence": frozenset({"analyst", "verifier", "admin"}),
    "verification:escalate": frozenset({"analyst", "verifier", "admin"}),
    "verification:assign": frozenset({"admin"}),
    "verification:reviewers:read": frozenset({"analyst", "verifier", "admin"}),
    "verification:decide": frozenset({"verifier", "admin"}),
    "evidence:read": frozenset({"analyst", "verifier", "ml_engineer", "system_operator", "admin"}),
    "evidence:link": frozenset({"analyst", "verifier", "admin"}),
    "evidence:correlate": frozenset({"analyst", "verifier", "ml_engineer", "admin"}),
    "events:create_candidate": frozenset({"analyst", "verifier", "admin"}),
    "events:update": frozenset({"verifier", "admin"}),
    "events:verify": frozenset({"verifier", "admin"}),
    "duplicates:suggest": frozenset({"analyst", "verifier", "admin"}),
    "duplicates:merge": frozenset({"verifier", "admin"}),
    "ai:read": frozenset({"analyst", "verifier", "ml_engineer", "admin"}),
    "ai:run": frozenset({"analyst", "verifier", "ml_engineer", "admin"}),
    "ai:configure": frozenset({"ml_engineer", "admin"}),
    "ai:models:manage": frozenset({"ml_engineer", "admin"}),
    "alerts:read": frozenset(ROLES),
    "alerts:manage": frozenset({"admin"}),
    "analytics:read": frozenset({"analyst", "verifier", "ml_engineer", "admin"}),
    "sources:read": frozenset({"analyst", "verifier", "ml_engineer", "system_operator", "admin"}),
    "sources:manage": frozenset({"system_operator", "admin"}),
    "sources:configure": frozenset({"system_operator", "admin"}),
    "sources:operate": frozenset({"system_operator", "admin"}),
    "system:health": frozenset({"analyst", "verifier", "ml_engineer", "system_operator", "admin"}),
    "system:logs": frozenset({"system_operator", "admin"}),
    "system:operate": frozenset({"system_operator", "admin"}),
    "audit:read": frozenset({"admin"}),
    "audit:read:relevant": frozenset({"analyst", "verifier", "admin"}),
    "audit:read:security": frozenset({"admin"}),
    "users:manage": frozenset({"admin"}),
    "users:read": frozenset({"admin"}),
    "users:create": frozenset({"admin"}),
    "users:update": frozenset({"admin"}),
    "users:disable": frozenset({"admin"}),
    "rbac:read": frozenset({"admin"}),
    "rbac:manage": frozenset({"admin"}),
    "settings:read": frozenset({"admin"}),
    "settings:manage": frozenset({"admin"}),
    "ml:read": frozenset({"ml_engineer", "admin"}),
    "notifications:own": frozenset({"citizen", "admin", "analyst", "verifier"}),
}

VERIFICATION_ACTION_PERMISSIONS = {
    "start_review": "verification:start_review",
    "approve": "verification:verify",
    "verify": "verification:verify",
    "reject": "verification:reject",
    "request_evidence": "verification:request_evidence",
    "escalate": "verification:escalate",
    "merge": "duplicates:merge",
    "split": "events:update",
}

ROLE_RELIABILITY = {
    "official": 0.95,
    "scientific": 0.88,
    "external": 0.62,
    "citizen": 0.45,
}


class Principal:
    def __init__(self, user_id: str, username: str, roles: list[str], raw: dict[str, Any] | None = None):
        self.user_id = user_id
        self.username = username
        self.roles = roles
        self.raw = raw or {}

    @property
    def role(self) -> str:
        for role in ("admin", "verifier", "analyst", "ml_engineer", "system_operator", "citizen"):
            if role in self.roles:
                return role
        return "unknown"

    def has(self, permission: str) -> bool:
        allowed = PERMISSIONS.get(permission, frozenset())
        return bool(allowed) and ("admin" in self.roles or any(r in allowed for r in self.roles))


def issue_token(user_id: str, username: str, roles: list[str]) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "preferred_username": username,
        "roles": roles,
        "iss": s.jwt_issuer,
        "aud": s.jwt_audience,
        "iat": now,
        "exp": now + timedelta(minutes=s.jwt_expire_minutes),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


_jwks: PyJWKClient | None = None


def decode_token(token: str) -> dict[str, Any]:
    s = get_settings()
    options = {"require": ["exp", "iss", "aud"]}
    if s.jwt_jwks_url:
        global _jwks
        if _jwks is None:
            _jwks = PyJWKClient(s.jwt_jwks_url)
        signing = _jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing.key,
            algorithms=["RS256", "ES256"],
            issuer=s.jwt_issuer,
            audience=s.jwt_audience,
            options=options,
        )
    return jwt.decode(
        token,
        s.jwt_secret,
        algorithms=[s.jwt_algorithm],
        issuer=s.jwt_issuer,
        audience=s.jwt_audience,
        options=options,
    )


def principal_from_payload(payload: dict[str, Any]) -> Principal:
    roles = payload.get("roles") or payload.get("realm_access", {}).get("roles") or []
    if isinstance(roles, str):
        roles = [roles]
    roles = [r for r in roles if r in ROLES]
    return Principal(
        user_id=str(payload.get("sub") or ""),
        username=str(payload.get("preferred_username") or payload.get("email") or "user"),
        roles=roles,
        raw=payload,
    )


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header.split(" ", 1)[1].strip()
    return None
