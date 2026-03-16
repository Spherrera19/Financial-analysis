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
    account_name: str
    apr: float          # decimal, e.g. 0.24 for 24%
    min_payment: float  # fixed monthly minimum in dollars


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
    Return all debt accounts (ever seen as liabilities) with their current
    APR and minimum payment — from account_terms if saved, otherwise defaults.
    account_name uses the same last-28-char truncation as DebtAccount.name.
    """
    conn = init_db(DB_PATH)
    try:
        # All accounts that ever had a negative balance (includes paid-off cards)
        rows = conn.execute(
            "SELECT DISTINCT name FROM accounts_history WHERE type = 'liability' ORDER BY name"
        ).fetchall()
        all_debt_full_names: list[str] = [r["name"] for r in rows]

        # Currently saved user overrides (keyed by truncated name)
        saved_rows = conn.execute(
            "SELECT account_name, apr, min_payment FROM account_terms"
        ).fetchall()
        saved: dict[str, tuple[float, float]] = {
            r["account_name"]: (r["apr"], r["min_payment"]) for r in saved_rows
        }
    finally:
        conn.close()

    result = []
    seen_truncated: set[str] = set()
    for full_name in all_debt_full_names:
        truncated = full_name[-28:]
        if truncated in seen_truncated:
            continue  # deduplicate on the unlikely chance two names share a suffix
        seen_truncated.add(truncated)

        if truncated in saved:
            apr, min_payment = saved[truncated]
            is_custom = True
        else:
            apr = get_apr_for_account(full_name)
            min_payment = get_default_min_payment(full_name)
            is_custom = False

        result.append({
            "account_name": truncated,
            "apr": apr,
            "min_payment": min_payment,
            "is_custom": is_custom,
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
                INSERT OR REPLACE INTO account_terms (account_name, apr, min_payment)
                VALUES (?, ?, ?)
                """,
                (term.account_name, term.apr, term.min_payment),
            )
        conn.commit()
    finally:
        conn.close()

    return JSONResponse(content={"saved": len(body.terms)})
