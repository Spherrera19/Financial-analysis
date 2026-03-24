"""Equity / RSU models (Phase 5)."""
from __future__ import annotations

from pydantic import BaseModel


class StockScenarios(BaseModel):
    """Price projection for a single future date under three GBM outcomes."""
    current_price:         float   # spot price at time of calculation
    average:               float   # median path: drift-adjusted, volatility-neutral
    best:                  float   # +1σ outcome at target date
    worst:                 float   # -1σ outcome at target date
    annualized_volatility: float   # σ used in the projection (e.g. 0.32 = 32%)


class VestEvent(BaseModel):
    """One tranche in a vesting schedule, optionally enriched with price scenarios."""
    date:      str                      # YYYY-MM-DD
    shares:    float
    scenarios: StockScenarios | None = None   # populated by equity_engine at runtime


class EquityGrant(BaseModel):
    """Mirrors the equity_grants SQLite table; vesting_schedule is fully typed."""
    id:               int | None = None
    ticker:           str
    grant_date:       str                   # YYYY-MM-DD
    total_shares:     float
    vesting_schedule: list[VestEvent]


class EquityVestSummary(BaseModel):
    """A single upcoming vest event enriched with GBM projections and 30% tax withholding."""
    date:                  str     # YYYY-MM-DD
    ticker:                str
    gross_shares:          float   # shares per the grant schedule
    net_shares:            float   # gross * 0.70 after 30% withholding
    current_value:         float   # net_shares × current spot price
    projected_avg:         float   # net_shares × GBM median price at vest date
    projected_best:        float   # net_shares × GBM +1σ price at vest date
    projected_worst:       float   # net_shares × GBM -1σ price at vest date
    annualized_volatility: float   # historical σ used in projection (e.g. 0.28 = 28%)
    days_until_vest:       int


class EquitySection(BaseModel):
    """Top-level payload returned by GET /api/equity."""
    total_unvested_value:   float                        = 0.0
    next_vest_date:         str | None                   = None
    projected_net_cash_12m: float                        = 0.0
    upcoming_vests:         list[EquityVestSummary]      = []


# --- DTOs migrated from routers/equity.py ---

class VestTranche(BaseModel):
    date:   str    # YYYY-MM-DD
    shares: float


class NewEquityGrant(BaseModel):
    ticker:            str
    grant_date:        str    # YYYY-MM-DD
    total_shares:      float
    vesting_schedule:  list[VestTranche]
