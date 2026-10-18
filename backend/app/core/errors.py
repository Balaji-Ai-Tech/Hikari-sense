from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import uuid


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details: Any = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def error_body(code: str, message: str, request_id: str, details: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message, "request_id": request_id}
    if details is not None:
        err["details"] = details
    return {"error": err}


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    rid = getattr(request.state, "request_id", str(uuid.uuid4()))
    return JSONResponse(error_body(exc.code, exc.message, rid, exc.details), status_code=exc.status_code)


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    rid = getattr(request.state, "request_id", str(uuid.uuid4()))
    code = "HTTP_ERROR"
    if exc.status_code == 401:
        code = "UNAUTHORIZED"
    elif exc.status_code == 403:
        code = "FORBIDDEN"
    elif exc.status_code == 404:
        code = "NOT_FOUND"
    elif exc.status_code == 429:
        code = "RATE_LIMITED"
    return JSONResponse(
        error_body(code, str(exc.detail), rid),
        status_code=exc.status_code,
        headers=exc.headers,
    )


async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    rid = getattr(request.state, "request_id", str(uuid.uuid4()))
    return JSONResponse(error_body("INTERNAL_ERROR", "An unexpected error occurred", rid), status_code=500)
