"""
GET /api/transactions — filterable transaction drill-down endpoint.

Supports ?period=, ?type=, ?category= (all optional, all combinable).
Period filter uses get_period_months() to match the exact date range shown on
charts, preventing data leaks across period boundaries.
"""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from backend.deps import get_db, PERIOD_KEYS
from backend.engine import get_period_months

router = APIRouter()


@router.get("/api/transactions")
def list_transactions(
    period:   str | None = Query(default=None),
    category: str | None = Query(default=None),
    type:     str | None = Query(default=None, alias="type"),
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Return transactions matching the given filters, ordered newest-first.

    When `type` is provided the caller's intent is explicit — the default
    exclusion of income (I) and transfers (X) is suppressed so that e.g.
    ?type=I can be used in the future without conflicting clauses.
    """
    # FastAPI won't bind 'type' as a Python identifier; use alias
    type_ = type  # noqa: A001 — shadow is intentional for readability below

    clauses: list[str] = []
    params:  list      = []

    # Default: hide income + internal transfers from the spending drawer.
    # Suppressed when type_ is explicit (caller declares what they want).
    if not type_:
        clauses.append("type NOT IN ('I', 'X')")

    if period is not None:
        if period not in PERIOD_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid period '{period}'. Must be one of: {PERIOD_KEYS}",
            )
        months = get_period_months(period)
        placeholders = ",".join("?" * len(months))
        clauses.append(f"strftime('%Y-%m', date) IN ({placeholders})")
        params.extend(months)

    if category is not None:
        clauses.append("category = ?")
        params.append(category)

    if type_ is not None:
        clauses.append("type = ?")
        params.append(type_)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    sql = f"""
        SELECT date, merchant, category, amount, type
        FROM   transactions
        {where}
        ORDER  BY date DESC
        LIMIT  500
    """

    rows = conn.execute(sql, params).fetchall()
    return JSONResponse(content=[dict(r) for r in rows])
