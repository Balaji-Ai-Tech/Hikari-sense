from __future__ import annotations

import hashlib
import io
import re
from datetime import timedelta
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from minio import Minio

from app.core.config import get_settings

SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
ALLOWED_MIME = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
    "image/gif": "image",
    "video/mp4": "video",
    "video/webm": "video",
    "video/quicktime": "video",
}
BUCKETS = ("raw", "media", "processed", "reports")


class ObjectStorage:
    def __init__(self) -> None:
        s = get_settings()
        self._local = Path(".data/storage")
        self._client: Minio | None = None
        try:
            self._client = Minio(
                s.minio_endpoint,
                access_key=s.minio_access_key,
                secret_key=s.minio_secret_key,
                secure=s.minio_secure,
            )
            for b in BUCKETS:
                if not self._client.bucket_exists(b):
                    self._client.make_bucket(b)
        except Exception:
            self._client = None
            for b in BUCKETS:
                (self._local / b).mkdir(parents=True, exist_ok=True)

    def put(self, bucket: str, data: bytes, content_type: str, suffix: str = "") -> str:
        key = f"{uuid4().hex}{suffix}"
        if self._client:
            self._client.put_object(
                bucket,
                key,
                io.BytesIO(data),
                length=len(data),
                content_type=content_type,
            )
            return f"s3://{bucket}/{key}"
        path = self._local / bucket / key
        path.write_bytes(data)
        return f"file://{bucket}/{key}"

    def signed_url(self, uri: str, minutes: int = 15) -> str:
        bucket, key = _split(uri)
        if self._client and uri.startswith("s3://"):
            return self._client.presigned_get_object(bucket, key, expires=timedelta(minutes=minutes))
        return f"/api/v1/media/local/{bucket}/{key}"

    def get_bytes(self, uri: str) -> bytes:
        bucket, key = _split(uri)
        if self._client and uri.startswith("s3://"):
            resp = self._client.get_object(bucket, key)
            try:
                return resp.read()
            finally:
                resp.close()
                resp.release_conn()
        return (self._local / bucket / key).read_bytes()


def _split(uri: str) -> tuple[str, str]:
    rest = uri.split("://", 1)[-1]
    bucket, _, key = rest.partition("/")
    return bucket, key


def safe_filename(name: str) -> str:
    base = Path(name.replace("\\", "/")).name
    cleaned = SAFE_NAME.sub("_", base)[:180]
    return cleaned or "upload.bin"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sniff_kind(content_type: str, filename: str) -> str | None:
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime in ALLOWED_MIME:
        return ALLOWED_MIME[mime]
    ext = Path(filename).suffix.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return "image"
    if ext in {".mp4", ".webm", ".mov"}:
        return "video"
    return None


_storage: ObjectStorage | None = None


def get_storage() -> ObjectStorage:
    global _storage
    if _storage is None:
        _storage = ObjectStorage()
    return _storage
