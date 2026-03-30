"""
GET  /api/transactions          — paginated, filterable transaction drill-down.
PATCH /api/transactions/{id}    — 3-axis Command Center routing (category, ledger, account).

Guardrails enforced:
  #1 Ledger-scoped bulk category updates (no cross-ledger contamination)
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


class TransactionUpdateRequest(BaseModel):
    """
    3-axis Command Center payload.

    apply_category_to_merchant: when True, bulk-updates all cleared rows sharing
      the same merchant (within the same ledger) to the new category, and upserts
      the ClassificationRule so future ingests learn the correction.

    apply_routing_to_account: when True, bulk-updates the ledger_id for all rows
      sharing the same account name, and upserts the AccountLedgerMap so future
      ingests route this account correctly.
    """
    category: str | None = None
    type: str | None = None
    ledger_id: int | None = None
    account: str | None = None
    apply_category_to_merchant: bool = False
    apply_routing_to_account: bool = False


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


@router.patch("/api/transactions/{transaction_id}")
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdateRequest,
    session: Session = Depends(get_db),
):
    """
    3-axis Command Center: update category, ledger, and/or account with optional
    force-multiplier bulk propagation controlled by explicit-intent flags.

    Axis 1 — Category:
      Always updates tx.category when provided.
      apply_category_to_merchant=True → bulk-fixes history for this merchant
      within the same ledger (Guardrail #1) and upserts ClassificationRule.

    Axis 2 — Routing:
      Always updates tx.ledger_id / tx.account when provided.
      apply_routing_to_account=True → bulk-re-routes all rows for this account
      to the new ledger_id and upserts AccountLedgerMap.

    Guardrail #3: merchant_key falls back to tx.merchant if original_merchant is None.
    """
    tx = session.get(TransactionRecord, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

    # Guardrail #3: original_merchant fallback
    merchant_key = tx.original_merchant or tx.merchant

    # ── Type (always applied to the individual row when provided) ────────────
    if payload.type is not None:
        tx.type = payload.type

    # ── Axis 1: Category ──────────────────────────────────────────────────────
    if payload.category is not None:
        tx.category = payload.category

        if payload.apply_category_to_merchant:
            # Build cascade values: always category; include type if provided
            cascade_values: dict = {"category": payload.category}
            if payload.type is not None:
                cascade_values["type"] = payload.type

            # Guardrail #1: scope to this ledger — no cross-ledger contamination
            session.execute(
                update(TransactionRecord)
                .where(TransactionRecord.ledger_id == tx.ledger_id)
                .where(
                    TransactionRecord.original_merchant == merchant_key
                    if tx.original_merchant
                    else TransactionRecord.merchant == merchant_key
                )
                .values(**cascade_values)
            )
            # Learning engine: upsert ClassificationRule
            rule = session.exec(
                select(ClassificationRule).where(
                    ClassificationRule.merchant_pattern == merchant_key
                )
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

    # ── Axis 2: Routing (ledger + account) ───────────────────────────────────
    if payload.ledger_id is not None:
        tx.ledger_id = payload.ledger_id

    if payload.account is not None:
        tx.account = payload.account

    if payload.apply_routing_to_account and (
        payload.ledger_id is not None or payload.account is not None
    ):
        routing_account = payload.account or tx.account
        routing_ledger  = payload.ledger_id or tx.ledger_id

        # Bulk re-route all transactions for this account to the new ledger
        session.execute(
            update(TransactionRecord)
            .where(TransactionRecord.account == routing_account)
            .values(ledger_id=routing_ledger)
        )

        # Learning engine: upsert AccountLedgerMap
        acct_map = session.exec(
            select(AccountLedgerMap).where(
                AccountLedgerMap.account_name == routing_account
            )
        ).first()
        if not acct_map:
            acct_map = AccountLedgerMap(
                account_name=routing_account,
                ledger_id=routing_ledger,
            )
        else:
            acct_map.ledger_id = routing_ledger
        session.add(acct_map)

    session.add(tx)
    session.commit()
    return {
        "merchant_key": merchant_key,
        "category":     tx.category,
        "ledger_id":    tx.ledger_id,
    }


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

        tx.category = res.category
        tx.ledger_id = res.ledger_id
        tx.status = "cleared"
        session.add(tx)

        if tx.original_merchant:
            rule = session.exec(
                select(ClassificationRule).where(
                    ClassificationRule.merchant_pattern == tx.original_merchant
                )
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

            session.execute(
                update(TransactionRecord)
                .where(TransactionRecord.original_merchant == tx.original_merchant)
                .values(category=res.category, status="cleared")
            )

        if tx.account:
            acct_map = session.exec(
                select(AccountLedgerMap).where(
                    AccountLedgerMap.account_name == tx.account
                )
            ).first()
            if not acct_map:
                acct_map = AccountLedgerMap(account_name=tx.account, ledger_id=res.ledger_id)
            else:
                acct_map.ledger_id = res.ledger_id
            session.add(acct_map)

            session.execute(
                update(TransactionRecord)
                .where(TransactionRecord.account == tx.account)
                .values(ledger_id=res.ledger_id)
            )

        resolved_count += 1

    session.commit()
    return {"message": f"Successfully resolved {resolved_count} transactions and updated routing rules."}
