"""Retirement account CRUD routes: /api/retirement."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response

from backend.deps import get_db
from backend.models import RetirementAccount, RetirementCreate, RetirementUpdate

router = APIRouter()


def _row_to_account(row: sqlite3.Row) -> dict:
    return {
        "id":                    row["id"],
        "account_name":          row["account_name"],
        "account_type":          row["account_type"],
        "owner":                 row["owner"],
        "annual_limit":          row["annual_limit"],
        "ytd_contributions":     row["ytd_contributions"],
        "employer_match_amount": row["employer_match_amount"],
        "employer_match_target": row["employer_match_target"],
    }


@router.get("/api/retirement")
def list_retirement_accounts(
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """Return all retirement accounts ordered by owner, then account_type."""
    rows = conn.execute(
        "SELECT * FROM retirement_accounts ORDER BY owner, account_type"
    ).fetchall()
    return JSONResponse(content=[_row_to_account(r) for r in rows])


@router.post("/api/retirement", status_code=201)
def create_retirement_account(
    body: RetirementCreate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """Insert a new retirement account."""
    cursor = conn.execute(
        """
        INSERT INTO retirement_accounts
            (account_name, account_type, owner, annual_limit,
             ytd_contributions, employer_match_amount, employer_match_target)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            body.account_name,
            body.account_type,
            body.owner,
            body.annual_limit,
            body.ytd_contributions,
            body.employer_match_amount,
            body.employer_match_target,
        ),
    )
    conn.commit()
    return JSONResponse(status_code=201, content={"id": cursor.lastrowid})


@router.put("/api/retirement/{account_id}")
def update_retirement_account(
    account_id: int,
    body: RetirementUpdate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """Partial update — only fields present in the request body are written."""
    # exclude_unset=True distinguishes "field not sent" (skip) from "field sent as null" (clear).
    # This allows users to clear nullable fields like employer_match_target back to null.
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    values = list(updates.values()) + [account_id]
    conn.execute(
        f"UPDATE retirement_accounts SET {set_clause} WHERE id = ?", values
    )
    conn.commit()

    row = conn.execute(
        "SELECT * FROM retirement_accounts WHERE id = ?", (account_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    return JSONResponse(content=_row_to_account(row))


@router.delete("/api/retirement/{account_id}", status_code=204)
def delete_retirement_account(
    account_id: int,
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    """Delete a retirement account by id."""
    row = conn.execute(
        "SELECT id FROM retirement_accounts WHERE id = ?", (account_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    conn.execute("DELETE FROM retirement_accounts WHERE id = ?", (account_id,))
    conn.commit()
    return Response(status_code=204)
