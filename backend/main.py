"""
Phase 4 — FastAPI Backend Wrapper
===================================
Wraps the existing engine + Pydantic pipeline into a live local API.

Run via start.bat or manually:
    uvicorn backend.main:app --reload
"""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Generator

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel
from starlette.requests import Request

from backend.logger import get_logger, LOG_FILE

log = get_logger("api")

from backend.database import init_db, sync_categories_from_transactions
from backend.debt_engine import get_apr_for_account, get_default_min_payment
from backend.equity_engine import parse_brokerage_csv
from backend.ingest import build_database
from backend.engine import (
    build_accounts,
    build_debt_section,
    build_equity_section,
    build_period,
    build_summary,
    get_period_months,
    get_recent_transactions,
)
from backend.models import (
    CategoryCreate,
    CategoryRow,
    CategoryUpdate,
    DashboardPayload,
    Meta,
    PeriodKey,
    RoutingTarget,
    RoutingUpdate,
)
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


# ---------------------------------------------------------------------------
# Request models for equity grants
# ---------------------------------------------------------------------------

class VestTranche(BaseModel):
    date:   str    # YYYY-MM-DD
    shares: float


class NewEquityGrant(BaseModel):
    ticker:            str
    grant_date:        str    # YYYY-MM-DD
    total_shares:      float
    vesting_schedule:  list[VestTranche]

DIR     = Path(__file__).parent.parent
DB_PATH = DIR / "finance.db"

PERIOD_KEYS: list[PeriodKey] = ["current", "last", "past2", "quarter", "year"]


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = init_db(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


app = FastAPI(title="Finance Dashboard API")


# ---------------------------------------------------------------------------
# Middleware — CORS first, then request logger (last-added = outermost)
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class _RequestLogMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status code, and elapsed time."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - start) * 1_000
        log.info(
            "%s %s → %s  (%.1f ms)",
            request.method,
            request.url.path,
            response.status_code,
            ms,
        )
        return response


app.add_middleware(_RequestLogMiddleware)


# ---------------------------------------------------------------------------
# Global exception handler — logs full traceback, returns clean JSON
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = traceback.format_exc()
    log.error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url.path,
        tb,
    )
    return JSONResponse(
        status_code=500,
        content={"error": str(exc)},
    )


@app.get("/api/dashboard")
def get_dashboard(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    """
    Build the full DashboardPayload from SQLite and return it as JSON.
    Assumes the database has already been populated by refresh.bat / ingest.py.
    model_dump(by_alias=True) ensures SankeyFlow emits 'from' not 'from_',
    matching the TypeScript contract.
    """
    summary  = build_summary(conn)
    accounts = build_accounts(conn)
    debt     = build_debt_section(conn)
    txs      = get_recent_transactions(conn)
    periods: dict[PeriodKey, object] = {
        pk: build_period(conn, pk) for pk in PERIOD_KEYS
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


# ---------------------------------------------------------------------------
# Equity route
# ---------------------------------------------------------------------------

@app.post("/api/equity/grants")
def create_equity_grant(
    body: NewEquityGrant,
    conn: sqlite3.Connection = Depends(get_db),
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


@app.get("/api/equity")
def get_equity(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    """
    Return upcoming vest events enriched with GBM price projections and
    30% tax withholding applied to all share counts.

    Stock history is fetched live from yfinance on each call.  The response
    includes three KPI scalars (total_unvested_value, next_vest_date,
    projected_net_cash_12m) plus the full upcoming_vests timeline array.
    """
    section = build_equity_section(conn)
    return JSONResponse(content=section.model_dump())


# ---------------------------------------------------------------------------
# Budget & Routing routes
# ---------------------------------------------------------------------------

@app.get("/api/routing")
def get_routing(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    """Return all routing targets ordered by priority then name."""
    rows = conn.execute(
        "SELECT id, name, monthly_amount, category, priority "
        "FROM routing_targets ORDER BY priority ASC, name ASC"
    ).fetchall()
    return JSONResponse(content=[dict(r) for r in rows])


@app.put("/api/routing")
def save_routing(
    body: RoutingUpdate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Full replace of routing_targets.
    Wrapped in a single transaction: DELETE + reset autoincrement + bulk INSERT.
    Frontend must refetch GET /api/routing after success to get new IDs.
    """
    if not body.targets:
        raise HTTPException(status_code=400, detail="targets list must not be empty.")

    conn.execute("DELETE FROM routing_targets")
    conn.execute("DELETE FROM sqlite_sequence WHERE name='routing_targets'")
    conn.executemany(
        "INSERT INTO routing_targets (name, monthly_amount, category, priority) "
        "VALUES (?, ?, ?, ?)",
        [(t.name, t.monthly_amount, t.category, t.priority) for t in body.targets],
    )
    conn.commit()
    return JSONResponse(content={"saved": len(body.targets)})


# ---------------------------------------------------------------------------
# Category routes
# ---------------------------------------------------------------------------

@app.get("/api/categories")
def get_categories(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    """Return all categories ordered alphabetically."""
    rows = conn.execute(
        "SELECT id, name, monthly_budget FROM categories ORDER BY name ASC"
    ).fetchall()
    return JSONResponse(content=[dict(r) for r in rows])


@app.post("/api/categories")
def create_category(
    body: CategoryCreate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """Create a new category. Returns 409 if the name already exists."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name must not be empty.")
    existing = conn.execute(
        "SELECT id FROM categories WHERE name = ?", (name,)
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{name}' already exists.")
    cursor = conn.execute(
        "INSERT INTO categories (name, monthly_budget) VALUES (?, ?)",
        (name, body.monthly_budget),
    )
    conn.commit()
    return JSONResponse(
        status_code=201,
        content={"id": cursor.lastrowid, "name": name, "monthly_budget": body.monthly_budget},
    )


@app.put("/api/categories/{category_id}")
def update_category(
    category_id: int,
    body: CategoryUpdate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Update a category's name and/or monthly_budget.
    If the name changes, cascades the rename to all matching transaction rows
    atomically.  Returns 409 if the new name already exists.
    """
    row = conn.execute(
        "SELECT id, name, monthly_budget FROM categories WHERE id = ?", (category_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found.")

    old_name   = row["name"]
    new_name   = body.name.strip() if body.name is not None else old_name
    new_budget = body.monthly_budget if body.monthly_budget is not None else row["monthly_budget"]

    if new_name != old_name:
        # Conflict check
        conflict = conn.execute(
            "SELECT id FROM categories WHERE name = ? AND id != ?", (new_name, category_id)
        ).fetchone()
        if conflict:
            raise HTTPException(
                status_code=409, detail=f"Category '{new_name}' already exists."
            )
        # Cascade rename to transaction history
        conn.execute(
            "UPDATE transactions SET category = ? WHERE category = ?", (new_name, old_name)
        )

    conn.execute(
        "UPDATE categories SET name = ?, monthly_budget = ? WHERE id = ?",
        (new_name, new_budget, category_id),
    )
    conn.commit()
    return JSONResponse(content={"id": category_id, "name": new_name, "monthly_budget": new_budget})


@app.delete("/api/categories/{category_id}")
def delete_category(
    category_id: int,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Delete a category.  Cascades all matching transactions to 'Uncategorized'.
    Ensures 'Uncategorized' exists before the cascade.
    """
    row = conn.execute(
        "SELECT name FROM categories WHERE id = ?", (category_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found.")

    old_name = row["name"]

    # Ensure 'Uncategorized' exists before cascading
    conn.execute(
        "INSERT OR IGNORE INTO categories (name) VALUES ('Uncategorized')"
    )
    # Cascade transactions
    conn.execute(
        "UPDATE transactions SET category = 'Uncategorized' WHERE category = ?", (old_name,)
    )
    # Delete the category
    conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    conn.commit()
    return JSONResponse(content={"deleted": old_name})


# ---------------------------------------------------------------------------
# Debt settings routes
# ---------------------------------------------------------------------------

@app.get("/api/debt/settings")
def get_debt_settings(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    """
    Return all debt accounts (ever seen as liabilities in accounts_history)
    with their current APR, minimum payment, and optional display nickname.
    account_name is the FULL original name — never truncated.
    """
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
def save_debt_settings(
    body: DebtSettingsUpdate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Upsert APR and minimum payment for each account into account_terms.
    Returns the count of rows saved.
    """
    if not body.terms:
        raise HTTPException(status_code=400, detail="No terms provided.")

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

    return JSONResponse(content={"saved": len(body.terms)})


# ---------------------------------------------------------------------------
# CSV upload route
# ---------------------------------------------------------------------------

_FINANCE_PREFIXES = ("Transactions", "Balances")
_EQUITY_PREFIXES  = ("Equity", "RSU")
_VALID_PREFIXES   = _FINANCE_PREFIXES + _EQUITY_PREFIXES


@app.post("/api/upload/csv")
async def upload_csv(
    files: list[UploadFile] = File(...),
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Accept one or more CSV files and route them by filename prefix.

    Finance exports (Transactions_*.csv, Balances_*.csv):
      - Delete existing files for that prefix from the project root.
      - Save the new file, then rebuild SQLite from all CSVs.

    Equity exports (Equity_*.csv, RSU_*.csv):
      - Parse grant tranches from the CSV using parse_brokerage_csv().
      - For each unique ticker found: DELETE existing rows where
        source = 'brokerage_csv', then INSERT the new grants.
      - Manual grants (source = 'manual') are never touched.

    Returns {"uploaded": [...filenames], "count": N, "grants_imported": M}
    where grants_imported is present only when equity files were processed.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    finance_uploads: list[UploadFile] = []
    equity_uploads:  list[UploadFile] = []

    for upload in files:
        filename = upload.filename or ""
        if any(filename.startswith(p) for p in _EQUITY_PREFIXES):
            equity_uploads.append(upload)
        elif any(filename.startswith(p) for p in _FINANCE_PREFIXES):
            finance_uploads.append(upload)
        else:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"'{filename}' is not a recognised export. "
                    f"Expected a filename starting with one of: "
                    f"{', '.join(_VALID_PREFIXES)}."
                ),
            )

    saved_finance: list[str] = []
    saved_equity:  list[str] = []
    grants_imported = 0

    # ── Finance files: save to disk, rebuild SQLite ──────────────────────────
    for upload in finance_uploads:
        filename = upload.filename or ""
        prefix = next(p for p in _FINANCE_PREFIXES if filename.startswith(p))
        for old in DIR.glob(f"{prefix}*.csv"):
            old.unlink()
        dest = DIR / filename
        content = await upload.read()
        dest.write_bytes(content)
        saved_finance.append(filename)

    if saved_finance:
        rebuilt = build_database(DB_PATH, DIR)
        rebuilt.close()
        # sync_categories_from_transactions is already called inside build_database()

    # ── Equity files: parse → per-ticker upsert ───────────────────────────────
    for upload in equity_uploads:
        filename = upload.filename or ""
        content = await upload.read()

        # Write to a temp file so parse_brokerage_csv can open it normally
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".csv")
        try:
            os.write(tmp_fd, content)
            os.close(tmp_fd)
            grants = parse_brokerage_csv(tmp_path)
        finally:
            os.unlink(tmp_path)

        # Per-ticker upsert: only brokerage_csv rows are replaced
        tickers = {g["ticker"] for g in grants}
        for ticker in tickers:
            conn.execute(
                "DELETE FROM equity_grants WHERE ticker = ? AND source = 'brokerage_csv'",
                (ticker,),
            )

        for grant in grants:
            conn.execute(
                """
                INSERT INTO equity_grants
                    (ticker, grant_date, total_shares, vesting_schedule, source)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    grant["ticker"],
                    grant["grant_date"],
                    grant["total_shares"],
                    json.dumps(grant["vesting_schedule"]),
                    grant["source"],
                ),
            )

        conn.commit()
        grants_imported += len(grants)
        saved_equity.append(filename)

    all_uploaded = saved_finance + saved_equity
    result: dict = {"uploaded": all_uploaded, "count": len(all_uploaded)}
    if saved_equity:
        result["grants_imported"] = grants_imported

    return JSONResponse(content=result)


# ---------------------------------------------------------------------------
# System logs route
# ---------------------------------------------------------------------------

@app.get("/api/logs")
def get_logs(lines: int = 200) -> JSONResponse:
    """
    Return the last `lines` lines of logs/app.log.
    Returns {"lines": [...], "total": <total_line_count>}.
    """
    if not LOG_FILE.exists():
        return JSONResponse(content={"lines": [], "total": 0})

    with LOG_FILE.open("r", encoding="utf-8", errors="replace") as f:
        all_lines = f.readlines()

    tail = [line.rstrip() for line in all_lines[-lines:]]
    return JSONResponse(content={"lines": tail, "total": len(all_lines)})
