# Phase 6: Tax Shield Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Tax & Retirement" tab with gamified contribution tracking (ghost car pacer, match checkpoint, tax shield KPI) backed by a full CRUD SQLite/FastAPI layer.

**Architecture:** New `retirement_accounts` SQLite table → FastAPI CRUD router → React Query `useQuery`/`useMutation` in three focused frontend files: `TaxRetirementTab` (layout), `RetirementCard` (gamified card logic), `RetirementModal` (form).

**Tech Stack:** Python FastAPI + Pydantic v2 + SQLite (backend); React 19 + TypeScript + @tanstack/react-query v5 + Framer Motion (frontend); pytest + FastAPI TestClient (tests).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/database.py` | Add `retirement_accounts` table to `_create_tables()` + `_migrate()` v5 |
| Modify | `backend/models.py` | Add `RetirementAccount`, `RetirementCreate`, `RetirementUpdate` |
| Create | `backend/routers/retirement.py` | GET / POST / PUT /{id} / DELETE /{id} under `/api/retirement` |
| Modify | `backend/main.py` | Register `retirement` router |
| Create | `tests/test_retirement_api.py` | API tests for all four CRUD endpoints |
| Modify | `frontend/src/types.ts` | Add `'tax'` to `TabKey`; add `RetirementAccount`, `RetirementCreate`, `RetirementUpdate` interfaces |
| Modify | `frontend/src/components/layout/Sidebar.tsx` | Add `Tax & Retirement` nav item |
| Modify | `frontend/src/App.tsx` | Wire pre-guard branch + `case 'tax'` in `renderTab()` |
| Modify | `frontend/src/pages/index.ts` | Export `TaxRetirementTab` |
| Create | `frontend/src/pages/TaxRetirementTab.tsx` | React Query fetch, KPI scoreboard, two-column grid |
| Create | `frontend/src/components/cards/RetirementCard.tsx` | Gamified card: progress bar, ghost car, match checkpoint |
| Create | `frontend/src/components/modals/RetirementModal.tsx` | Create/edit/delete form with useMutation |

---

## Task 1: Database Schema

**Files:**
- Modify: `backend/database.py`
- Create: `tests/test_retirement_api.py` (skeleton only — expanded in Task 3)

- [ ] **Step 1: Add `retirement_accounts` to `_create_tables()`**

In `backend/database.py`, inside the `_create_tables()` executescript string, append this block **before the closing `"""`**:

```sql
    -- -----------------------------------------------------------------------
    -- retirement_accounts
    --   Tracks tax-advantaged account contributions per person.
    --   employer_match_amount and employer_match_target are nullable —
    --   not all accounts have employer match programs.
    -- -----------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS retirement_accounts (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        account_name          TEXT NOT NULL,
        account_type          TEXT NOT NULL,
        owner                 TEXT NOT NULL,
        annual_limit          REAL NOT NULL,
        ytd_contributions     REAL NOT NULL DEFAULT 0.0,
        employer_match_amount REAL,
        employer_match_target REAL
    );
```

- [ ] **Step 2: Add `_migrate()` v5 block**

In `backend/database.py`, append this block at the end of the `_migrate()` function body (after the v4 block):

```python
    # v5: add retirement_accounts table (for databases predating this migration)
    existing_tables = {
        row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    if "retirement_accounts" not in existing_tables:
        conn.execute("""
            CREATE TABLE retirement_accounts (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                account_name          TEXT NOT NULL,
                account_type          TEXT NOT NULL,
                owner                 TEXT NOT NULL,
                annual_limit          REAL NOT NULL,
                ytd_contributions     REAL NOT NULL DEFAULT 0.0,
                employer_match_amount REAL,
                employer_match_target REAL
            )
        """)
```

- [ ] **Step 3: Write schema test**

Create `tests/test_retirement_api.py` with just the table-existence test for now:

```python
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
```

- [ ] **Step 4: Run schema tests (expected: PASS)**

```bash
cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March"
call venv\Scripts\activate
pytest tests/test_retirement_api.py::test_retirement_accounts_table_exists tests/test_retirement_api.py::test_retirement_accounts_columns -v
```

Expected output: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/database.py tests/test_retirement_api.py
git commit -m "feat: add retirement_accounts table + schema tests"
```

---

## Task 2: Pydantic Models

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Add three models to `backend/models.py`**

Append after the `CategoryUpdate` class (before the `Transaction` section):

```python
# ---------------------------------------------------------------------------
# Retirement accounts  (Phase 6)
# ---------------------------------------------------------------------------

class RetirementAccount(BaseModel):
    id:                    int
    account_name:          str
    account_type:          str
    owner:                 str
    annual_limit:          float
    ytd_contributions:     float
    employer_match_amount: float | None = None
    employer_match_target: float | None = None


class RetirementCreate(BaseModel):
    account_name:          str
    account_type:          str
    owner:                 str
    annual_limit:          float
    ytd_contributions:     float = 0.0
    employer_match_amount: float | None = None
    employer_match_target: float | None = None


class RetirementUpdate(BaseModel):
    account_name:          str   | None = None
    account_type:          str   | None = None
    owner:                 str   | None = None
    annual_limit:          float | None = None
    ytd_contributions:     float | None = None
    employer_match_amount: float | None = None
    employer_match_target: float | None = None
```

- [ ] **Step 2: Verify no import errors**

```bash
python -c "from backend.models import RetirementAccount, RetirementCreate, RetirementUpdate; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/models.py
git commit -m "feat: add RetirementAccount Pydantic models"
```

---

## Task 3: CRUD Router + API Tests

**Files:**
- Create: `backend/routers/retirement.py`
- Modify: `backend/main.py`
- Modify: `tests/test_retirement_api.py`

- [ ] **Step 1: Write all API tests first (TDD)**

Append these tests to `tests/test_retirement_api.py`:

```python
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
```

- [ ] **Step 2: Run tests — expect FAIL (router doesn't exist yet)**

```bash
pytest tests/test_retirement_api.py -v -k "not table_exists and not columns"
```

Expected: errors like `404` or `AttributeError` — the routes don't exist yet. This confirms TDD red state.

- [ ] **Step 3: Create `backend/routers/retirement.py`**

```python
"""Retirement account CRUD routes: /api/retirement."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response

from backend.deps import get_db
from backend.models import RetirementAccount, RetirementCreate, RetirementUpdate

router = APIRouter()


def _row_to_account(row: sqlite3.Row) -> dict:
    return {
        "id":                    row["id"],
        "account_name":          row["account_name"],
        "account_type":          row["account_type"],
        "owner":                 row["owner"],
        "annual_limit":          row["annual_limit"],
        "ytd_contributions":     row["ytd_contributions"],
        "employer_match_amount": row["employer_match_amount"],
        "employer_match_target": row["employer_match_target"],
    }


@router.get("/api/retirement")
def list_retirement_accounts(
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """Return all retirement accounts ordered by owner, then account_type."""
    rows = conn.execute(
        "SELECT * FROM retirement_accounts ORDER BY owner, account_type"
    ).fetchall()
    return JSONResponse(content=[_row_to_account(r) for r in rows])


@router.post("/api/retirement", status_code=201)
def create_retirement_account(
    body: RetirementCreate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """Insert a new retirement account."""
    cursor = conn.execute(
        """
        INSERT INTO retirement_accounts
            (account_name, account_type, owner, annual_limit,
             ytd_contributions, employer_match_amount, employer_match_target)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            body.account_name,
            body.account_type,
            body.owner,
            body.annual_limit,
            body.ytd_contributions,
            body.employer_match_amount,
            body.employer_match_target,
        ),
    )
    conn.commit()
    return JSONResponse(status_code=201, content={"id": cursor.lastrowid})


@router.put("/api/retirement/{account_id}")
def update_retirement_account(
    account_id: int,
    body: RetirementUpdate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """Partial update — only non-None fields are written."""
    # exclude_unset=True distinguishes "field not sent" (skip) from "field sent as null" (clear).
    # This allows users to clear nullable fields like employer_match_target back to null.
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    set_clause = ", ".join(f"{col} = ?" for col in updates)
    values = list(updates.values()) + [account_id]
    conn.execute(
        f"UPDATE retirement_accounts SET {set_clause} WHERE id = ?", values
    )
    conn.commit()

    row = conn.execute(
        "SELECT * FROM retirement_accounts WHERE id = ?", (account_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    return JSONResponse(content=_row_to_account(row))


@router.delete("/api/retirement/{account_id}", status_code=204)
def delete_retirement_account(
    account_id: int,
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    """Delete a retirement account by id."""
    row = conn.execute(
        "SELECT id FROM retirement_accounts WHERE id = ?", (account_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    conn.execute("DELETE FROM retirement_accounts WHERE id = ?", (account_id,))
    conn.commit()
    return Response(status_code=204)
```

- [ ] **Step 4: Register router in `backend/main.py`**

Find the import line:
```python
from backend.routers import dashboard, budget, equity, debt, settings as settings_router, transactions
```

Replace it with:
```python
from backend.routers import dashboard, budget, equity, debt, settings as settings_router, transactions, retirement
```

Then find `app.include_router(transactions.router)` and add after it:
```python
app.include_router(retirement.router)
```

- [ ] **Step 5: Run all retirement API tests (expected: all PASS)**

```bash
pytest tests/test_retirement_api.py -v
```

Expected: 11 passed.

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
pytest tests/ -v
```

Expected: all previously passing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/retirement.py backend/main.py tests/test_retirement_api.py
git commit -m "feat: add retirement CRUD router + full API test suite"
```

---

## Task 4: Frontend Types & Sidebar

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add `'tax'` to `TabKey` in `types.ts`**

Find:
```typescript
export type TabKey = 'overview' | 'cashflow' | 'spending' | 'debt' | 'transactions' | 'settings' | 'equity' | 'budget';
```

Replace with:
```typescript
export type TabKey = 'overview' | 'cashflow' | 'spending' | 'debt' | 'transactions' | 'settings' | 'equity' | 'budget' | 'tax';
```

- [ ] **Step 2: Add `RetirementAccount`, `RetirementCreate`, and `RetirementUpdate` interfaces to `types.ts`**

Append after the `DrawerFilter` interface at the bottom of `types.ts`:

```typescript
// ── Retirement / Tax Shield (Phase 6) ────────────────────────────────────────

export interface RetirementAccount {
  id:                    number;
  account_name:          string;
  account_type:          string;   // '401k' | 'HSA' | 'Roth IRA' | etc.
  owner:                 string;   // 'Steven' | 'Wife'
  annual_limit:          number;
  ytd_contributions:     number;
  employer_match_amount: number | null;
  employer_match_target: number | null;
}

export type RetirementCreate = Omit<RetirementAccount, 'id'>;

export interface RetirementUpdate {
  account_name?:          string;
  account_type?:          string;
  owner?:                 string;
  annual_limit?:          number;
  ytd_contributions?:     number;
  employer_match_amount?: number | null;
  employer_match_target?: number | null;
}
```

`RetirementCreate` and `RetirementUpdate` are imported by `RetirementModal.tsx` — they must be in `types.ts` or the TypeScript build will fail.

- [ ] **Step 3: Add `ShieldCheck` nav item in `Sidebar.tsx`**

Find the import:
```typescript
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  CreditCard,
  Receipt,
  Settings,
  BarChart2,
  Landmark,
} from 'lucide-react';
```

Add `ShieldCheck` to the list:
```typescript
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  CreditCard,
  Receipt,
  Settings,
  BarChart2,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
```

Find:
```typescript
  { id: 'equity',        label: 'Equity',         icon: BarChart2,       section: 'Wealth Building' },
```

Add after it:
```typescript
  { id: 'tax',           label: 'Tax & Retirement', icon: ShieldCheck,   section: 'Wealth Building' },
```

- [ ] **Step 4: Build to verify types and sidebar compile cleanly**

This step is intentionally run before `TaxRetirementTab.tsx` exists. The build verifies the new TypeScript interfaces and sidebar nav item. At this stage the build should succeed because the barrel export in `pages/index.ts` and the App.tsx wiring are not added until Task 5. If the build fails for any reason at this step, fix it before continuing.

```bash
npm run build
```

Expected: build succeeds with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add 'tax' TabKey, RetirementAccount type, Tax & Retirement nav item"
```

---

## Task 5: Wire `TaxRetirementTab` into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/index.ts`

- [ ] **Step 1: Add barrel export to `pages/index.ts`**

In `frontend/src/pages/index.ts`, append:
```typescript
export { default as TaxRetirementTab } from './TaxRetirementTab';
```

(The file `TaxRetirementTab.tsx` does not exist yet — the barrel export will cause a build error until Task 8 creates it. The wiring changes in this task and Task 8 are committed together.)

- [ ] **Step 2: Import `TaxRetirementTab` in `App.tsx`**

Find:
```typescript
import {
  OverviewTab,
  CashFlowTab,
  SpendingTab,
  DebtTab,
  TransactionsTab,
  SettingsTab,
  EquityTab,
  BudgetTab,
} from './pages';
```

Replace with:
```typescript
import {
  OverviewTab,
  CashFlowTab,
  SpendingTab,
  DebtTab,
  TransactionsTab,
  SettingsTab,
  EquityTab,
  BudgetTab,
  TaxRetirementTab,
} from './pages';
```

- [ ] **Step 3: Add `case 'tax'` to `renderTab()` switch**

Find:
```typescript
      case 'budget':       return null; // handled in pre-guard chain
      case 'settings':     return null; // handled in pre-guard chain
```

Add after the `budget` line (before `settings`):
```typescript
      case 'tax':          return null; // handled in pre-guard chain
```

- [ ] **Step 4: Add `tax` branch to pre-guard chain in `App.tsx`**

Find:
```tsx
        ) : activeTab === 'budget' ? (
          <div style={{ padding: '1.5rem' }}>
            <BudgetTab onDrillDown={openDrawer} />
          </div>
        ) : (
```

Replace with:
```tsx
        ) : activeTab === 'budget' ? (
          <div style={{ padding: '1.5rem' }}>
            <BudgetTab onDrillDown={openDrawer} />
          </div>
        ) : activeTab === 'tax' ? (
          <div style={{ padding: '1.5rem' }}>
            <TaxRetirementTab />
          </div>
        ) : (
```

- [ ] **Step 5: Hold off on building — `TaxRetirementTab.tsx` doesn't exist yet**

Tasks 6 and 7 create the child components. Task 8 creates `TaxRetirementTab.tsx`. The build will be verified at the end of Task 8. **Do not commit yet** — commit at end of Task 8 after the build passes.

---

## Task 6: `RetirementCard` Component

**Files:**
- Create: `frontend/src/components/cards/RetirementCard.tsx`

- [ ] **Step 1: Create `RetirementCard.tsx`**

```tsx
import type { RetirementAccount } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000) + 1;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RetirementCardProps {
  account: RetirementAccount;
  onEdit: (account: RetirementAccount) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RetirementCard({ account, onEdit }: RetirementCardProps) {
  const now = new Date();
  const dayOfYear = getDayOfYear(now);
  const daysInYear = isLeapYear(now.getFullYear()) ? 366 : 365;
  const targetPace = (dayOfYear / daysInYear) * account.annual_limit;

  const fillPct  = Math.min(100, (account.ytd_contributions / account.annual_limit) * 100);
  const pacePct  = Math.min(100, (targetPace / account.annual_limit) * 100);
  const isOnPace = account.ytd_contributions >= targetPace;

  const matchTarget   = account.employer_match_target;
  const matchSecured  = matchTarget !== null && account.ytd_contributions >= matchTarget;
  const matchPct      = matchTarget !== null ? Math.min(100, (matchTarget / account.annual_limit) * 100) : null;

  // Catch-up text (shown only when behind)
  const monthOfYear     = now.getMonth(); // 0-indexed; December = 11
  const monthsRemaining = Math.max(1, 12 - monthOfYear);
  const deficit         = targetPace - account.ytd_contributions;
  const monthlyNeeded   = deficit / monthsRemaining;

  const barColor = isOnPace ? '#22c55e' : '#f59e0b';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '0.875rem',
      padding: '1.25rem',
      marginBottom: '1rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
            {account.account_name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {account.account_type}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {matchSecured && (
            <span style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontSize: '0.6875rem',
              fontWeight: 700,
              padding: '0.2rem 0.5rem',
              borderRadius: '999px',
              letterSpacing: '0.03em',
            }}>
              🏆 Match Secured
            </span>
          )}
          <button
            onClick={() => onEdit(account)}
            title="Edit account"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '0.375rem',
              padding: '0.25rem 0.5rem',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
            }}
          >
            ✏️
          </button>
        </div>
      </div>

      {/* Contribution amounts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {fmt(account.ytd_contributions)}
        </span>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          of {fmt(account.annual_limit)} limit
        </span>
      </div>

      {/* Progress bar track */}
      <div style={{
        position: 'relative',
        height: 12,
        borderRadius: 999,
        background: 'var(--bg-base)',
        border: '1px solid var(--border-subtle)',
        overflow: 'visible',
        marginBottom: '0.5rem',
      }}>
        {/* Fill */}
        <div style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${fillPct}%`,
          background: barColor,
          borderRadius: 999,
          transition: 'width 0.4s ease',
        }} />

        {/* Ghost car notch */}
        <div
          title={`On-pace target: ${fmt(targetPace)}`}
          style={{
            position: 'absolute',
            top: -2, bottom: -2,
            left: `${pacePct}%`,
            width: 2,
            background: 'rgba(255,255,255,0.85)',
            borderRadius: 2,
            zIndex: 2,
            transform: 'translateX(-50%)',
          }}
        />
        {/* Ghost car label */}
        <div style={{
          position: 'absolute',
          top: -18,
          left: `${pacePct}%`,
          transform: 'translateX(-50%)',
          fontSize: '0.5625rem',
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          👻
        </div>

        {/* Match checkpoint (shown only when not yet secured and target exists) */}
        {matchPct !== null && !matchSecured && (
          <>
            <div
              title={`Free money checkpoint: ${fmt(matchTarget!)}`}
              style={{
                position: 'absolute',
                top: -4, bottom: -4,
                left: `${matchPct}%`,
                width: 2,
                borderLeft: '2px dashed #f59e0b',
                zIndex: 3,
                transform: 'translateX(-50%)',
              }}
            />
            <div style={{
              position: 'absolute',
              top: -20,
              left: `${matchPct}%`,
              transform: 'translateX(-50%)',
              fontSize: '0.625rem',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>
              ⭐
            </div>
          </>
        )}
      </div>

      {/* Status text */}
      <div style={{ fontSize: '0.75rem', minHeight: '1rem' }}>
        {isOnPace ? (
          <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ On pace</span>
        ) : (
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>
            +{fmt(monthlyNeeded)}/mo to catch up
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit (no build yet — parent component not created)**

```bash
git add frontend/src/components/cards/RetirementCard.tsx
git commit -m "feat: add RetirementCard with ghost car and match checkpoint"
```

---

## Task 7: `RetirementModal` Component

**Files:**
- Create: `frontend/src/components/modals/RetirementModal.tsx`

- [ ] **Step 1: Create `RetirementModal.tsx`**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import type { RetirementAccount, RetirementCreate, RetirementUpdate } from '../../types';

const API = 'http://localhost:8000';

// ── Shared input styles ───────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.4375rem',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontSize: '0.9375rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '0.375rem',
};

const FIELD: React.CSSProperties = {
  marginBottom: '1rem',
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface RetirementModalProps {
  account: RetirementAccount | null;  // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RetirementModal({ account, onClose, onSaved }: RetirementModalProps) {
  const isEdit = account !== null;

  const [form, setForm] = useState({
    account_name:          account?.account_name          ?? '',
    account_type:          account?.account_type          ?? '401k',
    owner:                 account?.owner                 ?? 'Steven',
    annual_limit:          String(account?.annual_limit          ?? ''),
    ytd_contributions:     String(account?.ytd_contributions     ?? '0'),
    employer_match_amount: String(account?.employer_match_amount ?? ''),
    employer_match_target: String(account?.employer_match_target ?? ''),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const parseOpt = (s: string): number | null =>
    s.trim() === '' ? null : parseFloat(s);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (body: RetirementCreate) =>
      fetch(`${API}/api/retirement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const updateMutation = useMutation({
    mutationFn: (body: RetirementUpdate) =>
      fetch(`${API}/api/retirement/${account!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetch(`${API}/api/retirement/${account!.id}`, { method: 'DELETE' }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      account_name:          form.account_name,
      account_type:          form.account_type,
      owner:                 form.owner,
      annual_limit:          parseFloat(form.annual_limit),
      ytd_contributions:     parseFloat(form.ytd_contributions),
      employer_match_amount: parseOpt(form.employer_match_amount),
      employer_match_target: parseOpt(form.employer_match_target),
    };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload as RetirementCreate);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 200,
        }}
      />

      {/* Panel */}
      <motion.div
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0,
          width: 440,
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-subtle)',
          zIndex: 201,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit Account' : 'Add Account'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div style={FIELD}>
            <label style={LABEL}>Account Name</label>
            <input style={INPUT} value={form.account_name} onChange={e => set('account_name', e.target.value)} required />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Account Type</label>
            <input style={INPUT} value={form.account_type} onChange={e => set('account_type', e.target.value)}
              placeholder="e.g. 401k, HSA, Roth IRA" required />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Owner</label>
            <select style={INPUT} value={form.owner} onChange={e => set('owner', e.target.value)}>
              <option value="Steven">Steven</option>
              <option value="Wife">Wife</option>
            </select>
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Annual Limit ($)</label>
            <input style={INPUT} type="number" min={0} step={1} value={form.annual_limit}
              onChange={e => set('annual_limit', e.target.value)} required />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>YTD Contributions ($)</label>
            <input style={INPUT} type="number" min={0} step={0.01} value={form.ytd_contributions}
              onChange={e => set('ytd_contributions', e.target.value)} required />
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '1rem 0', paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Employer Match (optional)
            </div>

            <div style={FIELD}>
              <label style={LABEL}>Match Target ($) — contribute this much to earn full match</label>
              <input style={INPUT} type="number" min={0} step={0.01} value={form.employer_match_target}
                onChange={e => set('employer_match_target', e.target.value)}
                placeholder="Leave blank if no match" />
            </div>

            <div style={FIELD}>
              <label style={LABEL}>Match Amount YTD ($) — dollars matched so far</label>
              <input style={INPUT} type="number" min={0} step={0.01} value={form.employer_match_amount}
                onChange={e => set('employer_match_amount', e.target.value)}
                placeholder="Leave blank if no match" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'var(--accent-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </form>

        {/* Delete (edit mode only) */}
        {isEdit && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  width: '100%', padding: '0.625rem',
                  background: 'transparent',
                  border: '1px solid var(--accent-red)',
                  borderRadius: '0.5rem',
                  color: 'var(--accent-red)',
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                Delete Account
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={isPending}
                  style={{
                    flex: 1, padding: '0.625rem',
                    background: 'var(--accent-red)',
                    border: 'none', borderRadius: '0.5rem',
                    color: '#fff', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    flex: 1, padding: '0.625rem',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/modals/RetirementModal.tsx
git commit -m "feat: add RetirementModal with create/edit/delete"
```

---

## Task 8: `TaxRetirementTab` Page + Build Verification

**Files:**
- Create: `frontend/src/pages/TaxRetirementTab.tsx`

- [ ] **Step 1: Create `TaxRetirementTab.tsx`**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RetirementAccount } from '../types';
import { RetirementCard } from '../components/cards/RetirementCard';
import { RetirementModal } from '../components/modals/RetirementModal';

const API = 'http://localhost:8000';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TaxRetirementTab() {
  const { data: accounts = [], isLoading, error, refetch } = useQuery<RetirementAccount[]>({
    queryKey: ['retirement'],
    queryFn: () => fetch(`${API}/api/retirement`).then(r => r.json()),
  });

  // null = closed | 'new' = create mode | RetirementAccount = edit mode
  const [modalAccount, setModalAccount] = useState<RetirementAccount | 'new' | null>(null);

  const steven = accounts.filter(a => a.owner === 'Steven');
  const wife   = accounts.filter(a => a.owner === 'Wife');

  // KPI calculations
  const totalContributions = accounts.reduce((s, a) => s + a.ytd_contributions, 0);
  const totalShield        = totalContributions * 0.24;
  const matchCount         = accounts.filter(
    a => a.employer_match_target !== null && a.ytd_contributions >= a.employer_match_target!
  ).length;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        Loading retirement data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'var(--accent-red)' }}>
        Failed to load retirement accounts.
      </div>
    );
  }

  return (
    <div>
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Tax Shield
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Tax-advantaged contribution tracker
          </p>
        </div>
        <button
          onClick={() => setModalAccount('new')}
          style={{
            padding: '0.625rem 1.25rem',
            background: 'var(--accent-blue)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          + Add Account
        </button>
      </div>

      {/* ── KPI Scoreboard ─────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-blue), #6366f1)',
        borderRadius: '1rem',
        padding: '2rem',
        marginBottom: '2rem',
        color: '#fff',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8, marginBottom: '0.5rem' }}>
          Total Tax Shield
        </div>
        <div style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, marginBottom: '0.5rem' }}>
          {fmt(totalShield)}
        </div>
        <div style={{ fontSize: '0.875rem', opacity: 0.75, marginBottom: '1.5rem' }}>
          Estimated taxes saved YTD · Based on 24% marginal rate
        </div>

        {/* Secondary KPIs */}
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{fmt(totalContributions)}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>Total YTD Contributions</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{accounts.length}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>Active Accounts</div>
          </div>
          {matchCount > 0 && (
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>🏆 {matchCount}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>Matches Secured</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {accounts.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          border: '2px dashed var(--border-subtle)',
          borderRadius: '1rem',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛡️</div>
          <p style={{ fontSize: '1rem', margin: 0 }}>No accounts yet. Add one to start tracking your Tax Shield.</p>
        </div>
      )}

      {/* ── Player grid ────────────────────────────────────────────────── */}
      {accounts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Steven */}
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Steven
            </h2>
            {steven.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No accounts.</p>
            ) : (
              steven.map(acc => (
                <RetirementCard
                  key={acc.id}
                  account={acc}
                  onEdit={setModalAccount}
                />
              ))
            )}
          </div>

          {/* Wife */}
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Wife
            </h2>
            {wife.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No accounts.</p>
            ) : (
              wife.map(acc => (
                <RetirementCard
                  key={acc.id}
                  account={acc}
                  onEdit={setModalAccount}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      {modalAccount !== null && (
        <RetirementModal
          account={modalAccount === 'new' ? null : modalAccount}
          onClose={() => setModalAccount(null)}
          onSaved={() => { refetch(); setModalAccount(null); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the frontend**

```bash
npm run build
```

Expected: build succeeds with 0 errors and 0 TypeScript type errors.

If the build fails, fix the TypeScript errors before continuing.

- [ ] **Step 3: Commit all wiring changes together**

```bash
git add frontend/src/pages/TaxRetirementTab.tsx frontend/src/pages/index.ts frontend/src/App.tsx
git commit -m "feat: add TaxRetirementTab page and wire into App"
```

---

## Task 9: End-to-End Smoke Test

- [ ] **Step 1: Start the backend**

```bash
call venv\Scripts\activate
uvicorn backend.main:app --reload --port 8000
```

- [ ] **Step 2: In a second terminal, serve the frontend**

```bash
npx serve dist -p 3000
```

- [ ] **Step 3: Manual smoke test checklist**

Open `http://localhost:3000` and verify:

- [ ] "Tax & Retirement" appears in the Wealth Building nav section with a shield icon
- [ ] Clicking it opens the Tax Shield tab (no console errors)
- [ ] The KPI scoreboard renders with "$0 Estimated Taxes Saved YTD" on empty state
- [ ] The empty-state prompt is shown ("No accounts yet…")
- [ ] Click "+ Add Account" → modal slides in from the right
- [ ] Fill in a 401k for Steven (annual_limit: 23000, ytd_contributions: 5000, no match) → Save
- [ ] The card appears in the Steven column with a progress bar and ghost car notch
- [ ] Add an HSA for Wife with employer_match_target: 1000 and ytd_contributions: 800 → gold checkpoint ⭐ visible on bar
- [ ] Update the HSA ytd_contributions to 1100 → checkpoint disappears, "🏆 Match Secured" badge appears
- [ ] The KPI scoreboard updates with correct totals
- [ ] Click ✏️ on a card → modal opens in edit mode with pre-filled values
- [ ] Delete an account → it disappears from the grid
- [ ] Run the full backend test suite: `pytest tests/ -v` — all pass

- [ ] **Step 4: Final commit and git push**

```bash
git push
```

---

## Summary

| Task | Deliverable | Tests |
|------|-------------|-------|
| 1 | `retirement_accounts` schema | 2 schema tests |
| 2 | Pydantic models | Import smoke test |
| 3 | CRUD router + router wiring | 9 API tests |
| 4 | Types + Sidebar nav item | TypeScript build |
| 5 | App.tsx wiring | — |
| 6 | `RetirementCard` | — |
| 7 | `RetirementModal` | — |
| 8 | `TaxRetirementTab` + build | `npm run build` |
| 9 | End-to-end smoke test | Manual checklist |
