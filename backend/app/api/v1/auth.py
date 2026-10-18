from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import Db, get_principal
from app.core.config import get_settings
from app.core.security import ROLES, Principal, issue_token
from app.models.user import Role, User
from app.schemas.auth import DevLogin, MeResponse, TokenResponse

router = APIRouter(tags=["auth"])


@router.post("/auth/dev-login", response_model=TokenResponse)
def dev_login(body: DevLogin, db: Db):
    settings = get_settings()
    if settings.environment not in {"development", "test"}:
        raise HTTPException(404, "Dev login is disabled")
    if body.role not in ROLES:
        raise HTTPException(400, "Unknown role")
    user = db.execute(select(User).where(User.username == body.username)).scalar_one_or_none()
    if not user:
        user = User(id=uuid4(), username=body.username, display_name=body.username)
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            user = db.execute(select(User).where(User.username == body.username)).scalar_one_or_none()
            if user is None:
                raise
    if not user.is_active:
        raise HTTPException(403, "User account is disabled")
    role = db.execute(select(Role).where(Role.name == body.role)).scalar_one_or_none()
    if role and role not in user.roles:
        user.roles.append(role)
    db.commit()
    token = issue_token(str(user.id), user.username, [body.role])
    return TokenResponse(access_token=token, role=body.role, expires_in=settings.jwt_expire_minutes * 60)


@router.get("/auth/me", response_model=MeResponse)
def me(principal: Annotated[Principal, Depends(get_principal)]):
    return MeResponse(user_id=principal.user_id, username=principal.username, roles=principal.roles)
