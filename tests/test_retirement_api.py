"""Tests for the retirement_accounts CRUD API."""
import sqlite3
import pytest
from fastapi.testclient import TestClient

from backend.database import init_db
from backend.main import app
from backend.deps import get_db


# ── Fixture ─────────────────────────────────────────────────────────────────

@pytest.fixture()
def client():
    """TestClient backed by an isolated in-memory database."""
    conn = init_db(":memory:")

    def override():
        try:
            yield conn
        finally:
            pass

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    conn.close()


# ── Schema ───────────────────────────────────────────────────────────────────

def test_retirement_accounts_table_exists():
    """init_db creates the retirement_accounts table."""
    conn = init_db(":memory:")
    tables = {
        row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "retirement_accounts" in tables
    conn.close()


def test_retirement_accounts_columns():
    """retirement_accounts has the expected columns."""
    conn = init_db(":memory:")
    cols = {row[1] for row in conn.execute("PRAGMA table_info(retirement_accounts)")}
    expected = {
        "id", "account_name", "account_type", "owner",
        "annual_limit", "ytd_contributions",
        "employer_match_amount", "employer_match_target",
    }
    assert expected == cols
    conn.close()
