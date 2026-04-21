import os
from typing import List, Optional
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .schemas import (
    MetricCreateSchema,
    MetricResponseSchema,
    MetricUpdateSchema,
    AddValueSchema
)
from .services import (
    add_metric_service,
    get_metric_by_id_service,
    get_all_my_metrics_service,
    update_metric_service,
    delete_metric_service,
    add_metric_value_service
)


bearer_scheme = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UUID:
    """
    Decode the Bearer JWT and return the user's UUID (maps to patient_id).
    Raises 401 if the token is missing, expired, or invalid.
    """
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("No subject in token.")
        return UUID(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


router = APIRouter(prefix="/api/metrics", tags=["Metrics"])


@router.post(
    "/add",
    response_model=MetricResponseSchema,
    status_code=status.HTTP_201_CREATED,
)
def add_metric(
    payload: MetricCreateSchema,
    current_user_id: UUID = Depends(get_current_user),
):
    """
    Create a new metric tracking item.
    """
    return add_metric_service(payload, current_user_id)


@router.get("/", response_model=List[MetricResponseSchema])
def get_all_my_metrics(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user_id: UUID = Depends(get_current_user),
):
    """
    Retrieve all metrics for the current user.
    """
    return get_all_my_metrics_service(current_user_id, skip=skip, limit=limit)


@router.get("/{metric_id}", response_model=MetricResponseSchema)
def get_metric(
    metric_id: UUID,
    current_user_id: UUID = Depends(get_current_user),
):
    """
    Retrieve a specific metric by ID.
    """
    return get_metric_by_id_service(metric_id, current_user_id)


@router.put("/update/{metric_id}", response_model=MetricResponseSchema)
def update_metric(
    metric_id: UUID,
    payload: MetricUpdateSchema,
    current_user_id: UUID = Depends(get_current_user),
):
    """
    Update a metric's details.
    """
    return update_metric_service(metric_id, payload, current_user_id)


@router.post("/add_value/{metric_id}", response_model=MetricResponseSchema)
def add_metric_value(
    metric_id: UUID,
    payload: AddValueSchema,
    current_user_id: UUID = Depends(get_current_user),
):
    """
    Add a new value (e.g. blood sugar reading) to a metric.
    """
    return add_metric_value_service(metric_id, payload, current_user_id)


@router.delete("/delete/{metric_id}", status_code=status.HTTP_200_OK)
def delete_metric(
    metric_id: UUID,
    current_user_id: UUID = Depends(get_current_user),
):
    """
    Delete a metric.
    """
    return delete_metric_service(metric_id, current_user_id)
