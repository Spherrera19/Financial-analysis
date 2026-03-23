"""GET /api/dashboard — builds and returns the full DashboardPayload."""
from __future__ import annotations

import sqlite3
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlmodel import Session

from backend.database import engine as _sa_engine
from backend.deps import get_db, PERIOD_KEYS
from backend.engine import (
    build_accounts, build_debt_section, build_equity_section,
    build_period, build_summary, get_period_months, get_recent_transactions,
)
from backend.models import DashboardPayload, Meta, PeriodKey
from generate_dashboard import compute_ai_summary

router = APIRouter()


@router.get("/api/dashboard")
def get_dashboard(
    ledger_id: int | None = Query(default=None, description="Filter data to a specific ledger workspace. Omit for unscoped (all-ledger) view."),
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Build the full DashboardPayload from SQLite and return it as JSON.
    Assumes the database has already been populated by refresh.bat / ingest.py.
    model_dump(by_alias=True) ensures SankeyFlow emits 'from' not 'from_',
    matching the TypeScript contract.

    Pass ?ledger_id=<id> to scope analytics to a single ledger workspace.

    TODO: refactor engine.py functions to accept Session when engine.py is migrated.
    Bridge: borrow a raw DBAPI connection from the SQLAlchemy pool for the legacy analytics engine.
    """
    conn = _sa_engine.raw_connection()
    conn.row_factory = sqlite3.Row
    try:
        summary  = build_summary(conn)
        accounts = build_accounts(conn)
        debt     = build_debt_section(conn)
        txs      = get_recent_transactions(conn, ledger_id=ledger_id)
        periods: dict[PeriodKey, object] = {
            pk: build_period(conn, pk, ledger_id=ledger_id) for pk in PERIOD_KEYS
        }

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
        return JSONResponse(content=payload.model_dump(by_alias=True))
    finally:
        conn.close()
