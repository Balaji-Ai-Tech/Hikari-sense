from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import Db, require
from app.core.errors import AppError
from app.core.security import PERMISSIONS, ROLES, Principal
from app.models.user import Role, User
from app.services import audit_service

router = APIRouter(tags=["users"])


class RoleChange(BaseModel):
    role: str


class UserStatusChange(BaseModel):
    is_active: bool


class PermissionRoleOut(BaseModel):
    name: str
    permissions: list[str]


@router.get("/users")
def list_users(
    db: Db,
    _: Annotated[Principal, Depends(require("users:read"))],
    q: str | None = None,
):
    rows = db.execute(select(User)).scalars().all()
    if q:
        query = q.casefold()
        rows = [u for u in rows if query in u.username.casefold() or query in u.display_name.casefold() or query in (u.email or "").casefold()]
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "display_name": u.display_name,
            "roles": [r.name for r in u.roles],
            "is_active": u.is_active,
        }
        for u in rows
    ]


@router.post("/users/{user_id}/role")
def set_role(
    user_id: UUID,
    body: RoleChange,
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(require("users:manage"))],
):
    if body.role not in ROLES:
        raise AppError("INVALID_ROLE", "Unknown role", 400)
    user = db.get(User, user_id)
    if not user:
        raise AppError("USER_NOT_FOUND", "User was not found", 404)
    before = [r.name for r in user.roles]
    role = db.execute(select(Role).where(Role.name == body.role)).scalar_one_or_none()
    if not role:
        role = Role(name=body.role)
        db.add(role)
        db.flush()
    user.roles = [role]
    audit_service.record(
        db,
        action="user.role_change",
        entity_type="User",
        entity_id=str(user.id),
        actor_name=principal.username,
        actor_role=principal.role,
        before={"roles": before},
        after={"roles": [body.role]},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return {"id": str(user.id), "roles": [body.role]}


@router.patch("/users/{user_id}/status")
def set_user_status(
    user_id: UUID,
    body: UserStatusChange,
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(require("users:disable"))],
):
    user = db.get(User, user_id)
    if not user:
        raise AppError("USER_NOT_FOUND", "User was not found", 404)
    before = {"is_active": user.is_active}
    user.is_active = body.is_active
    audit_service.record(
        db,
        action="user.status_change",
        entity_type="User",
        entity_id=str(user.id),
        actor_user_id=UUID(principal.user_id) if _is_uuid(principal.user_id) else None,
        actor_name=principal.username,
        actor_role=principal.role,
        before=before,
        after={"is_active": user.is_active},
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {"id": str(user.id), "is_active": user.is_active}


@router.get("/rbac/roles", response_model=list[PermissionRoleOut])
def list_role_permissions(_: Annotated[Principal, Depends(require("rbac:read"))]):
    return [
        {
            "name": role,
            "permissions": sorted(permission for permission, allowed in PERMISSIONS.items() if role in allowed),
        }
        for role in ROLES
    ]


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except ValueError:
        return False
