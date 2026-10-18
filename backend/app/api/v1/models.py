from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import Db, require
from app.core.security import Principal
from app.models.model_version import ModelVersion

router = APIRouter(tags=["ml"])


@router.get("/models")
def list_models(db: Db, _: Annotated[Principal, Depends(require("ml:read"))]):
    rows = db.execute(select(ModelVersion)).scalars().all()
    return [
        {
            "model_name": r.model_name,
            "model_version": r.model_version,
            "dataset_version": r.dataset_version,
            "accuracy": r.accuracy,
            "precision": r.precision,
            "recall": r.recall,
            "f1": r.f1,
            "latency": r.latency_ms,
            "drift": r.drift,
            "training_date": r.training_date,
            "deployment_status": r.deployment_status,
            "notes": r.notes,
            "metrics_available": r.accuracy is not None,
        }
        for r in rows
    ]
