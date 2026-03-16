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


class DebtSection(BaseModel):
    accounts: list[DebtAccount]
    trend: DebtTrend


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
