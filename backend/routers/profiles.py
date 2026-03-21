"""Household profile CRUD routes: /api/profiles."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from backend.deps import get_db
from backend.models import Ledger, LedgerAccess, UserProfile, UserProfileCreate, UserProfileUpdate

router = APIRouter()


@router.get("/api/profiles")
def list_profiles(session: Session = Depends(get_db)) -> JSONResponse:
    """Return all household profiles ordered by id."""
    profiles = session.exec(select(UserProfile).order_by(UserProfile.id)).all()
    return JSONResponse(content=[p.model_dump() for p in profiles])


@router.post("/api/profiles", status_code=201)
def create_profile(
    body: UserProfileCreate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Create a new household member.
    Auto-provisions a personal ledger with admin access.
    """
    profile = UserProfile(name=body.name, is_primary=False)
    session.add(profile)
    session.flush()  # populate profile.id

    ledger = Ledger(name=f"{body.name}'s Personal", type="personal")
    session.add(ledger)
    session.flush()  # populate ledger.id

    access = LedgerAccess(user_id=profile.id, ledger_id=ledger.id, role="admin")
    session.add(access)
    session.commit()
    session.refresh(profile)

    return JSONResponse(status_code=201, content=profile.model_dump())


@router.put("/api/profiles/{profile_id}")
def update_profile(
    profile_id: int,
    body: UserProfileUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Partial update of a UserProfile."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    profile = session.get(UserProfile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found.")

    for field, value in updates.items():
        setattr(profile, field, value)

    session.add(profile)
    session.commit()
    session.refresh(profile)
    return JSONResponse(content=profile.model_dump())
