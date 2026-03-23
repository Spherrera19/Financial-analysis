"""Equity routes: GET /api/equity, POST /api/equity/grants."""
from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import Session

from backend.database import engine as _sa_engine
from backend.deps import get_db
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
    session: Session = Depends(get_db),
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

    result = session.execute(
        text("""
        INSERT INTO equity_grants (ticker, grant_date, total_shares, vesting_schedule, source)
        VALUES (:ticker, :grant_date, :total_shares, :vesting_schedule, :source)
        """),
        {
            "ticker":            body.ticker.upper().strip(),
            "grant_date":        body.grant_date,
            "total_shares":      body.total_shares,
            "vesting_schedule":  schedule_json,
            "source":            "manual",
        },
    )
    session.commit()
    # NOTE: session.execute(text(...)) returns CursorResult. Use result.lastrowid directly —
    # .cursor is None by the time the result is returned (cursor already closed by SQLAlchemy).
    return JSONResponse(
        status_code=201,
        content={"id": result.lastrowid, "ticker": body.ticker.upper().strip()},
    )


@router.get("/api/equity")
def get_equity(session: Session = Depends(get_db)) -> JSONResponse:
    """
    Return upcoming vest events enriched with GBM price projections and
    30% tax withholding applied to all share counts.

    Stock history is fetched live from yfinance on each call.  The response
    includes three KPI scalars (total_unvested_value, next_vest_date,
    projected_net_cash_12m) plus the full upcoming_vests timeline array.

    TODO: refactor build_equity_section() to accept Session when engine.py is migrated.
    Bridge: borrow a raw DBAPI connection from the SQLAlchemy pool for the legacy engine call.
    """
    raw = _sa_engine.raw_connection()
    raw.row_factory = sqlite3.Row
    try:
        section = build_equity_section(raw)
    finally:
        raw.close()
    return JSONResponse(content=section.model_dump())
