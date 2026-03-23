"""
Shared FastAPI dependencies used by all routers.
Centralising here avoids circular imports between main.py and router modules.

get_db() → yields SQLModel Session for all routers.
"""
from __future__ import annotations

from pathlib import Path
from typing import Generator

from sqlmodel import Session

from backend.database import engine
from backend.models import PeriodKey

DIR      = Path(__file__).parent.parent
DB_PATH  = DIR / "finance.db"

PERIOD_KEYS: list[PeriodKey] = ["current", "last", "past2", "quarter", "year"]


def get_db() -> Generator[Session, None, None]:
    """Yield a SQLModel Session. Used by all routers."""
    with Session(engine) as session:
        yield session
