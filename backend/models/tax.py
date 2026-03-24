"""Tax profile models (Phase 6 Step 2)."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from sqlmodel import SQLModel as _SQLModel, Field as _Field


class TaxProfile(_SQLModel, table=True):  # type: ignore[call-arg]
    """Singleton row (id=1) — user-editable tax inputs."""
    __tablename__ = "tax_profiles"
    id:                            Optional[int] = _Field(default=None, primary_key=True)
    filing_status:                 str           = _Field(default="MFJ")
    gross_w2_income:               float         = _Field(default=0.0)
    estimated_annual_withholdings: float         = _Field(default=0.0)


class TaxProfileUpdate(BaseModel):
    """Partial update for the singleton TaxProfile (id=1)."""
    filing_status:                  str   | None = None
    gross_w2_income:                float | None = None
    estimated_annual_withholdings:  float | None = None


class TaxEstimateResponse(BaseModel):
    """Full tax estimate breakdown returned by GET /api/tax/estimate."""
    filing_status:                  str
    gross_w2_income:                float
    pre_tax_retirement_deductions:  float   # sum of 401k + HSA ytd_contributions
    agi:                            float   # gross - pre_tax_retirement_deductions
    standard_deduction:             float   # 29200 for MFJ 2024
    taxable_income:                 float   # max(0, agi - standard_deduction)
    estimated_federal_tax:          float
    estimated_annual_withholdings:  float
    net_owed:                       float   # tax - withholdings; negative = refund
