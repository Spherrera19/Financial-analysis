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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.database import init_db
from backend.debt_engine import get_apr_for_account, get_default_min_payment
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


# ---------------------------------------------------------------------------
# Request / response models for debt settings
# ---------------------------------------------------------------------------

class AccountTerm(BaseModel):
    account_name: str           # full original name — PRIMARY KEY in account_terms
    apr: float                  # decimal, e.g. 0.24 for 24%
    min_payment: float          # fixed monthly minimum in dollars
    display_name: str | None = None  # user nickname; None = show full name


class DebtSettingsUpdate(BaseModel):
    terms: list[AccountTerm]

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


# ---------------------------------------------------------------------------
# Debt settings routes
# ---------------------------------------------------------------------------

@app.get("/api/debt/settings")
def get_debt_settings() -> JSONResponse:
    """
    Return all debt accounts (ever seen as liabilities in accounts_history)
    with their current APR, minimum payment, and optional display nickname.
    account_name is the FULL original name — never truncated.
    """
    conn = init_db(DB_PATH)
    try:
        # All accounts that ever had a negative balance (includes paid-off cards)
        rows = conn.execute(
            "SELECT DISTINCT name FROM accounts_history WHERE type = 'liability' ORDER BY name"
        ).fetchall()
        all_full_names: list[str] = [r["name"] for r in rows]

        # Saved user overrides keyed by full account name
        saved_rows = conn.execute(
            "SELECT account_name, apr, min_payment, display_name FROM account_terms"
        ).fetchall()
        saved: dict[str, dict] = {
            r["account_name"]: {
                "apr":          r["apr"],
                "min_payment":  r["min_payment"],
                "display_name": r["display_name"],
            }
            for r in saved_rows
        }
    finally:
        conn.close()

    result = []
    for full_name in all_full_names:
        s = saved.get(full_name)
        if s:
            result.append({
                "account_name": full_name,
                "display_name": s["display_name"],
                "apr":          s["apr"],
                "min_payment":  s["min_payment"],
                "is_custom":    True,
            })
        else:
            result.append({
                "account_name": full_name,
                "display_name": None,
                "apr":          get_apr_for_account(full_name),
                "min_payment":  get_default_min_payment(full_name),
                "is_custom":    False,
            })

    return JSONResponse(content=result)


@app.post("/api/debt/settings")
def save_debt_settings(body: DebtSettingsUpdate) -> JSONResponse:
    """
    Upsert APR and minimum payment for each account into account_terms.
    Returns the count of rows saved.
    """
    if not body.terms:
        raise HTTPException(status_code=400, detail="No terms provided.")

    conn = init_db(DB_PATH)
    try:
        for term in body.terms:
            conn.execute(
                """
                INSERT OR REPLACE INTO account_terms
                    (account_name, apr, min_payment, display_name)
                VALUES (?, ?, ?, ?)
                """,
                (
                    term.account_name,
                    term.apr,
                    term.min_payment,
                    term.display_name or None,  # store NULL for empty string
                ),
            )
        conn.commit()
    finally:
        conn.close()

    return JSONResponse(content={"saved": len(body.terms)})
