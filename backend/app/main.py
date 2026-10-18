from __future__ import annotations

import time

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response

from app.api.router import api_router
from app.core import database as database_module
from app.core.config import get_settings
from app.core.errors import AppError, RequestIdMiddleware, app_error_handler, http_error_handler, unhandled_handler
from app.core.logging import configure_logging
from app.core.metrics import ERROR_COUNT, REQUEST_COUNT, REQUEST_LATENCY, metrics_payload
from app.core.redis import ping_redis
from fastapi import HTTPException

import app.models  # noqa: F401  — register metadata

settings = get_settings()
configure_logging(settings.environment)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="HIKARI SENSE API",
    description=(
        "PS 26069 — National Weather Big Data Analytics Platform "
        "(Ministry of Earth Sciences / India Meteorological Department). "
        "Team: The WIND BREAKERS. Architecture: Connectors → Kafka → Python processing "
        "(Flink for later scale-out) → NLP/Vision interfaces → Dedup/clustering → "
        "Verification → PostgreSQL/PostGIS → FastAPI/WebSocket."
    ),
    version="0.1.0",
    contact={"name": "The WIND BREAKERS"},
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(HTTPException, http_error_handler)
app.add_exception_handler(Exception, unhandled_handler)
app.include_router(api_router)


@app.middleware("http")
async def metrics_mw(request: Request, call_next):  # type: ignore[no-untyped-def]
    start = time.perf_counter()
    response: Response = await call_next(request)
    path = request.url.path
    if path not in {"/metrics", "/health", "/ready"}:
        REQUEST_COUNT.labels(request.method, path, str(response.status_code)).inc()
        REQUEST_LATENCY.labels(request.method, path).observe(time.perf_counter() - start)
        if response.status_code >= 500:
            ERROR_COUNT.labels("http_5xx").inc()
    return response


@app.on_event("startup")
def startup() -> None:
    if settings.environment in {"development", "test"}:
        try:
            database_module.Base.metadata.create_all(bind=database_module.engine)
        except Exception as exc:  # pragma: no cover - runtime-only safety
            logger.warning("database_startup_init_failed", extra={"error": str(exc)})


@app.get("/health", tags=["ops"])
def health():
    return {
        "status": "ok",
        "service": "hikari-sense",
        "problem_statement": "PS 26069",
        "environment": settings.environment,
    }


@app.get("/ready", tags=["ops"])
def ready():
    db_ok = database_module.engine.dialect.name == "postgresql" and database_module.ping_db()
    redis_ok = ping_redis()
    ready_ok = db_ok and redis_ok
    payload = {"status": "ready" if ready_ok else "degraded", "postgres": db_ok, "redis": redis_ok, "kafka": "optional"}
    return JSONResponse(content=payload, status_code=200 if ready_ok else 503)


@app.get("/metrics", tags=["ops"])
def metrics():
    body, ctype = metrics_payload()
    return Response(content=body, media_type=ctype)
