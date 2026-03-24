"""Top-level payload (matches DashboardPayload in types.ts)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .shared import Meta, Summary, Account, PeriodKey
from .period import PeriodData
from .debt import DebtSection
from .transaction import Transaction


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
