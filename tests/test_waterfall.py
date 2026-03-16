"""
Tests for waterfall math in backend/classify.py and backend/engine.py.
"""
import pytest
from backend.classify import get_minimum_payment_total, MINIMUM_PAYMENTS


# ── classify.py helpers ────────────────────────────────────────────────────

def test_minimum_payment_total_one_month():
    """Total for 1 month == sum of all values in MINIMUM_PAYMENTS."""
    expected = sum(MINIMUM_PAYMENTS.values())
    assert get_minimum_payment_total(1) == expected


def test_minimum_payment_total_scales_by_months():
    """Total scales linearly with number of months."""
    base = sum(MINIMUM_PAYMENTS.values())
    assert get_minimum_payment_total(3) == pytest.approx(base * 3)


def test_minimum_payment_total_zero_months():
    """Zero months produces 0."""
    assert get_minimum_payment_total(0) == 0.0


# ── waterfall math (pure functions, no DB needed) ──────────────────────────

def _compute_waterfall(
    kpi_income: float,
    nec_total: float,
    opt_total: float,
    oth_total: float,
    dbt_total: float,
    n_months: int = 1,
) -> dict:
    """
    Mirrors the waterfall computation in engine.py build_period().
    Keep in sync with that function.
    NOTE: _compute_waterfall is a local test helper defined here in the test file,
    not imported from engine.py. It only imports get_minimum_payment_total from classify.
    """
    from backend.classify import get_minimum_payment_total
    _min_total  = get_minimum_payment_total(n_months)
    extra_debt  = round(max(0.0, dbt_total - _min_total), 2)
    necessary   = round(nec_total + min(dbt_total, _min_total), 2)
    true_disc   = round(max(0.0, kpi_income - necessary), 2)
    opt_spend   = round(opt_total + oth_total, 2)
    unspent     = round(max(0.0, true_disc - opt_spend - extra_debt), 2)
    return dict(
        total_income=round(kpi_income, 2),
        necessary_spending=necessary,
        true_discretionary_income=true_disc,
        optional_spending=opt_spend,
        opt_subtotal=round(opt_total, 2),
        oth_subtotal=round(oth_total, 2),
        extra_debt_payments=extra_debt,
        unspent_free_cash=unspent,
    )


def test_no_debt_transactions():
    """When dbt_total == 0, extra_debt is 0 and necessary == nec_total only."""
    result = _compute_waterfall(
        kpi_income=5000.0,
        nec_total=2000.0,
        opt_total=500.0,
        oth_total=100.0,
        dbt_total=0.0,
    )
    assert result["extra_debt_payments"] == 0.0
    assert result["necessary_spending"] == 2000.0  # no debt contribution
    assert result["true_discretionary_income"] == pytest.approx(3000.0)
    assert result["optional_spending"] == pytest.approx(600.0)
    assert result["unspent_free_cash"] == pytest.approx(2400.0)


def test_debt_below_minimum():
    """When actual debt < minimum, extra_debt is 0; minimum is clamped to actual."""
    min_total = sum(MINIMUM_PAYMENTS.values())
    dbt_total = min_total / 2  # only half of minimum paid
    result = _compute_waterfall(
        kpi_income=5000.0,
        nec_total=2000.0,
        opt_total=300.0,
        oth_total=0.0,
        dbt_total=dbt_total,
    )
    assert result["extra_debt_payments"] == 0.0
    assert result["necessary_spending"] == pytest.approx(2000.0 + dbt_total, abs=0.01)


def test_debt_above_minimum():
    """When actual debt > minimum, the excess is extra_debt."""
    min_total = sum(MINIMUM_PAYMENTS.values())
    dbt_total = min_total + 200.0
    result = _compute_waterfall(
        kpi_income=5000.0,
        nec_total=2000.0,
        opt_total=300.0,
        oth_total=0.0,
        dbt_total=dbt_total,
    )
    assert result["extra_debt_payments"] == pytest.approx(200.0, abs=0.01)
    assert result["necessary_spending"] == pytest.approx(2000.0 + min_total, abs=0.01)


def test_unspent_never_negative():
    """unspent_free_cash floors at 0 even when spending exceeds discretionary."""
    result = _compute_waterfall(
        kpi_income=1000.0,
        nec_total=800.0,
        opt_total=500.0,  # way over discretionary
        oth_total=100.0,
        dbt_total=0.0,
    )
    assert result["unspent_free_cash"] == 0.0


def test_subtotals_sum_to_optional_spending():
    """opt_subtotal + oth_subtotal == optional_spending."""
    result = _compute_waterfall(
        kpi_income=5000.0,
        nec_total=2000.0,
        opt_total=400.0,
        oth_total=150.0,
        dbt_total=0.0,
    )
    assert result["opt_subtotal"] + result["oth_subtotal"] == pytest.approx(
        result["optional_spending"], abs=0.01
    )


def test_deficit_income_true_disc_clamps_at_zero():
    """When income < necessary spending, true_discretionary_income is 0, not negative."""
    result = _compute_waterfall(
        kpi_income=0.0,
        nec_total=500.0,
        opt_total=0.0,
        oth_total=0.0,
        dbt_total=0.0,
    )
    assert result["true_discretionary_income"] == 0.0
    assert result["unspent_free_cash"] == 0.0
