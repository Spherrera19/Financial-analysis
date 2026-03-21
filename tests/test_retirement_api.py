"""Tests for the retirement_accounts CRUD API."""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy import inspect
from sqlalchemy.pool import StaticPool
import backend.models  # noqa: F401

from backend.main import app
from backend.deps import get_db


# ── Fixture (used by CRUD API tests added in Task 3) ─────────────────────────

@pytest.fixture()
def client():
    """TestClient backed by an isolated in-memory SQLModel database."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    def override():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── Schema ───────────────────────────────────────────────────────────────────

def test_retirement_accounts_table_exists():
    """SQLModel creates the retirement_accounts table."""
    test_engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    SQLModel.metadata.create_all(test_engine)
    tables = set(inspect(test_engine).get_table_names())
    assert "retirement_accounts" in tables


def test_retirement_accounts_columns():
    """retirement_accounts has the expected columns (owner/user_id replaced by ledger_id FK)."""
    test_engine = create_engine("sqlite:///:memory:", poolclass=StaticPool)
    SQLModel.metadata.create_all(test_engine)
    cols = {c["name"] for c in inspect(test_engine).get_columns("retirement_accounts")}
    expected = {
        "id", "account_name", "account_type", "ledger_id",
        "annual_limit", "ytd_contributions",
        "employer_match_amount", "employer_match_target",
    }
    assert expected == cols


# ── Helpers ──────────────────────────────────────────────────────────────────

def _seed_account(client, **overrides):
    """POST one account and return the created id."""
    payload = {
        "account_name": "Steven 401k",
        "account_type": "401k",
        "ledger_id": None,
        "annual_limit": 23000.0,
        "ytd_contributions": 5000.0,
        "employer_match_amount": None,
        "employer_match_target": None,
        **overrides,
    }
    r = client.post("/api/retirement", json=payload)
    assert r.status_code == 201
    return r.json()["id"]


# ── GET ───────────────────────────────────────────────────────────────────────

def test_get_empty_list(client):
    """GET /api/retirement returns [] when no accounts exist."""
    r = client.get("/api/retirement")
    assert r.status_code == 200
    assert r.json() == []


def test_get_returns_accounts_ordered_by_ledger_id_then_type(client):
    """GET returns accounts ordered by ledger_id ASC, account_type ASC."""
    # ledger_id=2 seeded first to verify ordering is by ledger_id not insertion order
    _seed_account(client, ledger_id=2, account_type="HSA",      account_name="Wife HSA")
    _seed_account(client, ledger_id=1, account_type="Roth IRA", account_name="Steven Roth")
    _seed_account(client, ledger_id=1, account_type="401k",     account_name="Steven 401k")

    r = client.get("/api/retirement")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 3
    # ledger_id=1 (lower) comes first
    assert rows[0]["ledger_id"] == 1
    assert rows[0]["account_type"] == "401k"   # 401k before Roth IRA alphabetically
    assert rows[1]["account_type"] == "Roth IRA"
    assert rows[2]["ledger_id"] == 2


def test_get_response_shape(client):
    """Each item has all expected fields (user_id replaced by ledger_id)."""
    _seed_account(client, employer_match_target=5750.0, employer_match_amount=1200.0)
    r = client.get("/api/retirement")
    row = r.json()[0]
    expected_keys = {
        "id", "account_name", "account_type", "ledger_id",
        "annual_limit", "ytd_contributions",
        "employer_match_amount", "employer_match_target",
    }
    assert set(row.keys()) == expected_keys
    assert row["employer_match_target"] == 5750.0
    assert row["employer_match_amount"] == 1200.0


# ── POST ──────────────────────────────────────────────────────────────────────

def test_post_creates_account(client):
    """POST /api/retirement returns 201 with new id."""
    r = client.post("/api/retirement", json={
        "account_name": "HSA",
        "account_type": "HSA",
        "annual_limit": 4150.0,
        "ytd_contributions": 0.0,
    })
    assert r.status_code == 201
    body = r.json()
    assert "id" in body
    assert isinstance(body["id"], int)


def test_post_null_match_fields_allowed(client):
    """POST with no match fields stores them as null."""
    _seed_account(client)
    r = client.get("/api/retirement")
    row = r.json()[0]
    assert row["employer_match_amount"] is None
    assert row["employer_match_target"] is None


# ── PUT ───────────────────────────────────────────────────────────────────────

def test_put_partial_update(client):
    """PUT /api/retirement/{id} updates only provided fields."""
    acct_id = _seed_account(client)
    r = client.put(f"/api/retirement/{acct_id}", json={"ytd_contributions": 9500.0})
    assert r.status_code == 200
    updated = r.json()
    assert updated["ytd_contributions"] == 9500.0
    assert updated["account_name"] == "Steven 401k"  # unchanged


def test_put_returns_404_for_missing_id(client):
    """PUT on non-existent id returns 404."""
    r = client.put("/api/retirement/9999", json={"ytd_contributions": 1000.0})
    assert r.status_code == 404


def test_put_empty_body_returns_400(client):
    """PUT with an empty body returns 400."""
    acct_id = _seed_account(client)
    r = client.put(f"/api/retirement/{acct_id}", json={})
    assert r.status_code == 400


# ── DELETE ────────────────────────────────────────────────────────────────────

def test_delete_removes_account(client):
    """DELETE /api/retirement/{id} returns 204 and removes the row."""
    acct_id = _seed_account(client)
    r = client.delete(f"/api/retirement/{acct_id}")
    assert r.status_code == 204
    # Confirm gone
    rows = client.get("/api/retirement").json()
    assert all(row["id"] != acct_id for row in rows)


def test_delete_returns_404_for_missing_id(client):
    """DELETE on non-existent id returns 404."""
    r = client.delete("/api/retirement/9999")
    assert r.status_code == 404
