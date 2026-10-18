from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import Db, require
from app.core.errors import AppError
from app.core.security import Principal
from app.models.event import EventReport
from app.models.report import Report
from app.services.event_service import to_report_out
from app.services import audit_service

router = APIRouter(tags=["reports"])


@router.get("/reports")
def list_reports(db: Db, _: Annotated[Principal, Depends(require("reports:read:all"))]):
    rows = db.execute(select(Report).options(selectinload(Report.media)).limit(500)).scalars().all()
    links = {str(l.report_id): l.event_id for l in db.execute(select(EventReport)).scalars().all()}
    return [to_report_out(db, r, links.get(str(r.id))) for r in rows]


@router.post("/reports/{report_id}/duplicate")
def resolve_duplicate(
    report_id: UUID,
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(require("duplicates:merge"))],
    resolution: str = "ignored",
):
    row = db.get(Report, report_id)
    if not row:
        raise AppError("REPORT_NOT_FOUND", "Report was not found", 404)
    before = {"duplicateStatus": row.duplicate_status, "duplicateOf": str(row.duplicate_of_id) if row.duplicate_of_id else None}
    row.duplicate_status = "merged" if resolution == "merged" else "ignored"
    try:
        actor_user_id = UUID(principal.user_id)
    except ValueError:
        actor_user_id = None
    audit_service.record(
        db,
        action="duplicate.resolve",
        entity_type="Report",
        entity_id=str(row.id),
        actor_user_id=actor_user_id,
        actor_name=principal.username,
        actor_role=principal.role,
        before=before,
        after={"duplicateStatus": row.duplicate_status, "duplicateOf": str(row.duplicate_of_id) if row.duplicate_of_id else None},
        reason=f"Duplicate marked {row.duplicate_status}",
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    return {"id": str(row.id), "duplicateStatus": row.duplicate_status}


@router.get("/reports/{report_id}")
def get_report(report_id: UUID, db: Db, principal: Annotated[Principal, Depends(require("reports:read:all"))]):
    row = db.execute(select(Report).options(selectinload(Report.media)).where(Report.id == report_id)).scalar_one_or_none()
    if not row:
        raise AppError("REPORT_NOT_FOUND", "Report was not found", 404)
    link = db.execute(select(EventReport).where(EventReport.report_id == report_id)).scalar_one_or_none()
    return to_report_out(db, row, link.event_id if link else None)
