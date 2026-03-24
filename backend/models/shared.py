"""Primitive / shared models used across the domain."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Meta(BaseModel):
    generated_at: str
    as_of_date: str


class Summary(BaseModel):
    net_worth: float
    total_assets: float
    total_liabilities: float
    asset_count: int
    liability_count: int


class Account(BaseModel):
    name: str
    balance: float
    date: str
    type: Literal["asset", "liability"]


# "from" is a reserved keyword — serialise/deserialise via alias.
class SankeyFlow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(..., alias="from")
    to: str
    flow: float


PeriodKey = Literal["current", "last", "past2", "quarter", "year"]
