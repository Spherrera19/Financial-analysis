"""
SQLite schema initialisation for the Finance dashboard backend.

Usage:
    from backend.database import engine, init_db
    conn = init_db()          # uses default path (finance.db in project root)

`engine` is the SQLModel/SQLAlchemy engine — used by Session-based CRUD routers via get_db().
`init_db()` returns a raw sqlite3.Connection — used by get_raw_db() and engine.py functions.
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
# Raw sqlite3 interface — used by get_raw_db(), ingest.py, and engine.py
# ---------------------------------------------------------------------------

def init_db(db_path: str | Path = DB_PATH) -> sqlite3.Connection:
    """
    Open the SQLite database and run any pending schema migrations.
    Returns an open connection with row_factory set to sqlite3.Row.

    When called with the default DB_PATH, tables are assumed to exist (FastAPI
    lifespan calls create_db_tables() before any request).  When called with an
    alternate path (e.g. ':memory:' in tests), a temporary SQLModel engine is
    spun up just to bootstrap the schema — ensuring tests remain self-contained.
    """
    path_str = str(db_path)
    conn = sqlite3.connect(path_str, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")

    # Bootstrap tables for non-default paths (tests, one-off scripts).
    # We can't use create_engine("sqlite:///:memory:") here because each
    # SQLAlchemy engine connection to :memory: is a separate empty database.
    # Instead we emit DDL directly on the existing raw sqlite3 connection by
    # wrapping it in a sqlalchemy creator function.
    if path_str != str(DB_PATH):
        from sqlalchemy import create_engine as _sa_create_engine
        _tmp_engine = _sa_create_engine("sqlite://", creator=lambda: conn)
        SQLModel.metadata.create_all(_tmp_engine)

    _migrate(conn)
    conn.commit()
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """
    Idempotent migrations for schema changes added after initial deployment.
    Each step is safe to run on an already-migrated database.

    Table creation is handled by SQLModel.metadata.create_all() (via create_db_tables).
    This function only handles ALTER TABLE changes and data backfills.
    Each ALTER TABLE step is skipped entirely when the parent table doesn't exist
    yet (e.g. brand-new :memory: databases created in tests before tables are seeded).
    """
    existing_tables = {
        row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }

    # v2: add display_name column to account_terms
    if "account_terms" in existing_tables:
        existing = {row[1] for row in conn.execute("PRAGMA table_info(account_terms)")}
        if "display_name" not in existing:
            conn.execute("ALTER TABLE account_terms ADD COLUMN display_name TEXT")

        # v2: purge any rows written with the old 28-char truncated-name scheme.
        conn.execute("DELETE FROM account_terms WHERE length(account_name) <= 28")

    # v3: add source column to equity_grants
    if "equity_grants" in existing_tables:
        existing_eq = {row[1] for row in conn.execute("PRAGMA table_info(equity_grants)")}
        if "source" not in existing_eq:
            conn.execute(
                "ALTER TABLE equity_grants ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"
            )

    # v4: seed routing_targets when table is empty
    if "routing_targets" in existing_tables and conn.execute("SELECT COUNT(*) FROM routing_targets").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO routing_targets (name, monthly_amount, category, priority) VALUES (?, ?, ?, ?)",
            [
                ("Fixed Auto-Pay (x6011)", 2500.0, "bills",     1),
                ("Shared Living (x5252)",   950.0, "living",    2),
                ("Wife Personal",           815.0, "allowance", 3),
                ("Steven Personal",         410.0, "allowance", 3),
            ],
        )

    # v4: one-time backfill — populate categories from existing transaction data.
    if "categories" in existing_tables and "transactions" in existing_tables:
        conn.execute("""
            INSERT OR IGNORE INTO categories (name)
            SELECT DISTINCT category FROM transactions
            WHERE category IS NOT NULL AND category != ''
        """)

    # v5: add retirement_accounts table (for databases predating SQLModel migration)
    if "retirement_accounts" not in existing_tables:
        conn.execute("""
            CREATE TABLE retirement_accounts (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                account_name          TEXT NOT NULL,
                account_type          TEXT NOT NULL,
                owner                 TEXT NOT NULL,
                annual_limit          REAL NOT NULL,
                ytd_contributions     REAL NOT NULL DEFAULT 0.0,
                employer_match_amount REAL,
                employer_match_target REAL
            )
        """)

    # v6: seed default TaxProfile singleton (id=1) when table is empty
    if "tax_profiles" in existing_tables and \
       conn.execute("SELECT COUNT(*) FROM tax_profiles").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO tax_profiles (id, filing_status, gross_w2_income, estimated_annual_withholdings) "
            "VALUES (1, 'MFJ', 0.0, 0.0)"
        )

    # v7: seed default UserProfile rows (Steven + Wife) when table is empty
    if "userprofile" in existing_tables and \
       conn.execute("SELECT COUNT(*) FROM userprofile").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO userprofile (name, is_primary) VALUES ('Steven', 1)"
        )
        conn.execute(
            "INSERT INTO userprofile (name, is_primary) VALUES ('Wife', 0)"
        )

    # v7: add user_id column to retirement_accounts if missing, then backfill from owner string
    if "retirement_accounts" in existing_tables:
        existing_ra = {row[1] for row in conn.execute("PRAGMA table_info(retirement_accounts)")}
        if "user_id" not in existing_ra:
            conn.execute("ALTER TABLE retirement_accounts ADD COLUMN user_id INTEGER")

        # Backfill user_id from owner string for any rows still NULL.
        # Only run if the legacy owner column still exists (pre-migration databases).
        if "userprofile" in existing_tables:
            has_owner_col = "owner" in {row[1] for row in conn.execute("PRAGMA table_info(retirement_accounts)")}
            if has_owner_col:
                conn.execute("""
                    UPDATE retirement_accounts
                    SET user_id = (
                        SELECT id FROM userprofile
                        WHERE LOWER(userprofile.name) = LOWER(retirement_accounts.owner)
                        LIMIT 1
                    )
                    WHERE user_id IS NULL
                      AND owner IS NOT NULL
                      AND owner != ''
                """)

    # v8: seed default Ledger + LedgerAccess rows when tables are empty
    if "ledger" in existing_tables and \
       conn.execute("SELECT COUNT(*) FROM ledger").fetchone()[0] == 0:
        conn.execute("INSERT INTO ledger (name, type) VALUES ('Household', 'joint')")
        conn.execute("INSERT INTO ledger (name, type) VALUES ('Steven Private', 'personal')")
        conn.execute("INSERT INTO ledger (name, type) VALUES ('Wife Private', 'personal')")

    if "ledgeraccess" in existing_tables and "ledger" in existing_tables and \
       "userprofile" in existing_tables and \
       conn.execute("SELECT COUNT(*) FROM ledgeraccess").fetchone()[0] == 0:
        # Resolve dynamic IDs so the seed is position-independent
        household_id = conn.execute(
            "SELECT id FROM ledger WHERE name='Household' LIMIT 1"
        ).fetchone()
        steven_priv_id = conn.execute(
            "SELECT id FROM ledger WHERE name='Steven Private' LIMIT 1"
        ).fetchone()
        wife_priv_id = conn.execute(
            "SELECT id FROM ledger WHERE name='Wife Private' LIMIT 1"
        ).fetchone()
        steven_id = conn.execute(
            "SELECT id FROM userprofile WHERE name='Steven' LIMIT 1"
        ).fetchone()
        wife_id = conn.execute(
            "SELECT id FROM userprofile WHERE name='Wife' LIMIT 1"
        ).fetchone()

        if all(r is not None for r in [household_id, steven_priv_id, wife_priv_id, steven_id, wife_id]):
            h, sp, wp = household_id[0], steven_priv_id[0], wife_priv_id[0]
            sid, wid = steven_id[0], wife_id[0]
            conn.executemany(
                "INSERT OR IGNORE INTO ledgeraccess (user_id, ledger_id, role) VALUES (?, ?, ?)",
                [
                    (sid, h,  "admin"),
                    (sid, sp, "admin"),
                    (wid, h,  "admin"),
                    (wid, wp, "admin"),
                ],
            )

    # v8: add ledger_id column to retirement_accounts and incomesource, backfill to Household
    household_row = None
    if "ledger" in existing_tables:
        household_row = conn.execute(
            "SELECT id FROM ledger WHERE name='Household' LIMIT 1"
        ).fetchone()

    if "retirement_accounts" in existing_tables:
        ra_cols = {row[1] for row in conn.execute("PRAGMA table_info(retirement_accounts)")}
        if "ledger_id" not in ra_cols:
            conn.execute("ALTER TABLE retirement_accounts ADD COLUMN ledger_id INTEGER")
        if household_row is not None:
            conn.execute(
                "UPDATE retirement_accounts SET ledger_id = ? WHERE ledger_id IS NULL",
                (household_row[0],),
            )

    if "incomesource" in existing_tables:
        is_cols = {row[1] for row in conn.execute("PRAGMA table_info(incomesource)")}
        if "ledger_id" not in is_cols:
            conn.execute("ALTER TABLE incomesource ADD COLUMN ledger_id INTEGER")
        if household_row is not None:
            conn.execute(
                "UPDATE incomesource SET ledger_id = ? WHERE ledger_id IS NULL",
                (household_row[0],),
            )

    # v9: add ledger_id to transactions, categories, equity_grants; backfill all rows to Household
    if "transactions" in existing_tables:
        tx_cols = {row[1] for row in conn.execute("PRAGMA table_info(transactions)")}
        if "ledger_id" not in tx_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN ledger_id INTEGER")
        if household_row is not None:
            conn.execute(
                "UPDATE transactions SET ledger_id = ? WHERE ledger_id IS NULL",
                (household_row[0],),
            )

    if "categories" in existing_tables:
        cat_cols = {row[1] for row in conn.execute("PRAGMA table_info(categories)")}
        if "ledger_id" not in cat_cols:
            conn.execute("ALTER TABLE categories ADD COLUMN ledger_id INTEGER")
        if household_row is not None:
            conn.execute(
                "UPDATE categories SET ledger_id = ? WHERE ledger_id IS NULL",
                (household_row[0],),
            )

    if "equity_grants" in existing_tables:
        eg_cols = {row[1] for row in conn.execute("PRAGMA table_info(equity_grants)")}
        if "ledger_id" not in eg_cols:
            conn.execute("ALTER TABLE equity_grants ADD COLUMN ledger_id INTEGER")
        if household_row is not None:
            conn.execute(
                "UPDATE equity_grants SET ledger_id = ? WHERE ledger_id IS NULL",
                (household_row[0],),
            )


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
