"""Integration tests for the UserProfile and IncomeSource API endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 — registers all table=True classes
from backend.main import app
from backend.deps import get_db
from backend.models import Ledger, UserProfile


@pytest.fixture()
def client():
    """
    TestClient backed by an isolated in-memory DB.
    Seeded: two UserProfiles + one Household Ledger (id=1).
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as session:
        session.add(UserProfile(id=1, name="Steven", is_primary=True))
        session.add(UserProfile(id=2, name="Wife",   is_primary=False))
        session.add(Ledger(id=1, name="Household", type="joint"))
        session.commit()

    def override():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── GET /api/profiles ─────────────────────────────────────────────────────────

def test_get_profiles_returns_seeded_members(client):
    """GET /api/profiles returns both seeded household members."""
    r = client.get("/api/profiles")
    assert r.status_code == 200
    assert {p["name"] for p in r.json()} == {"Steven", "Wife"}


def test_get_profiles_shape(client):
    """Each profile entry has exactly the expected fields."""
    r = client.get("/api/profiles")
    assert set(r.json()[0].keys()) == {"id", "name", "is_primary"}


def test_primary_flag_is_correct(client):
    """Steven is is_primary=True; Wife is is_primary=False."""
    data   = client.get("/api/profiles").json()
    steven = next(p for p in data if p["name"] == "Steven")
    wife   = next(p for p in data if p["name"] == "Wife")
    assert steven["is_primary"] is True
    assert wife["is_primary"]   is False


# ── PUT /api/profiles/{id} ────────────────────────────────────────────────────

def test_put_profile_renames(client):
    """PUT /api/profiles/{id} persists a new name."""
    profiles  = client.get("/api/profiles").json()
    steven_id = next(p["id"] for p in profiles if p["name"] == "Steven")

    r = client.put(f"/api/profiles/{steven_id}", json={"name": "Steve"})
    assert r.status_code == 200
    assert r.json()["name"] == "Steve"

    names = {p["name"] for p in client.get("/api/profiles").json()}
    assert "Steve" in names
    assert "Steven" not in names


def test_put_profile_nonexistent_returns_404(client):
    """PUT /api/profiles/999 returns 404 when no such profile exists."""
    r = client.put("/api/profiles/999", json={"name": "Ghost"})
    assert r.status_code == 404


def test_put_profile_empty_body_returns_400(client):
    """PUT with an empty body returns 400."""
    r = client.put("/api/profiles/1", json={})
    assert r.status_code == 400


# ── GET /api/incomes (empty) ──────────────────────────────────────────────────

def test_get_incomes_returns_empty_list(client):
    """GET /api/incomes returns [] when no income sources have been created."""
    r = client.get("/api/incomes")
    assert r.status_code == 200
    assert r.json() == []


# ── POST /api/incomes ─────────────────────────────────────────────────────────

def test_post_income_creates_w2_source(client):
    """POST /api/incomes creates a W2 income source linked to the Household ledger."""
    r = client.post("/api/incomes", json={
        "ledger_id": 1,
        "source_type": "W2",
        "gross_amount": 150_000.0,
        "estimated_withholdings": 25_000.0,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["id"] is not None
    assert body["ledger_id"] == 1
    assert body["source_type"] == "W2"
    assert body["gross_amount"] == 150_000.0
    assert body["estimated_withholdings"] == 25_000.0


def test_post_income_creates_llc_source(client):
    """POST /api/incomes accepts 'LLC' as a source_type."""
    r = client.post("/api/incomes", json={
        "ledger_id": 1,
        "source_type": "LLC",
        "gross_amount": 40_000.0,
        "estimated_withholdings": 0.0,
    })
    assert r.status_code == 201
    assert r.json()["source_type"] == "LLC"


def test_post_income_invalid_ledger_id_returns_404(client):
    """POST /api/incomes with a non-existent ledger_id returns 404."""
    r = client.post("/api/incomes", json={
        "ledger_id": 999,
        "source_type": "W2",
        "gross_amount": 50_000.0,
        "estimated_withholdings": 8_000.0,
    })
    assert r.status_code == 404


def test_get_incomes_returns_all_created(client):
    """GET /api/incomes returns all created income sources."""
    client.post("/api/incomes", json={"ledger_id": 1, "source_type": "W2",  "gross_amount": 150_000.0, "estimated_withholdings": 25_000.0})
    client.post("/api/incomes", json={"ledger_id": 1, "source_type": "W2",  "gross_amount": 90_000.0,  "estimated_withholdings": 15_000.0})

    r = client.get("/api/incomes")
    assert len(r.json()) == 2


# ── PUT /api/incomes/{id} ─────────────────────────────────────────────────────

def test_put_income_updates_gross_amount(client):
    """PUT /api/incomes/{id} updates gross_amount."""
    post_r = client.post("/api/incomes", json={
        "ledger_id": 1, "source_type": "W2",
        "gross_amount": 100_000.0, "estimated_withholdings": 15_000.0,
    })
    income_id = post_r.json()["id"]

    r = client.put(f"/api/incomes/{income_id}", json={"gross_amount": 120_000.0})
    assert r.status_code == 200
    assert r.json()["gross_amount"] == 120_000.0


def test_put_income_nonexistent_returns_404(client):
    """PUT /api/incomes/999 returns 404."""
    r = client.put("/api/incomes/999", json={"gross_amount": 50_000.0})
    assert r.status_code == 404


def test_put_income_empty_body_returns_400(client):
    """PUT /api/incomes/{id} with empty body returns 400."""
    post_r = client.post("/api/incomes", json={
        "ledger_id": 1, "source_type": "W2",
        "gross_amount": 100_000.0, "estimated_withholdings": 15_000.0,
    })
    income_id = post_r.json()["id"]

    r = client.put(f"/api/incomes/{income_id}", json={})
    assert r.status_code == 400


# ── DELETE /api/incomes/{id} ──────────────────────────────────────────────────

def test_delete_income_removes_record(client):
    """DELETE /api/incomes/{id} returns 204 and the record no longer exists."""
    post_r = client.post("/api/incomes", json={
        "ledger_id": 1, "source_type": "1099",
        "gross_amount": 20_000.0, "estimated_withholdings": 0.0,
    })
    income_id = post_r.json()["id"]

    r = client.delete(f"/api/incomes/{income_id}")
    assert r.status_code == 204
    assert all(i["id"] != income_id for i in client.get("/api/incomes").json())


def test_delete_income_nonexistent_returns_404(client):
    """DELETE /api/incomes/999 returns 404."""
    r = client.delete("/api/incomes/999")
    assert r.status_code == 404
