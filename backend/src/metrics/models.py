from datetime import datetime
from typing import List
from uuid import UUID, uuid4


class Value:
    date: datetime
    value: float


class Metric:
    id: UUID
    title: str
    description: str
    values: List[Value]

    def __init__(self):
        self.id = uuid4()
