from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.core.config import get_settings

ALLOWED_EVENT_CATEGORIES = {
    "flooding",
    "rainfall",
    "thunderstorm",
    "heatwave",
    "fog",
    "dust_storm",
    "strong_wind",
    "cyclone",
    "other",
}
REVIEW_PRIORITIES = {"low", "medium", "high", "critical"}


class AIAnalysisRequest(BaseModel):
    report_id: str
    report_text: str
    location: str | None = None
    event_type: str | None = None
    source_account: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIAnalysisPayload(BaseModel):
    status: Literal["completed", "failed", "disabled"] = "completed"
    event_category: str = "other"
    summary: str = ""
    location: str | None = None
    observed_time: str | None = None
    uncertainty: str = ""
    evidence_claims: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    duplicate_references: list[str] = Field(default_factory=list)
    review_priority: Literal["low", "medium", "high", "critical"] = "medium"
    provider: str = "disabled"
    model: str = "n/a"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    error: str | None = None
    processed_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    manual_review_available: bool = True

    @field_validator("event_category")
    @classmethod
    def validate_event_category(cls, value: str) -> str:
        return value if value in ALLOWED_EVENT_CATEGORIES else "other"

    @field_validator("review_priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        return value if value in REVIEW_PRIORITIES else "medium"

    @field_validator("evidence_claims", "missing_information", "duplicate_references")
    @classmethod
    def normalize_list(cls, value):
        if value is None:
            return []
        if not isinstance(value, list):
            return [str(value)]
        return [str(item) for item in value]


class BaseAIProvider:
    name: str = "disabled"

    def is_disabled(self) -> bool:
        return False

    def analyze(self, request: AIAnalysisRequest) -> AIAnalysisPayload:
        raise NotImplementedError


class DisabledAIProvider(BaseAIProvider):
    name = "disabled"

    def is_disabled(self) -> bool:
        return True

    def analyze(self, request: AIAnalysisRequest) -> AIAnalysisPayload:
        return AIAnalysisPayload(
            status="disabled",
            event_category="other",
            summary="AI analysis is disabled in this environment; manual review remains available.",
            location=request.location,
            uncertainty="AI provider is not configured.",
            provider=self.name,
            model="n/a",
            confidence=0.0,
            manual_review_available=True,
        )


class OpenAICompatibleProvider(BaseAIProvider):
    name = "openai_compatible"

    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = self.settings.ai_provider_base_url.strip()
        self.api_key = self.settings.ai_provider_api_key.strip()
        self.model = self.settings.ai_provider_model.strip() or "gpt-4o-mini"
        self.timeout = max(5, int(self.settings.ai_provider_timeout_seconds))

    def is_disabled(self) -> bool:
        return not bool(self.base_url and self.api_key)

    def analyze(self, request: AIAnalysisRequest) -> AIAnalysisPayload:
        if self.is_disabled():
            return DisabledAIProvider().analyze(request)
        system_prompt = (
            "You are a weather-intelligence assistant for disaster verification. "
            "Return only valid JSON matching the schema exactly. "
            "Do not perform privileged verification actions. "
            "Use the input as evidence, not as proof."
        )
        user_prompt = json.dumps(
            {
                "report_id": request.report_id,
                "text": request.report_text,
                "location": request.location,
                "event_type": request.event_type,
                "source_account": request.source_account,
                "metadata": request.metadata,
            },
            ensure_ascii=False,
        )
        body = {
            "model": self.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        "Analyze the report and produce structured output. "
                        "Fields: status, event_category, summary, location, observed_time, uncertainty, evidence_claims, "
                        "missing_information, duplicate_references, review_priority, provider, model, confidence, error. "
                        f"Report payload: {user_prompt}"
                    ),
                },
            ],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(f"{self.base_url.rstrip('/')}/chat/completions", headers=headers, json=body)
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeError(f"AI provider request failed: {exc}") from exc

        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        if isinstance(content, list):
            pieces = []
            for part in content:
                if isinstance(part, dict):
                    pieces.append(part.get("text", ""))
            content = "".join(pieces)
        if not isinstance(content, str):
            raise RuntimeError("AI provider response was missing valid content")
        cleaned = re.sub(r"^```(?:json)?\s*", "", content.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Unable to parse JSON from AI provider: {exc}") from exc
        payload = {**payload, "provider": self.name, "model": self.model, "status": "completed"}
        try:
            return AIAnalysisPayload.model_validate(payload)
        except ValidationError as exc:
            raise ValueError(f"AI provider returned invalid output: {exc}") from exc


def get_ai_provider() -> BaseAIProvider:
    settings = get_settings()
    if settings.ai_provider == "disabled":
        return DisabledAIProvider()
    if settings.ai_provider in {"openai", "openai_compatible", "generic"}:
        return OpenAICompatibleProvider()
    return DisabledAIProvider()
