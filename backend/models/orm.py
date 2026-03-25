"""DB-layer ORM table classes — additive (no existing Pydantic model displaced)."""
from __future__ import annotations

from typing import Optional
from sqlmodel import SQLModel as _SQLModel, Field as _Field


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
    id:                Optional[int] = _Field(default=None, primary_key=True)
    date:              str           = ""
    merchant:          str           = ""
    category:          str           = ""
    account:           str           = ""
    amount:            float         = 0.0
    owner:             str           = ""   # kept for CSV compat; ledger_id is the canonical FK
    type:              str           = ""   # 'I'|'N'|'O'|'D'|'X'|'T'
    is_checking:       int           = _Field(default=0)
    ledger_id:         Optional[int] = _Field(default=None, foreign_key="ledger.id")
    status:            str           = _Field(default="cleared")
    original_merchant: Optional[str] = _Field(default=None)


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
