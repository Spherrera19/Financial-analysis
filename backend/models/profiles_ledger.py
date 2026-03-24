"""Household profiles and Entity-Ledger Architecture (Phase 7)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from sqlmodel import SQLModel as _SQLModel, Field as _Field


class UserProfile(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "userprofile"
    id:         Optional[int] = _Field(default=None, primary_key=True)
    name:       str           = ""
    is_primary: bool          = _Field(default=False)


class UserProfileUpdate(BaseModel):
    """Partial update for a UserProfile."""
    name:       str  | None = None
    is_primary: bool | None = None


class UserProfileCreate(BaseModel):
    """Payload for creating a new household member."""
    name: str


class Ledger(_SQLModel, table=True):  # type: ignore[call-arg]
    """A financial workspace — Household, personal, or business."""
    __tablename__ = "ledger"
    id:   Optional[int] = _Field(default=None, primary_key=True)
    name: str           = ""
    type: str           = ""   # 'joint' | 'personal' | 'business'


class LedgerAccess(_SQLModel, table=True):  # type: ignore[call-arg]
    """Junction: which users can see which ledgers, and in what role."""
    __tablename__ = "ledgeraccess"
    user_id:   int = _Field(foreign_key="userprofile.id", primary_key=True)
    ledger_id: int = _Field(foreign_key="ledger.id",      primary_key=True)
    role:      str = _Field(default="viewer")   # 'admin' | 'viewer'


class LedgerTransfer(_SQLModel, table=True):  # type: ignore[call-arg]
    """Records money / debt movements between two ledgers."""
    __tablename__ = "ledgertransfer"
    id:             Optional[int] = _Field(default=None, primary_key=True)
    from_ledger_id: int           = _Field(foreign_key="ledger.id")
    to_ledger_id:   int           = _Field(foreign_key="ledger.id")
    amount:         float         = 0.0
    description:    str           = ""
    created_at:     datetime      = _Field(default_factory=datetime.utcnow)


class Notification(_SQLModel, table=True):  # type: ignore[call-arg]
    """In-app notification attached to a ledger."""
    __tablename__ = "notification"
    id:        Optional[int] = _Field(default=None, primary_key=True)
    ledger_id: int           = _Field(foreign_key="ledger.id")
    message:   str           = ""
    is_read:   bool          = _Field(default=False)


# Pydantic schemas for the Ledger API

class LedgerCreate(BaseModel):
    name:             str
    type:             str
    creator_user_id:  int


class LedgerShare(BaseModel):
    user_id: int
    role:    str = "viewer"


class LedgerMember(BaseModel):
    user_id: int
    name:    str
    role:    str   # 'admin' | 'viewer'


class LedgerWithMembers(BaseModel):
    id:      int
    name:    str
    type:    str
    members: list[LedgerMember]
