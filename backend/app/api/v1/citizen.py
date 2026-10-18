from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.deps import Db, require
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.redis import rate_hit
from app.core.security import Principal
from app.models.report import Report
from app.schemas.citizen_report import CitizenReportAccepted, CitizenSubmissionOut
from app.services.event_service import to_report_out
from app.services.report_service import submit_citizen_report
from sqlalchemy import select
from sqlalchemy.orm import selectinload

router = APIRouter(tags=["citizen"])


@router.post("/citizen/reports", response_model=CitizenReportAccepted)
async def create_citizen_report(
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(require("citizen:submit"))],
    description: str = Form(...),
    event_type: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    location_text: str | None = Form(None),
    occurred_at: datetime | None = Form(None),
    files: list[UploadFile] = File(default=[]),
):
    allowed, n = rate_hit(f"citizen:{principal.user_id}", get_settings().citizen_rate_limit_per_min)
    if not allowed:
        raise HTTPException(429, "Rate limit exceeded")
    blobs: list[tuple[str, str, bytes]] = []
    for f in files:
        data = await f.read()
        blobs.append((f.filename or "upload.bin", f.content_type or "", data))
    report = submit_citizen_report(
        db,
        principal,
        description=description,
        event_type=event_type,
        latitude=latitude,
        longitude=longitude,
        location_text=location_text,
        occurred_at=occurred_at,
        files=blobs,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return CitizenReportAccepted(report_id=report.id)


@router.get("/citizen/reports")
def my_reports(db: Db, principal: Annotated[Principal, Depends(require("citizen:own"))]):
    q = select(Report).options(selectinload(Report.media))
    try:
        uid = UUID(principal.user_id)
        q = q.where(Report.submitted_by_user_id == uid)
    except Exception:
        q = q.where(Report.source_account == principal.username)
    rows = db.execute(q).scalars().all()
    return [
        CitizenSubmissionOut(
            id=r.id,
            hazard=None,
            description=r.text,
            location=r.place_text or r.city,
            lat=r.lat,
            lng=r.lon,
            language=r.lang,
            observedAt=r.posted_at,
            submittedAt=r.created_at,
            status=r.status,
            media=[{"name": m.filename, "kind": m.media_type, "key": str(m.id)} for m in r.media],
        )
        for r in rows
    ]


@router.get("/citizen/reports/{report_id}")
def my_report(report_id: UUID, db: Db, principal: Annotated[Principal, Depends(require("citizen:own"))]):
    row = db.execute(select(Report).options(selectinload(Report.media)).where(Report.id == report_id)).scalar_one_or_none()
    if not row:
        raise AppError("REPORT_NOT_FOUND", "Report was not found", 404)
    if str(row.submitted_by_user_id) != principal.user_id and row.source_account != principal.username and "admin" not in principal.roles:
        raise AppError("FORBIDDEN", "Citizens may only access their own reports", 403)
    response = to_report_out(db, row).model_dump()
    response.update(
        {
            "eventId": None,
            "sourceId": "SRC-CITIZEN",
            "sourceName": "Citizen submission",
            "sourceType": "citizen",
            "sourceAccount": "",
            "aiClassification": None,
            "aiConfidence": None,
            "duplicateStatus": "unique",
            "duplicateOf": None,
            "similarity": None,
            "translation": None,
        }
    )
    return response
