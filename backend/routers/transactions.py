"""
GET /api/transactions — filterable transaction drill-down endpoint.

Supports ?period=, ?type=, ?category= (all optional, all combinable).
Period filter uses get_period_months() to match the exact date range shown on
charts, preventing data leaks across period boundaries.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlmodel import Session, select, update
from sqlalchemy import text

from backend.deps import get_db, PERIOD_KEYS
from backend.engine import get_period_months
from backend.models.orm import TransactionRecord
from backend.models.triage import ClassificationRule, AccountLedgerMap


class TriageResolution(BaseModel):
    transaction_id: int
    category: str
    ledger_id: int


class TriageResolveRequest(BaseModel):
    resolutions: List[TriageResolution]

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

    clauses: list[str] = ["status = 'cleared'"]
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


@router.get("/api/transactions/review")
def get_pending_transactions(session: Session = Depends(get_db)):
    statement = select(TransactionRecord).where(TransactionRecord.status == "needs_review")
    return session.exec(statement).all()


@router.post("/api/transactions/review/resolve")
def resolve_pending_transactions(
    payload: TriageResolveRequest,
    session: Session = Depends(get_db),
):
    resolved_count = 0
    for res in payload.resolutions:
        tx = session.get(TransactionRecord, res.transaction_id)
        if not tx:
            continue

        # 1. Update the transaction
        tx.category = res.category
        tx.ledger_id = res.ledger_id
        tx.status = "cleared"
        session.add(tx)

        # 2. Learn category rule (upsert) + bulk-apply to all matching transactions
        if tx.original_merchant:
            rule = session.exec(
                select(ClassificationRule).where(ClassificationRule.merchant_pattern == tx.original_merchant)
            ).first()
            if not rule:
                rule = ClassificationRule(
                    merchant_pattern=tx.original_merchant,
                    assigned_category=res.category,
                    match_type="exact",
                )
            else:
                rule.assigned_category = res.category
            session.add(rule)

            # Force-multiply: clear every transaction from this merchant
            session.execute(
                update(TransactionRecord)
                .where(TransactionRecord.original_merchant == tx.original_merchant)
                .values(category=res.category, status="cleared")
            )

        # 3. Learn account routing rule (upsert) + bulk-apply to all matching transactions
        if tx.account:
            acct_map = session.exec(
                select(AccountLedgerMap).where(AccountLedgerMap.account_name == tx.account)
            ).first()
            if not acct_map:
                acct_map = AccountLedgerMap(account_name=tx.account, ledger_id=res.ledger_id)
            else:
                acct_map.ledger_id = res.ledger_id
            session.add(acct_map)

            # Force-multiply: reroute every transaction from this account
            session.execute(
                update(TransactionRecord)
                .where(TransactionRecord.account == tx.account)
                .values(ledger_id=res.ledger_id)
            )

        resolved_count += 1

    session.commit()
    return {"message": f"Successfully resolved {resolved_count} transactions and updated routing rules."}
