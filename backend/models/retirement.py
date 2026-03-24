"""Retirement account models (Phase 6)."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field
from sqlmodel import SQLModel as _SQLModel, Field as _Field


class RetirementAccount(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "retirement_accounts"
    id:                    Optional[int]   = _Field(default=None, primary_key=True)
    account_name:          str             = ""
    account_type:          str             = ""
    # ledger_id replaces user_id (Phase 7 Step 2). Financial data belongs to a Ledger.
    ledger_id:             Optional[int]   = _Field(default=None, foreign_key="ledger.id")
    annual_limit:          float           = 0.0
    ytd_contributions:     float           = _Field(default=0.0)
    employer_match_amount: Optional[float] = None
    employer_match_target: Optional[float] = None


class RetirementCreate(BaseModel):
    account_name:          str
    account_type:          str
    ledger_id:             int | None = None
    annual_limit:          float = Field(..., gt=0)
    ytd_contributions:     float = 0.0
    employer_match_amount: float | None = None
    employer_match_target: float | None = None


class RetirementUpdate(BaseModel):
    account_name:          str   | None = None
    account_type:          str   | None = None
    ledger_id:             int   | None = None
    annual_limit:          float | None = Field(None, gt=0)
    ytd_contributions:     float | None = None
    employer_match_amount: float | None = None
    employer_match_target: float | None = None
