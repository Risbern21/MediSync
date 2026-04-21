from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ValueSchema(BaseModel):
    date: datetime = Field(default_factory=datetime.now)
    value: float


class MetricCreateSchema(BaseModel):
    patient_id: UUID
    title: str = Field(..., max_length=100)
    description: str = Field(..., max_length=500)
    values: List[ValueSchema] = Field(default_factory=list)


class MetricUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    values: Optional[List[ValueSchema]] = None


class MetricResponseSchema(BaseModel):
    id: UUID
    patient_id: UUID
    title: str
    description: str
    values: List[ValueSchema]
    created_at: datetime

    model_config = {"from_attributes": True}


class MetricInDBSchema(MetricCreateSchema):
    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=datetime.now)


class AddValueSchema(BaseModel):
    value: float
    date: Optional[datetime] = None
