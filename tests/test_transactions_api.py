"""
Tests for GET /api/transactions — the filterable transaction drill-down endpoint.
Uses FastAPI TestClient with an in-memory SQLite database seeded with known rows.
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy import text
from sqlalchemy.pool import StaticPool
import backend.models  # noqa: F401

from backend.main import app
from backend.deps import get_db


# ── Test fixture: in-memory DB with four known transactions ─────────────────

def _seed_db(session: Session) -> None:
    """Insert four transactions covering all type codes used in tests."""
    session.execute(text("""
        INSERT INTO transactions
            (date, merchant, category, account, amount, owner, type, is_checking)
        VALUES
            ('2030-01-10', 'Grocery Co',  'Groceries', 'Checking', -120.00, 'owner', 'N', 1),
            ('2030-01-15', 'Coffee Shop', 'Dining',    'Visa',      -18.50, 'owner', 'O', 0),
            ('2030-01-20', 'Chase Card',  'Debt',      'Checking', -200.00, 'owner', 'D', 1),
            ('2029-12-05', 'Old Grocer',  'Groceries', 'Checking',  -95.00, 'owner', 'N', 1)
    """))
    session.commit()


@pytest.fixture()
def client():
    """TestClient that overrides get_db with an isolated in-memory SQLModel database."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as seed_session:
        _seed_db(seed_session)

    def override():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


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
    """?period=current excludes rows outside the current month.

    All seeded rows are dated 2030-01 or 2029-12 — neither will ever be
    the "current" month, so the filter must return an empty list.
    If it returned all rows, this test would catch the regression.
    """
    r = client.get("/api/transactions", params={"period": "current"})
    assert r.status_code == 200
    rows = r.json()
    # Seeded dates are in 2030 / 2029 — current month filter must exclude all of them
    assert len(rows) == 0


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
