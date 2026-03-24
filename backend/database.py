"""
SQLite schema initialisation for the Finance dashboard backend.

Usage:
    from backend.database import engine, init_db
    conn = init_db()          # uses default path (finance.db in project root)

`engine` is the SQLModel/SQLAlchemy engine — used by Session-based CRUD routers via get_db().
`init_db()` returns a raw sqlite3.Connection — used by engine.py functions and the bridge pattern in routers/dashboard.py and routers/equity.py.
`create_db_tables()` is called on FastAPI startup to register tables before first request.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlmodel import SQLModel, create_engine

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DIR     = Path(__file__).parent.parent
DB_PATH = DIR / "finance.db"

# ---------------------------------------------------------------------------
# SQLModel engine — import models first so their metadata is registered
# ---------------------------------------------------------------------------
import backend.models  # noqa: F401 — registers all table=True classes with SQLModel.metadata

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def create_db_tables() -> None:
    """Create all SQLModel-registered tables (idempotent, safe to call on startup)."""
    SQLModel.metadata.create_all(engine)


# ---------------------------------------------------------------------------
# Raw sqlite3 interface — used by ingest.py, engine.py, and the bridge callers in routers/dashboard.py and routers/equity.py
# ---------------------------------------------------------------------------

def init_db(db_path: str | Path = DB_PATH) -> sqlite3.Connection:
    """
    Open the SQLite database with WAL mode and FK enforcement.
    Returns an open connection with row_factory set to sqlite3.Row.

    When called with an alternate path (e.g. ':memory:' in tests), bootstraps
    the schema via SQLModel.metadata.create_all() so tests remain self-contained.
    DDL for the production database is managed by Alembic.
    """
    path_str = str(db_path)
    conn = sqlite3.connect(path_str, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")

    if path_str != str(DB_PATH):
        from sqlalchemy import create_engine as _sa_create_engine
        _tmp_engine = _sa_create_engine(f"sqlite:///{path_str}", creator=lambda: conn)
        SQLModel.metadata.create_all(_tmp_engine)

    return conn


def sync_categories_from_transactions(conn: sqlite3.Connection) -> None:
    """
    Keep the categories table in sync with the distinct category values in
    the transactions table. Called exclusively from ingest.build_database().
    Does NOT call conn.commit() — callers are responsible for committing.
    """
    conn.execute("""
        INSERT OR IGNORE INTO categories (name)
        SELECT DISTINCT category FROM transactions
        WHERE category IS NOT NULL AND category != ''
    """)
    conn.execute("""
        DELETE FROM categories
        WHERE  monthly_budget = 0.0
          AND  name != 'Uncategorized'
          AND  name NOT IN (SELECT DISTINCT category FROM transactions)
    """)
