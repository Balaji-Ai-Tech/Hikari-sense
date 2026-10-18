from __future__ import annotations

import time
from dataclasses import dataclass, asdict

from app.core.config import get_settings
from app.core.metrics import VERIFICATION_LATENCY
from app.core.security import ROLE_RELIABILITY

W_S, W_C, W_G, W_T, W_M = 0.25, 0.25, 0.20, 0.15, 0.15


@dataclass
class Signals:
    source_reliability: float
    corroboration: float
    spatial_consistency: float
    temporal_consistency: float
    media_authenticity: float
    official_boost: float
    recycled_cap_applied: bool
    score: float
    auto_decision: str
    disclaimer: str = "SUGGESTION ONLY — HUMAN REVIEWER MAKES THE FINAL DECISION."


def score_event(
    *,
    source_types: list[str],
    unique_sources: int,
    report_count: int,
    spatial_spread_km: float | None,
    time_span_hours: float | None,
    media_authenticity_avg: float,
    official_agree: bool,
    recycled_image: bool,
) -> Signals:
    t0 = time.perf_counter()
    s = get_settings()
    rels = [ROLE_RELIABILITY.get(t, 0.4) for t in source_types] or [0.4]
    S = sum(rels) / len(rels)
    C = min(1.0, 0.2 * unique_sources + 0.1 * max(0, report_count - 1))
    if spatial_spread_km is None:
        G = 0.4
    elif spatial_spread_km <= s.cluster_radius_km:
        G = 0.9
    elif spatial_spread_km <= s.cluster_radius_km * 2:
        G = 0.55
    else:
        G = 0.25
    if time_span_hours is None:
        T = 0.4
    elif time_span_hours <= s.cluster_window_hours:
        T = 0.9
    elif time_span_hours <= s.cluster_window_hours * 2:
        T = 0.5
    else:
        T = 0.25
    M = media_authenticity_avg
    raw = W_S * S + W_C * C + W_G * G + W_T * T + W_M * M
    boost = s.official_corroboration_boost if official_agree else 0.0
    raw = min(1.0, raw + boost)
    capped = False
    if recycled_image:
        raw = min(raw, s.recycled_image_score_cap)
        capped = True
    if raw >= s.auto_verify_threshold:
        decision = "AUTO_VERIFIED"
    elif raw >= s.needs_review_threshold:
        decision = "NEEDS_REVIEW"
    else:
        decision = "LOW_CONFIDENCE"
    VERIFICATION_LATENCY.observe(time.perf_counter() - t0)
    return Signals(S, C, G, T, M, boost, capped, round(raw, 4), decision)


def to_frontend_verification(auto: str, human: str | None = None) -> str:
    if human == "APPROVED":
        return "verified"
    if human == "REJECTED":
        return "rejected"
    if human == "MERGED":
        return "merged"
    return {
        "AUTO_VERIFIED": "corroborated",
        "NEEDS_REVIEW": "needs_review",
        "LOW_CONFIDENCE": "low_confidence",
    }.get(auto, "needs_review")
