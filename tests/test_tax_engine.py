"""Unit tests for the federal tax calculation engine."""
import pytest
from backend.tax_engine import calculate_federal_tax, STANDARD_DEDUCTION_MFJ


def test_standard_deduction_value():
    """Standard deduction for MFJ 2024 is $29,200."""
    assert STANDARD_DEDUCTION_MFJ == 29_200


def test_zero_income_yields_zero_tax():
    """No income → no tax."""
    result = calculate_federal_tax(gross_income=0.0, pre_tax_deductions=0.0)
    assert result == 0.0


def test_income_below_standard_deduction_yields_zero_tax():
    """Gross income less than the standard deduction → taxable income = 0 → no tax."""
    # gross=20000, deductions=0, AGI=20000, taxable=max(0, 20000-29200)=0
    result = calculate_federal_tax(gross_income=20_000.0, pre_tax_deductions=0.0)
    assert result == 0.0


def test_first_bracket_only():
    """Income entirely within the 10% bracket.

    gross=50000, pre_tax=0 → AGI=50000 → taxable=50000-29200=20800
    Tax = 20800 × 0.10 = 2080.00
    """
    result = calculate_federal_tax(gross_income=50_000.0, pre_tax_deductions=0.0)
    assert result == pytest.approx(2_080.00, rel=1e-4)


def test_two_bracket_income():
    """Income spanning the 10% and 12% brackets.

    gross=100000, pre_tax=0 → AGI=100000 → taxable=70800
    10%: 23200 × 0.10 = 2320.00
    12%: (70800 - 23200) × 0.12 = 47600 × 0.12 = 5712.00
    Total: 8032.00
    """
    result = calculate_federal_tax(gross_income=100_000.0, pre_tax_deductions=0.0)
    assert result == pytest.approx(8_032.00, rel=1e-4)


def test_three_bracket_income():
    """Income spanning 10%, 12%, and 22% brackets.

    gross=200000, pre_tax=0 → AGI=200000 → taxable=170800
    10%: 23200 × 0.10 = 2320.00
    12%: (94300 - 23200) × 0.12 = 71100 × 0.12 = 8532.00
    22%: (170800 - 94300) × 0.22 = 76500 × 0.22 = 16830.00
    Total: 27682.00
    """
    result = calculate_federal_tax(gross_income=200_000.0, pre_tax_deductions=0.0)
    assert result == pytest.approx(27_682.00, rel=1e-4)


def test_pre_tax_deductions_reduce_agi():
    """Pre-tax 401k/HSA deductions lower AGI before bracket calculation.

    gross=200000, pre_tax=23000 → AGI=177000 → taxable=147800
    10%: 23200 × 0.10 = 2320.00
    12%: (94300 - 23200) × 0.12 = 8532.00
    22%: (147800 - 94300) × 0.22 = 53500 × 0.22 = 11770.00
    Total: 22622.00
    """
    result = calculate_federal_tax(gross_income=200_000.0, pre_tax_deductions=23_000.0)
    assert result == pytest.approx(22_622.00, rel=1e-4)


def test_deductions_exceeding_gross_yields_zero_tax():
    """Pre-tax deductions larger than gross income clamp AGI at 0."""
    result = calculate_federal_tax(gross_income=50_000.0, pre_tax_deductions=60_000.0)
    assert result == 0.0


def test_high_income_all_brackets():
    """Income high enough to cross into the 37% bracket.

    gross=900000, pre_tax=0 → AGI=900000 → taxable=870800
    10%: 23200 × 0.10 = 2320.00
    12%: (94300 - 23200) × 0.12 = 71100 × 0.12 = 8532.00
    22%: (201050 - 94300) × 0.22 = 106750 × 0.22 = 23485.00
    24%: (383900 - 201050) × 0.24 = 182850 × 0.24 = 43884.00
    32%: (487450 - 383900) × 0.32 = 103550 × 0.32 = 33136.00
    35%: (731200 - 487450) × 0.35 = 243750 × 0.35 = 85312.50
    37%: (870800 - 731200) × 0.37 = 139600 × 0.37 = 51652.00
    Total: 248321.50
    """
    result = calculate_federal_tax(gross_income=900_000.0, pre_tax_deductions=0.0)
    assert result == pytest.approx(248_321.50, rel=1e-4)
