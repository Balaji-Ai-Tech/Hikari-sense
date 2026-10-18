from __future__ import annotations

import re
import time
from dataclasses import dataclass

from app.core.metrics import AI_LATENCY

CLASSES = (
    "rainfall",
    "flooding",
    "thunderstorm",
    "heatwave",
    "fog",
    "dust_storm",
    "strong_wind",
    "cyclone",
    "other",
)

# Frontend EventType mapping
TO_FRONTEND = {
    "rainfall": "heavy_rainfall",
    "flooding": "flood",
    "thunderstorm": "thunderstorm",
    "heatwave": "heatwave",
    "fog": "fog",
    "dust_storm": "dust_storm",
    "strong_wind": "strong_wind",
    "cyclone": "cyclone",
    "other": "heavy_rainfall",
}

RULES: list[tuple[str, tuple[str, ...]]] = [
    ("flooding", ("waterlogging", "water logged", "flood", "water entered", "knee-deep", "inundat", "overflow", "underpass closed", "बाढ़", "వరద", "வெள்ள")),
    ("rainfall", ("heavy rain", "downpour", "rainfall", "pours", "बारिश", "वर्षा", "వర్షం", "மழை", "বৃষ্টি")),
    ("thunderstorm", ("lightning", "thunder", "hail", "बिजली", "మెరుపు", "இடி")),
    ("heatwave", ("heatwave", "extreme heat", "temperature very high", "heat stroke", "लू", "వేడి", "வெயில்")),
    ("fog", ("dense fog", "visibility", "कोहरा", "పొగమంచు")),
    ("dust_storm", ("dust storm", "andhi", "aandhi", "धूल", "புழுதி")),
    ("strong_wind", ("strong wind", "tree fallen", "gale", "आंधी", "గాలి", "காற்று")),
    ("cyclone", ("cyclone", "landfall", "eye of the storm", "चक्रवात", "సుడిగాలి")),
]

SCRIPT_LANG = [
    (re.compile(r"[\u0900-\u097F]"), "hi"),
    (re.compile(r"[\u0C00-\u0C7F]"), "te"),
    (re.compile(r"[\u0B80-\u0BFF]"), "ta"),
    (re.compile(r"[\u0980-\u09FF]"), "bn"),
    (re.compile(r"[\u0A80-\u0AFF]"), "gu"),
    (re.compile(r"[\u0B00-\u0B7F]"), "or"),
    (re.compile(r"[\u0D00-\u0D7F]"), "ml"),
    (re.compile(r"[\u0A00-\u0A7F]"), "pa"),
]


@dataclass
class Classification:
    event_type: str
    confidence: float
    urgency: str
    suggested_team: str
    reason: str
    model_version: str
    language: str
    frontend_type: str
    disclaimer: str = "SUGGESTION ONLY — HUMAN REVIEWER MAKES THE FINAL DECISION."
    kind: str = "rules_baseline"


class WeatherClassifier:
    """Rules-based baseline. Not an ML model. Replace with MuRIL/XLM-R behind this interface."""

    model_version = "rules-baseline-v1"

    def detect_language(self, text: str) -> str:
        for rx, code in SCRIPT_LANG:
            if rx.search(text):
                return code
        return "en"

    def predict_text(self, text: str) -> Classification:
        t0 = time.perf_counter()
        blob = (text or "").lower()
        lang = self.detect_language(text or "")
        best: tuple[str, int, str] = ("other", 0, "no weather keywords")
        for label, kws in RULES:
            hits = [k for k in kws if k.lower() in blob]
            if len(hits) > best[1]:
                best = (label, len(hits), f"matched: {', '.join(hits[:4])}")
        label, n, reason = best
        conf = 0.35 if n == 0 else min(0.92, 0.55 + 0.12 * n)
        urgency = "critical" if label in {"flooding", "cyclone"} and n >= 2 else "high" if n else "low"
        team = {
            "flooding": "Urban flood cell",
            "cyclone": "Cyclone warning group",
            "heatwave": "Heat-health desk",
            "thunderstorm": "Nowcast desk",
        }.get(label, "General verification")
        AI_LATENCY.observe(time.perf_counter() - t0)
        return Classification(
            event_type=label,
            confidence=round(conf, 3),
            urgency=urgency,
            suggested_team=team,
            reason=reason,
            model_version=self.model_version,
            language=lang,
            frontend_type=TO_FRONTEND[label],
        )

    def predict_media(self, scene_label: str | None) -> Classification | None:
        if not scene_label:
            return None
        mapping = {
            "flood": "flooding",
            "waterlogging": "flooding",
            "hail": "thunderstorm",
            "dust haze": "dust_storm",
            "fog": "fog",
            "lightning": "thunderstorm",
        }
        label = mapping.get(scene_label.lower())
        if not label:
            return None
        return Classification(
            event_type=label,
            confidence=0.5,
            urgency="medium",
            suggested_team="Media review",
            reason=f"scene interface label={scene_label} (not a trained vision model)",
            model_version=self.model_version,
            language="und",
            frontend_type=TO_FRONTEND[label],
        )

    def predict(self, text: str, scene_label: str | None = None) -> Classification:
        text_pred = self.predict_text(text)
        media_pred = self.predict_media(scene_label)
        if media_pred and media_pred.event_type != "other" and text_pred.event_type == "other":
            return media_pred
        return text_pred


classifier = WeatherClassifier()
