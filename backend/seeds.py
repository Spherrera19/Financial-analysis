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

    # v8: LedgerAccess — Always ensure primary users have access to defaults
    household_row = conn.execute("SELECT id FROM ledger WHERE name='Household' LIMIT 1").fetchone()
    steven_priv   = conn.execute("SELECT id FROM ledger WHERE name='Steven Private' LIMIT 1").fetchone()
    wife_priv     = conn.execute("SELECT id FROM ledger WHERE name='Wife Private' LIMIT 1").fetchone()
    steven_id     = conn.execute("SELECT id FROM userprofile WHERE name='Steven' LIMIT 1").fetchone()
    wife_id       = conn.execute("SELECT id FROM userprofile WHERE name='Wife' LIMIT 1").fetchone()

    if all(r is not None for r in [household_row, steven_priv, wife_priv, steven_id, wife_id]):
        h, sp, wp = household_row[0], steven_priv[0], wife_priv[0]
        sid, wid  = steven_id[0], wife_id[0]

        access_data = [
            (sid, h,  "admin"), (sid, sp, "admin"),
            (wid, h,  "admin"), (wid, wp, "admin"),
        ]
        for uid, lid, role in access_data:
            conn.execute(
                "INSERT INTO ledgeraccess (user_id, ledger_id, role) "
                "SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM ledgeraccess WHERE user_id=? AND ledger_id=?)",
                (uid, lid, role, uid, lid)
            )

    # v9: DATA RESCUE - Assign any orphaned/unmapped transactions to Household
    if household_row:
        conn.execute(
            "UPDATE transactions SET ledger_id = ? WHERE ledger_id IS NULL OR ledger_id NOT IN (SELECT id FROM ledger)",
            (household_row[0],)
        )

    conn.commit()
