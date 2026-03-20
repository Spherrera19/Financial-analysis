"""
Shared FastAPI dependencies used by all routers.
Centralising here avoids circular imports between main.py and router modules.

Two database dependencies are available:

  get_db()      → yields SQLModel Session  (for CRUD routers: retirement, budget, transactions)
  get_raw_db()  → yields sqlite3.Connection (for engine-delegating routers: dashboard, equity,
                  settings, debt — these call engine.py functions that use sqlite3.Row access)
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Generator

from sqlmodel import Session

from backend.database import engine, init_db
from backend.models import PeriodKey

DIR      = Path(__file__).parent.parent
DB_PATH  = DIR / "finance.db"

PERIOD_KEYS: list[PeriodKey] = ["current", "last", "past2", "quarter", "year"]


def get_db() -> Generator[Session, None, None]:
    """Yield a SQLModel Session. Used by CRUD routers (retirement, budget, transactions)."""
    with Session(engine) as session:
        yield session


def get_raw_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Yield a raw sqlite3.Connection. Used by routers that delegate to engine.py functions
    (dashboard, equity, settings, debt) which rely on sqlite3.Row dict-style access.
    """
    conn = init_db(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()
