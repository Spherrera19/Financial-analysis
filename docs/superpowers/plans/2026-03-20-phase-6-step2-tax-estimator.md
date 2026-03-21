# Phase 6 Step 2 — Tax Liability Estimator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a federal tax estimation engine that reads the household's gross W2 income, pre-tax retirement deductions, and withholdings from the database, runs them through 2024 MFJ progressive brackets, and renders a "Tax Forecaster" section in the Tax/Retirement tab showing a breakdown and a big green/red net refund/owed KPI.

**Architecture:** A new `TaxProfile` singleton (always id=1) holds user-editable inputs (gross income, withholdings). A pure Python `backend/tax_engine.py` module handles the bracket math with no I/O. A new `backend/routers/tax.py` router exposes three endpoints; the estimate endpoint assembles profile + live retirement contributions, runs the engine, and returns a fully computed payload. The frontend adds a new section inside the existing `TaxRetirementTab.tsx` using two `useQuery` hooks and one `useMutation`.

**Tech Stack:** Python FastAPI, SQLModel (Session), pure Python tax math, React 19, TypeScript, TanStack Query v5, Tailwind v4.

---

## Critical design decisions (read before touching any file)

### 1. TaxProfile is a singleton — always id = 1

There is only ever one `TaxProfile` row. The GET and PUT endpoints always operate on `id=1`. The `_migrate()` function seeds this row when the table is empty. The router's GET endpoint must return 404 (not 500) if the row doesn't exist yet, as a safety net.

### 2. Pre-tax retirement deductions = 401k + HSA only (not Roth)

The spec says sum `ytd_contributions` where `account_type` is `'401k'` or `'HSA'`. Roth contributions are after-tax and must be excluded. This is the `pre_tax_retirement_deductions` value in the response.

### 3. 2024 IRS MFJ progressive brackets (hardcoded)

```
$0           – $23,200     → 10%
$23,200      – $94,300     → 12%
$94,300      – $201,050    → 22%
$201,050     – $383,900    → 24%
$383,900     – $487,450    → 32%
$487,450     – $731,200    → 35%
$731,200+                  → 37%
```
Standard deduction MFJ 2024: **$29,200**

### 4. net_owed sign convention

`net_owed = estimated_federal_tax - estimated_annual_withholdings`
- **Negative** → refund (green in UI)
- **Positive** → tax bomb (red/orange in UI)

### 5. Tax router uses `get_db()` (Session) — not `get_raw_db()`

`TaxProfile` and `RetirementAccount` are both SQLModel `table=True` classes. The tax router is pure Session-based CRUD + a compute endpoint, so it follows the same pattern as `retirement.py`.

### 6. Frontend: local input state + onBlur/Enter mutation

The user edits Gross W2 Income and Annual Withholdings in input fields. `useMutation` fires on `onBlur` or `Enter` keypress. After a successful mutation, both the `tax/profile` and `tax/estimate` queries are invalidated so the forecaster rerenders.

---

## File map

| Action | File |
|---|---|
| Modify | `backend/models.py` — add `TaxProfile` (table=True), `TaxProfileUpdate`, `TaxEstimateResponse` |
| Modify | `backend/database.py` — add v6 seed step in `_migrate()` |
| Create | `backend/tax_engine.py` — `calculate_federal_tax()` pure function |
| Create | `backend/routers/tax.py` — GET/PUT profile, GET estimate |
| Modify | `backend/main.py` — register tax router |
| Modify | `frontend/src/types.ts` — add `TaxProfile`, `TaxEstimateResponse` interfaces |
| Modify | `frontend/src/pages/TaxRetirementTab.tsx` — add Tax Forecaster section |
| Create | `tests/test_tax_engine.py` — unit tests for bracket math |
| Create | `tests/test_tax_api.py` — integration tests for all 3 endpoints |

---

## Task 1: Add TaxProfile model and Pydantic schemas to `backend/models.py`

**Files:**
- Modify: `backend/models.py` — end of file, after the last SQLModel ORM class block

- [ ] **Step 1: Append to `backend/models.py` — Pydantic schemas first (after `RetirementUpdate`), then ORM class at bottom**

Find the line `# ---------------------------------------------------------------------------` that begins the "SQLModel ORM table classes" block near the bottom of the file. **Before** that block, insert the two pure-Pydantic schemas in the "Retirement accounts" section (after `RetirementUpdate`):

```python
# ---------------------------------------------------------------------------
# Tax profile  (Phase 6 Step 2)
# ---------------------------------------------------------------------------

class TaxProfileUpdate(BaseModel):
    """Partial update for the singleton TaxProfile (id=1)."""
    filing_status:                  str   | None = None
    gross_w2_income:                float | None = None
    estimated_annual_withholdings:  float | None = None


class TaxEstimateResponse(BaseModel):
    """Full tax estimate breakdown returned by GET /api/tax/estimate."""
    filing_status:                  str
    gross_w2_income:                float
    pre_tax_retirement_deductions:  float   # sum of 401k + HSA ytd_contributions
    agi:                            float   # gross - pre_tax_retirement_deductions
    standard_deduction:             float   # 29200 for MFJ 2024
    taxable_income:                 float   # max(0, agi - standard_deduction)
    estimated_federal_tax:          float
    estimated_annual_withholdings:  float
    net_owed:                       float   # tax - withholdings; negative = refund
```

Then **at the very bottom** of the file (after `EquityGrantRecord`), add the SQLModel table class:

```python
class TaxProfile(_SQLModel, table=True):  # type: ignore[call-arg]
    """Singleton row (id=1) — user-editable tax inputs."""
    __tablename__ = "tax_profiles"
    id:                            Optional[int] = _Field(default=None, primary_key=True)
    filing_status:                 str           = _Field(default="MFJ")
    gross_w2_income:               float         = _Field(default=0.0)
    estimated_annual_withholdings: float         = _Field(default=0.0)
```

- [ ] **Step 2: Verify imports cleanly**

```bash
./venv/Scripts/python.exe -c "from backend.models import TaxProfile, TaxProfileUpdate, TaxEstimateResponse; print('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat: add TaxProfile SQLModel table and Pydantic schemas"
```

---

## Task 2: Seed default TaxProfile in `_migrate()` and verify table creation

**Files:**
- Modify: `backend/database.py` — add v6 seed step inside `_migrate()`

- [ ] **Step 1: Add the v6 seed step to `_migrate()`**

At the END of the `_migrate()` function body (after the v5 retirement_accounts block, before the closing of the function), add:

```python
    # v6: seed default TaxProfile singleton (id=1) when table is empty
    if "tax_profiles" in existing_tables and \
       conn.execute("SELECT COUNT(*) FROM tax_profiles").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO tax_profiles (id, filing_status, gross_w2_income, estimated_annual_withholdings) "
            "VALUES (1, 'MFJ', 0.0, 0.0)"
        )
```

- [ ] **Step 2: Verify create_all now creates the tax_profiles table**

```bash
./venv/Scripts/python.exe -c "
from sqlmodel import create_engine, SQLModel
from sqlalchemy import inspect
import backend.models
engine = create_engine('sqlite:///:memory:')
SQLModel.metadata.create_all(engine)
tables = inspect(engine).get_table_names()
assert 'tax_profiles' in tables, f'Missing! Tables: {tables}'
print('tax_profiles table created ok')
"
```
Expected: `tax_profiles table created ok`

- [ ] **Step 3: Verify the full backend still imports**

```bash
./venv/Scripts/python.exe -c "from backend.main import app; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/database.py
git commit -m "feat: seed default TaxProfile row in _migrate() v6"
```

---

## Task 3: Build `backend/tax_engine.py` with TDD

**Files:**
- Create: `tests/test_tax_engine.py`
- Create: `backend/tax_engine.py`

### Step 1: Write all failing tests first

- [ ] **Step 1a: Create `tests/test_tax_engine.py`**

```python
"""Unit tests for the federal tax calculation engine."""
import pytest
from backend.tax_engine import calculate_federal_tax, STANDARD_DEDUCTION_MFJ


def test_standard_deduction_value():
    """Standard deduction for MFJ 2024 is $29,200."""
    assert STANDARD_DEDUCTION_MFJ == 29_200


def test_zero_income_yields_zero_tax():
    """No income → no tax."""
    result = calculate_federal_tax(gross_income=0.0, pre_tax_deductions=0.0)
    assert result == 0.0


def test_income_below_standard_deduction_yields_zero_tax():
    """Gross income less than the standard deduction → taxable income = 0 → no tax."""
    # gross=20000, deductions=0, AGI=20000, taxable=max(0, 20000-29200)=0
    result = calculate_federal_tax(gross_income=20_000.0, pre_tax_deductions=0.0)
    assert result == 0.0


def test_first_bracket_only():
    """Income entirely within the 10% bracket.

    gross=50000, pre_tax=0 → AGI=50000 → taxable=50000-29200=20800
    Tax = 20800 × 0.10 = 2080.00
    """
    result = calculate_federal_tax(gross_income=50_000.0, pre_tax_deductions=0.0)
    assert result == pytest.approx(2_080.00, rel=1e-4)


def test_two_bracket_income():
    """Income spanning the 10% and 12% brackets.

    gross=100000, pre_tax=0 → AGI=100000 → taxable=70800
    10%: 23200 × 0.10 = 2320.00
    12%: (70800 - 23200) × 0.12 = 47600 × 0.12 = 5712.00
    Total: 8032.00
    """
    result = calculate_federal_tax(gross_income=100_000.0, pre_tax_deductions=0.0)
    assert result == pytest.approx(8_032.00, rel=1e-4)


def test_three_bracket_income():
    """Income spanning 10%, 12%, and 22% brackets.

    gross=200000, pre_tax=0 → AGI=200000 → taxable=170800
    10%: 23200 × 0.10 = 2320.00
    12%: (94300 - 23200) × 0.12 = 71100 × 0.12 = 8532.00
    22%: (170800 - 94300) × 0.22 = 76500 × 0.22 = 16830.00
    Total: 27682.00
    """
    result = calculate_federal_tax(gross_income=200_000.0, pre_tax_deductions=0.0)
    assert result == pytest.approx(27_682.00, rel=1e-4)


def test_pre_tax_deductions_reduce_agi():
    """Pre-tax 401k/HSA deductions lower AGI before bracket calculation.

    gross=200000, pre_tax=23000 → AGI=177000 → taxable=147800
    10%: 23200 × 0.10 = 2320.00
    12%: (94300 - 23200) × 0.12 = 8532.00
    22%: (147800 - 94300) × 0.22 = 53500 × 0.22 = 11770.00
    Total: 22622.00
    """
    result = calculate_federal_tax(gross_income=200_000.0, pre_tax_deductions=23_000.0)
    assert result == pytest.approx(22_622.00, rel=1e-4)


def test_deductions_exceeding_gross_yields_zero_tax():
    """Pre-tax deductions larger than gross income clamp AGI at 0."""
    result = calculate_federal_tax(gross_income=50_000.0, pre_tax_deductions=60_000.0)
    assert result == 0.0


def test_high_income_all_brackets():
    """Income high enough to cross into the 37% bracket.

    gross=900000, pre_tax=0 → AGI=900000 → taxable=870800
    10%: 23200 × 0.10 = 2320.00
    12%: (94300 - 23200) × 0.12 = 8532.00
    22%: (201050 - 94300) × 0.22 = 23551.00
    24%: (383900 - 201050) × 0.24 = 43884.00
    32%: (487450 - 383900) × 0.32 = 33136.00
    35%: (731200 - 487450) × 0.35 = 85330.00
    37%: (870800 - 731200) × 0.37 = 51652.00
    Total: 248405.00
    """
    result = calculate_federal_tax(gross_income=900_000.0, pre_tax_deductions=0.0)
    assert result == pytest.approx(248_405.00, rel=1e-4)
```

- [ ] **Step 1b: Run tests to confirm they all fail**

```bash
./venv/Scripts/python.exe -m pytest tests/test_tax_engine.py -v
```
Expected: all FAIL with `ModuleNotFoundError: No module named 'backend.tax_engine'`

- [ ] **Step 2: Create `backend/tax_engine.py`**

```python
"""
Federal income tax estimator for the Finance Dashboard.

Supports Married Filing Jointly (MFJ) filing status with 2024 IRS brackets.
All bracket thresholds and the standard deduction are hardcoded constants —
update them here each year.

Usage:
    from backend.tax_engine import calculate_federal_tax
    tax = calculate_federal_tax(gross_income=200_000, pre_tax_deductions=23_000)
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# 2024 IRS constants — MFJ
# ---------------------------------------------------------------------------

STANDARD_DEDUCTION_MFJ: float = 29_200.0

# (upper_bound, marginal_rate) — last entry is float('inf') for the top bracket
_MFJ_BRACKETS: list[tuple[float, float]] = [
    (23_200.0,       0.10),
    (94_300.0,       0.12),
    (201_050.0,      0.22),
    (383_900.0,      0.24),
    (487_450.0,      0.32),
    (731_200.0,      0.35),
    (float("inf"),   0.37),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_federal_tax(gross_income: float, pre_tax_deductions: float) -> float:
    """
    Estimate federal income tax owed for MFJ filing status.

    Args:
        gross_income:       Total W2 gross income before any deductions.
        pre_tax_deductions: Pre-tax retirement contributions (401k, HSA, etc.)
                            that reduce AGI before the standard deduction.

    Returns:
        Estimated total federal tax owed (float, always >= 0).
    """
    agi = max(0.0, gross_income - pre_tax_deductions)
    taxable_income = max(0.0, agi - STANDARD_DEDUCTION_MFJ)

    total_tax = 0.0
    prev_upper = 0.0

    for upper, rate in _MFJ_BRACKETS:
        if taxable_income <= prev_upper:
            break
        bracket_amount = min(taxable_income, upper) - prev_upper
        total_tax += bracket_amount * rate
        prev_upper = upper

    return total_tax
```

- [ ] **Step 3: Run tests to confirm all pass**

```bash
./venv/Scripts/python.exe -m pytest tests/test_tax_engine.py -v
```
Expected: **9 PASSED**

- [ ] **Step 4: Commit**

```bash
git add backend/tax_engine.py tests/test_tax_engine.py
git commit -m "feat: add federal tax engine with 2024 MFJ brackets (TDD)"
```

---

## Task 4: Build `backend/routers/tax.py` with integration tests

**Files:**
- Create: `tests/test_tax_api.py`
- Create: `backend/routers/tax.py`

- [ ] **Step 1: Create `tests/test_tax_api.py`**

```python
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
    from backend.models import RetirementAccount
    # Seed a 401k and an HSA account using the overridden session
    # (must go through the app's dependency to hit the same in-memory DB)
    client.put("/api/tax/profile", json={"gross_w2_income": 200_000.0})

    # Use retirement API to create accounts (exercises the full stack)
    client.post("/api/retirement", json={
        "account_name": "Steven 401k",
        "account_type": "401k",
        "owner": "Steven",
        "annual_limit": 23_000.0,
        "ytd_contributions": 12_000.0,
    })
    client.post("/api/retirement", json={
        "account_name": "Wife HSA",
        "account_type": "HSA",
        "owner": "Wife",
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
        "owner": "Wife",
        "annual_limit": 7_000.0,
        "ytd_contributions": 7_000.0,
    })
    r = client.get("/api/tax/estimate")
    body = r.json()
    # Roth should NOT appear in pre_tax_retirement_deductions
    assert body["pre_tax_retirement_deductions"] == 0.0
    assert body["agi"] == 200_000.0


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
```

- [ ] **Step 2: Run tests to confirm they fail (router doesn't exist)**

```bash
./venv/Scripts/python.exe -m pytest tests/test_tax_api.py -v
```
Expected: FAIL — `404 Not Found` or import errors.

- [ ] **Step 3: Create `backend/routers/tax.py`**

```python
"""Tax profile and estimate routes: /api/tax/profile, /api/tax/estimate."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from backend.deps import get_db
from backend.models import RetirementAccount, TaxEstimateResponse, TaxProfile, TaxProfileUpdate
from backend.tax_engine import STANDARD_DEDUCTION_MFJ, calculate_federal_tax

router = APIRouter()

# Account types that reduce AGI (pre-tax contributions)
_PRE_TAX_TYPES = {"401k", "HSA"}


@router.get("/api/tax/profile")
def get_tax_profile(session: Session = Depends(get_db)) -> JSONResponse:
    """Return the singleton TaxProfile (id=1)."""
    profile = session.get(TaxProfile, 1)
    if profile is None:
        raise HTTPException(status_code=404, detail="Tax profile not found.")
    return JSONResponse(content=profile.model_dump())


@router.put("/api/tax/profile")
def update_tax_profile(
    body: TaxProfileUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Partial update of the singleton TaxProfile (id=1)."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    profile = session.get(TaxProfile, 1)
    if profile is None:
        raise HTTPException(status_code=404, detail="Tax profile not found.")

    for field, value in updates.items():
        setattr(profile, field, value)

    session.add(profile)
    session.commit()
    session.refresh(profile)
    return JSONResponse(content=profile.model_dump())


@router.get("/api/tax/estimate")
def get_tax_estimate(session: Session = Depends(get_db)) -> JSONResponse:
    """
    Compute end-of-year federal tax estimate for MFJ filing status.

    Deductions = sum of ytd_contributions for 401k and HSA accounts only
    (Roth IRA and other after-tax accounts are excluded).
    """
    profile = session.get(TaxProfile, 1)
    if profile is None:
        raise HTTPException(status_code=404, detail="Tax profile not found.")

    # Sum only pre-tax retirement contributions that reduce AGI
    accounts = session.exec(select(RetirementAccount)).all()
    pre_tax_deductions = sum(
        a.ytd_contributions for a in accounts if a.account_type in _PRE_TAX_TYPES
    )

    gross = profile.gross_w2_income
    agi = max(0.0, gross - pre_tax_deductions)
    taxable_income = max(0.0, agi - STANDARD_DEDUCTION_MFJ)
    estimated_tax = calculate_federal_tax(gross, pre_tax_deductions)
    net_owed = estimated_tax - profile.estimated_annual_withholdings

    result = TaxEstimateResponse(
        filing_status=profile.filing_status,
        gross_w2_income=gross,
        pre_tax_retirement_deductions=pre_tax_deductions,
        agi=agi,
        standard_deduction=STANDARD_DEDUCTION_MFJ,
        taxable_income=taxable_income,
        estimated_federal_tax=estimated_tax,
        estimated_annual_withholdings=profile.estimated_annual_withholdings,
        net_owed=net_owed,
    )
    return JSONResponse(content=result.model_dump())
```

- [ ] **Step 4: Run the tax API tests**

```bash
./venv/Scripts/python.exe -m pytest tests/test_tax_api.py -v
```
Expected: **FAIL** — the router is not registered yet (404s). Proceed to Task 5 to register it.

> **Note to implementer:** If you see `ImportError` or `AttributeError` before 404s, fix those first. The 404s specifically mean the module is fine but the endpoints aren't mounted yet.

- [ ] **Step 5: Commit the router (before registering)**

```bash
git add backend/routers/tax.py tests/test_tax_api.py
git commit -m "feat: add tax router and integration tests"
```

---

## Task 5: Register the tax router in `backend/main.py`

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add the import to `backend/main.py`**

Find the existing router import line:
```python
from backend.routers import dashboard, budget, equity, debt, settings as settings_router, transactions, retirement
```

Replace with:
```python
from backend.routers import dashboard, budget, equity, debt, settings as settings_router, transactions, retirement, tax
```

- [ ] **Step 2: Add the router include**

After `app.include_router(retirement.router)`, add:
```python
app.include_router(tax.router)
```

- [ ] **Step 3: Run ALL tests**

```bash
./venv/Scripts/python.exe -m pytest tests/ -v
```
Expected: **all tests pass** (44 existing + all new tax tests).

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: register tax router in main.py"
```

---

## Task 6: Add TypeScript interfaces to `frontend/src/types.ts`

**Files:**
- Modify: `frontend/src/types.ts` — append after the `RetirementUpdate` interface block

- [ ] **Step 1: Append to `frontend/src/types.ts`** (after the existing `RetirementUpdate` interface, around line 167)

```typescript
// ── Tax Estimator (Phase 6 Step 2) ───────────────────────────────────────────

export interface TaxProfile {
  id: number;
  filing_status: string;
  gross_w2_income: number;
  estimated_annual_withholdings: number;
}

export interface TaxProfileUpdate {
  filing_status?: string;
  gross_w2_income?: number;
  estimated_annual_withholdings?: number;
}

export interface TaxEstimateResponse {
  filing_status: string;
  gross_w2_income: number;
  pre_tax_retirement_deductions: number;
  agi: number;
  standard_deduction: number;
  taxable_income: number;
  estimated_federal_tax: number;
  estimated_annual_withholdings: number;
  net_owed: number;  // negative = refund, positive = owed
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add TaxProfile and TaxEstimateResponse TypeScript interfaces"
```

---

## Task 7: Build the Tax Forecaster UI in `TaxRetirementTab.tsx`

**Files:**
- Modify: `frontend/src/pages/TaxRetirementTab.tsx`

This is the most substantial frontend task. Read the file carefully before making changes. The goal is to ADD a "Tax Forecaster" section between the existing KPI scoreboard and the retirement accounts grid — without touching existing code.

- [ ] **Step 1: Update imports at the top of `TaxRetirementTab.tsx`**

Replace:
```typescript
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import type { RetirementAccount } from '../types';
```
With:
```typescript
import { useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RetirementAccount, TaxProfile, TaxProfileUpdate, TaxEstimateResponse } from '../types';
```

- [ ] **Step 2: Add TaxForecaster queries and mutation inside the component function**

After the existing `useQuery` for retirement accounts (around line 20), add inside `TaxRetirementTab()`:

```typescript
  const queryClient = useQueryClient();

  // ── Tax Forecaster state ──
  const [localGross, setLocalGross] = useState<string>('');
  const [localWithholdings, setLocalWithholdings] = useState<string>('');
  const grossInitialized = useRef(false);
  const withInitialized  = useRef(false);

  const { data: taxProfile } = useQuery<TaxProfile>({
    queryKey: ['tax-profile'],
    queryFn: () => fetch(`${API}/api/tax/profile`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  const { data: estimate } = useQuery<TaxEstimateResponse>({
    queryKey: ['tax-estimate'],
    queryFn: () => fetch(`${API}/api/tax/estimate`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  // Sync local input state from fetched profile (only on first load)
  useEffect(() => {
    if (taxProfile && !grossInitialized.current) {
      setLocalGross(String(taxProfile.gross_w2_income));
      grossInitialized.current = true;
    }
    if (taxProfile && !withInitialized.current) {
      setLocalWithholdings(String(taxProfile.estimated_annual_withholdings));
      withInitialized.current = true;
    }
  }, [taxProfile]);

  const { mutate: saveProfile } = useMutation({
    mutationFn: (update: TaxProfileUpdate) =>
      fetch(`${API}/api/tax/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tax-profile'] });
      queryClient.invalidateQueries({ queryKey: ['tax-estimate'] });
    },
  });

  const handleSaveGross = () => saveProfile({ gross_w2_income: parseFloat(localGross) || 0 });
  const handleSaveWithholdings = () => saveProfile({ estimated_annual_withholdings: parseFloat(localWithholdings) || 0 });
```

- [ ] **Step 3: Add the Tax Forecaster JSX section**

In the JSX return, after the KPI scoreboard `</div>` (the gradient blue block that ends around line 107) and before the empty state / player grid, insert:

```tsx
      {/* ── Tax Forecaster ──────────────────────────────────────────── */}
      <div className="mb-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h2 className="m-0 text-base font-bold text-[var(--text-primary)]">
              End of Year Tax Forecaster <span className="text-xs font-normal text-[var(--text-muted)] ml-1">(Federal · MFJ 2024)</span>
            </h2>
            <p className="m-0 text-xs text-[var(--text-muted)] mt-0.5">
              Uses your 401k + HSA YTD contributions to estimate taxable income
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Editable Inputs Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Expected Gross W2 Income
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-sm">$</span>
                <input
                  type="number"
                  value={localGross}
                  onChange={e => setLocalGross(e.target.value)}
                  onBlur={handleSaveGross}
                  onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                  className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                Expected Annual Withholdings
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-sm">$</span>
                <input
                  type="number"
                  value={localWithholdings}
                  onChange={e => setLocalWithholdings(e.target.value)}
                  onBlur={handleSaveWithholdings}
                  onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                  className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Breakdown Table */}
          {estimate && (
            <div className="space-y-0">
              {[
                { label: 'Gross W2 Income',               value: estimate.gross_w2_income,                positive: true  },
                { label: 'Pre-Tax Deductions (401k + HSA)',value: -estimate.pre_tax_retirement_deductions, positive: false },
                { label: 'Adjusted Gross Income (AGI)',    value: estimate.agi,                            positive: true, divider: false },
                { label: 'Standard Deduction (MFJ 2024)', value: -estimate.standard_deduction,            positive: false },
                { label: 'Taxable Income',                 value: estimate.taxable_income,                 positive: true, bold: true },
                { label: 'Estimated Federal Tax',          value: -estimate.estimated_federal_tax,         positive: false, bold: true },
                { label: 'Estimated Withholdings',         value: estimate.estimated_annual_withholdings,  positive: true  },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`flex justify-between items-center py-2.5 px-1 text-sm border-b border-[var(--border-subtle)] last:border-0 ${row.bold ? 'font-semibold' : ''}`}
                >
                  <span className="text-[var(--text-secondary)]">{row.label}</span>
                  <span className={row.positive ? 'text-[var(--text-primary)]' : 'text-[var(--accent-red)]'}>
                    {row.value < 0 ? `−${fmt(Math.abs(row.value))}` : fmt(row.value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Big KPI — Net Refund / Tax Bomb */}
          {estimate && (
            <div
              className={`rounded-2xl p-8 text-center ${
                estimate.net_owed <= 0
                  ? 'bg-[color-mix(in_srgb,var(--accent-green)_12%,transparent)]'
                  : 'bg-[color-mix(in_srgb,var(--accent-red)_10%,transparent)]'
              }`}
            >
              <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${estimate.net_owed <= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                {estimate.net_owed <= 0 ? '🟢 Estimated Refund' : '🚨 Estimated Tax Owed (Tax Bomb)'}
              </div>
              <div className={`text-6xl font-black leading-none mb-2 ${estimate.net_owed <= 0 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
                {fmt(Math.abs(estimate.net_owed))}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-3">
                {estimate.net_owed <= 0
                  ? `Your withholdings exceed your estimated tax — you may receive a refund.`
                  : `Your estimated tax exceeds your withholdings — you may owe this amount.`}
              </div>
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Build and verify no TypeScript errors**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TaxRetirementTab.tsx
git commit -m "feat: add Tax Forecaster UI to TaxRetirementTab"
```

---

## Task 8: End-to-end smoke test

- [ ] **Step 1: Run the full test suite**

```bash
./venv/Scripts/python.exe -m pytest tests/ -v
```
Expected: all tests pass (0 failures). Count should be 44 (existing) + 9 (tax engine) + 12 (tax api) = **65 tests**.

- [ ] **Step 2: Start the backend and hit all three endpoints**

```bash
./venv/Scripts/uvicorn.exe backend.main:app --reload --port 8000
```

In a separate terminal:
```bash
curl http://localhost:8000/api/tax/profile
curl -X PUT http://localhost:8000/api/tax/profile -H "Content-Type: application/json" -d '{"gross_w2_income": 200000, "estimated_annual_withholdings": 25000}'
curl http://localhost:8000/api/tax/estimate
```
Expected: all return JSON with HTTP 200.

- [ ] **Step 3: Build and serve the frontend**

```bash
npm run build && npx serve dist -p 3000
```
Expected: build succeeds.

- [ ] **Step 4: Final commit if any cleanup was done**

```bash
git add -A
git status  # should be clean or only untracked files
```

---

## Summary of what this builds

| Component | Description |
|---|---|
| `backend/models.py` | `TaxProfile` table, `TaxProfileUpdate`, `TaxEstimateResponse` |
| `backend/database.py` | v6 seed: default TaxProfile row (id=1) |
| `backend/tax_engine.py` | Pure `calculate_federal_tax()` with 2024 MFJ brackets |
| `backend/routers/tax.py` | GET/PUT profile, GET estimate (Session-based) |
| `backend/main.py` | Register tax router |
| `frontend/src/types.ts` | `TaxProfile`, `TaxProfileUpdate`, `TaxEstimateResponse` TS interfaces |
| `frontend/src/pages/TaxRetirementTab.tsx` | Editable inputs + breakdown table + giant green/red KPI |
| `tests/test_tax_engine.py` | 9 unit tests for bracket math |
| `tests/test_tax_api.py` | 12 integration tests for all 3 endpoints |
