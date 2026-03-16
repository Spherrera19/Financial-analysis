"""
SQLite schema initialisation for the Finance dashboard backend.

Usage:
    from backend.database import init_db
    conn = init_db()          # uses default path "finance.db"
    conn = init_db("custom.db")
"""
from __future__ import annotations

import sqlite3
from pathlib import Path


def init_db(db_path: str | Path = "finance.db") -> sqlite3.Connection:
    """
    Create (or open) the SQLite database and ensure all tables exist.
    Returns an open connection with row_factory set to sqlite3.Row.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")

    _create_tables(conn)
    conn.commit()
    return conn


def _create_tables(conn: sqlite3.Connection) -> None:
    conn.executescript("""
    -- -----------------------------------------------------------------------
    -- transactions
    --   Mirrors the Transaction interface (d/m/c/a/v/o/t/k) but stores the
    --   full, human-readable column names for query ergonomics.  The compact
    --   aliases (d, m, …) are used only in the JSON payload to the frontend.
    -- -----------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS transactions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT    NOT NULL,           -- YYYY-MM-DD
        merchant    TEXT    NOT NULL,
        category    TEXT    NOT NULL,
        account     TEXT    NOT NULL,           -- last 25 chars of account name
        amount      REAL    NOT NULL,           -- neg = expense, pos = income
        owner       TEXT    NOT NULL,
        type        TEXT    NOT NULL CHECK (type IN ('I','N','O','D','X','T')),
        is_checking INTEGER NOT NULL DEFAULT 0 CHECK (is_checking IN (0,1))
    );

    CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_type     ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_tx_owner    ON transactions(owner);

    -- -----------------------------------------------------------------------
    -- accounts_history
    --   One row per account snapshot (e.g. month-end balance).  Supports the
    --   DebtTrendLine chart and net-worth-over-time calculations.
    -- -----------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS accounts_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        balance     REAL    NOT NULL,
        date        TEXT    NOT NULL,           -- YYYY-MM-DD (snapshot date)
        type        TEXT    NOT NULL CHECK (type IN ('asset','liability'))
    );

    CREATE INDEX IF NOT EXISTS idx_ah_name ON accounts_history(name);
    CREATE INDEX IF NOT EXISTS idx_ah_date ON accounts_history(date);
    """)
