"""Ledger workspace CRUD routes: /api/ledgers."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from backend.deps import get_db
from backend.models import Ledger, LedgerAccess, LedgerCreate, LedgerShare, LedgerWithMembers, LedgerMember, UserProfile

router = APIRouter()


@router.get("/api/ledgers")
def list_ledgers(user_id: int, session: Session = Depends(get_db)) -> JSONResponse:
    """Return every ledger the given user has access to, with embedded member list."""
    # 1. Which ledgers can this user see?
    access_rows = session.exec(
        select(LedgerAccess).where(LedgerAccess.user_id == user_id)
    ).all()
    ledger_ids = [row.ledger_id for row in access_rows]
    if not ledger_ids:
        return JSONResponse(content=[])

    # 2. Fetch the ledger rows.
    ledgers = session.exec(
        select(Ledger).where(Ledger.id.in_(ledger_ids)).order_by(Ledger.id)  # type: ignore[union-attr]
    ).all()

    # 3. Fetch ALL access rows for these ledgers (not just the requesting user).
    all_access = session.exec(
        select(LedgerAccess).where(LedgerAccess.ledger_id.in_(ledger_ids))  # type: ignore[union-attr]
    ).all()

    # 4. Resolve user names in one batch query.
    member_user_ids = list({row.user_id for row in all_access})
    profiles = session.exec(
        select(UserProfile).where(UserProfile.id.in_(member_user_ids))  # type: ignore[union-attr]
    ).all()
    name_map: dict[int, str] = {p.id: p.name for p in profiles if p.id is not None}

    # 5. Group access rows by ledger_id.
    from collections import defaultdict
    members_by_ledger: dict[int, list[LedgerMember]] = defaultdict(list)
    for row in all_access:
        members_by_ledger[row.ledger_id].append(
            LedgerMember(user_id=row.user_id, name=name_map.get(row.user_id, "Unknown"), role=row.role)
        )

    # 6. Build the enriched response.
    result = [
        LedgerWithMembers(
            id=l.id,           # type: ignore[arg-type]
            name=l.name,
            type=l.type,
            members=members_by_ledger.get(l.id, []),
        ).model_dump()
        for l in ledgers
    ]
    return JSONResponse(content=result)


@router.post("/api/ledgers", status_code=201)
def create_ledger(body: LedgerCreate, session: Session = Depends(get_db)) -> JSONResponse:
    """
    Create a new ledger and automatically grant the creator admin access.
    Returns the new ledger record.
    """
    if session.get(UserProfile, body.creator_user_id) is None:
        raise HTTPException(status_code=404, detail=f"User id={body.creator_user_id} not found.")

    ledger = Ledger(name=body.name, type=body.type)
    session.add(ledger)
    session.flush()   # populate ledger.id before creating the access row

    access = LedgerAccess(user_id=body.creator_user_id, ledger_id=ledger.id, role="admin")
    session.add(access)
    session.commit()
    session.refresh(ledger)

    return JSONResponse(
        status_code=201,
        content={"id": ledger.id, "name": ledger.name, "type": ledger.type},
    )


@router.post("/api/ledgers/{ledger_id}/share")
def share_ledger(
    ledger_id: int,
    body: LedgerShare,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Grant (or update) access for another user on this ledger.
    Upsert: if access already exists, the role is updated.
    """
    ledger = session.get(Ledger, ledger_id)
    if ledger is None:
        raise HTTPException(status_code=404, detail=f"Ledger id={ledger_id} not found.")

    if session.get(UserProfile, body.user_id) is None:
        raise HTTPException(status_code=404, detail=f"User id={body.user_id} not found.")

    # Upsert: update existing access row or create a new one
    existing = session.exec(
        select(LedgerAccess).where(
            LedgerAccess.ledger_id == ledger_id,
            LedgerAccess.user_id  == body.user_id,
        )
    ).first()

    if existing:
        existing.role = body.role
        session.add(existing)
    else:
        existing = LedgerAccess(user_id=body.user_id, ledger_id=ledger_id, role=body.role)
        session.add(existing)

    session.commit()
    session.refresh(existing)
    return JSONResponse(content=existing.model_dump())
