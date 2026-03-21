"""Verify SQLModel engine and table creation work correctly."""
from sqlmodel import SQLModel, create_engine
from sqlalchemy import inspect

# Must import models so SQLModel metadata is populated before create_all
import backend.models  # noqa: F401

EXPECTED_TABLES = {
    "retirement_accounts", "routing_targets", "categories",
    "accounts_history", "account_terms", "transactions", "equity_grants",
    "userprofile", "incomesource",
    "ledger", "ledgeraccess", "ledgertransfer", "notification",
}


def test_create_all_creates_all_tables():
    """SQLModel.metadata.create_all creates all seven expected tables."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    tables = set(inspect(engine).get_table_names())
    assert EXPECTED_TABLES.issubset(tables), f"Missing tables: {EXPECTED_TABLES - tables}"


def test_init_db_memory_creates_tables():
    """init_db(':memory:') bootstraps schema via creator= pattern."""
    from backend.database import init_db
    conn = init_db(":memory:")
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert EXPECTED_TABLES.issubset(tables), f"Missing tables: {EXPECTED_TABLES - tables}"
    conn.close()
