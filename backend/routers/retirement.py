"""Retirement account CRUD routes: /api/retirement."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from sqlmodel import Session, select

from backend.deps import get_db
from backend.models import RetirementAccount, RetirementCreate, RetirementUpdate

router = APIRouter()


@router.get("/api/retirement")
def list_retirement_accounts(session: Session = Depends(get_db)) -> JSONResponse:
    """Return all retirement accounts ordered by owner, then account_type."""
    accounts = session.exec(
        select(RetirementAccount).order_by(RetirementAccount.ledger_id, RetirementAccount.account_type)
    ).all()
    return JSONResponse(content=[a.model_dump() for a in accounts])


@router.post("/api/retirement", status_code=201)
def create_retirement_account(
    body: RetirementCreate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Insert a new retirement account."""
    account = RetirementAccount(
        account_name=body.account_name,
        account_type=body.account_type,
        ledger_id=body.ledger_id,
        annual_limit=body.annual_limit,
        ytd_contributions=body.ytd_contributions,
        employer_match_amount=body.employer_match_amount,
        employer_match_target=body.employer_match_target,
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return JSONResponse(status_code=201, content={"id": account.id})


@router.put("/api/retirement/{account_id}")
def update_retirement_account(
    account_id: int,
    body: RetirementUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Partial update — only fields present in the request body are written."""
    account = session.get(RetirementAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    for field, value in updates.items():
        setattr(account, field, value)

    session.add(account)
    session.commit()
    session.refresh(account)
    return JSONResponse(content=account.model_dump())


@router.delete("/api/retirement/{account_id}", status_code=204)
def delete_retirement_account(
    account_id: int,
    session: Session = Depends(get_db),
) -> Response:
    """Delete a retirement account by id."""
    account = session.get(RetirementAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    session.delete(account)
    session.commit()
    return Response(status_code=204)
