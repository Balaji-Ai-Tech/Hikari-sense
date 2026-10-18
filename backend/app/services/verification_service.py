from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import cos, radians
from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.core.kafka import bus
from app.core.config import get_settings
from app.core.security import Principal, VERIFICATION_ACTION_PERMISSIONS
from app.models.event import Event, EventReport
from app.models.model_version import ModelPrediction
from app.models.official_observation import OfficialObservation
from app.models.report import Media, Report
from app.models.review_assignment import ReviewAssignment
from app.models.source import Source
from app.models.user import Role, User
from app.models.verification import Verification
from app.models.weather_observation import WeatherObservation
from app.intelligence.geoparser import haversine_km
from app.intelligence.event_clustering import cell
from app.services import audit_service
from app.services.event_service import emit, to_event_out
from app.services.notification_service import notify


def queue(db: Session) -> list[Event]:
    return list(
        db.execute(
            select(Event)
            .options(selectinload(Event.reports))
            .where(
                Event.verification.in_(
                    ["needs_review", "low_confidence", "escalated", "needs_more_evidence", "under_review"]
                )
            )
            .where(Event.merged_into_id.is_(None))
            .order_by(Event.last_seen.desc())
        )
        .scalars()
        .unique()
        .all()
    )


def review_priority(status: str) -> str:
    normalized = status.upper()
    if normalized in {"ESCALATED", "NEEDS_MORE_EVIDENCE"}:
        return "high"
    if normalized in {"NEEDS_REVIEW", "LOW_CONFIDENCE", "UNDER_REVIEW", "PENDING_HUMAN_REVIEW"}:
        return "normal"
    return "low"


def report_queue(
    db: Session,
    *,
    status: str | None = None,
    event_type: str | None = None,
    severity: str | None = None,
    location: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    has_media: bool | None = None,
    ai_confidence_min: float | None = None,
    ai_confidence_max: float | None = None,
    source: str | None = None,
    priority: str | None = None,
    reviewer_id: UUID | None = None,
    page: int = 1,
    page_size: int = 25,
) -> dict:
    active_statuses = [
        "RECEIVED",
        "PROCESSING",
        "NEEDS_REVIEW",
        "LOW_CONFIDENCE",
        "NEEDS_MORE_EVIDENCE",
        "ESCALATED",
        "UNDER_REVIEW",
        "AI_ANALYSIS_PENDING",
        "AI_ANALYZED",
        "PENDING_HUMAN_REVIEW",
    ]
    base = [Source.source_type == "citizen", func.upper(Report.status).in_(active_statuses)]
    if status:
        base.append(func.upper(Report.status) == status.upper())
    if event_type:
        base.append(func.lower(Report.event_type) == event_type.casefold())
    if severity:
        base.append(
            Report.id.in_(
                select(EventReport.report_id)
                .join(Event, Event.id == EventReport.event_id)
                .where(func.lower(Event.severity) == severity.casefold())
            )
        )
    if location:
        pattern = f"%{location.strip()}%"
        base.append(
            or_(
                Report.place_text.ilike(pattern),
                Report.city.ilike(pattern),
                Report.district.ilike(pattern),
                Report.state.ilike(pattern),
            )
        )
    if start_date:
        base.append(Report.created_at >= start_date)
    if end_date:
        base.append(Report.created_at <= end_date)
    if has_media is not None:
        media_exists = select(Media.id).where(Media.report_id == Report.id).exists()
        base.append(media_exists if has_media else ~media_exists)
    if ai_confidence_min is not None:
        base.append(Report.event_type_confidence >= ai_confidence_min)
    if ai_confidence_max is not None:
        base.append(Report.event_type_confidence <= ai_confidence_max)
    if source:
        source_pattern = f"%{source.strip()}%"
        base.append(or_(Source.code.ilike(source_pattern), Source.name.ilike(source_pattern)))
    if reviewer_id:
        base.append(
            Report.id.in_(
                select(ReviewAssignment.report_id).where(
                    ReviewAssignment.reviewer_id == reviewer_id,
                    ReviewAssignment.unassigned_at.is_(None),
                )
            )
        )
    priority_expr = case(
        (func.upper(Report.status).in_(["ESCALATED", "NEEDS_MORE_EVIDENCE"]), "high"),
        (
            func.upper(Report.status).in_(
                ["NEEDS_REVIEW", "LOW_CONFIDENCE", "UNDER_REVIEW", "PENDING_HUMAN_REVIEW"]
            ),
            "normal",
        ),
        else_="low",
    )
    if priority:
        base.append(priority_expr == priority.casefold())

    stmt = select(Report).join(Report.source).options(selectinload(Report.media)).where(*base)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.execute(
            stmt.order_by(Report.created_at.desc(), Report.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    status_rows = db.execute(
        select(func.upper(Report.status), func.count(Report.id))
        .join(Report.source)
        .where(Source.source_type == "citizen", func.upper(Report.status).in_(active_statuses))
        .group_by(func.upper(Report.status))
    ).all()
    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "status_counts": {key: count for key, count in status_rows},
    }


def reviewer_directory(db: Session) -> list[dict]:
    users = db.execute(
        select(User).options(selectinload(User.roles)).where(User.is_active.is_(True)).order_by(User.display_name, User.username)
    ).unique().scalars().all()
    assignments = db.execute(
        select(ReviewAssignment.reviewer_id, func.count(ReviewAssignment.id))
        .where(ReviewAssignment.unassigned_at.is_(None))
        .group_by(ReviewAssignment.reviewer_id)
    ).all()
    workloads = {user_id: count for user_id, count in assignments}
    result = []
    for user in users:
        roles = [role.name for role in user.roles]
        eligible = [role for role in roles if role in {"analyst", "verifier"}]
        if not eligible:
            continue
        result.append(
            {
                "id": str(user.id),
                "username": user.username,
                "display_name": user.display_name,
                "roles": eligible,
                "is_active": user.is_active,
                "active_assignments": workloads.get(user.id, 0),
            }
        )
    return result


def assignment_history(db: Session, report_id: UUID) -> list[dict]:
    rows = db.execute(
        select(ReviewAssignment)
        .where(ReviewAssignment.report_id == report_id)
        .order_by(ReviewAssignment.assigned_at.desc(), ReviewAssignment.id.desc())
    ).scalars().all()
    result = []
    for row in rows:
        reviewer = db.get(User, row.reviewer_id)
        assigner = db.get(User, row.assigned_by_user_id) if row.assigned_by_user_id else None
        unassigner = db.get(User, row.unassigned_by_user_id) if row.unassigned_by_user_id else None
        result.append(
            {
                "id": str(row.id),
                "report_id": str(row.report_id),
                "reviewer_id": str(row.reviewer_id),
                "reviewer_name": reviewer.display_name or reviewer.username if reviewer else "Disabled reviewer",
                "assigned_by_user_id": str(row.assigned_by_user_id) if row.assigned_by_user_id else None,
                "assigned_by_name": assigner.display_name or assigner.username if assigner else "system",
                "assigned_by_role": row.assigned_by_role,
                "assigned_at": row.assigned_at,
                "unassigned_by_user_id": str(row.unassigned_by_user_id) if row.unassigned_by_user_id else None,
                "unassigned_by_name": unassigner.display_name or unassigner.username if unassigner else None,
                "unassigned_by_role": row.unassigned_by_role,
                "unassigned_at": row.unassigned_at,
                "reason": row.reason,
                "active": row.unassigned_at is None,
            }
        )
    return result


def assign_report(
    db: Session,
    principal: Principal,
    report_id: UUID,
    reviewer_id: UUID | None,
    reason: str,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
) -> list[dict]:
    if not principal.has("verification:assign"):
        raise AppError("FORBIDDEN", "Missing permission verification:assign", 403)
    report = db.execute(select(Report).where(Report.id == report_id).with_for_update()).scalar_one_or_none()
    if report is None:
        raise AppError("REPORT_NOT_FOUND", "Report was not found", 404)
    source = db.get(Source, report.source_id)
    if source is None or source.source_type != "citizen":
        raise AppError("NOT_A_CITIZEN_REPORT", "Only citizen reports can be assigned for review", 400)

    current = db.execute(
        select(ReviewAssignment)
        .where(ReviewAssignment.report_id == report.id, ReviewAssignment.unassigned_at.is_(None))
        .with_for_update()
    ).scalar_one_or_none()
    before_reviewer = db.get(User, current.reviewer_id) if current else None
    before = {
        "reviewer_id": str(current.reviewer_id) if current else None,
        "reviewer_name": (before_reviewer.display_name or before_reviewer.username) if before_reviewer else None,
    }

    next_reviewer = None
    if reviewer_id is not None:
        next_reviewer = db.execute(
            select(User).options(selectinload(User.roles)).where(User.id == reviewer_id)
        ).unique().scalar_one_or_none()
        if next_reviewer is None or not next_reviewer.is_active:
            raise AppError("INVALID_REVIEWER", "Reviewer is missing or disabled", 400)
        if not any(role.name in {"analyst", "verifier"} for role in next_reviewer.roles):
            raise AppError("INVALID_REVIEWER", "Reviewer must have Analyst or Verifier role", 400)
        if current and current.reviewer_id == next_reviewer.id:
            return assignment_history(db, report.id)

    actor_id: UUID | None
    try:
        actor_id = UUID(principal.user_id)
    except ValueError:
        actor_id = None
    now = datetime.now(UTC)
    if current:
        current.unassigned_at = now
        current.unassigned_by_user_id = actor_id
        current.unassigned_by_role = principal.role
    if next_reviewer:
        db.add(
            ReviewAssignment(
                report_id=report.id,
                reviewer_id=next_reviewer.id,
                assigned_by_user_id=actor_id,
                assigned_by_role=principal.role,
                assigned_at=now,
                reason=reason.strip(),
            )
        )
    audit_service.record(
        db,
        action="verification.assignment.change",
        entity_type="Report",
        entity_id=str(report.id),
        actor_user_id=actor_id,
        actor_name=principal.username,
        actor_role=principal.role,
        before=before,
        after={
            "reviewer_id": str(next_reviewer.id) if next_reviewer else None,
            "reviewer_name": (next_reviewer.display_name or next_reviewer.username) if next_reviewer else None,
        },
        reason=reason.strip(),
        ip=ip,
        user_agent=user_agent,
    )
    db.commit()
    return assignment_history(db, report.id)


def report_evidence(db: Session, report_id: UUID, principal: Principal) -> list[dict]:
    report = db.execute(
        select(Report).options(selectinload(Report.media)).where(Report.id == report_id).with_for_update()
    ).scalar_one_or_none()
    if report is None:
        raise AppError("REPORT_NOT_FOUND", "Report was not found", 404)
    if report.lat is None or report.lon is None:
        return []

    radius_km = 50.0
    time_window = timedelta(hours=6)
    latitude_delta = radius_km / 111.0
    longitude_delta = radius_km / (111.0 * max(0.1, abs(cos(radians(report.lat)))))
    start, end = report.posted_at - time_window, report.posted_at + time_window
    evidence: list[dict] = []

    source_reports = db.execute(
        select(Report, Source)
        .join(Source, Report.source_id == Source.id)
        .where(Report.id != report.id)
        .where(Report.lat.between(report.lat - latitude_delta, report.lat + latitude_delta))
        .where(Report.lon.between(report.lon - longitude_delta, report.lon + longitude_delta))
        .where(Report.posted_at.between(start, end))
        .order_by(Report.posted_at.desc())
        .limit(500)
    ).all()
    for candidate, source in source_reports:
        if source.source_type == "citizen" and not principal.has("reports:read:all"):
            continue
        distance = haversine_km(report.lat, report.lon, candidate.lat, candidate.lon)
        if distance is None or distance > radius_km:
            continue
        evidence.append(
            {
                "id": str(candidate.id),
                "source": source.name,
                "sourceCode": source.code,
                "sourceType": source.source_type,
                "summary": candidate.text[:400],
                "lat": candidate.lat,
                "lng": candidate.lon,
                "geometry": candidate.geometry,
                "observedAt": candidate.posted_at,
                "distanceKm": round(distance, 1),
                "minutesApart": round(abs((candidate.posted_at - report.posted_at).total_seconds()) / 60),
                "reliability": source.reliability,
                "status": candidate.status,
                "classification": "POTENTIAL_CONTEXT",
                "note": "Proximity is context only; it is not automatic corroboration.",
            }
        )

    official_rows = db.execute(
        select(OfficialObservation)
        .where(OfficialObservation.lat.between(report.lat - latitude_delta, report.lat + latitude_delta))
        .where(OfficialObservation.lon.between(report.lon - longitude_delta, report.lon + longitude_delta))
        .where(OfficialObservation.observed_at.between(start, end))
        .order_by(OfficialObservation.observed_at.desc())
        .limit(200)
    ).scalars().all()
    for observation in official_rows:
        distance = haversine_km(report.lat, report.lon, observation.lat, observation.lon)
        if distance is None or distance > radius_km:
            continue
        details = observation.alert or observation.notes
        if observation.rainfall_mm is not None:
            details = f"{details}; rainfall {observation.rainfall_mm:g} mm" if details else f"Rainfall {observation.rainfall_mm:g} mm"
        evidence.append(
            {
                "id": str(observation.id),
                "source": observation.agency,
                "sourceCode": observation.agency,
                "sourceType": "scientific",
                "summary": details[:400],
                "lat": observation.lat,
                "lng": observation.lon,
                "geometry": None,
                "observedAt": observation.observed_at,
                "distanceKm": round(distance, 1),
                "minutesApart": round(abs((observation.observed_at - report.posted_at).total_seconds()) / 60),
                "reliability": None,
                "status": "SYNTHETIC" if observation.is_synthetic else "OBSERVED",
                "classification": "POTENTIAL_CONTEXT",
                "note": "Proximity is context only; it is not automatic corroboration.",
            }
        )

    weather_rows = db.execute(
        select(WeatherObservation)
        .where(WeatherObservation.lat.between(report.lat - latitude_delta, report.lat + latitude_delta))
        .where(WeatherObservation.lon.between(report.lon - longitude_delta, report.lon + longitude_delta))
        .where(WeatherObservation.observed_at.between(start, end))
        .order_by(WeatherObservation.observed_at.desc())
        .limit(200)
    ).scalars().all()
    for observation in weather_rows:
        distance = haversine_km(report.lat, report.lon, observation.lat, observation.lon)
        if distance is None or distance > radius_km:
            continue
        evidence.append(
            {
                "id": str(observation.id),
                "source": observation.provider,
                "sourceCode": observation.provider,
                "sourceType": "scientific",
                "summary": (
                    f"Precipitation {observation.precipitation_mm} mm; temperature {observation.temperature_c} °C; "
                    f"wind {observation.wind_ms} m/s"
                ),
                "lat": observation.lat,
                "lng": observation.lon,
                "geometry": None,
                "observedAt": observation.observed_at,
                "distanceKm": round(distance, 1),
                "minutesApart": round(abs((observation.observed_at - report.posted_at).total_seconds()) / 60),
                "reliability": None,
                "status": "OBSERVED",
                "classification": "POTENTIAL_CONTEXT",
                "note": "Proximity is context only; it is not automatic corroboration.",
            }
        )

    return sorted(evidence, key=lambda item: (item["distanceKm"], item["minutesApart"]))[:100]


def decide_report(
    db: Session,
    principal: Principal,
    report_id: UUID,
    action: str,
    reason: str,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
) -> Verification:
    permission = VERIFICATION_ACTION_PERMISSIONS.get(action)
    if permission is None:
        raise AppError("INVALID_ACTION", "Unknown report review action", 400)
    if not principal.has(permission):
        raise AppError("FORBIDDEN", f"Missing permission {permission}", 403)

    report = db.execute(
        select(Report).options(selectinload(Report.media)).where(Report.id == report_id).with_for_update()
    ).scalar_one_or_none()
    if report is None:
        raise AppError("REPORT_NOT_FOUND", "Report was not found", 404)
    source = db.get(Source, report.source_id)
    if source is None or source.source_type != "citizen":
        raise AppError("NOT_A_CITIZEN_REPORT", "Only citizen reports enter human review", 400)

    state = report.status.upper()
    target_status = {
        "start_review": "UNDER_REVIEW",
        "verify": "VERIFIED",
        "approve": "VERIFIED",
        "reject": "REJECTED",
        "request_evidence": "NEEDS_MORE_EVIDENCE",
        "escalate": "ESCALATED",
    }[action]
    prior_human_decision = db.execute(
        select(Verification)
        .where(Verification.report_id == report.id, Verification.decided_by.is_not(None))
        .order_by(Verification.decided_at.desc(), Verification.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if (
        state == target_status
        and target_status in {"VERIFIED", "REJECTED"}
        and prior_human_decision is not None
        and prior_human_decision.decision == target_status
    ):
        return prior_human_decision

    allowed_actions = {
        "RECEIVED": {"start_review"},
        "PROCESSING": {"start_review"},
        "AI_ANALYSIS_PENDING": {"start_review"},
        "AI_ANALYZED": {"start_review"},
        "PENDING_HUMAN_REVIEW": {"start_review"},
        "NEEDS_REVIEW": {"start_review"},
        "LOW_CONFIDENCE": {"start_review"},
        "NEEDS_MORE_EVIDENCE": {"start_review"},
        "ESCALATED": {"start_review", "verify", "approve", "reject", "request_evidence"},
        "UNDER_REVIEW": {"verify", "approve", "reject", "request_evidence", "escalate"},
        "VERIFIED": {"verify", "approve"},
    }
    if action not in allowed_actions.get(state, set()):
        raise AppError("INVALID_TRANSITION", f"Cannot {action} a report in {report.status}", 409)

    linked_event_ids = db.execute(
        select(EventReport.event_id).where(EventReport.report_id == report.id).order_by(EventReport.id)
    ).scalars().all()
    if len(linked_event_ids) > 1:
        raise AppError("REPORT_MULTIPLE_INCIDENTS", "Report is linked to multiple incidents", 409)
    event = db.get(Event, linked_event_ids[0]) if linked_event_ids else None
    if target_status == "VERIFIED" and event is None:
        location = report.place_text or report.city or report.district or report.state or "Unknown"
        event_type = report.event_type or "other"
        event = Event(
            title=f"{event_type} · {location}",
            event_type=event_type,
            lat=report.lat,
            lon=report.lon,
            h3_cell=cell(report.lat, report.lon) if report.lat is not None and report.lon is not None else None,
            state=report.state,
            district=report.district,
            city=report.city,
            started_at=report.posted_at,
            last_seen=report.posted_at,
            report_count=1,
            source_count=1,
            confidence=report.event_type_confidence or 0,
            status="VERIFIED",
            verification="verified",
            severity="medium",
            summary=report.text[:400],
            images=sum(media.media_type == "image" for media in report.media),
            videos=sum(media.media_type == "video" for media in report.media),
        )
        db.add(event)
        db.flush()
        db.add(EventReport(event_id=event.id, report_id=report.id))
    elif event is not None:
        event = db.execute(select(Event).where(Event.id == event.id).with_for_update()).scalar_one()

    prediction = db.execute(
        select(ModelPrediction).where(ModelPrediction.report_id == report.id).order_by(ModelPrediction.created_at.desc())
    ).scalars().first()
    now = datetime.now(UTC)
    before = {"status": report.status}
    report.status = target_status
    decision = Verification(
        event_id=event.id if event else None,
        report_id=report.id,
        decision=target_status,
        decided_by=UUID(principal.user_id) if _ok(principal.user_id) else None,
        decided_at=now,
        reason=reason,
        from_state=state,
        to_state=target_status,
        score=report.event_type_confidence,
        signals={
            "actor_role": principal.role,
            "evidence_considered": {
                "report_id": str(report.id),
                "media_ids": [str(media.id) for media in report.media],
                "model_prediction_id": str(prediction.id) if prediction else None,
                "linked_event_id": str(event.id) if event else None,
            },
        },
    )
    db.add(decision)
    other_human_approval = False
    if event is not None:
        other_human_approval = db.execute(
            select(Verification.id)
            .where(
                Verification.event_id == event.id,
                Verification.report_id != report.id,
                Verification.decided_by.is_not(None),
                Verification.decision.in_(["VERIFIED", "APPROVED"]),
            )
            .limit(1)
        ).first() is not None
        if target_status == "VERIFIED" or not other_human_approval:
            event.verification = target_status.casefold()
            event.status = target_status
            event.updated_at = now
    audit_service.record(
        db,
        action=f"verification.report.{action}",
        entity_type="Report",
        entity_id=str(report.id),
        actor_user_id=UUID(principal.user_id) if _ok(principal.user_id) else None,
        actor_name=principal.username,
        actor_role=principal.role,
        before=before,
        after={"status": target_status},
        reason=reason,
        ip=ip,
        user_agent=user_agent,
    )
    if report.submitted_by_user_id:
        notification_status = target_status.casefold()
        notify(
            db,
            user_id=report.submitted_by_user_id,
            ntype="VERIFICATION",
            title=f"Report {notification_status.replace('_', ' ')}",
            message=f"Your report status is now {notification_status.replace('_', ' ')}.",
            report_id=report.id,
        )
    db.commit()
    db.refresh(decision)
    if event is not None:
        emit(
            "EVENT_VERIFIED" if target_status == "VERIFIED" else "EVENT_UPDATED",
            {"event_id": str(event.id), "report_id": str(report.id), "verification": event.verification},
        )
        if target_status == "VERIFIED":
            bus.publish(get_settings().kafka_topic_events_verified, {"event_id": str(event.id)})
    return decision


def decide(
    db: Session,
    principal: Principal,
    event_id: UUID,
    action: str,
    reason: str,
    target_event_id: UUID | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> Verification:
    permission = VERIFICATION_ACTION_PERMISSIONS.get(action)
    if permission is None:
        raise AppError("INVALID_ACTION", "Unknown verification action", 400)
    if not principal.has(permission):
        raise AppError("FORBIDDEN", f"Missing permission {permission}", 403)

    event = db.execute(select(Event).where(Event.id == event_id).with_for_update()).scalar_one_or_none()
    if not event:
        raise AppError("EVENT_NOT_FOUND", "Event was not found", 404)
    before = {"status": event.status, "verification": event.verification}
    from_state = event.status
    mapping = {
        "start_review": ("UNDER_REVIEW", "under_review", "EVENT_UPDATED"),
        "approve": ("VERIFIED", "verified", "EVENT_VERIFIED"),
        "verify": ("VERIFIED", "verified", "EVENT_VERIFIED"),
        "reject": ("REJECTED", "rejected", "EVENT_REJECTED"),
        "request_evidence": ("NEEDS_MORE_EVIDENCE", "needs_more_evidence", "EVENT_UPDATED"),
        "merge": ("MERGED", "merged", "EVENT_MERGED"),
        "split": ("NEEDS_REVIEW", "needs_review", "EVENT_UPDATED"),
        "escalate": ("ESCALATED", "escalated", "EVENT_UPDATED"),
    }
    to_state, verification, ws = mapping[action]
    allowed_sources = {"NEEDS_REVIEW", "UNDER_REVIEW", "NEEDS_MORE_EVIDENCE", "ESCALATED"}
    if action not in {"merge", "split"} and event.status.upper() not in allowed_sources:
        raise AppError("INVALID_TRANSITION", f"Cannot {action} an event in {event.status}", 409)
    if action == "merge":
        if not target_event_id:
            raise AppError("TARGET_REQUIRED", "target_event_id is required to merge", 400)
        target = db.get(Event, target_event_id)
        if not target:
            raise AppError("EVENT_NOT_FOUND", "Target event was not found", 404)
        links = db.execute(select(EventReport).where(EventReport.event_id == event.id)).scalars().all()
        for link in links:
            link.event_id = target.id
        event.merged_into_id = target.id
        target.report_count = db.execute(
            select(EventReport).where(EventReport.event_id == target.id)
        ).scalars().all().__len__()  # noqa
    if action == "split":
        event.merged_into_id = None
    event.status = to_state
    event.verification = verification
    event.updated_at = datetime.now(UTC)
    human = {
        "start_review": "UNDER_REVIEW",
        "approve": "VERIFIED",
        "verify": "VERIFIED",
        "reject": "REJECTED",
        "request_evidence": "NEEDS_MORE_EVIDENCE",
        "merge": "MERGED",
        "split": "SPLIT",
        "escalate": "ESCALATED",
    }[action]
    report_ids = [
        link.report_id
        for link in db.execute(select(EventReport).where(EventReport.event_id == event.id)).scalars().all()
    ]
    row = Verification(
        event_id=event.id,
        decision=human,
        decided_by=UUID(principal.user_id) if _ok(principal.user_id) else None,
        decided_at=datetime.now(UTC),
        reason=reason,
        from_state=from_state,
        to_state=to_state,
        signals={
            "human_override": True,
            "actor_role": principal.role,
            "evidence_considered": {"report_ids": [str(report_id) for report_id in report_ids]},
            "disclaimer": "Human decision overrides automated recommendation.",
        },
        score=event.confidence,
    )
    db.add(row)
    audit_service.record(
        db,
        action=f"verification.{action}",
        entity_type="Event",
        entity_id=str(event.id),
        actor_user_id=UUID(principal.user_id) if _ok(principal.user_id) else None,
        actor_name=principal.username,
        actor_role=principal.role,
        before=before,
        after={"status": event.status, "verification": event.verification},
        reason=reason,
        ip=ip,
        user_agent=user_agent,
    )
    rids = [l.report_id for l in db.execute(select(EventReport).where(EventReport.event_id == event.id)).scalars().all()]
    reports = db.execute(select(Report).where(Report.id.in_(rids or [UUID(int=0)]))).scalars().all()
    for r in reports:
        if r.submitted_by_user_id:
            notify(
                db,
                user_id=r.submitted_by_user_id,
                ntype="VERIFICATION",
                title=f"Report {verification}",
                message=f"A verifier recorded: {action}. Reason: {reason}",
                report_id=r.id,
            )
    db.commit()
    db.refresh(row)
    emit(ws, {"event_id": str(event.id), "action": action})
    if action == "approve":
        bus.publish(get_settings().kafka_topic_events_verified, {"event_id": str(event.id)})
    return row


def _ok(v: str) -> bool:
    try:
        UUID(v)
        return True
    except Exception:
        return False
