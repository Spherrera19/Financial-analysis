"""Tax profile and estimate routes: /api/tax/profile, /api/tax/estimate."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from backend.deps import get_db
from backend.models import RetirementAccount, TaxEstimateResponse, TaxProfile, TaxProfileUpdate
from backend.tax_engine import STANDARD_DEDUCTION_MFJ, calculate_federal_tax

router = APIRouter()

# Account types (lowercased) whose ytd_contributions reduce AGI (pre-tax only).
# Roth variants are after-tax and must never appear in this set.
_PRE_TAX_TYPES: frozenset[str] = frozenset({"401k", "hsa"})


@router.get("/api/tax/profile")
def get_tax_profile(session: Session = Depends(get_db)) -> JSONResponse:
    """Return the singleton TaxProfile (id=1)."""
    profile = session.get(TaxProfile, 1)
    if profile is None:
        raise HTTPException(status_code=404, detail="Tax profile not found.")
    return JSONResponse(content=profile.model_dump())


@router.put("/api/tax/profile")
def update_tax_profile(
    body: TaxProfileUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Partial update of the singleton TaxProfile (id=1)."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    profile = session.get(TaxProfile, 1)
    if profile is None:
        raise HTTPException(status_code=404, detail="Tax profile not found.")

    for field, value in updates.items():
        setattr(profile, field, value)

    session.add(profile)
    session.commit()
    session.refresh(profile)
    return JSONResponse(content=profile.model_dump())


@router.get("/api/tax/estimate")
def get_tax_estimate(session: Session = Depends(get_db)) -> JSONResponse:
    """
    Compute end-of-year federal tax estimate for MFJ filing status.

    Pre-tax deductions = sum of ytd_contributions for 401k and HSA accounts only
    (case-insensitive). Roth variants and all other account types are excluded
    because their contributions are after-tax and do not reduce AGI.
    """
    profile = session.get(TaxProfile, 1)
    if profile is None:
        raise HTTPException(status_code=404, detail="Tax profile not found.")

    accounts = session.exec(select(RetirementAccount)).all()
    pre_tax_deductions = sum(
        a.ytd_contributions
        for a in accounts
        if a.account_type.lower() in _PRE_TAX_TYPES
    )

    gross = profile.gross_w2_income
    agi = max(0.0, gross - pre_tax_deductions)
    taxable_income = max(0.0, agi - STANDARD_DEDUCTION_MFJ)
    estimated_tax = calculate_federal_tax(gross, pre_tax_deductions)
    net_owed = estimated_tax - profile.estimated_annual_withholdings

    result = TaxEstimateResponse(
        filing_status=profile.filing_status,
        gross_w2_income=gross,
        pre_tax_retirement_deductions=pre_tax_deductions,
        agi=agi,
        standard_deduction=STANDARD_DEDUCTION_MFJ,
        taxable_income=taxable_income,
        estimated_federal_tax=estimated_tax,
        estimated_annual_withholdings=profile.estimated_annual_withholdings,
        net_owed=net_owed,
    )
    return JSONResponse(content=result.model_dump())
