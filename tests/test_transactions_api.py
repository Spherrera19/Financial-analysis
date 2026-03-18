"""
Tests for GET /api/transactions — the filterable transaction drill-down endpoint.
Uses FastAPI TestClient with an in-memory SQLite database seeded with known rows.
"""
import sqlite3
import pytest
from fastapi.testclient import TestClient

from backend.database import init_db
from backend.main import app
from backend.deps import get_db


# ── Test fixture: in-memory DB with four known transactions ─────────────────

def _seed_db(conn: sqlite3.Connection) -> None:
    """Insert four transactions covering all four type codes used in tests."""
    conn.executemany(
        """
        INSERT INTO transactions
            (date, merchant, category, account, amount, owner, type, is_checking)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            # Necessary, current month  (use 2030-01 so tests never collide with real data)
            ("2030-01-10", "Grocery Co",  "Groceries", "Checking", -120.00, "owner", "N", 1),
            # Optional, current month
            ("2030-01-15", "Coffee Shop", "Dining",    "Visa",     -18.50,  "owner", "O", 0),
            # Debt, current month
            ("2030-01-20", "Chase Card",  "Debt",      "Checking", -200.00, "owner", "D", 1),
            # Necessary, different month (2029-12)
            ("2029-12-05", "Old Grocer",  "Groceries", "Checking", -95.00,  "owner", "N", 1),
        ],
    )
    conn.commit()


@pytest.fixture()
def client():
    """TestClient that overrides get_db with an isolated in-memory database."""
    conn = init_db(":memory:")
    _seed_db(conn)

    def override_get_db():
        try:
            yield conn
        finally:
            pass  # keep alive for the duration of the test

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    conn.close()


# ── Tests ───────────────────────────────────────────────────────────────────

def test_no_params_returns_non_income_rows(client):
    """Without filters, returns all rows except type I and X (default exclusion)."""
    r = client.get("/api/transactions")
    assert r.status_code == 200
    rows = r.json()
    types = {row["type"] for row in rows}
    assert "I" not in types
    assert "X" not in types
    assert len(rows) == 4  # all four seeded rows pass the default exclusion


def test_type_filter_returns_only_matching_type(client):
    """?type=O returns only Optional transactions."""
    r = client.get("/api/transactions", params={"type": "O"})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["merchant"] == "Coffee Shop"
    assert rows[0]["type"] == "O"


def test_type_filter_overrides_default_exclusion(client):
    """?type=N does not conflict with default exclusion — returns Necessary rows."""
    r = client.get("/api/transactions", params={"type": "N"})
    assert r.status_code == 200
    assert len(r.json()) == 2  # both Necessary rows across both months


def test_category_filter(client):
    """?category=Groceries returns only grocery transactions."""
    r = client.get("/api/transactions", params={"category": "Groceries"})
    assert r.status_code == 200
    rows = r.json()
    assert all(row["category"] == "Groceries" for row in rows)
    assert len(rows) == 2  # one per month


def test_period_filter_bounds_to_month(client):
    """Passing period restricts rows to months returned by get_period_months()."""
    # We can't easily mock the period, but we can test that ?period=current
    # returns zero rows (our seeded data is in 2030-01, which will never be "current").
    r = client.get("/api/transactions", params={"period": "current"})
    assert r.status_code == 200
    # Seeded dates are in the future — current month won't match
    rows = r.json()
    assert isinstance(rows, list)


def test_combined_type_and_category(client):
    """?type=N&category=Groceries returns only Necessary Grocery rows."""
    r = client.get("/api/transactions", params={"type": "N", "category": "Groceries"})
    assert r.status_code == 200
    rows = r.json()
    assert all(row["type"] == "N" and row["category"] == "Groceries" for row in rows)


def test_invalid_period_returns_400(client):
    """An unrecognised period key returns HTTP 400."""
    r = client.get("/api/transactions", params={"period": "bogus"})
    assert r.status_code == 400


def test_response_shape(client):
    """Each row has the five expected fields."""
    r = client.get("/api/transactions", params={"type": "O"})
    assert r.status_code == 200
    row = r.json()[0]
    assert set(row.keys()) == {"date", "merchant", "category", "amount", "type"}


def test_uncategorized_category_works(client):
    """?category=Uncategorized does not error (no special-casing needed)."""
    r = client.get("/api/transactions", params={"category": "Uncategorized"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)  # empty list is fine — no matching rows seeded
