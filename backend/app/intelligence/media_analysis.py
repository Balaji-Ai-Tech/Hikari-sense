from __future__ import annotations

import io
from typing import Any

from app.core.storage import sha256_bytes


def perceptual_hash(data: bytes) -> str | None:
    try:
        from PIL import Image
        import imagehash
    except ImportError:
        return None
    try:
        img = Image.open(io.BytesIO(data))
        return str(imagehash.phash(img))
    except Exception:
        return None


def extract_exif(data: bytes) -> dict[str, Any]:
    try:
        from PIL import Image
        from PIL.ExifTags import GPSTAGS, TAGS
    except ImportError:
        return {}
    try:
        img = Image.open(io.BytesIO(data))
        raw = img.getexif()
        out: dict[str, Any] = {}
        for k, v in raw.items():
            name = TAGS.get(k, str(k))
            if name in {"Make", "Model", "DateTime", "Software"}:
                out[name] = str(v)
        return out
    except Exception:
        return {}


def analyze_image(data: bytes) -> dict[str, Any]:
    digest = sha256_bytes(data)
    phash = perceptual_hash(data)
    exif = extract_exif(data)
    return {
        "sha256": digest,
        "phash": phash,
        "exif": exif or None,
        "scene_label": None,  # vision model not deployed
        "authenticity": "unknown",
        "kind": "image",
    }


def analyze_video(data: bytes, filename: str) -> dict[str, Any]:
    digest = sha256_bytes(data)
    return {
        "sha256": digest,
        "phash": None,
        "exif": {"filename": filename, "bytes": len(data), "note": "frame sampling requires ffmpeg; not run"},
        "scene_label": None,
        "authenticity": "unknown",
        "kind": "video",
        "max_frames": 8,
        "sample_fps": 1,
    }


def malware_scan_hook(_data: bytes, _filename: str) -> bool:
    """Extension point for ClamAV / content scanning. Returns True if allowed."""
    return True
