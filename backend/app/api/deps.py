from __future__ import annotations

from typing import Annotated
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import Principal, bearer_token, decode_token, principal_from_payload
from app.models.user import User

Db = Annotated[Session, Depends(get_db)]


def get_principal(request: Request, db: Db) -> Principal:
    token = bearer_token(request)
    if not token:
        raise HTTPException(401, "Missing bearer token")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    principal = principal_from_payload(payload)
    try:
        user_id = UUID(principal.user_id)
    except ValueError:
        return principal
    user = db.get(User, user_id)
    if user is not None and not user.is_active:
        raise HTTPException(401, "User account is disabled")
    return principal


def optional_principal(request: Request) -> Principal | None:
    token = bearer_token(request)
    if not token:
        return None
    try:
        return principal_from_payload(decode_token(token))
    except Exception:
        return None


def require(*permissions: str):
    def _inner(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
        for p in permissions:
            if not principal.has(p):
                raise HTTPException(403, f"Missing permission {p}")
        return principal

    return _inner


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def ensure_user(db: Session, principal: Principal) -> User:
    try:
        uid = UUID(principal.user_id)
        user = db.get(User, uid)
        if user:
            return user
    except Exception:
        uid = uuid4()
    user = db.query(User).filter(User.username == principal.username).one_or_none()
    if user:
        return user
    user = User(id=uid, username=principal.username, display_name=principal.username)
    db.add(user)
    db.flush()
    return user
