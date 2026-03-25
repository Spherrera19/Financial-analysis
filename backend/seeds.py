"""
Idempotent startup seeds — data that must exist for the app to function.
Called on every FastAPI startup via main.py lifespan.
DDL (table creation / ALTER TABLE) is handled by Alembic, not here.
"""
from __future__ import annotations
import sqlite3


def run_seeds(conn: sqlite3.Connection) -> None:
    """
    Insert default rows for lookup tables when they are empty.
    Every statement uses INSERT OR IGNORE / count-check semantics
    so it is safe to call on a fully-seeded production database.
    """
    # v4: default routing targets
    if conn.execute("SELECT COUNT(*) FROM routing_targets").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO routing_targets (name, monthly_amount, category, priority) VALUES (?, ?, ?, ?)",
            [
                ("Fixed Auto-Pay (x6011)", 2500.0, "bills",     1),
                ("Shared Living (x5252)",   950.0, "living",    2),
                ("Wife Personal",           815.0, "allowance", 3),
                ("Steven Personal",         410.0, "allowance", 3),
            ],
        )

    # v4: backfill categories from existing transactions
    conn.execute("""
        INSERT OR IGNORE INTO categories (name)
        SELECT DISTINCT category FROM transactions
        WHERE category IS NOT NULL AND category != ''
    """)

    # v6: default TaxProfile singleton (id=1)
    if conn.execute("SELECT COUNT(*) FROM tax_profiles").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO tax_profiles (id, filing_status, gross_w2_income, estimated_annual_withholdings) "
            "VALUES (1, 'MFJ', 0.0, 0.0)"
        )

    # v7: default UserProfile rows
    if conn.execute("SELECT COUNT(*) FROM userprofile").fetchone()[0] == 0:
        conn.execute("INSERT INTO userprofile (name, is_primary) VALUES ('Steven', 1)")
        conn.execute("INSERT INTO userprofile (name, is_primary) VALUES ('Wife', 0)")

    # v8: default Ledger rows (Check by name, not by empty table)
    conn.execute("INSERT INTO ledger (name, type) SELECT 'Household', 'joint' WHERE NOT EXISTS (SELECT 1 FROM ledger WHERE name='Household')")
    conn.execute("INSERT INTO ledger (name, type) SELECT 'Steven Private', 'personal' WHERE NOT EXISTS (SELECT 1 FROM ledger WHERE name='Steven Private')")
    conn.execute("INSERT INTO ledger (name, type) SELECT 'Wife Private', 'personal' WHERE NOT EXISTS (SELECT 1 FROM ledger WHERE name='Wife Private')")

    # v8: LedgerAccess — Robust assignment based on primary flag, not names
    household_row = conn.execute("SELECT id FROM ledger WHERE name='Household' LIMIT 1").fetchone()
    steven_priv   = conn.execute("SELECT id FROM ledger WHERE name='Steven Private' LIMIT 1").fetchone()
    wife_priv     = conn.execute("SELECT id FROM ledger WHERE name='Wife Private' LIMIT 1").fetchone()

    # Grab users by role, not hardcoded name
    primary_user  = conn.execute("SELECT id FROM userprofile WHERE is_primary=1 LIMIT 1").fetchone()
    secondary_user= conn.execute("SELECT id FROM userprofile WHERE is_primary=0 LIMIT 1").fetchone()

    if household_row:
        h_id = household_row[0]

        # 1. Grant Primary User access to Household & Personal
        if primary_user:
            p_id = primary_user[0]
            conn.execute("INSERT INTO ledgeraccess (user_id, ledger_id, role) SELECT ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM ledgeraccess WHERE user_id=? AND ledger_id=?)", (p_id, h_id, p_id, h_id))
            if steven_priv:
                conn.execute("INSERT INTO ledgeraccess (user_id, ledger_id, role) SELECT ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM ledgeraccess WHERE user_id=? AND ledger_id=?)", (p_id, steven_priv[0], p_id, steven_priv[0]))

        # 2. Grant Secondary User access to Household & Personal
        if secondary_user:
            s_id = secondary_user[0]
            conn.execute("INSERT INTO ledgeraccess (user_id, ledger_id, role) SELECT ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM ledgeraccess WHERE user_id=? AND ledger_id=?)", (s_id, h_id, s_id, h_id))
            if wife_priv:
                conn.execute("INSERT INTO ledgeraccess (user_id, ledger_id, role) SELECT ?, ?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM ledgeraccess WHERE user_id=? AND ledger_id=?)", (s_id, wife_priv[0], s_id, wife_priv[0]))

    # v9: DATA RESCUE - Assign any orphaned/unmapped transactions to Household
    if household_row:
        conn.execute(
            "UPDATE transactions SET ledger_id = ? WHERE ledger_id IS NULL OR ledger_id NOT IN (SELECT id FROM ledger)",
            (household_row[0],)
        )

    conn.commit()
