from fastapi import APIRouter

from app.core.database import ping_db
from app.core.redis import ping_redis

router = APIRouter(tags=["ops"])


@router.get("/api/v1/system/health")
def system_health():
    return {
        "postgres": ping_db(),
        "redis": ping_redis(),
        "problem_statement": "PS 26069",
        "note": "Kafka and MinIO are optional locally; PostgreSQL is the source of truth.",
    }
