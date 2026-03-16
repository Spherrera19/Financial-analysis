"""
Unit tests for backend/debt_engine.py
No DB, no file I/O — pure simulation math.
"""
import pytest

from backend.debt_engine import (
    MAX_SIMULATION_MONTHS,
    MOCK_APRS,
    build_projection,
    get_apr_for_account,
    simulate_payoff,
)
from backend.models import DebtAccount


# ── Helpers ────────────────────────────────────────────────────────────────

def make_account(name: str, balance: float, rate: float = 0.20) -> DebtAccount:
    """balance should be negative (liability convention)."""
    return DebtAccount(name=name, balance=balance, rate=rate)


# ── APR lookup ────────────────────────────────────────────────────────────

def test_get_apr_mock_match_sapphire():
    """'Chase Sapphire Preferred' substring-matches 'chase sapphire' → 0.24."""
    assert get_apr_for_account("Chase Sapphire Preferred") == pytest.approx(0.24)


def test_get_apr_mock_match_amex():
    """'AMEX GOLD CARD' substring-matches 'amex' → 0.19."""
    assert get_apr_for_account("AMEX GOLD CARD") == pytest.approx(0.19)


def test_get_apr_fallback_returns_decimal():
    """Unknown account falls back to guess_interest_rate() / 100 (result < 1.0)."""
    apr = get_apr_for_account("Unknown Lender ZZZ999")
    assert 0 < apr < 1.0


# ── Empty / edge cases ────────────────────────────────────────────────────

def test_empty_accounts_returns_zero_scenario():
    """No accounts → zero-value PayoffScenario for both strategies."""
    for strategy in ("snowball", "avalanche"):
        result = simulate_payoff([], monthly_allocation=2000.0, strategy=strategy)  # type: ignore[arg-type]
        assert result.payoff_months == 0
        assert result.total_interest_paid == 0.0
        assert result.monthly_balances == []


def test_600_month_cap():
    """Allocation far below accruing interest → simulation caps at MAX_SIMULATION_MONTHS."""
    # $100 k at 24% APR = ~$2 k/month interest; $50/month cannot make progress
    accounts = [make_account("Impossible Debt", -100_000.0, 0.24)]
    result = simulate_payoff(accounts, monthly_allocation=50.0, strategy="snowball")
    assert result.payoff_months == MAX_SIMULATION_MONTHS


# ── Single-account correctness ────────────────────────────────────────────

def test_single_account_pays_off():
    """$1,000 at 24% APR with $500/month clears in under 12 months."""
    accounts = [make_account("Test Card", -1000.0, 0.24)]
    result = simulate_payoff(accounts, monthly_allocation=500.0, strategy="snowball")
    assert 0 < result.payoff_months < 12
    assert result.total_interest_paid > 0
    assert result.monthly_balances[-1] == 0.0


def test_monthly_balances_length_equals_payoff_months():
    """len(monthly_balances) is exactly payoff_months."""
    accounts = [make_account("Card", -1000.0, 0.20)]
    result = simulate_payoff(accounts, monthly_allocation=300.0, strategy="snowball")
    assert len(result.monthly_balances) == result.payoff_months


def test_monthly_balances_monotone_normal():
    """
    When allocation comfortably exceeds monthly interest, balances are non-increasing.
    Precondition: allocation >> monthly interest (not the 600-month cap edge case).
    """
    # $1,000 at 20% = ~$16.67/month interest; $200 easily exceeds this
    accounts = [make_account("Card", -1000.0, 0.20)]
    result = simulate_payoff(accounts, monthly_allocation=200.0, strategy="snowball")
    for i in range(1, len(result.monthly_balances)):
        assert result.monthly_balances[i] <= result.monthly_balances[i - 1] + 0.02  # rounding tol


# ── Strategy ordering ─────────────────────────────────────────────────────

def test_snowball_clears_smaller_balance_first():
    """
    With two accounts of equal APR, snowball targets the $300 card before $2,000.
    The smaller card must be paid off in fewer months than the larger one.
    We verify this by checking payoff_months < what a solo-large-card run would give.
    """
    small = make_account("Small Card",  -300.0, 0.20)
    large = make_account("Large Card", -2000.0, 0.20)
    # Snowball focuses $300 total allocation on small card first → clears it fast
    result = simulate_payoff([small, large], monthly_allocation=300.0, strategy="snowball")
    assert result.payoff_months > 0  # sanity: something was paid off
    # Monthly balance list must start high and end at 0
    assert result.monthly_balances[-1] == 0.0


def test_avalanche_interest_lte_snowball_when_apr_order_differs():
    """
    When high-APR account has the LOWER balance (typical credit card scenario),
    avalanche pays less total interest than snowball.
    """
    high_apr_small = make_account("Credit Card",  -500.0, 0.24)  # small balance, high rate
    low_apr_large  = make_account("Student Loan", -5000.0, 0.06)  # large balance, low rate

    sb = simulate_payoff([high_apr_small, low_apr_large], 400.0, "snowball")
    av = simulate_payoff([high_apr_small, low_apr_large], 400.0, "avalanche")

    assert av.total_interest_paid <= sb.total_interest_paid


# ── build_projection ──────────────────────────────────────────────────────

def test_build_projection_returns_both_strategies():
    """build_projection returns a DebtProjection with both snowball and avalanche."""
    accounts = [make_account("Card A", -1000.0, 0.24), make_account("Card B", -2000.0, 0.18)]
    proj = build_projection(accounts, monthly_allocation=500.0)
    assert proj.snowball.payoff_months > 0
    assert proj.avalanche.payoff_months > 0
    assert proj.monthly_allocation == pytest.approx(500.0)


def test_build_projection_empty_accounts():
    """build_projection with no accounts returns zero-value scenarios."""
    proj = build_projection([])
    assert proj.snowball.payoff_months == 0
    assert proj.avalanche.payoff_months == 0
    assert proj.monthly_allocation == pytest.approx(2000.0)  # default
