from typing import Annotated
from uuid import UUID
import mimetypes

from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.deps import Db, get_principal
from app.core.security import Principal
from app.core.storage import get_storage, safe_filename
from app.models.report import Media
from app.models.source import Source

router = APIRouter(tags=["media"])


@router.get("/media/{media_id}")
def read_media(
    media_id: UUID,
    db: Db,
    principal: Annotated[Principal, Depends(get_principal)],
):
    media = db.get(Media, media_id)
    if media is None:
        raise HTTPException(404, "Media was not found")
    report = media.report
    source = db.get(Source, report.source_id)
    owned = (
        str(report.submitted_by_user_id) == principal.user_id
        or report.source_account == principal.username
    )
    may_read = (owned and principal.has("media:read:own")) or principal.has("media:read:review") or principal.has(
        "media:read:ai"
    )
    if source and source.source_type == "citizen" and not may_read:
        raise HTTPException(403, "Missing permission to read this citizen media")
    if source and source.source_type != "citizen" and not (
        principal.has("evidence:read") or principal.has("media:read:review")
    ):
        raise HTTPException(403, "Missing permission to read this media")
    content = get_storage().get_bytes(media.uri)
    media_type = mimetypes.guess_type(media.filename or "")[0] or "application/octet-stream"
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'inline; filename="{safe_filename(media.filename or "evidence")}"',
            "X-Content-Type-Options": "nosniff",
        },
    )