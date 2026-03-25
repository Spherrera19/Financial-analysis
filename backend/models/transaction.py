"""Transaction models (compact field names match the TS interface exactly)."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


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
    status: str = Field(default="cleared")
    original_merchant: str | None = Field(default=None)
