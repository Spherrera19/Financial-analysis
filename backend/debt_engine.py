"""
Phase 3, Step 2 — Debt Snowball / Avalanche Forecaster
=======================================================
Pure Python simulation engine — no Pandas, no DB access.
DB-sourced APR/min-payment overrides are passed in as a pre-fetched dict
(db_terms) from engine.py, keeping this module free of DB imports.

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

# Type alias: truncated account_name → (apr as decimal, min_payment in $)
DbTerms = dict[str, tuple[float, float]]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_apr_for_account(
    account_name: str,
    db_terms: "DbTerms | None" = None,
) -> float:
    """
    Return the annual percentage rate (as a decimal, e.g. 0.24) for an account.

    Priority:
    1. Exact match against db_terms keys (DB-saved user configuration).
    2. Substring match against db_terms keys.
    3. Substring match against MOCK_APRS keys (case-insensitive).
    4. Fallback: guess_interest_rate() / 100.0.
    """
    if db_terms:
        if account_name in db_terms:
            return db_terms[account_name][0]
        lower = account_name.lower()
        for saved_name, (apr, _) in db_terms.items():
            if saved_name.lower() in lower or lower in saved_name.lower():
                return apr

    lower = account_name.lower()
    for mock_key, apr in MOCK_APRS.items():
        if mock_key in lower:
            return apr
    return guess_interest_rate(account_name) / 100.0


def get_default_min_payment(account_name: str) -> float:
    """
    Return the known minimum payment from MINIMUM_PAYMENTS, or 0.0 if unknown.
    No balance-based fallback — used for settings display defaults only.
    """
    lower = account_name.lower()
    for key, amount in MINIMUM_PAYMENTS.items():
        if key in lower:
            return amount
    return 0.0


def _get_min_payment(
    account_name: str,
    balance: float,
    db_terms: "DbTerms | None" = None,
) -> float:
    """
    Return the minimum monthly payment for an account.

    Priority:
    1. Exact match against db_terms (DB-saved user configuration).
    2. Substring match against MINIMUM_PAYMENTS (case-insensitive).
    3. Fallback: 1% of current balance.
    """
    if db_terms and account_name in db_terms:
        return db_terms[account_name][1]
    lower = account_name.lower()
    for key, amount in MINIMUM_PAYMENTS.items():
        if key in lower:
            return amount
    return round(abs(balance) * 0.01, 2)


# ---------------------------------------------------------------------------
# Core simulation
# ---------------------------------------------------------------------------

def simulate_payoff(
    accounts: list[DebtAccount],
    monthly_allocation: float,
    strategy: Literal["snowball", "avalanche"],
    db_terms: "DbTerms | None" = None,
) -> PayoffScenario:
    """
    Simulate month-by-month debt payoff.

    Snowball  — target the lowest balance first (fastest psychological win).
    Avalanche — target the highest APR first (lowest total interest paid).

    APR comes from DebtAccount.rate (pre-resolved by engine.py via db_terms).
    Min payments check db_terms first, then MINIMUM_PAYMENTS, then 1% fallback.
    """
    # Build a mutable working list (only accounts with a non-trivial balance)
    working: list[dict] = [
        {
            "name": a.name,
            "balance": abs(a.balance),
            "apr": a.rate,   # already resolved in engine.py using db_terms
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
            min_pmt = _get_min_payment(acct["name"], acct["balance"], db_terms)
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
    db_terms: "DbTerms | None" = None,
) -> DebtProjection:
    """
    Run both strategies and return a single DebtProjection.

    db_terms: pre-fetched from account_terms table by engine.py.
              Keys are truncated account names (last 28 chars), matching
              DebtAccount.name. Values are (apr_decimal, min_payment_dollars).
    """
    return DebtProjection(
        snowball=simulate_payoff(accounts, monthly_allocation, "snowball", db_terms),
        avalanche=simulate_payoff(accounts, monthly_allocation, "avalanche", db_terms),
        monthly_allocation=monthly_allocation,
    )
