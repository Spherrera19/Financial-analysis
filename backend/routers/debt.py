"""Debt settings routes: GET/POST /api/debt/settings."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.deps import get_raw_db
from backend.debt_engine import get_apr_for_account, get_default_min_payment

router = APIRouter()


class AccountTerm(BaseModel):
    account_name: str           # full original name — PRIMARY KEY in account_terms
    apr: float                  # decimal, e.g. 0.24 for 24%
    min_payment: float          # fixed monthly minimum in dollars
    display_name: str | None = None  # user nickname; None = show full name


class DebtSettingsUpdate(BaseModel):
    terms: list[AccountTerm]


@router.get("/api/debt/settings")
def get_debt_settings(conn: sqlite3.Connection = Depends(get_raw_db)) -> JSONResponse:
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


@router.post("/api/debt/settings")
def save_debt_settings(
    body: DebtSettingsUpdate,
    conn: sqlite3.Connection = Depends(get_raw_db),
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
