"""Household profile CRUD routes: /api/profiles."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from backend.deps import get_db
from backend.models import UserProfile, UserProfileUpdate

router = APIRouter()


@router.get("/api/profiles")
def list_profiles(session: Session = Depends(get_db)) -> JSONResponse:
    """Return all household profiles ordered by id."""
    profiles = session.exec(select(UserProfile).order_by(UserProfile.id)).all()
    return JSONResponse(content=[p.model_dump() for p in profiles])


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
