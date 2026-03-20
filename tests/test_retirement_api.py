"""Tests for the retirement_accounts CRUD API."""
import pytest
from fastapi.testclient import TestClient

from backend.database import init_db
from backend.main import app
from backend.deps import get_db


# ── Fixture (used by CRUD API tests added in Task 3) ─────────────────────────

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


# ── Helpers ──────────────────────────────────────────────────────────────────

def _seed_account(client, **overrides):
    """POST one account and return the created id."""
    payload = {
        "account_name": "Steven 401k",
        "account_type": "401k",
        "owner": "Steven",
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


def test_get_returns_accounts_ordered_by_owner_then_type(client):
    """GET returns accounts ordered by owner ASC, account_type ASC."""
    _seed_account(client, owner="Wife",   account_type="HSA",      account_name="Wife HSA")
    _seed_account(client, owner="Steven", account_type="Roth IRA", account_name="Steven Roth")
    _seed_account(client, owner="Steven", account_type="401k",     account_name="Steven 401k")

    r = client.get("/api/retirement")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 3
    # Steven comes before Wife alphabetically
    assert rows[0]["owner"] == "Steven"
    assert rows[0]["account_type"] == "401k"   # 401k before Roth IRA
    assert rows[1]["account_type"] == "Roth IRA"
    assert rows[2]["owner"] == "Wife"


def test_get_response_shape(client):
    """Each item has all expected fields."""
    _seed_account(client, employer_match_target=5750.0, employer_match_amount=1200.0)
    r = client.get("/api/retirement")
    row = r.json()[0]
    expected_keys = {
        "id", "account_name", "account_type", "owner",
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
        "owner": "Wife",
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
