from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SourceOut(BaseModel):
    id: str
    name: str
    kind: str
    status: str
    reliability: float
    throughput: str
    lastSync: str
    description: str
    health: str


class SourceHealthOut(BaseModel):
    source_id: UUID
    code: str
    status: str
    last_success: datetime | None
    last_failure: datetime | None
    latency_ms: float
    records_received: int
    records_processed: int
    error_count: int
    last_error: str | None
    is_live: bool
    note: str
