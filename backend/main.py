"""
Phase 4 — FastAPI Backend Wrapper
===================================
Wraps the existing engine + Pydantic pipeline into a live local API.

Run via start.bat or manually:
    uvicorn backend.main:app --reload
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.database import init_db
from backend.engine import (
    build_accounts,
    build_debt_section,
    build_period,
    build_summary,
    get_period_months,
    get_recent_transactions,
)
from backend.models import DashboardPayload, Meta, PeriodKey
from generate_dashboard import compute_ai_summary

DIR     = Path(__file__).parent.parent
DB_PATH = DIR / "finance.db"

PERIOD_KEYS: list[PeriodKey] = ["current", "last", "past2", "quarter", "year"]

app = FastAPI(title="Finance Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/dashboard")
def get_dashboard() -> JSONResponse:
    """
    Build the full DashboardPayload from SQLite and return it as JSON.
    Assumes the database has already been populated by refresh.bat / ingest.py.
    Uses payload.to_json() (by_alias=True) to ensure SankeyFlow emits 'from'
    not 'from_', matching the TypeScript contract.
    """
    conn = init_db(DB_PATH)
    try:
        summary  = build_summary(conn)
        accounts = build_accounts(conn)
        debt     = build_debt_section(conn)
        txs      = get_recent_transactions(conn)
        periods: dict[PeriodKey, object] = {
            pk: build_period(conn, pk) for pk in PERIOD_KEYS
        }
    finally:
        conn.close()

    assets_dicts      = [a.model_dump() for a in accounts if a.balance >= 0]
    liabilities_dicts = [a.model_dump() for a in accounts if a.balance <  0]

    summaries: dict[PeriodKey, str] = {
        pk: compute_ai_summary(
            pk,
            get_period_months(pk),
            periods[pk].model_dump(),
            assets_dicts,
            liabilities_dicts,
            summary.total_assets,
            summary.total_liabilities,
            summary.net_worth,
            debt.trend.labels,
            debt.trend.values,
        )
        for pk in PERIOD_KEYS
    }

    payload = DashboardPayload(
        meta=Meta(
            generated_at=datetime.now().isoformat(),
            as_of_date=datetime.today().strftime("%B %d, %Y"),
        ),
        summary=summary,
        accounts=accounts,
        periods=periods,
        debt=debt,
        transactions=txs,
        summaries=summaries,
    )

    # to_json() calls model_dump_json(by_alias=True) — required for SankeyFlow
    return JSONResponse(content=json.loads(payload.to_json()))
