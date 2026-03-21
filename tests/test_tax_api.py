"""Integration tests for the tax profile and estimate API endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401
from backend.main import app
from backend.deps import get_db


@pytest.fixture()
def client():
    """TestClient backed by an isolated in-memory SQLModel database."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    # Seed the singleton TaxProfile row (id=1) — mirrors what _migrate() does in prod
    with Session(test_engine) as session:
        from backend.models import TaxProfile
        session.add(TaxProfile(
            id=1,
            filing_status="MFJ",
            gross_w2_income=0.0,
            estimated_annual_withholdings=0.0,
        ))
        session.commit()

    def override():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── GET /api/tax/profile ──────────────────────────────────────────────────────

def test_get_profile_returns_default_row(client):
    """GET /api/tax/profile returns the seeded singleton row."""
    r = client.get("/api/tax/profile")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == 1
    assert body["filing_status"] == "MFJ"
    assert body["gross_w2_income"] == 0.0
    assert body["estimated_annual_withholdings"] == 0.0


def test_get_profile_shape(client):
    """GET /api/tax/profile returns all expected fields."""
    r = client.get("/api/tax/profile")
    assert set(r.json().keys()) == {
        "id", "filing_status", "gross_w2_income", "estimated_annual_withholdings"
    }


# ── PUT /api/tax/profile ──────────────────────────────────────────────────────

def test_put_profile_updates_gross_income(client):
    """PUT /api/tax/profile persists gross_w2_income."""
    r = client.put("/api/tax/profile", json={"gross_w2_income": 180_000.0})
    assert r.status_code == 200
    assert r.json()["gross_w2_income"] == 180_000.0

    # Verify persisted
    r2 = client.get("/api/tax/profile")
    assert r2.json()["gross_w2_income"] == 180_000.0


def test_put_profile_partial_update(client):
    """PUT accepts partial body — untouched fields are unchanged."""
    client.put("/api/tax/profile", json={"gross_w2_income": 150_000.0})
    client.put("/api/tax/profile", json={"estimated_annual_withholdings": 25_000.0})
    r = client.get("/api/tax/profile")
    data = r.json()
    assert data["gross_w2_income"] == 150_000.0
    assert data["estimated_annual_withholdings"] == 25_000.0


def test_put_empty_body_returns_400(client):
    """PUT with an empty body returns 400."""
    r = client.put("/api/tax/profile", json={})
    assert r.status_code == 400


# ── GET /api/tax/estimate ─────────────────────────────────────────────────────

def test_estimate_with_zero_income(client):
    """Estimate returns all zeros when gross income is 0."""
    r = client.get("/api/tax/estimate")
    assert r.status_code == 200
    body = r.json()
    assert body["gross_w2_income"] == 0.0
    assert body["estimated_federal_tax"] == 0.0
    assert body["net_owed"] == 0.0


def test_estimate_calculates_tax_correctly(client):
    """Estimate uses the tax engine to compute correct bracket math.

    gross=200000, no pre-tax retirement → taxable=170800
    Expected total tax ≈ 27682.00 (see test_tax_engine.py for bracket breakdown)
    """
    client.put("/api/tax/profile", json={"gross_w2_income": 200_000.0})
    r = client.get("/api/tax/estimate")
    body = r.json()
    assert body["gross_w2_income"] == 200_000.0
    assert body["agi"] == 200_000.0          # no retirement contributions
    assert body["standard_deduction"] == 29_200.0
    assert body["taxable_income"] == 170_800.0
    assert abs(body["estimated_federal_tax"] - 27_682.0) < 1.0


def test_estimate_includes_retirement_deductions(client):
    """Estimate sums 401k + HSA contributions and reduces AGI."""
    client.put("/api/tax/profile", json={"gross_w2_income": 200_000.0})

    # Use retirement API to create accounts (exercises the full stack)
    client.post("/api/retirement", json={
        "account_name": "Steven 401k",
        "account_type": "401k",
        "annual_limit": 23_000.0,
        "ytd_contributions": 12_000.0,
    })
    client.post("/api/retirement", json={
        "account_name": "Wife HSA",
        "account_type": "HSA",
        "annual_limit": 8_300.0,
        "ytd_contributions": 4_000.0,
    })

    r = client.get("/api/tax/estimate")
    body = r.json()
    assert body["pre_tax_retirement_deductions"] == 16_000.0  # 12000 + 4000
    assert body["agi"] == 184_000.0                           # 200000 - 16000


def test_estimate_excludes_roth_from_deductions(client):
    """Roth IRA contributions are after-tax and must NOT reduce AGI."""
    client.put("/api/tax/profile", json={"gross_w2_income": 200_000.0})
    client.post("/api/retirement", json={
        "account_name": "Wife Roth IRA",
        "account_type": "Roth IRA",
        "annual_limit": 7_000.0,
        "ytd_contributions": 7_000.0,
    })
    r = client.get("/api/tax/estimate")
    body = r.json()
    # Roth should NOT appear in pre_tax_retirement_deductions
    assert body["pre_tax_retirement_deductions"] == 0.0
    assert body["agi"] == 200_000.0


def test_estimate_excludes_roth_401k_variant(client):
    """Account typed as 'Roth 401k' is after-tax and must NOT reduce AGI."""
    client.put("/api/tax/profile", json={"gross_w2_income": 200_000.0})
    client.post("/api/retirement", json={
        "account_name": "Steven Roth 401k",
        "account_type": "Roth 401k",
        "annual_limit": 23_000.0,
        "ytd_contributions": 10_000.0,
    })
    r = client.get("/api/tax/estimate")
    body = r.json()
    assert body["pre_tax_retirement_deductions"] == 0.0
    assert body["agi"] == 200_000.0


def test_estimate_case_insensitive_type_matching(client):
    """Account type '401K' (uppercase K) is treated the same as '401k'."""
    client.put("/api/tax/profile", json={"gross_w2_income": 200_000.0})
    client.post("/api/retirement", json={
        "account_name": "Steven 401K",
        "account_type": "401K",
        "annual_limit": 23_000.0,
        "ytd_contributions": 5_000.0,
    })
    r = client.get("/api/tax/estimate")
    body = r.json()
    assert body["pre_tax_retirement_deductions"] == 5_000.0


def test_estimate_net_owed_refund(client):
    """net_owed is negative when withholdings exceed tax owed (refund scenario)."""
    client.put("/api/tax/profile", json={
        "gross_w2_income": 100_000.0,
        "estimated_annual_withholdings": 15_000.0,
    })
    r = client.get("/api/tax/estimate")
    body = r.json()
    # Tax on $70800 taxable ≈ 8032; withholdings 15000 → net_owed ≈ -6968 (refund)
    assert body["net_owed"] < 0


def test_estimate_net_owed_tax_bomb(client):
    """net_owed is positive when withholdings are less than tax owed."""
    client.put("/api/tax/profile", json={
        "gross_w2_income": 300_000.0,
        "estimated_annual_withholdings": 10_000.0,
    })
    r = client.get("/api/tax/estimate")
    body = r.json()
    assert body["net_owed"] > 0


def test_estimate_response_shape(client):
    """GET /api/tax/estimate returns all expected fields."""
    r = client.get("/api/tax/estimate")
    expected_keys = {
        "filing_status", "gross_w2_income", "pre_tax_retirement_deductions",
        "agi", "standard_deduction", "taxable_income",
        "estimated_federal_tax", "estimated_annual_withholdings", "net_owed",
    }
    assert set(r.json().keys()) == expected_keys
