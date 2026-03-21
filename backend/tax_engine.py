"""
Federal income tax estimator for the Finance Dashboard.

Supports Married Filing Jointly (MFJ) filing status with 2024 IRS brackets.
All bracket thresholds and the standard deduction are hardcoded constants —
update them here each year.

Usage:
    from backend.tax_engine import calculate_federal_tax
    tax = calculate_federal_tax(gross_income=200_000, pre_tax_deductions=23_000)
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# 2024 IRS constants — MFJ
# ---------------------------------------------------------------------------

STANDARD_DEDUCTION_MFJ: float = 29_200.0

# (upper_bound, marginal_rate) — last entry is float('inf') for the top bracket
_MFJ_BRACKETS: list[tuple[float, float]] = [
    (23_200.0,       0.10),
    (94_300.0,       0.12),
    (201_050.0,      0.22),
    (383_900.0,      0.24),
    (487_450.0,      0.32),
    (731_200.0,      0.35),
    (float("inf"),   0.37),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_federal_tax(gross_income: float, pre_tax_deductions: float) -> float:
    """
    Estimate federal income tax owed for MFJ filing status.

    Args:
        gross_income:       Total W2 gross income before any deductions.
        pre_tax_deductions: Pre-tax retirement contributions (401k, HSA, etc.)
                            that reduce AGI before the standard deduction.

    Returns:
        Estimated total federal tax owed (float, always >= 0).
    """
    agi = max(0.0, gross_income - pre_tax_deductions)
    taxable_income = max(0.0, agi - STANDARD_DEDUCTION_MFJ)

    total_tax = 0.0
    prev_upper = 0.0

    for upper, rate in _MFJ_BRACKETS:
        if taxable_income <= prev_upper:
            break
        bracket_amount = min(taxable_income, upper) - prev_upper
        total_tax += bracket_amount * rate
        prev_upper = upper

    return total_tax
