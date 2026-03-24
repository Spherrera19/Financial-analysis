"""Debt section models."""
from __future__ import annotations

from pydantic import BaseModel


class DebtAccount(BaseModel):
    name: str
    balance: float
    rate: float


class DebtTrend(BaseModel):
    labels: list[str]
    values: list[float]


class PayoffScenario(BaseModel):
    payoff_months: int              # months until total balance reaches 0
    total_interest_paid: float      # cumulative interest paid across all accounts
    monthly_balances: list[float]   # total remaining debt each month (for sparkline)


class DebtProjection(BaseModel):
    snowball: PayoffScenario
    avalanche: PayoffScenario
    monthly_allocation: float       # cash dedicated to debt per month (for display)


class DebtSection(BaseModel):
    accounts: list[DebtAccount]
    trend: DebtTrend
    projection: DebtProjection      # NEW — required field


# --- DTOs migrated from routers/debt.py ---

class AccountTerm(BaseModel):
    account_name: str           # full original name — PRIMARY KEY in account_terms
    apr: float                  # decimal, e.g. 0.24 for 24%
    min_payment: float          # fixed monthly minimum in dollars
    display_name: str | None = None  # user nickname; None = show full name


class DebtSettingsUpdate(BaseModel):
    terms: list[AccountTerm]
