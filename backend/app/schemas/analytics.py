from pydantic import BaseModel


class SeriesPoint(BaseModel):
    t: str
    v: float


class NamedCount(BaseModel):
    name: str
    value: float


class FunnelStep(BaseModel):
    stage: str
    count: int
