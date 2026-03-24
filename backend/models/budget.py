"""Budget & Routing models (Phase 4.5)."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from sqlmodel import SQLModel as _SQLModel, Field as _Field


class RoutingTarget(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "routing_targets"
    id:             Optional[int] = _Field(default=None, primary_key=True)
    name:           str           = ""
    monthly_amount: float         = 0.0
    category:       str           = _Field(default="")
    priority:       int           = _Field(default=99)


class RoutingUpdate(BaseModel):
    targets: list[RoutingTarget]


class CategoryRow(BaseModel):
    id:             int
    name:           str
    monthly_budget: float


class CategoryCreate(BaseModel):
    name:           str
    monthly_budget: float = 0.0
    ledger_id:      int | None = None


class CategoryUpdate(BaseModel):
    name:           str | None = None
    monthly_budget: float | None = None
