"""
Phase 3, Step 2 — Debt Snowball / Avalanche Forecaster
=======================================================
Pure Python simulation engine — no Pandas, no DB access.
Designed for Phase 4 FastAPI migration: build_projection() returns a
DebtProjection Pydantic model that can be returned directly from a route.

Run standalone:
    python -c "from backend.debt_engine import build_projection; print(build_projection([]))"
"""
from __future__ import annotations

from typing import Literal

from backend.classify import MINIMUM_PAYMENTS, guess_interest_rate
from backend.models import DebtAccount, DebtProjection, PayoffScenario

# ---------------------------------------------------------------------------
# Mock APR overrides (Phase 3 placeholder — replaced by DB/Plaid in Phase 5)
# Keys are lowercase substrings that may appear in actual account names.
# ---------------------------------------------------------------------------

MOCK_APRS: dict[str, float] = {
    "chase sapphire": 0.24,
    "amex":           0.19,
}

MAX_SIMULATION_MONTHS = 600  # 50-year safety cap; prevents infinite loops


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_apr_for_account(account_name: str) -> float:
    """
    Return the annual percentage rate (as a decimal, e.g. 0.24) for an account.

    Priority:
    1. Substring match against MOCK_APRS keys (case-insensitive).
    2. Fallback: guess_interest_rate() / 100.0 (returns percentage — divide to normalise).
    """
    lower = account_name.lower()
    for mock_key, apr in MOCK_APRS.items():
        if mock_key in lower:
            return apr
    return guess_interest_rate(account_name) / 100.0


def _get_min_payment(account_name: str, balance: float) -> float:
    """
    Return the minimum monthly payment for an account.

    Priority:
    1. Substring match against MINIMUM_PAYMENTS (case-insensitive, from classify.py).
    2. Fallback: 1% of current balance.
    """
    lower = account_name.lower()
    for key, amount in MINIMUM_PAYMENTS.items():
        if key in lower:
            return amount
    return round(balance * 0.01, 2)


# ---------------------------------------------------------------------------
# Core simulation
# ---------------------------------------------------------------------------

def simulate_payoff(
    accounts: list[DebtAccount],
    monthly_allocation: float,
    strategy: Literal["snowball", "avalanche"],
) -> PayoffScenario:
    """
    Simulate month-by-month debt payoff.

    Snowball  — target the lowest balance first (fastest psychological win).
    Avalanche — target the highest APR first (lowest total interest paid).

    Each month:
      1. Apply compound interest to every account.
      2. Make minimum payments on every account.
      3. Apply any remaining allocation to the current target account.
      4. Remove fully paid accounts.
      5. Record total remaining balance in monthly_balances.

    Stops when all balances reach zero or MAX_SIMULATION_MONTHS is hit.
    """
    # Build a mutable working list (only accounts with a non-trivial balance)
    working: list[dict] = [
        {
            "name": a.name,
            "balance": abs(a.balance),   # engine works with positive numbers internally
            "apr": get_apr_for_account(a.name),
        }
        for a in accounts
        if abs(a.balance) > 0.01
    ]

    if not working:
        return PayoffScenario(payoff_months=0, total_interest_paid=0.0, monthly_balances=[])

    # Sort determines which account is "targeted" first
    if strategy == "snowball":
        working.sort(key=lambda a: a["balance"])             # ascending balance
    else:
        working.sort(key=lambda a: a["apr"], reverse=True)   # descending APR

    total_interest = 0.0
    monthly_balances: list[float] = []

    for _ in range(MAX_SIMULATION_MONTHS):
        # Step 1: Apply monthly interest to all accounts
        for acct in working:
            monthly_rate = acct["apr"] / 12.0
            interest = acct["balance"] * monthly_rate
            acct["balance"] += interest
            total_interest += interest

        # Step 2: Apply minimum payments to all accounts
        remaining = monthly_allocation
        for acct in working:
            min_pmt = _get_min_payment(acct["name"], acct["balance"])
            payment = min(min_pmt, acct["balance"])
            acct["balance"] = max(0.0, acct["balance"] - payment)
            remaining -= payment

        # Step 3: Apply remaining allocation to the current target (first non-zero)
        remaining = max(0.0, remaining)
        for acct in working:
            if acct["balance"] > 0 and remaining > 0:
                payment = min(remaining, acct["balance"])
                acct["balance"] = max(0.0, acct["balance"] - payment)
                remaining -= payment
                break  # snowball/avalanche: one target per month

        # Step 4: Remove paid-off accounts (under $0.01 = effectively zero)
        working = [a for a in working if a["balance"] > 0.01]

        # Step 5: Record total remaining balance
        monthly_balances.append(round(sum(a["balance"] for a in working), 2))

        # Step 6: Exit when all accounts are paid off
        if not working:
            break

    return PayoffScenario(
        payoff_months=len(monthly_balances),
        total_interest_paid=round(total_interest, 2),
        monthly_balances=monthly_balances,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_projection(
    accounts: list[DebtAccount],
    monthly_allocation: float = 2000.0,
) -> DebtProjection:
    """
    Run both strategies and return a single DebtProjection.

    Phase 4: return this directly from a FastAPI route — no rewrite needed.

    monthly_allocation defaults to $2,000 (Phase 3 deliberate placeholder).
    Phase 4 will derive this from the current-period waterfall fields:
        unspent_free_cash + extra_debt_payments + sum(MINIMUM_PAYMENTS.values())
    """
    return DebtProjection(
        snowball=simulate_payoff(accounts, monthly_allocation, "snowball"),
        avalanche=simulate_payoff(accounts, monthly_allocation, "avalanche"),
        monthly_allocation=monthly_allocation,
    )
