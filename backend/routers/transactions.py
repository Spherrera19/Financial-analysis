"""
GET /api/transactions  — paginated, filterable transaction drill-down.
PUT /api/transactions/{id}/category — inline recategorization with force-multiplier.

Guardrails enforced:
  #1 Ledger-scoped bulk updates (no cross-ledger contamination)
  #3 original_merchant fallback to merchant for manual/legacy entries
  #4 Always filter status='cleared'; needs_review rows never surface here
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, not_, update
from sqlmodel import Session, select

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


class CategoryUpdateRequest(BaseModel):
    category: str


router = APIRouter()


@router.get("/api/transactions")
def list_transactions(
    period:    str | None = Query(default=None),
    category:  str | None = Query(default=None),
    type:      str | None = Query(default=None, alias="type"),
    ledger_id: int | None = Query(default=None, description="Scope results to a specific ledger workspace."),
    skip:      int        = Query(default=0,   ge=0),
    limit:     int        = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Return paginated transactions matching the given filters, ordered newest-first.

    Guardrail #4: Always filters status='cleared'. Pass ?ledger_id=<id> to restrict
    results to one ledger workspace. Excludes income (I) and transfers (X) by default
    unless ?type= is explicitly provided.
    """
    type_ = type  # noqa: A001

    # Guardrail #4: always start with cleared-only
    stmt = select(TransactionRecord).where(TransactionRecord.status == "cleared")

    # Guardrail #4: scope to ledger when provided
    if ledger_id is not None:
        stmt = stmt.where(TransactionRecord.ledger_id == ledger_id)

    # Default: exclude income and transfers unless caller specifies a type
    if not type_:
        stmt = stmt.where(not_(TransactionRecord.type.in_(["I", "X"])))

    if period is not None:
        if period not in PERIOD_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid period '{period}'. Must be one of: {PERIOD_KEYS}",
            )
        months = get_period_months(period)
        stmt = stmt.where(func.strftime("%Y-%m", TransactionRecord.date).in_(months))

    if category is not None:
        stmt = stmt.where(TransactionRecord.category == category)

    if type_ is not None:
        stmt = stmt.where(TransactionRecord.type == type_)

    stmt = stmt.order_by(TransactionRecord.date.desc()).offset(skip).limit(limit)

    records = session.exec(stmt).all()
    return JSONResponse(content=[
        {
            "id":          r.id,
            "date":        r.date,
            "merchant":    r.merchant,
            "category":    r.category,
            "account":     r.account,
            "amount":      r.amount,
            "owner":       r.owner,
            "type":        r.type,
            "is_checking": bool(r.is_checking),
        }
        for r in records
    ])


@router.put("/api/transactions/{transaction_id}/category")
def update_transaction_category(
    transaction_id: int,
    payload: CategoryUpdateRequest,
    session: Session = Depends(get_db),
):
    """
    Recategorize a single transaction, then bulk-fix all rows from the same
    merchant (ledger-scoped), and upsert a ClassificationRule for future ingest.

    Guardrail #1: bulk update WHERE includes ledger_id — no cross-ledger contamination.
    Guardrail #3: falls back to tx.merchant when tx.original_merchant is None/empty.
    """
    tx = session.get(TransactionRecord, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

    # Guardrail #3: original_merchant fallback
    use_original = bool(tx.original_merchant)
    merchant_key = tx.original_merchant if use_original else tx.merchant

    # 1. Update the specific transaction
    tx.category = payload.category
    session.add(tx)

    # 2. Bulk update — Guardrail #1: always scope to this ledger
    bulk_stmt = (
        update(TransactionRecord)
        .where(TransactionRecord.ledger_id == tx.ledger_id)
        .values(category=payload.category)
    )
    if use_original:
        bulk_stmt = bulk_stmt.where(TransactionRecord.original_merchant == merchant_key)
    else:
        bulk_stmt = bulk_stmt.where(TransactionRecord.merchant == merchant_key)
    session.execute(bulk_stmt)

    # 3. Upsert ClassificationRule (learning engine)
    rule = session.exec(
        select(ClassificationRule).where(ClassificationRule.merchant_pattern == merchant_key)
    ).first()
    if not rule:
        rule = ClassificationRule(
            merchant_pattern=merchant_key,
            assigned_category=payload.category,
            match_type="exact",
        )
    else:
        rule.assigned_category = payload.category
    session.add(rule)

    session.commit()
    return {"updated_merchant": merchant_key, "category": payload.category}


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
