"""Income source CRUD routes: /api/incomes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from sqlmodel import Session, select

from backend.deps import get_db
from backend.models import IncomeSource, IncomeSourceCreate, IncomeSourceUpdate, Ledger

router = APIRouter()


@router.get("/api/incomes")
def list_incomes(session: Session = Depends(get_db)) -> JSONResponse:
    """Return all income sources ordered by ledger_id, then id."""
    incomes = session.exec(
        select(IncomeSource).order_by(IncomeSource.ledger_id, IncomeSource.id)
    ).all()
    return JSONResponse(content=[i.model_dump() for i in incomes])


@router.post("/api/incomes", status_code=201)
def create_income(
    body: IncomeSourceCreate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Create a new income source linked to a Ledger."""
    if body.ledger_id is not None and session.get(Ledger, body.ledger_id) is None:
        raise HTTPException(status_code=404, detail=f"Ledger id={body.ledger_id} not found.")

    income = IncomeSource(
        ledger_id=body.ledger_id,
        source_type=body.source_type,
        gross_amount=body.gross_amount,
        estimated_withholdings=body.estimated_withholdings,
    )
    session.add(income)
    session.commit()
    session.refresh(income)
    return JSONResponse(status_code=201, content=income.model_dump())


@router.put("/api/incomes/{income_id}")
def update_income(
    income_id: int,
    body: IncomeSourceUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Partial update of an IncomeSource."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    income = session.get(IncomeSource, income_id)
    if income is None:
        raise HTTPException(status_code=404, detail="Income source not found.")

    for field, value in updates.items():
        setattr(income, field, value)

    session.add(income)
    session.commit()
    session.refresh(income)
    return JSONResponse(content=income.model_dump())


@router.delete("/api/incomes/{income_id}", status_code=204)
def delete_income(
    income_id: int,
    session: Session = Depends(get_db),
) -> Response:
    """Delete an income source by id."""
    income = session.get(IncomeSource, income_id)
    if income is None:
        raise HTTPException(status_code=404, detail="Income source not found.")

    session.delete(income)
    session.commit()
    return Response(status_code=204)
