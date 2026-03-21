"""
Phase 2 — Milestone 2: CSV Ingestion ETL
=========================================
Reads the raw CSV files from the project root and populates the SQLite
database created by database.py.

Run standalone to verify:
    python -m backend.ingest           # from project root
    python backend/ingest.py           # also works
"""
from __future__ import annotations

import csv
import os
import sqlite3
from pathlib import Path

from backend.classify import TYPE_CODE, classify, is_checking
from backend.database import init_db, sync_categories_from_transactions

# ---------------------------------------------------------------------------
# Project root — one level above this file (backend/)
# ---------------------------------------------------------------------------
_BACKEND_DIR = Path(__file__).parent
_PROJECT_ROOT = _BACKEND_DIR.parent


def _find_csv_files(data_dir: Path, prefix: str) -> list[Path]:
    """Return sorted list of CSV files matching <prefix>*.csv in data_dir."""
    return sorted(data_dir.glob(f"{prefix}*.csv"))


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def _load_transactions(data_dir: Path) -> list[dict]:
    """
    Load the single most-recent Transactions_*.csv.
    Returns a list of row-dicts ready for the transactions table.
    Mirrors the load logic in generate_dashboard.py exactly.
    """
    tx_files = sorted(data_dir.glob("Transactions_*.csv"), reverse=True)
    if not tx_files:
        print("  WARNING: No Transactions_*.csv found — skipping.")
        return []

    chosen = tx_files[0]
    print(f"  Reading transactions from: {chosen.name}")

    rows = []
    skipped = 0
    with chosen.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            try:
                amount = float(raw["Amount"].replace(",", ""))
            except (ValueError, KeyError):
                skipped += 1
                continue

            category = raw.get("Category", "").strip()
            account  = raw.get("Account",  "").strip()

            rows.append({
                "date":        raw.get("Date",     "").strip(),
                "merchant":    raw.get("Merchant", "").strip(),
                "category":    category,
                "account":     account,
                "amount":      amount,
                "owner":       raw.get("Owner",    "").strip(),
                "type":        TYPE_CODE[classify(category)],
                "is_checking": 1 if is_checking(account) else 0,
            })

    if skipped:
        print(f"  Skipped {skipped} unparseable rows in {chosen.name}.")
    return rows


def _load_accounts_history(data_dir: Path) -> list[dict]:
    """
    Load ALL Balances_*.csv files to build the full account history
    (needed for the debt trend chart).
    Returns a list of row-dicts ready for the accounts_history table.
    """
    bal_files = _find_csv_files(data_dir, "Balances_")
    if not bal_files:
        print("  WARNING: No Balances_*.csv found — skipping.")
        return []

    print(f"  Reading balances from {len(bal_files)} file(s): "
          f"{[f.name for f in bal_files]}")

    rows = []
    skipped = 0
    for fpath in bal_files:
        with fpath.open(newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for raw in reader:
                try:
                    balance = float(raw["Balance"].replace(",", ""))
                except (ValueError, KeyError, TypeError):
                    skipped += 1
                    continue

                rows.append({
                    "name":    raw["Account"].strip(),
                    "balance": balance,
                    "date":    raw["Date"].strip(),
                    "type":    "asset" if balance >= 0 else "liability",
                })

    if skipped:
        print(f"  Skipped {skipped} unparseable balance rows.")
    return rows


# ---------------------------------------------------------------------------
# Insert helpers
# ---------------------------------------------------------------------------

def _insert_transactions(conn: sqlite3.Connection, rows: list[dict]) -> int:
    conn.executemany(
        """
        INSERT INTO transactions (date, merchant, category, account, amount, owner, type, is_checking, ledger_id)
        VALUES (:date, :merchant, :category, :account, :amount, :owner, :type, :is_checking, :ledger_id)
        """,
        rows,
    )
    return len(rows)


def _insert_accounts_history(conn: sqlite3.Connection, rows: list[dict]) -> int:
    conn.executemany(
        """
        INSERT INTO accounts_history (name, balance, date, type)
        VALUES (:name, :balance, :date, :type)
        """,
        rows,
    )
    return len(rows)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_database(
    db_path: str | Path = "finance.db",
    data_dir: str | Path | None = None,
) -> sqlite3.Connection:
    """
    Wipe-and-reload ETL.

    Connects to (or creates) the SQLite database at db_path, clears both
    tables, then reads all CSV files from data_dir and reloads them.

    Args:
        db_path:  Path to the SQLite file.  Defaults to "finance.db" in cwd.
        data_dir: Directory containing the CSV files.
                  Defaults to the project root (parent of backend/).

    Returns:
        The open sqlite3.Connection (caller should close when done).
    """
    data_dir = Path(data_dir) if data_dir else _PROJECT_ROOT
    db_path  = Path(db_path)

    print(f"\n[ingest] data_dir : {data_dir}")
    print(f"[ingest] db_path  : {db_path.resolve()}")

    conn = init_db(db_path)

    # ── Wipe existing data (idempotent reload) ────────────────────────────────
    print("\n[ingest] Clearing existing table data...")
    conn.execute("DELETE FROM transactions;")
    conn.execute("DELETE FROM accounts_history;")
    # Reset autoincrement counters so IDs are stable across reloads
    conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'accounts_history');")
    conn.commit()

    # ── Resolve Household ledger_id for stamping imported rows ────────────────
    # init_db() (called above) seeds the Household ledger via _migrate(), so the
    # row is guaranteed to exist by this point. We assign all CSV-imported
    # transactions to Household — the default shared workspace.
    _household = conn.execute(
        "SELECT id FROM ledger WHERE name='Household' LIMIT 1"
    ).fetchone()
    _household_id: int | None = _household[0] if _household else None

    # ── Load & insert transactions ────────────────────────────────────────────
    print("\n[ingest] Loading transactions...")
    tx_rows = _load_transactions(data_dir)
    for row in tx_rows:
        row["ledger_id"] = _household_id
    n_tx = _insert_transactions(conn, tx_rows)
    conn.commit()
    print(f"  Inserted {n_tx} transactions into SQLite.")

    # ── Load & insert accounts history ───────────────────────────────────────
    print("\n[ingest] Loading accounts history...")
    ah_rows = _load_accounts_history(data_dir)
    n_ah = _insert_accounts_history(conn, ah_rows)
    conn.commit()
    print(f"  Inserted {n_ah} account-history rows into SQLite.")

    # ── Sanity check ─────────────────────────────────────────────────────────
    print("\n[ingest] Verification queries:")

    row = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()
    print(f"  transactions        : {row[0]:>6} rows")

    row = conn.execute("SELECT COUNT(*) FROM transactions WHERE type = 'X'").fetchone()
    print(f"  transfers (type=X)  : {row[0]:>6} rows  (included; filtered at query time)")

    row = conn.execute("SELECT COUNT(*) FROM transactions WHERE type = 'I'").fetchone()
    print(f"  income  (type=I)    : {row[0]:>6} rows")

    row = conn.execute("SELECT COUNT(*) FROM accounts_history").fetchone()
    print(f"  accounts_history    : {row[0]:>6} rows")

    row = conn.execute(
        "SELECT MIN(date), MAX(date) FROM transactions WHERE date != ''"
    ).fetchone()
    print(f"  transaction date range: {row[0]}  ->  {row[1]}")

    row = conn.execute(
        "SELECT MIN(date), MAX(date) FROM accounts_history WHERE date != ''"
    ).fetchone()
    print(f"  balance date range    : {row[0]}  ->  {row[1]}")

    # ── Sync categories from freshly loaded transactions ──────────────────────
    print("\n[ingest] Syncing categories table...")
    sync_categories_from_transactions(conn)
    conn.commit()
    n_cats = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
    print(f"  categories           : {n_cats:>6} rows")

    print("\n[ingest] Done.\n")
    return conn


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    conn = build_database()
    conn.close()
