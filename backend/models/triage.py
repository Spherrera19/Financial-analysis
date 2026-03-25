"""Triage and routing models for account-to-ledger mapping and classification rules."""
from __future__ import annotations

from typing import Optional
from sqlmodel import SQLModel, Field


class AccountLedgerMap(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "account_ledger_map"
    id: Optional[int] = Field(default=None, primary_key=True)
    account_name: str = Field(unique=True, index=True)
    ledger_id: int = Field(foreign_key="ledger.id")


class ClassificationRule(SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "classification_rules"
    id: Optional[int] = Field(default=None, primary_key=True)
    merchant_pattern: str = Field(unique=True, index=True)
    assigned_category: str
    assigned_ledger_id: Optional[int] = Field(default=None, foreign_key="ledger.id")
    match_type: str = Field(default="contains")
