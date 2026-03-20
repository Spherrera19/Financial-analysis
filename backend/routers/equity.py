"""Equity routes: GET /api/equity, POST /api/equity/grants."""
from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.deps import get_raw_db
from backend.engine import build_equity_section
from backend.equity_engine import parse_brokerage_csv

router = APIRouter()


class VestTranche(BaseModel):
    date:   str    # YYYY-MM-DD
    shares: float


class NewEquityGrant(BaseModel):
    ticker:            str
    grant_date:        str    # YYYY-MM-DD
    total_shares:      float
    vesting_schedule:  list[VestTranche]


@router.post("/api/equity/grants")
def create_equity_grant(
    body: NewEquityGrant,
    conn: sqlite3.Connection = Depends(get_raw_db),
) -> JSONResponse:
    """
    Insert a new equity grant into equity_grants.
    vesting_schedule is stored as a JSON string of [{date, shares}, ...].
    Returns the new row's id on success.
    """
    if not body.vesting_schedule:
        raise HTTPException(status_code=400, detail="vesting_schedule must have at least one tranche.")

    schedule_json = json.dumps([
        {"date": t.date, "shares": t.shares}
        for t in body.vesting_schedule
    ])

    cursor = conn.execute(
        """
        INSERT INTO equity_grants (ticker, grant_date, total_shares, vesting_schedule)
        VALUES (?, ?, ?, ?)
        """,
        (body.ticker.upper().strip(), body.grant_date, body.total_shares, schedule_json),
    )
    conn.commit()

    return JSONResponse(
        status_code=201,
        content={"id": cursor.lastrowid, "ticker": body.ticker.upper().strip()},
    )


@router.get("/api/equity")
def get_equity(conn: sqlite3.Connection = Depends(get_raw_db)) -> JSONResponse:
    """
    Return upcoming vest events enriched with GBM price projections and
    30% tax withholding applied to all share counts.

    Stock history is fetched live from yfinance on each call.  The response
    includes three KPI scalars (total_unvested_value, next_vest_date,
    projected_net_cash_12m) plus the full upcoming_vests timeline array.
    """
    section = build_equity_section(conn)
    return JSONResponse(content=section.model_dump())
