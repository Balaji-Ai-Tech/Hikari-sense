from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select

from app.api.deps import Db, require
from app.core.security import Principal, VERIFICATION_ACTION_PERMISSIONS
from app.api.deps import get_principal
from app.models.event import Event, EventReport
from app.models.verification import Verification
from app.models.audit_log import AuditLog
from app.models.review_assignment import ReviewAssignment
from app.models.user import User
from pydantic import BaseModel, Field

from app.schemas.verification import DecisionIn, DecisionOut
from app.services.event_service import to_event_out
from app.services.verification_service import (
    decide,
    decide_report,
    queue,
    report_evidence,
    report_queue,
    assign_report,
    assignment_history,
    reviewer_directory,
    review_priority,
)
from app.services.event_service import to_report_out

router = APIRouter(tags=["verification"])

HUMAN_TO_ACTION = {
    "APPROVED": "approve",
    "VERIFIED": "verify",
    "REJECTED": "reject",
    "UNDER_REVIEW": "start_review",
    "NEEDS_MORE_EVIDENCE": "request_evidence",
    "MERGED": "merge",
    "SPLIT": "split",
    "ESCALATED": "escalate",
}


def _out(row: Verification) -> DecisionOut:
    return DecisionOut(
        id=row.id,
        eventId=row.event_id,
        reportId=row.report_id,
        action=HUMAN_TO_ACTION.get(row.decision, row.decision.lower()),
        reason=row.reason or "",
        decidedAt=row.decided_at or row.created_at,
        decidedBy=str(row.decided_by) if row.decided_by else "system",
        fromState=row.from_state,
        toState=row.to_state,
        signals=row.signals or {},
        score=row.score,
    )


@router.get("/verification/queue")
def verification_queue(db: Db, _: Annotated[Principal, Depends(require("verification:queue:read"))]):
    return [to_event_out(db, e) for e in queue(db)]


@router.get("/verification/decisions")
def decisions(db: Db, _: Annotated[Principal, Depends(require("verification:read"))]):
    rows = db.execute(select(Verification).order_by(Verification.created_at.desc()).limit(200)).scalars().all()
    return [_out(r) for r in rows if r.decided_by is not None]


@router.get("/verification/reports/queue")
def citizen_report_queue(
    db: Db,
    _: Annotated[Principal, Depends(require("verification:queue:read"))],
    status: str | None = Query(default=None, max_length=32),
    event_type: str | None = Query(default=None, max_length=64),
    severity: str | None = Query(default=None, max_length=16),
    location: str | None = Query(default=None, max_length=128),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    has_media: bool | None = None,
    ai_confidence_min: float | None = Query(default=None, ge=0, le=1),
    ai_confidence_max: float | None = Query(default=None, ge=0, le=1),
    source: str | None = Query(default=None, max_length=64),
    reviewer_id: UUID | None = None,
    priority: Literal["low", "normal", "high"] | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date must be at or before end_date")
    if ai_confidence_min is not None and ai_confidence_max is not None and ai_confidence_min > ai_confidence_max:
        raise HTTPException(422, "ai_confidence_min must be at or below ai_confidence_max")

    result = report_queue(
        db,
        status=status,
        event_type=event_type,
        severity=severity,
        location=location,
        start_date=start_date,
        end_date=end_date,
        has_media=has_media,
        ai_confidence_min=ai_confidence_min,
        ai_confidence_max=ai_confidence_max,
        source=source,
        reviewer_id=reviewer_id,
        priority=priority,
        page=page,
        page_size=page_size,
    )
    reports = result["items"]
    links = {
        link.report_id: link.event_id
        for link in db.execute(
            select(EventReport).where(EventReport.report_id.in_([report.id for report in reports]))
        ).scalars()
    }
    severities = {
        link.report_id: severity_value
        for link, severity_value in db.execute(
            select(EventReport, Event.severity)
            .join(Event, Event.id == EventReport.event_id)
            .where(EventReport.report_id.in_([report.id for report in reports]))
        ).all()
    }
    assignments = {
        assignment.report_id: (assignment, display_name, username)
        for assignment, display_name, username in db.execute(
            select(ReviewAssignment, User.display_name, User.username)
            .join(User, User.id == ReviewAssignment.reviewer_id)
            .where(
                ReviewAssignment.report_id.in_([report.id for report in reports]),
                ReviewAssignment.unassigned_at.is_(None),
            )
        ).all()
    }
    return {
        **{key: value for key, value in result.items() if key != "items"},
        "filters": {
            "status": status,
            "event_type": event_type,
            "severity": severity,
            "location": location,
            "start_date": start_date,
            "end_date": end_date,
            "has_media": has_media,
            "ai_confidence_min": ai_confidence_min,
            "ai_confidence_max": ai_confidence_max,
            "source": source,
            "reviewer_id": reviewer_id,
            "priority": priority,
        },
        "items": [
            {
                **to_report_out(db, report, links.get(report.id)).model_dump(),
                "severity": severities.get(report.id),
                "priority": review_priority(report.status),
                "reviewer_id": str(assignments[report.id][0].reviewer_id) if report.id in assignments else None,
                "reviewer_name": (
                    assignments[report.id][1] or assignments[report.id][2]
                    if report.id in assignments
                    else None
                ),
                "assigned_at": assignments[report.id][0].assigned_at if report.id in assignments else None,
            }
            for report in reports
        ],
    }


@router.get("/verification/reviewers")
def list_reviewers(db: Db, _: Annotated[Principal, Depends(require("verification:reviewers:read"))]):
    return reviewer_directory(db)


@router.get("/verification/reports/{report_id}/assignments")
def get_report_assignments(
    report_id: UUID,
    db: Db,
    _: Annotated[Principal, Depends(require("verification:read"))],
):
    return assignment_history(db, report_id)


class AssignmentIn(BaseModel):
    reviewer_id: UUID | None = None
    reason: str = Field(min_length=3, max_length=2000)


@router.put("/verification/reports/{report_id}/assignment")
def set_report_assignment(
    report_id: UUID,
    body: AssignmentIn,
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(get_principal)],
):
    if not principal.has("verification:assign"):
        raise HTTPException(403, "Missing permission verification:assign")
    return assign_report(
        db,
        principal,
        report_id,
        body.reviewer_id,
        body.reason,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.get("/verification/reports/{report_id}/decisions")
def citizen_report_decisions(
    report_id: UUID,
    db: Db,
    _: Annotated[Principal, Depends(require("verification:read"))],
):
    rows = db.execute(
        select(Verification)
        .where(Verification.report_id == report_id)
        .order_by(Verification.created_at.desc())
        .limit(200)
    ).scalars().all()
    return [_out(row) for row in rows]


@router.get("/verification/reports/{report_id}/evidence")
def citizen_report_evidence(
    report_id: UUID,
    db: Db,
    principal: Annotated[Principal, Depends(require("evidence:read"))],
):
    return report_evidence(db, report_id, principal)


@router.get("/verification/reports/{report_id}/audit")
def citizen_report_audit(
    report_id: UUID,
    db: Db,
    _: Annotated[Principal, Depends(require("audit:read:relevant"))],
):
    rows = db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == "Report", AuditLog.entity_id == str(report_id))
        .order_by(AuditLog.timestamp.desc())
        .limit(200)
    ).scalars().all()
    return [
        {
            "id": str(row.id),
            "at": row.timestamp,
            "actor": row.actor_name,
            "role": row.actor_role,
            "action": row.action,
            "reason": row.reason,
            "before": row.before,
            "after": row.after,
        }
        for row in rows
    ]


class ReportDecisionIn(BaseModel):
    action: Literal["start_review", "verify", "reject", "request_evidence", "escalate"]
    reason: str = Field(min_length=3, max_length=2000)


@router.post("/verification/reports/{report_id}/decide")
def decide_citizen_report(
    report_id: UUID,
    body: ReportDecisionIn,
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(get_principal)],
):
    permission = VERIFICATION_ACTION_PERMISSIONS[body.action]
    if not principal.has(permission):
        raise HTTPException(403, f"Missing permission {permission}")
    row = decide_report(
        db,
        principal,
        report_id,
        body.action,
        body.reason,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _out(row)


class FrontendDecision(BaseModel):
    eventId: UUID
    action: str
    reason: str
    targetEventId: UUID | None = None


@router.post("/verification/decide")
def decide_event(
    body: FrontendDecision,
    request: Request,
    db: Db,
    principal: Annotated[Principal, Depends(get_principal)],
):
    permission = VERIFICATION_ACTION_PERMISSIONS.get(body.action)
    if permission is None:
        raise HTTPException(400, "Unknown verification action")
    if not principal.has(permission):
        raise HTTPException(403, f"Missing permission {permission}")
    row = decide(
        db,
        principal,
        body.eventId,
        body.action,
        body.reason,
        body.targetEventId,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _out(row)


def _action_route(action: str):
    permission = VERIFICATION_ACTION_PERMISSIONS[action]

    def _inner(
        event_id: UUID,
        body: DecisionIn,
        request: Request,
        db: Db,
            principal: Annotated[Principal, Depends(require(permission))],
    ):
        row = decide(
            db,
            principal,
            event_id,
            action,
            body.reason,
            body.target_event_id,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        return _out(row)

    return _inner


router.add_api_route("/admin/events/{event_id}/approve", _action_route("approve"), methods=["POST"])
router.add_api_route("/admin/events/{event_id}/start-review", _action_route("start_review"), methods=["POST"])
router.add_api_route("/admin/events/{event_id}/verify", _action_route("verify"), methods=["POST"])
router.add_api_route("/admin/events/{event_id}/reject", _action_route("reject"), methods=["POST"])
router.add_api_route(
    "/admin/events/{event_id}/request-evidence", _action_route("request_evidence"), methods=["POST"]
)
router.add_api_route("/admin/events/{event_id}/escalate", _action_route("escalate"), methods=["POST"])
router.add_api_route("/admin/events/{event_id}/merge", _action_route("merge"), methods=["POST"])
router.add_api_route("/admin/events/{event_id}/split", _action_route("split"), methods=["POST"])
