from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import Db, require
from app.core.security import Principal
from app.services.source_service import health_rows, list_sources

router = APIRouter(tags=["sources"])


@router.get("/sources")
def sources(db: Db, _: Annotated[Principal, Depends(require("sources:read"))]):
    return list_sources(db)


@router.get("/sources/health")
def source_health(db: Db, _: Annotated[Principal, Depends(require("sources:read"))]):
    return health_rows(db)
