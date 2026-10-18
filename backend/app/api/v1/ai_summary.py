import httpx

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, ValidationError
from starlette.concurrency import run_in_threadpool

from app.api.deps import Db
from app.core.config import get_settings
from app.core.redis import rate_hit
from app.services.disaster_summary import (
    GeminiAccessDenied,
    GeminiModelUnavailable,
    GeminiQuotaExceeded,
    create_disaster_summary,
)

router = APIRouter(tags=["ai"])


class DisasterSummaryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


@router.post("/ai/analyze")
async def analyze_disaster_summary(request: Request, db: Db):
    client_ip = request.client.host if request.client else "unknown"
    allowed, _ = rate_hit(f"ai:disaster-summary:{client_ip}", limit=5, window_sec=60)
    if not allowed:
        raise HTTPException(
            429,
            "AI summary rate limit reached. Retry in a minute.",
            headers={"Retry-After": "60"},
        )

    max_bytes = get_settings().ai_summary_max_request_bytes
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > max_bytes:
        raise HTTPException(413, "Request body is too large.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > max_bytes:
            raise HTTPException(413, "Request body is too large.")
    try:
        DisasterSummaryRequest.model_validate_json(bytes(body))
    except ValidationError:
        raise HTTPException(422, "Request body must be an empty JSON object.") from None

    try:
        return await run_in_threadpool(create_disaster_summary, db)
    except GeminiQuotaExceeded:
        raise HTTPException(
            429,
            "Gemini free-tier quota or rate limit reached. Check project limits in AI Studio before retrying.",
            headers={"Retry-After": "60"},
        ) from None
    except GeminiModelUnavailable:
        model = get_settings().gemini_model
        raise HTTPException(
            503,
            f"Configured Gemini model '{model}' is unavailable to this API key. Confirm access in AI Studio or set GEMINI_MODEL explicitly.",
        ) from None
    except GeminiAccessDenied:
        raise HTTPException(
            503,
            "Gemini rejected this API key. Confirm the key and model access in Google AI Studio.",
        ) from None
    except RuntimeError as exc:
        if str(exc) == "Gemini is not configured.":
            raise HTTPException(503, "AI summaries are not configured. Set GEMINI_API_KEY on the backend.") from None
        raise HTTPException(502, "Gemini summary provider failed. Retry later.") from None
    except httpx.TimeoutException:
        raise HTTPException(504, "Gemini summary request timed out. Retry later.") from None