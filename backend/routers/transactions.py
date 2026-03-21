"""
GET /api/transactions — filterable transaction drill-down endpoint.

Supports ?period=, ?type=, ?category= (all optional, all combinable).
Period filter uses get_period_months() to match the exact date range shown on
charts, preventing data leaks across period boundaries.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlmodel import Session
from sqlalchemy import text

from backend.deps import get_db, PERIOD_KEYS
from backend.engine import get_period_months

router = APIRouter()


@router.get("/api/transactions")
def list_transactions(
    period:    str | None = Query(default=None),
    category:  str | None = Query(default=None),
    type:      str | None = Query(default=None, alias="type"),
    ledger_id: int | None = Query(default=None, description="Scope results to a specific ledger workspace."),
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Return transactions matching the given filters, ordered newest-first.

    When `type` is provided the caller's intent is explicit — the default
    exclusion of income (I) and transfers (X) is suppressed.
    Pass ?ledger_id=<id> to restrict results to one ledger workspace.
    """
    type_ = type  # noqa: A001

    clauses: list[str] = []
    params:  dict      = {}

    if not type_:
        clauses.append("type NOT IN ('I', 'X')")

    if period is not None:
        if period not in PERIOD_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid period '{period}'. Must be one of: {PERIOD_KEYS}",
            )
        months = get_period_months(period)
        # SQLAlchemy text() requires named params; build :m0, :m1, ...
        placeholders = ",".join(f":m{i}" for i in range(len(months)))
        clauses.append(f"strftime('%Y-%m', date) IN ({placeholders})")
        params.update({f"m{i}": m for i, m in enumerate(months)})

    if category is not None:
        clauses.append("category = :category")
        params["category"] = category

    if type_ is not None:
        clauses.append("type = :type_val")
        params["type_val"] = type_

    # Ledger filter: ledger_id is always bound as a named parameter, never string-interpolated.
    if ledger_id is not None:
        clauses.append("ledger_id = :ledger_id")
        params["ledger_id"] = ledger_id

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    sql = text(f"""
        SELECT date, merchant, category, amount, type
        FROM   transactions
        {where}
        ORDER  BY date DESC
        LIMIT  500
    """)

    rows = session.execute(sql, params).mappings().all()
    return JSONResponse(content=[dict(r) for r in rows])
