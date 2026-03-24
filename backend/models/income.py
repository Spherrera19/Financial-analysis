"""Income source models (Phase 7 Step 1)."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from sqlmodel import SQLModel as _SQLModel, Field as _Field


class IncomeSource(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "incomesource"
    id:                      Optional[int] = _Field(default=None, primary_key=True)
    ledger_id:               Optional[int] = _Field(default=None, foreign_key="ledger.id")
    source_type:             str           = ""   # 'W2' | 'LLC' | '1099'
    gross_amount:            float         = _Field(default=0.0)
    estimated_withholdings:  float         = _Field(default=0.0)


class IncomeSourceCreate(BaseModel):
    ledger_id:              int | None = None
    source_type:            str
    gross_amount:           float = 0.0
    estimated_withholdings: float = 0.0


class IncomeSourceUpdate(BaseModel):
    """Partial update for an IncomeSource."""
    source_type:            str   | None = None
    gross_amount:           float | None = None
    estimated_withholdings: float | None = None
