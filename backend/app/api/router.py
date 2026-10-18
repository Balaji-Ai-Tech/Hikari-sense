from fastapi import APIRouter

from app.api.v1 import (
    alerts,
    analytics,
    audit,
    ai_summary,
    auth,
    citizen,
    events,
    health,
    media,
    models as ml_models,
    notifications,
    reports,
    sources,
    stream,
    users,
    verification,
    weather,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(ai_summary.router, prefix="/api/v1")
api_router.include_router(auth.router, prefix="/api/v1")
api_router.include_router(events.router, prefix="/api/v1")
api_router.include_router(reports.router, prefix="/api/v1")
api_router.include_router(citizen.router, prefix="/api/v1")
api_router.include_router(verification.router, prefix="/api/v1")
api_router.include_router(alerts.router, prefix="/api/v1")
api_router.include_router(notifications.router, prefix="/api/v1")
api_router.include_router(analytics.router, prefix="/api/v1")
api_router.include_router(sources.router, prefix="/api/v1")
api_router.include_router(audit.router, prefix="/api/v1")
api_router.include_router(ml_models.router, prefix="/api/v1")
api_router.include_router(users.router, prefix="/api/v1")
api_router.include_router(stream.router, prefix="/api/v1")
api_router.include_router(media.router, prefix="/api/v1")
api_router.include_router(weather.router, prefix="/api/v1")
