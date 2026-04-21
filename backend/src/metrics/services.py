from datetime import datetime
from uuid import UUID, uuid4

from bson import Binary
from fastapi import HTTPException, status

from db.db import get_db

from .schemas import (
    MetricCreateSchema,
    MetricInDBSchema,
    MetricResponseSchema,
    MetricUpdateSchema,
    AddValueSchema
)

COLLECTION = "metrics"


# ---------- helpers -----------------------------------------------------------

def _uuid_to_bin(uid: UUID) -> Binary:
    return Binary(uid.bytes, 3)

def _bin_to_uuid(val) -> UUID:
    if isinstance(val, (bytes, Binary)):
        raw = bytes(val)
        if len(raw) == 16:
            return UUID(bytes=raw)
        return UUID(raw.decode("ascii"))
    return UUID(str(val))

def _doc_to_response(doc: dict) -> MetricResponseSchema:
    return MetricResponseSchema(
        id=_bin_to_uuid(doc["_id"]),
        patient_id=_bin_to_uuid(doc["patient_id"]),
        title=doc["title"],
        description=doc.get("description", ""),
        values=doc.get("values", []),
        created_at=doc["created_at"],
    )

# ---------- services ----------------------------------------------------------

def add_metric_service(
    payload: MetricCreateSchema,
    current_user_id: UUID,
) -> MetricResponseSchema:
    db_doc = MetricInDBSchema(**payload.model_dump())
    document = db_doc.model_dump()
    document["_id"] = _uuid_to_bin(db_doc.id)
    document["patient_id"] = _uuid_to_bin(db_doc.patient_id)
    del document["id"]

    db = get_db()
    db[COLLECTION].insert_one(document)

    return MetricResponseSchema(**db_doc.model_dump())


def get_metric_by_id_service(
    metric_id: UUID,
    current_user_id: UUID,
) -> MetricResponseSchema:
    db = get_db()
    doc = db[COLLECTION].find_one({"_id": _uuid_to_bin(metric_id)})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Metric not found."
        )

    if _bin_to_uuid(doc["patient_id"]) != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied."
        )

    return _doc_to_response(doc)


def get_all_my_metrics_service(
    current_user_id: UUID,
    skip: int = 0,
    limit: int = 20,
) -> list[MetricResponseSchema]:
    db = get_db()
    query = {"patient_id": _uuid_to_bin(current_user_id)}
    docs = db[COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(limit)
    return [_doc_to_response(doc) for doc in docs]


def update_metric_service(
    metric_id: UUID,
    payload: MetricUpdateSchema,
    current_user_id: UUID,
) -> MetricResponseSchema:
    db = get_db()
    doc = db[COLLECTION].find_one({"_id": _uuid_to_bin(metric_id)})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Metric not found."
        )

    if _bin_to_uuid(doc["patient_id"]) != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied."
        )

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update."
        )

    db[COLLECTION].update_one(
        {"_id": _uuid_to_bin(metric_id)},
        {"$set": updates},
    )

    updated = db[COLLECTION].find_one({"_id": _uuid_to_bin(metric_id)})
    return _doc_to_response(updated)


def add_metric_value_service(
    metric_id: UUID,
    payload: AddValueSchema,
    current_user_id: UUID,
) -> MetricResponseSchema:
    db = get_db()
    doc = db[COLLECTION].find_one({"_id": _uuid_to_bin(metric_id)})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Metric not found."
        )

    if _bin_to_uuid(doc["patient_id"]) != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied."
        )

    new_val = {
        "value": payload.value,
        "date": payload.date if payload.date else datetime.now()
    }

    db[COLLECTION].update_one(
        {"_id": _uuid_to_bin(metric_id)},
        {"$push": {"values": new_val}}
    )

    updated = db[COLLECTION].find_one({"_id": _uuid_to_bin(metric_id)})
    return _doc_to_response(updated)


def delete_metric_service(
    metric_id: UUID,
    current_user_id: UUID,
) -> dict:
    db = get_db()
    doc = db[COLLECTION].find_one({"_id": _uuid_to_bin(metric_id)})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Metric not found."
        )

    if _bin_to_uuid(doc["patient_id"]) != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied."
        )

    db[COLLECTION].delete_one({"_id": _uuid_to_bin(metric_id)})
    return {"detail": "Metric deleted successfully."}
