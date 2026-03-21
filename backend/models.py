"""
Pydantic v2 models — exact mirrors of frontend/src/types.ts.
These are the strict serialization layer between Python processing and data.json.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional, Tuple
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import SQLModel as _SQLModel, Field as _Field


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

class RoutingTarget(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "routing_targets"
    id:             Optional[int] = _Field(default=None, primary_key=True)
    name:           str           = ""
    monthly_amount: float         = 0.0
    category:       str           = _Field(default="")
    priority:       int           = _Field(default=99)


class RoutingUpdate(BaseModel):
    targets: list[RoutingTarget]


class CategoryRow(BaseModel):
    id:             int
    name:           str
    monthly_budget: float


class CategoryCreate(BaseModel):
    name:           str
    monthly_budget: float = 0.0
    ledger_id:      int | None = None


class CategoryUpdate(BaseModel):
    name:           str | None = None
    monthly_budget: float | None = None


# ---------------------------------------------------------------------------
# Household profiles  (Phase 7 Step 1)
# ---------------------------------------------------------------------------

class UserProfile(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "userprofile"
    id:         Optional[int] = _Field(default=None, primary_key=True)
    name:       str           = ""
    is_primary: bool          = _Field(default=False)


class UserProfileUpdate(BaseModel):
    """Partial update for a UserProfile."""
    name:       str  | None = None
    is_primary: bool | None = None


class UserProfileCreate(BaseModel):
    """Payload for creating a new household member."""
    name: str


# ---------------------------------------------------------------------------
# Entity-Ledger Architecture  (Phase 7 Step 2)
# ---------------------------------------------------------------------------

class Ledger(_SQLModel, table=True):  # type: ignore[call-arg]
    """A financial workspace — Household, personal, or business."""
    __tablename__ = "ledger"
    id:   Optional[int] = _Field(default=None, primary_key=True)
    name: str           = ""
    type: str           = ""   # 'joint' | 'personal' | 'business'


class LedgerAccess(_SQLModel, table=True):  # type: ignore[call-arg]
    """Junction: which users can see which ledgers, and in what role."""
    __tablename__ = "ledgeraccess"
    user_id:   int = _Field(foreign_key="userprofile.id", primary_key=True)
    ledger_id: int = _Field(foreign_key="ledger.id",      primary_key=True)
    role:      str = _Field(default="viewer")   # 'admin' | 'viewer'


class LedgerTransfer(_SQLModel, table=True):  # type: ignore[call-arg]
    """Records money / debt movements between two ledgers."""
    __tablename__ = "ledgertransfer"
    id:             Optional[int] = _Field(default=None, primary_key=True)
    from_ledger_id: int           = _Field(foreign_key="ledger.id")
    to_ledger_id:   int           = _Field(foreign_key="ledger.id")
    amount:         float         = 0.0
    description:    str           = ""
    created_at:     datetime      = _Field(default_factory=datetime.utcnow)


class Notification(_SQLModel, table=True):  # type: ignore[call-arg]
    """In-app notification attached to a ledger."""
    __tablename__ = "notification"
    id:        Optional[int] = _Field(default=None, primary_key=True)
    ledger_id: int           = _Field(foreign_key="ledger.id")
    message:   str           = ""
    is_read:   bool          = _Field(default=False)


# Pydantic schemas for the Ledger API

class LedgerCreate(BaseModel):
    name:             str
    type:             str
    creator_user_id:  int


class LedgerShare(BaseModel):
    user_id: int
    role:    str = "viewer"


class LedgerMember(BaseModel):
    user_id: int
    name:    str
    role:    str   # 'admin' | 'viewer'


class LedgerWithMembers(BaseModel):
    id:      int
    name:    str
    type:    str
    members: list[LedgerMember]


# ---------------------------------------------------------------------------
# Retirement accounts  (Phase 6)
# ---------------------------------------------------------------------------

class RetirementAccount(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "retirement_accounts"
    id:                    Optional[int]   = _Field(default=None, primary_key=True)
    account_name:          str             = ""
    account_type:          str             = ""
    # ledger_id replaces user_id (Phase 7 Step 2). Financial data belongs to a Ledger.
    ledger_id:             Optional[int]   = _Field(default=None, foreign_key="ledger.id")
    annual_limit:          float           = 0.0
    ytd_contributions:     float           = _Field(default=0.0)
    employer_match_amount: Optional[float] = None
    employer_match_target: Optional[float] = None


class RetirementCreate(BaseModel):
    account_name:          str
    account_type:          str
    ledger_id:             int | None = None
    annual_limit:          float = Field(..., gt=0)
    ytd_contributions:     float = 0.0
    employer_match_amount: float | None = None
    employer_match_target: float | None = None


class RetirementUpdate(BaseModel):
    account_name:          str   | None = None
    account_type:          str   | None = None
    ledger_id:             int   | None = None
    annual_limit:          float | None = Field(None, gt=0)
    ytd_contributions:     float | None = None
    employer_match_amount: float | None = None
    employer_match_target: float | None = None


# ---------------------------------------------------------------------------
# Income sources  (Phase 7 Step 1)
# ---------------------------------------------------------------------------

class IncomeSource(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "incomesource"
    id:                      Optional[int] = _Field(default=None, primary_key=True)
    ledger_id:               Optional[int] = _Field(default=None, foreign_key="ledger.id")
    source_type:             str           = ""   # 'W2' | 'LLC' | '1099'
    gross_amount:            float         = _Field(default=0.0)
    estimated_withholdings:  float         = _Field(default=0.0)


class IncomeSourceCreate(BaseModel):
    ledger_id:              int | None = None
    source_type:            str
    gross_amount:           float = 0.0
    estimated_withholdings: float = 0.0


class IncomeSourceUpdate(BaseModel):
    """Partial update for an IncomeSource."""
    source_type:            str   | None = None
    gross_amount:           float | None = None
    estimated_withholdings: float | None = None


# ---------------------------------------------------------------------------
# Tax profile  (Phase 6 Step 2)
# ---------------------------------------------------------------------------

class TaxProfileUpdate(BaseModel):
    """Partial update for the singleton TaxProfile (id=1)."""
    filing_status:                  str   | None = None
    gross_w2_income:                float | None = None
    estimated_annual_withholdings:  float | None = None


class TaxEstimateResponse(BaseModel):
    """Full tax estimate breakdown returned by GET /api/tax/estimate."""
    filing_status:                  str
    gross_w2_income:                float
    pre_tax_retirement_deductions:  float   # sum of 401k + HSA ytd_contributions
    agi:                            float   # gross - pre_tax_retirement_deductions
    standard_deduction:             float   # 29200 for MFJ 2024
    taxable_income:                 float   # max(0, agi - standard_deduction)
    estimated_federal_tax:          float
    estimated_annual_withholdings:  float
    net_owed:                       float   # tax - withholdings; negative = refund


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


# ---------------------------------------------------------------------------
# SQLModel ORM table classes — additive (no existing Pydantic model displaced)
# ---------------------------------------------------------------------------

class Category(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "categories"
    id:             Optional[int] = _Field(default=None, primary_key=True)
    name:           str           = _Field(default="", unique=True)
    monthly_budget: float         = _Field(default=0.0)
    ledger_id:      Optional[int] = _Field(default=None, foreign_key="ledger.id")


class AccountHistoryRecord(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "accounts_history"
    id:      Optional[int] = _Field(default=None, primary_key=True)
    name:    str            = ""
    balance: float          = 0.0
    date:    str            = ""
    type:    str            = ""   # 'asset' | 'liability'


class AccountTermRecord(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "account_terms"
    account_name: str           = _Field(primary_key=True)
    apr:          float         = 0.0
    min_payment:  float         = 0.0
    display_name: Optional[str] = None


class TransactionRecord(_SQLModel, table=True):  # type: ignore[call-arg]
    """DB-layer model with full column names. Separate from the compact Transaction API model."""
    __tablename__ = "transactions"
    id:          Optional[int] = _Field(default=None, primary_key=True)
    date:        str           = ""
    merchant:    str           = ""
    category:    str           = ""
    account:     str           = ""
    amount:      float         = 0.0
    owner:       str           = ""   # kept for CSV compat; ledger_id is the canonical FK
    type:        str           = ""   # 'I'|'N'|'O'|'D'|'X'|'T'
    is_checking: int           = _Field(default=0)
    ledger_id:   Optional[int] = _Field(default=None, foreign_key="ledger.id")


class EquityGrantRecord(_SQLModel, table=True):  # type: ignore[call-arg]
    """DB-layer model. vesting_schedule stored as JSON string (see EquityGrant for typed API model)."""
    __tablename__ = "equity_grants"
    id:               Optional[int] = _Field(default=None, primary_key=True)
    ticker:           str           = ""
    grant_date:       str           = ""
    total_shares:     float         = 0.0
    vesting_schedule: str           = ""   # JSON: [{"date": "YYYY-MM-DD", "shares": 50.0}, ...]
    source:           str           = _Field(default="manual")
    ledger_id:        Optional[int] = _Field(default=None, foreign_key="ledger.id")


class TaxProfile(_SQLModel, table=True):  # type: ignore[call-arg]
    """Singleton row (id=1) — user-editable tax inputs."""
    __tablename__ = "tax_profiles"
    id:                            Optional[int] = _Field(default=None, primary_key=True)
    filing_status:                 str           = _Field(default="MFJ")
    gross_w2_income:               float         = _Field(default=0.0)
    estimated_annual_withholdings: float         = _Field(default=0.0)
