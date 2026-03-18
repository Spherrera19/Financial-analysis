"""
Shared FastAPI dependencies used by all routers.
Centralising here avoids circular imports between main.py and router modules.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Generator

from backend.database import init_db
from backend.models import PeriodKey

DIR      = Path(__file__).parent.parent
DB_PATH  = DIR / "finance.db"

PERIOD_KEYS: list[PeriodKey] = ["current", "last", "past2", "quarter", "year"]


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = init_db(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()
