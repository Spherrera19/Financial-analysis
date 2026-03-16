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
    _migrate(conn)
    conn.commit()
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """
    Idempotent migrations for schema changes added after initial deployment.
    Each step is safe to run on an already-migrated database.
    """
    # v2: add display_name column to account_terms
    existing = {row[1] for row in conn.execute("PRAGMA table_info(account_terms)")}
    if "display_name" not in existing:
        conn.execute("ALTER TABLE account_terms ADD COLUMN display_name TEXT")

    # v2: purge any rows written with the old 28-char truncated-name scheme.
    # Full names from Monarch CSVs are always longer than 28 chars (they include
    # the "(...NNNN)" suffix), so rows with account_name ≤ 28 chars are stale.
    conn.execute("DELETE FROM account_terms WHERE length(account_name) <= 28")


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

    -- -----------------------------------------------------------------------
    -- account_terms
    --   User-configured APR, minimum payment, and optional display nickname
    --   per debt account.
    --   account_name PRIMARY KEY stores the FULL original name from
    --   accounts_history — never truncated, always matches the source data.
    --   display_name is the user-chosen nickname shown in the UI; NULL means
    --   fall back to the full account_name.
    --   INSERT OR REPLACE semantics make upserts trivial from the API.
    -- -----------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS account_terms (
        account_name  TEXT  PRIMARY KEY,
        apr           REAL  NOT NULL,   -- decimal, e.g. 0.24 for 24%
        min_payment   REAL  NOT NULL,   -- fixed monthly minimum in dollars
        display_name  TEXT              -- user nickname; NULL = use account_name
    );
    """)
