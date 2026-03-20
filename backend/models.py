"""
Pydantic v2 models — exact mirrors of frontend/src/types.ts.
These are the strict serialization layer between Python processing and data.json.
"""
from __future__ import annotations

from typing import Literal, Tuple
from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Primitive / shared
# ---------------------------------------------------------------------------

class Meta(BaseModel):
    generated_at: str
    as_of_date: str


class Summary(BaseModel):
    net_worth: float
    total_assets: float
    total_liabilities: float
    asset_count: int
    liability_count: int


class Account(BaseModel):
    name: str
    balance: float
    date: str
    type: Literal["asset", "liability"]


# "from" is a reserved keyword — serialise/deserialise via alias.
class SankeyFlow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(..., alias="from")
    to: str
    flow: float


# ---------------------------------------------------------------------------
# Period data (one per period key: current / last / past2 / quarter / year)
# ---------------------------------------------------------------------------

PeriodKey = Literal["current", "last", "past2", "quarter", "year"]


class CashFlowWaterfall(BaseModel):
    total_income:               float
    necessary_spending:         float   # necessities + min(dbt_total, sum_minimums)
    true_discretionary_income:  float   # max(0, total_income - necessary_spending)
    optional_spending:          float   # opt_total + oth_total (merged for bar width)
    opt_subtotal:               float   # opt_total alone (for tooltip sub-breakdown)
    oth_subtotal:               float   # oth_total alone (for tooltip sub-breakdown)
    extra_debt_payments:        float   # max(0, dbt_total - sum_minimums)
    unspent_free_cash:          float   # max(0, true_discretionary - optional - extra_debt)


class PeriodData(BaseModel):
    labels: list[str]
    income: list[float]
    spending: list[float]
    necessity: list[float]
    optional: list[float]
    other: list[float]
    debt: list[float]
    chk_income: list[float]
    chk_outflow: list[float]
    # [necessity, optional, debt, other]
    nec_opt_donut: Tuple[float, float, float, float]
    cat_labels: list[str]
    cat_values: list[float]
    src_labels: list[str]
    src_values: list[float]
    kpi_income: float
    kpi_spending: float
    kpi_net: float
    kpi_debt: float
    kpi_disposable: float
    sankey: list[SankeyFlow]
    cash_flow_waterfall: CashFlowWaterfall


# ---------------------------------------------------------------------------
# Debt section
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Equity / RSU  (Phase 5)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Budget & Routing  (Phase 4.5)
# ---------------------------------------------------------------------------

class RoutingTarget(BaseModel):
    id:             int | None = None   # None for new rows not yet in the DB
    name:           str
    monthly_amount: float
    category:       str
    priority:       int


class RoutingUpdate(BaseModel):
    targets: list[RoutingTarget]


class CategoryRow(BaseModel):
    id:             int
    name:           str
    monthly_budget: float


class CategoryCreate(BaseModel):
    name:           str
    monthly_budget: float = 0.0


class CategoryUpdate(BaseModel):
    name:           str | None = None
    monthly_budget: float | None = None


# ---------------------------------------------------------------------------
# Retirement accounts  (Phase 6)
# ---------------------------------------------------------------------------

class RetirementAccount(BaseModel):
    id:                    int
    account_name:          str
    account_type:          str
    owner:                 str
    annual_limit:          float
    ytd_contributions:     float
    employer_match_amount: float | None = None
    employer_match_target: float | None = None


class RetirementCreate(BaseModel):
    account_name:          str
    account_type:          str
    owner:                 str
    annual_limit:          float = Field(..., gt=0)
    ytd_contributions:     float = 0.0
    employer_match_amount: float | None = None
    employer_match_target: float | None = None


class RetirementUpdate(BaseModel):
    account_name:          str   | None = None
    account_type:          str   | None = None
    owner:                 str   | None = None
    annual_limit:          float | None = Field(None, gt=0)
    ytd_contributions:     float | None = None
    employer_match_amount: float | None = None
    employer_match_target: float | None = None


# ---------------------------------------------------------------------------
# Transaction  (compact field names match the TS interface exactly)
# ---------------------------------------------------------------------------

TransactionType = Literal["I", "N", "O", "D", "X", "T"]

class Transaction(BaseModel):
    d: str          # date YYYY-MM-DD
    m: str          # merchant
    c: str          # category
    a: str          # account (last 25 chars)
    v: float        # amount (neg = expense, pos = income)
    o: str          # owner
    t: TransactionType  # type code
    k: Literal[0, 1]   # 1 = checking account


# ---------------------------------------------------------------------------
# Top-level payload  (matches DashboardPayload in types.ts)
# ---------------------------------------------------------------------------

class DashboardPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    meta: Meta
    summary: Summary
    accounts: list[Account]
    periods: dict[PeriodKey, PeriodData]
    debt: DebtSection
    transactions: list[Transaction]
    summaries: dict[PeriodKey, str]

    def to_json(self, **kwargs) -> str:
        """Serialise to JSON, using aliases (so SankeyFlow emits 'from' not 'from_')."""
        return self.model_dump_json(by_alias=True, **kwargs)
