from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from app.core.config import get_settings


def normalize_text(text: str) -> str:
    t = text.lower().strip()
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"[#@]\w+", " ", t)
    t = re.sub(r"[^\w\s\u0900-\u0D7F]", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def text_hash(text: str) -> str:
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


def shingles(text: str, n: int = 3) -> set[str]:
    toks = normalize_text(text).split()
    if len(toks) < n:
        return set(toks)
    return {" ".join(toks[i : i + n]) for i in range(len(toks) - n + 1)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def hamming(a: str, b: str) -> int:
    if not a or not b or len(a) != len(b):
        return 64
    return sum(x != y for x, y in zip(a, b, strict=True))


def cosine_bow(a: str, b: str) -> float:
    fa: dict[str, int] = {}
    fb: dict[str, int] = {}
    for t in normalize_text(a).split():
        fa[t] = fa.get(t, 0) + 1
    for t in normalize_text(b).split():
        fb[t] = fb.get(t, 0) + 1
    keys = set(fa) | set(fb)
    if not keys:
        return 0.0
    dot = sum(fa.get(k, 0) * fb.get(k, 0) for k in keys)
    na = sum(v * v for v in fa.values()) ** 0.5
    nb = sum(v * v for v in fb.values()) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@dataclass
class DupHit:
    kind: str  # exact_text | exact_media | near_text | near_media
    other_id: str | None
    score: float
    recycled: bool = False


def compare_text(a: str, b: str) -> DupHit | None:
    s = get_settings()
    if text_hash(a) == text_hash(b) and a.strip():
        return DupHit("exact_text", None, 1.0)
    jac = jaccard(shingles(a), shingles(b))
    cos = cosine_bow(a, b)
    if jac >= s.near_dup_jaccard or cos >= s.near_dup_cosine:
        return DupHit("near_text", None, max(jac, cos))
    return None


def compare_phash(a: str | None, b: str | None) -> DupHit | None:
    if not a or not b:
        return None
    s = get_settings()
    d = hamming(a, b)
    if d <= s.phash_hamming_max:
        return DupHit("near_media", None, 1 - d / 64, recycled=True)
    return None
