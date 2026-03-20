# Phase 5.5: Stabilization & Interactive Drill-Downs — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the FastAPI monolith into routers, migrate BudgetTab/EquityTab to React Query, build a universal `TransactionDrawer`, and wire Chart.js `onClick` on every major chart so clicking any slice opens a period-bounded transaction drill-down.

**Architecture:** A new `backend/deps.py` provides shared `get_db()` / path constants to six router files that replace `main.py`'s route handlers. A new `GET /api/transactions` endpoint accepts `?period=`, `?type=`, and `?category=` filters. On the frontend, `@tanstack/react-query` v5 replaces raw `fetch+useEffect` in `BudgetTab` and `EquityTab`; a root-level `TransactionDrawer` is triggered by `onDrillDown` callbacks wired to Chart.js `onClick` handlers in four chart components.

**Tech Stack:** Python / FastAPI / SQLite / Pydantic v2 · React 19 / TypeScript / @tanstack/react-query v5 / Framer Motion / Chart.js / react-chartjs-2

**Spec:** `docs/superpowers/specs/2026-03-17-phase-5-5-stabilization-drill-downs-design.md`

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `backend/deps.py` | `get_db()`, `DIR`, `DB_PATH`, `PERIOD_KEYS` — shared by all routers |
| `backend/routers/__init__.py` | Empty package marker |
| `backend/routers/dashboard.py` | `GET /api/dashboard` |
| `backend/routers/budget.py` | `/api/routing`, `/api/categories`, `/api/categories/progress` |
| `backend/routers/equity.py` | `/api/equity`, `/api/equity/grants` |
| `backend/routers/debt.py` | `/api/debt/settings` (GET + POST) |
| `backend/routers/transactions.py` | NEW: `GET /api/transactions?period=&type=&category=` |
| `backend/routers/settings.py` | `/api/upload/csv`, `/api/logs` |
| `tests/test_transactions_api.py` | pytest tests for the new transactions endpoint |
| `frontend/src/components/modals/TransactionDrawer.tsx` | Right-side slide-out drawer |

### Modified files
| File | Change |
|------|--------|
| `backend/main.py` | Strip to app init + middleware + `include_router()` calls only |
| `frontend/src/main.tsx` | Wrap app in `QueryClientProvider` |
| `frontend/src/types.ts` | Add `DrawerFilter` interface |
| `frontend/src/App.tsx` | Add drawer state + `openDrawer` + thread `onDrillDown` to three tabs |
| `frontend/src/pages/BudgetTab.tsx` | Replace fetch+useEffect with useQuery/useMutation; add `onDrillDown` prop |
| `frontend/src/pages/EquityTab.tsx` | Replace refreshKey pattern with useQuery/useMutation |
| `frontend/src/components/layout/Sidebar.tsx` | Add three section labels between nav groups |
| `frontend/src/components/charts/SpendingDonut.tsx` | Add `onDrillDown` prop + Chart.js `options.onClick` |
| `frontend/src/components/charts/CategoryBar.tsx` | Add `onDrillDown` prop + Chart.js `options.onClick` |
| `frontend/src/components/charts/DiscretionaryBar.tsx` | Add `onDrillDown` prop + HTML div `onClick` on segments |
| `frontend/src/components/modals/index.ts` | Export `TransactionDrawer` |
| `frontend/src/pages/OverviewTab.tsx` | Thread `onDrillDown` down to `DiscretionaryBar` |
| `frontend/src/pages/SpendingTab.tsx` | Thread `onDrillDown` down to `SpendingDonut` + `CategoryBar` |

---

## Task 1: Create `backend/deps.py` and router package skeleton

**Files:**
- Create: `backend/deps.py`
- Create: `backend/routers/__init__.py`

- [ ] **Step 1: Create `backend/deps.py`**

```python
"""
Shared FastAPI dependencies used by all routers.
Centralising here avoids circular imports between main.py and router modules.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Generator

from backend.database import init_db
from backend.models import PeriodKey

DIR      = Path(__file__).parent.parent
DB_PATH  = DIR / "finance.db"

PERIOD_KEYS: list[PeriodKey] = ["current", "last", "past2", "quarter", "year"]


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = init_db(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()
```

- [ ] **Step 2: Create `backend/routers/__init__.py`**

```python
# Router package — individual modules imported by main.py via include_router()
```

- [ ] **Step 3: Verify Python can import the new module**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
call venv\Scripts\activate
python -c "from backend.deps import get_db, DIR, DB_PATH, PERIOD_KEYS; print('OK', PERIOD_KEYS)"
```

Expected: `OK ['current', 'last', 'past2', 'quarter', 'year']`

- [ ] **Step 4: Commit**

```bash
git add backend/deps.py backend/routers/__init__.py
git commit -m "feat: add backend/deps.py shared dependencies and routers package skeleton"
```

---

## Task 2: Create the five migration router files and gut `main.py`

**Files:**
- Create: `backend/routers/dashboard.py`, `budget.py`, `equity.py`, `debt.py`, `settings.py`
- Modify: `backend/main.py`

The strategy: copy each route handler verbatim into its router file, swap `@app.` for `@router.`, update imports to use `backend.deps`, then delete the handlers from `main.py` and add `include_router()` calls.

- [ ] **Step 1: Create `backend/routers/dashboard.py`**

```python
"""GET /api/dashboard — builds and returns the full DashboardPayload."""
from __future__ import annotations

import sqlite3
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from backend.deps import get_db, PERIOD_KEYS
from backend.engine import (
    build_accounts, build_debt_section, build_equity_section,
    build_period, build_summary, get_period_months, get_recent_transactions,
)
from backend.models import DashboardPayload, Meta, PeriodKey
from generate_dashboard import compute_ai_summary

router = APIRouter()


@router.get("/api/dashboard")
def get_dashboard(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    summary  = build_summary(conn)
    accounts = build_accounts(conn)
    debt     = build_debt_section(conn)
    txs      = get_recent_transactions(conn)
    periods: dict[PeriodKey, object] = {
        pk: build_period(conn, pk) for pk in PERIOD_KEYS
    }

    assets_dicts      = [a.model_dump() for a in accounts if a.balance >= 0]
    liabilities_dicts = [a.model_dump() for a in accounts if a.balance <  0]

    summaries: dict[PeriodKey, str] = {
        pk: compute_ai_summary(
            pk, get_period_months(pk), periods[pk].model_dump(),
            assets_dicts, liabilities_dicts,
            summary.total_assets, summary.total_liabilities, summary.net_worth,
            debt.trend.labels, debt.trend.values,
        )
        for pk in PERIOD_KEYS
    }

    payload = DashboardPayload(
        meta=Meta(
            generated_at=datetime.now().isoformat(),
            as_of_date=datetime.today().strftime("%B %d, %Y"),
        ),
        summary=summary,
        accounts=accounts,
        periods=periods,
        debt=debt,
        transactions=txs,
        summaries=summaries,
    )
    return JSONResponse(content=payload.model_dump(by_alias=True))
```

- [ ] **Step 2: Create `backend/routers/equity.py`**

Cut the `NewEquityGrant` / `VestTranche` models and the two equity route handlers from `main.py` and paste here with `router = APIRouter()` and `@router.` decorators.

```python
"""Equity routes: GET /api/equity, POST /api/equity/grants."""
from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.deps import get_db
from backend.engine import build_equity_section
from backend.equity_engine import parse_brokerage_csv

router = APIRouter()


class VestTranche(BaseModel):
    date:   str
    shares: float


class NewEquityGrant(BaseModel):
    ticker:           str
    grant_date:       str
    total_shares:     float
    vesting_schedule: list[VestTranche]


@router.post("/api/equity/grants")
def create_equity_grant(
    body: NewEquityGrant,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    if not body.vesting_schedule:
        raise HTTPException(status_code=400, detail="vesting_schedule must have at least one tranche.")
    schedule_json = json.dumps([{"date": t.date, "shares": t.shares} for t in body.vesting_schedule])
    cursor = conn.execute(
        "INSERT INTO equity_grants (ticker, grant_date, total_shares, vesting_schedule) VALUES (?, ?, ?, ?)",
        (body.ticker.upper().strip(), body.grant_date, body.total_shares, schedule_json),
    )
    conn.commit()
    return JSONResponse(status_code=201, content={"id": cursor.lastrowid, "ticker": body.ticker.upper().strip()})


@router.get("/api/equity")
def get_equity(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    section = build_equity_section(conn)
    return JSONResponse(content=section.model_dump())
```

- [ ] **Step 3: Create `backend/routers/budget.py`**

Cut the routing + category route handlers (and `RoutingUpdate`, `CategoryCreate`, `CategoryUpdate` imports) from `main.py`, paste with `router = APIRouter()`.

```python
"""Budget routes: /api/routing, /api/categories, /api/categories/progress."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from backend.deps import get_db
from backend.models import CategoryCreate, CategoryRow, CategoryUpdate, RoutingTarget, RoutingUpdate

router = APIRouter()
```

Then copy verbatim the seven route handlers (`get_routing`, `save_routing`, `get_categories`, `get_categories_progress`, `create_category`, `update_category`, `delete_category`) from `main.py`, replacing `@app.` with `@router.`.

- [ ] **Step 4: Create `backend/routers/debt.py`**

Cut the `AccountTerm` / `DebtSettingsUpdate` models and two debt route handlers from `main.py`.

```python
"""Debt settings routes: GET/POST /api/debt/settings."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.deps import get_db
from backend.debt_engine import get_apr_for_account, get_default_min_payment

router = APIRouter()


class AccountTerm(BaseModel):
    account_name: str
    apr:          float
    min_payment:  float
    display_name: str | None = None


class DebtSettingsUpdate(BaseModel):
    terms: list[AccountTerm]
```

Then copy the two debt route handlers (`get_debt_settings`, `save_debt_settings`).

- [ ] **Step 5: Create `backend/routers/settings.py`**

Cut the `_FINANCE_PREFIXES` / `_EQUITY_PREFIXES` constants, CSV upload handler, and logs handler from `main.py`.

```python
"""System routes: POST /api/upload/csv, GET /api/logs."""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from backend.deps import get_db, DIR
from backend.equity_engine import parse_brokerage_csv
from backend.ingest import build_database
from backend.logger import LOG_FILE

router = APIRouter()

_FINANCE_PREFIXES = ("Transactions", "Balances")
_EQUITY_PREFIXES  = ("Equity", "RSU")
_VALID_PREFIXES   = _FINANCE_PREFIXES + _EQUITY_PREFIXES
```

Then copy the `upload_csv` and `get_logs` handlers.

- [ ] **Step 6: Gut `main.py` — replace all route handlers with `include_router()` calls**

The new `main.py` should be ~60 lines. It keeps: imports, logger, middleware classes, exception handler, `app = FastAPI(...)`. Remove every `@app.get` / `@app.post` etc. handler and every now-redundant model class. Add:

```python
from backend.routers import dashboard, budget, equity, debt, transactions, settings as settings_router

# ... (keep CORS and request log middleware registrations as-is) ...

app.include_router(dashboard.router)
app.include_router(budget.router)
app.include_router(equity.router)
app.include_router(debt.router)
app.include_router(transactions.router)
app.include_router(settings_router.router)
```

Remove from `main.py`: `AccountTerm`, `DebtSettingsUpdate`, `VestTranche`, `NewEquityGrant`, `DIR`, `DB_PATH`, `PERIOD_KEYS`, `get_db`, and all route handler functions. Also remove imports that are no longer needed in `main.py` (they're used by the router files now).

- [ ] **Step 7: Smoke-test the refactored API**

Start the server and hit a couple of endpoints:

```bash
call venv\Scripts\activate
uvicorn backend.main:app --reload --port 8000
```

In a second terminal:
```bash
curl http://localhost:8000/api/categories
curl http://localhost:8000/api/routing
curl http://localhost:8000/api/dashboard
```

Expected: all three return JSON (may be empty/slow for `/api/dashboard` but must not 500). The `/api/dashboard` hit is critical — it exercises the `generate_dashboard` import path that moved from `main.py` into `backend/routers/dashboard.py`.

Stop the server with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add backend/routers/ backend/main.py backend/deps.py
git commit -m "refactor: split FastAPI monolith into APIRouter files (budget, equity, debt, settings, dashboard)"
```

---

## Task 3: Create `backend/routers/transactions.py` with tests

**Files:**
- Create: `backend/routers/transactions.py`
- Create: `tests/test_transactions_api.py`

- [ ] **Step 1: Write the failing tests first**

```python
# tests/test_transactions_api.py
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
```

- [ ] **Step 2: Run tests — confirm they fail with import/route-not-found errors**

```bash
call venv\Scripts\activate
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
pytest tests/test_transactions_api.py -v 2>&1 | head -40
```

Expected: ImportError or 404s — the route does not exist yet.

- [ ] **Step 3: Create `backend/routers/transactions.py`**

```python
"""
GET /api/transactions — filterable transaction drill-down endpoint.

Supports ?period=, ?type=, ?category= (all optional, all combinable).
Period filter uses get_period_months() to match the exact date range shown on
charts, preventing data leaks across period boundaries.
"""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from backend.deps import get_db, PERIOD_KEYS
from backend.engine import get_period_months

router = APIRouter()


@router.get("/api/transactions")
def list_transactions(
    period:   str | None = Query(default=None),
    category: str | None = Query(default=None),
    type:     str | None = Query(default=None, alias="type"),
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Return transactions matching the given filters, ordered newest-first.

    When `type` is provided the caller's intent is explicit — the default
    exclusion of income (I) and transfers (X) is suppressed so that e.g.
    ?type=I can be used in the future without conflicting clauses.
    """
    # FastAPI won't bind 'type' as a Python identifier; use alias
    type_ = type  # noqa: A001 — shadow is intentional for readability below

    clauses: list[str] = []
    params:  list      = []

    # Default: hide income + internal transfers from the spending drawer.
    # Suppressed when type_ is explicit (caller declares what they want).
    if not type_:
        clauses.append("type NOT IN ('I', 'X')")

    if period is not None:
        if period not in PERIOD_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid period '{period}'. Must be one of: {PERIOD_KEYS}",
            )
        months = get_period_months(period)
        placeholders = ",".join("?" * len(months))
        clauses.append(f"strftime('%Y-%m', date) IN ({placeholders})")
        params.extend(months)

    if category is not None:
        clauses.append("category = ?")
        params.append(category)

    if type_ is not None:
        clauses.append("type = ?")
        params.append(type_)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    sql = f"""
        SELECT date, merchant, category, amount, type
        FROM   transactions
        {where}
        ORDER  BY date DESC
        LIMIT  500
    """

    rows = conn.execute(sql, params).fetchall()
    return JSONResponse(content=[dict(r) for r in rows])
```

- [ ] **Step 4: Register the router in `main.py`** (should already be there from Task 2 Step 6, but double-check the import line exists):

```python
from backend.routers import transactions
# ...
app.include_router(transactions.router)
```

- [ ] **Step 5: Run the tests — confirm they all pass**

```bash
pytest tests/test_transactions_api.py -v
```

Expected output: 9 tests, all PASSED.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
pytest tests/ -v
```

Expected: all tests pass (including existing `test_debt_engine.py` and `test_waterfall.py`).

- [ ] **Step 7: Commit**

```bash
git add backend/routers/transactions.py tests/test_transactions_api.py
git commit -m "feat: add GET /api/transactions with period/type/category filters and pytest suite"
```

---

## Task 4: Install React Query and wrap `main.tsx`

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Install `@tanstack/react-query`**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
npm install @tanstack/react-query
```

Expected: `package.json` gains `"@tanstack/react-query": "^5.x"` in `dependencies`.

- [ ] **Step 2: Update `frontend/src/main.tsx`**

Replace the entire file:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/layout'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,  // 30 s — prevents hammering FastAPI on tab switches
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
```

- [ ] **Step 3: Verify the build compiles cleanly**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
npm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
git add frontend/package.json frontend/package-lock.json frontend/src/main.tsx
git commit -m "feat: install @tanstack/react-query v5 and wrap app in QueryClientProvider"
```

---

## Task 5: Refactor `EquityTab.tsx` to React Query

**Files:**
- Modify: `frontend/src/pages/EquityTab.tsx`

This is the simpler refactor (one query, one mutation) — do it before BudgetTab.

- [ ] **Step 1: Add `useQuery` / `useMutation` / `useQueryClient` imports at the top of `EquityTab.tsx`**

Add to the existing import block:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```

- [ ] **Step 2: Replace the fetch+useEffect data fetching in `EquityTab` with `useQuery`**

The current `EquityTab` function body opens with:
```tsx
const [equityData, setEquityData]    = useState<EquitySection | null>(null);
const [loading, setLoading]          = useState(true);
const [globalErrors, setGlobalErrors] = useState<string[]>([]);
const [showModal, setShowModal]      = useState(false);
const [refreshKey, setRefreshKey]    = useState(0);
const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
// ...
useEffect(() => {
  setLoading(true);
  fetch(...)
  // ...
}, [refreshKey, addError]);
```

Replace with:

```tsx
const qc = useQueryClient()
const [showModal, setShowModal] = useState(false)

const { data: equityData, isLoading: loading, isError, error } = useQuery<EquitySection>({
  queryKey: ['equity'],
  queryFn:  () =>
    fetch(`${API}/api/equity`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
})

const globalErrors = isError ? [(error as Error).message] : []
```

- [ ] **Step 3: Replace `AddGrantModal`'s submit `fetch` with `useMutation`**

The `AddGrantModal` component currently calls `fetch(API/api/equity/grants, {method:'POST', ...})` directly. Add mutation inside `AddGrantModal` (it already receives `onSuccess` as a prop):

```tsx
// Inside AddGrantModal — replace the try/catch fetch block in handleSubmit:
const mutation = useMutation({
  mutationFn: (body: object) =>
    fetch(`${API}/api/equity/grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
      return r.json();
    }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['equity'] })
    onSuccess()
  },
  onError: (e: Error) => setFormError(e.message),
})
```

Add `const qc = useQueryClient()` inside `AddGrantModal`.

Update `handleSubmit` to call `mutation.mutate(payload)` instead of the raw fetch.
Replace `submitting` with `mutation.isPending`.

- [ ] **Step 4: Remove unused state: `refreshKey`, `refresh`, `addError`, `globalErrors` array**

These are now replaced by the query's `isError` / `error` and the mutation's `onError`.
The `globalErrors` display banner can read from `isError ? [(error as Error).message] : []`.

**Important:** `AddGrantModal` receives an `onSuccess` prop. After removing `refresh`, `EquityTab` must pass `onSuccess={() => setShowModal(false)}` — the mutation calls `qc.invalidateQueries` to re-fetch, then calls `onSuccess()` to close the modal. Do NOT pass `refresh` (it no longer exists). The full call site in `EquityTab`:
```tsx
<AddGrantModal onSuccess={() => setShowModal(false)} />
```

- [ ] **Step 5: Build and verify**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
npm run build
```

Expected: exits 0. The EquityTab re-fetches automatically after a grant is saved because `invalidateQueries` marks the `['equity']` query stale.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/pages/EquityTab.tsx
git commit -m "refactor: migrate EquityTab to useQuery/useMutation — remove refreshKey pattern"
```

---

## Task 6: Refactor `BudgetTab.tsx` to React Query

**Files:**
- Modify: `frontend/src/pages/BudgetTab.tsx`

This is the largest refactor. Three separate queries (`routing`, `categories`, `categories/progress`) plus multiple mutations.

- [ ] **Step 1: Add React Query imports at the top of `BudgetTab.tsx`**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```

- [ ] **Step 2: Refactor `BudgetTab` root component — replace `loadTargets` with `useQuery`**

Current:
```tsx
const [targets, setTargets] = useState<RoutingTarget[]>([]);
const [loading, setLoading] = useState(true);
const [loadErr, setLoadErr] = useState<string | null>(null);
const loadTargets = useCallback(async () => { ... }, []);
useEffect(() => { loadTargets(); }, [loadTargets]);
```

Replace with:
```tsx
const { data: targets = [], isLoading: loading, error: loadErr } =
  useQuery<RoutingTarget[]>({
    queryKey: ['routing'],
    queryFn:  () =>
      fetch(`${API}/api/routing`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  })
```

The `loadErr` is now `Error | null` instead of `string | null` — update the JSX to use `loadErr?.message`.

- [ ] **Step 3: Refactor `RoutingEditor` — replace `handleSave` with `useMutation`**

`RoutingEditor` currently calls `fetch(PUT /api/routing)` and then calls `onSaved()` prop.

Replace `onSaved` prop with nothing — the mutation invalidates the query:

```tsx
function RoutingEditor({ targets }: { targets: RoutingTarget[] }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<RoutingTarget[]>(() => targets.map(t => ({ ...t })))

  const saveMutation = useMutation({
    mutationFn: (ts: RoutingTarget[]) =>
      fetch(`${API}/api/routing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: ts }),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routing'] }),
  })
```

Replace `saveState` / `saveError` state with `saveMutation.isPending` / `saveMutation.isSuccess` / `saveMutation.error?.message`.

Remove `onSaved` from `RoutingEditor`'s prop type and from the call site in `BudgetTab`.

- [ ] **Step 4: Refactor `LivePacing` — remove useEffect, add useQuery**

`LivePacing` currently manages its own `useState` + `useEffect` for `/api/categories/progress`.

Replace:
```tsx
function LivePacing() {
  const { data: items = [], isLoading: loading, error } =
    useQuery<CategoryProgress[]>({
      queryKey: ['categories/progress'],
      queryFn:  () =>
        fetch(`${API}/api/categories/progress`)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    })

  if (loading) return <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading live spend data…</p>
  if (error)   return <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Could not load: {(error as Error).message}</p>
  // ... rest of component unchanged
```

- [ ] **Step 5: Refactor `CategoryManager` — replace all fetches with useQuery/useMutation**

`CategoryManager` has three fetches: load, save per row, delete per row, and add. Replace:

```tsx
function CategoryManager() {
  const qc = useQueryClient()
  const [catTab, setCatTab] = useState<'pacing' | 'budgets'>('pacing')

  const { data: rows = [], isLoading: loading, error: loadErr } =
    useQuery<CategoryRow[]>({
      queryKey: ['categories'],
      queryFn:  () =>
        fetch(`${API}/api/categories`)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CategoryRow> }) =>
      fetch(`${API}/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`))); return r.json(); }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/api/categories/${id}`, { method: 'DELETE' })
        .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`))); return r.json(); }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })

  const addMutation = useMutation({
    mutationFn: (name: string) =>
      fetch(`${API}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, monthly_budget: 0 }),
      }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`))); return r.json(); }),
    onSuccess: () => { setNewName(''); setAdding(false); qc.invalidateQueries({ queryKey: ['categories'] }); },
  })
```

The per-row draft state (`CategoryRowDraft`) and the `toDraft` helper are kept for local editing. The `_saveState` / `_saveError` fields on each draft row are replaced by the mutation's `isPending` / `error`.

- [ ] **Step 6: Build and verify**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
npm run build
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
cd ..
git add frontend/src/pages/BudgetTab.tsx
git commit -m "refactor: migrate BudgetTab to useQuery/useMutation — remove all fetch+useEffect patterns"
```

---

## Task 7: Add section grouping to `Sidebar.tsx`

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update the `NAV_ITEMS` array to include a `section` field**

Replace the current `NAV_ITEMS` array:

```tsx
const NAV_ITEMS: {
  id: TabKey;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  section: string;
}[] = [
  { id: 'overview',     label: 'Overview',     icon: LayoutDashboard, section: 'Daily Ops' },
  { id: 'cashflow',     label: 'Cash Flow',    icon: TrendingUp,      section: 'Daily Ops' },
  { id: 'spending',     label: 'Spending',     icon: Wallet,          section: 'Daily Ops' },
  { id: 'budget',       label: 'Budget',       icon: Landmark,        section: 'Daily Ops' },
  { id: 'transactions', label: 'Transactions', icon: Receipt,         section: 'Daily Ops' },
  { id: 'debt',         label: 'Debt',         icon: CreditCard,      section: 'Wealth Building' },
  { id: 'equity',       label: 'Equity',       icon: BarChart2,       section: 'Wealth Building' },
  { id: 'settings',     label: 'Settings',     icon: Settings,        section: 'System' },
]
```

- [ ] **Step 2: Update the desktop rail `<nav>` to render section labels**

Replace the `{NAV_ITEMS.map(...)}` block inside the desktop `<nav>` with a section-aware renderer:

```tsx
<nav style={{ flex: 1, padding: '0 8px' }}>
  {(['Daily Ops', 'Wealth Building', 'System'] as const).map(section => {
    const sectionItems = NAV_ITEMS.filter(item => item.section === section)
    return (
      <div key={section}>
        {/* Section label — invisible when collapsed, fades in on rail hover */}
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75"
          style={{
            padding: '1rem 1.25rem 0.25rem',
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}
        >
          {section}
        </div>

        {/* Nav items in this section */}
        {sectionItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              // ... (keep all existing button styles and handlers exactly as-is)
            >
              {/* ... keep existing active indicator, icon, and label span exactly as-is */}
            </button>
          )
        })}
      </div>
    )
  })}
</nav>
```

The mobile bottom tab bar iterates `NAV_ITEMS` as a flat array — no changes needed there.

- [ ] **Step 3: Build and verify**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
npm run build
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add Daily Ops / Wealth Building / System section groups to nav rail"
```

---

## Task 8: Add `DrawerFilter` to `types.ts` and create `TransactionDrawer.tsx`

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/components/modals/TransactionDrawer.tsx`
- Modify: `frontend/src/components/modals/index.ts`

- [ ] **Step 1: Add `DrawerFilter` interface to `frontend/src/types.ts`**

Append to the end of `types.ts`:

```typescript
// ── Drill-down drawer (Phase 5.5) ────────────────────────────────────────────
// Placed here (not in a local component file) so App.tsx, tab components, and
// chart components can all import it from the same source without a second import path.

export interface DrawerFilter {
  category?: string;    // e.g. "Groceries" — exact match on transactions.category
  period?:   PeriodKey; // e.g. "current" — maps to date range via backend get_period_months()
  type?:     string;    // e.g. "O" — transaction type code (N, O, D, I, T, X)
  label?:    string;    // display-only: shown in the drawer header, never sent to the API
}
```

- [ ] **Step 2: Create `frontend/src/components/modals/TransactionDrawer.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import type { DrawerFilter } from '../../types'

const API = 'http://localhost:8000'

const TYPE_LABELS: Record<string, string> = {
  N: 'Necessities', O: 'Optional', D: 'Debt',
  I: 'Income',      T: 'Other',   X: 'Transfers',
}

const PERIOD_LABELS: Record<string, string> = {
  current: 'Current month', last: 'Last month',
  past2:   '2 months ago',  quarter: 'This quarter', year: 'YTD',
}

function buildLabel(f: DrawerFilter): string {
  if (f.label) return f.label
  const parts: string[] = []
  if (f.type)     parts.push(TYPE_LABELS[f.type]   ?? f.type)
  if (f.category) parts.push(f.category)
  if (f.period)   parts.push(PERIOD_LABELS[f.period] ?? f.period)
  return parts.join(' · ') || 'Transactions'
}

interface DrawerRow {
  date:     string
  merchant: string
  category: string
  amount:   number
  type:     string
}

function fetchTransactions(filter: DrawerFilter): Promise<DrawerRow[]> {
  const params = new URLSearchParams()
  if (filter.period)   params.set('period',   filter.period)
  if (filter.category) params.set('category', filter.category)
  if (filter.type)     params.set('type',     filter.type)
  return fetch(`${API}/api/transactions?${params.toString()}`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtAmt(n: number): string {
  return (n < 0 ? '−' : '+') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface TransactionDrawerProps {
  filter:  DrawerFilter
  onClose: () => void
}

export function TransactionDrawer({ filter, onClose }: TransactionDrawerProps) {
  const { data: rows = [], isLoading, isError, error } = useQuery<DrawerRow[]>({
    queryKey: ['transactions', filter],
    queryFn:  () => fetchTransactions(filter),
  })

  const netSum = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 299,
          background: 'rgba(0,0,0,0.35)',
        }}
      />

      {/* Drawer panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0,
          width: 440, zIndex: 300,
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {buildLabel(filter)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Drill-down · read-only
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '1.25rem', lineHeight: 1,
              padding: '0.25rem', borderRadius: '0.375rem',
            }}
            aria-label="Close"
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Loading transactions…
            </div>
          )}
          {isError && (
            <div style={{ padding: '1.5rem', color: 'var(--accent-red)', fontSize: '0.875rem' }}>
              {(error as Error).message}
            </div>
          )}
          {!isLoading && !isError && rows.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No transactions found for this filter.
            </div>
          )}
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr auto',
                gap: '0.5rem',
                alignItems: 'center',
                padding: '0.625rem 1.25rem',
                borderBottom: '1px solid var(--border-subtle)',
                background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--border-subtle) 20%, transparent)',
              }}
            >
              {/* Date */}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {fmtDate(row.date)}
              </span>

              {/* Merchant + category badge */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.merchant}
                </div>
                <span style={{
                  display: 'inline-block', marginTop: '0.15rem',
                  fontSize: '0.6875rem', fontWeight: 600,
                  padding: '0.1rem 0.45rem', borderRadius: '999px',
                  background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                  color: 'var(--accent-blue)',
                }}>
                  {row.category}
                </span>
              </div>

              {/* Amount */}
              <span style={{
                fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap',
                color: row.amount >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {fmtAmt(row.amount)}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        {!isLoading && !isError && (
          <div style={{
            padding: '0.875rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
            fontSize: '0.8125rem', color: 'var(--text-secondary)',
          }}>
            <span>{rows.length} transaction{rows.length !== 1 ? 's' : ''}</span>
            <span style={{ fontWeight: 700, color: netSum >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              Net: {fmtAmt(netSum)}
            </span>
          </div>
        )}
      </motion.div>
    </>
  )
}
```

- [ ] **Step 3: Export from `frontend/src/components/modals/index.ts`**

Add the export:
```typescript
export { TransactionDrawer } from './TransactionDrawer'
```

- [ ] **Step 4: Build and verify**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
npm run build
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/types.ts frontend/src/components/modals/TransactionDrawer.tsx frontend/src/components/modals/index.ts
git commit -m "feat: add DrawerFilter type and TransactionDrawer slide-out component"
```

---

## Task 9: Wire `onClick` on all four chart components

**Files:**
- Modify: `frontend/src/components/charts/SpendingDonut.tsx`
- Modify: `frontend/src/components/charts/CategoryBar.tsx`
- Modify: `frontend/src/components/charts/DiscretionaryBar.tsx`

- [ ] **Step 1: Update `SpendingDonut.tsx` — add `onDrillDown` prop and Chart.js `options.onClick`**

```tsx
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import type { DrawerFilter } from '../../types'

ChartJS.register(ArcElement, Tooltip, Legend)

// Map donut slice label → transaction type code
const SLICE_TYPE: Record<string, string> = {
  Necessities: 'N',
  Optional:    'O',
  Debt:        'D',
  Other:       'T',
}

interface SpendingDonutProps {
  nec:         number
  opt:         number
  debt:        number
  other:       number
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}

export function SpendingDonut({ nec, opt, debt, other, onDrillDown }: SpendingDonutProps) {
  const chartData = {
    labels: ['Necessities', 'Optional', 'Debt', 'Other'],
    datasets: [{
      data: [nec, opt, debt, other],
      backgroundColor: [
        'rgba(96, 165, 250, 0.8)',
        'rgba(192, 132, 252, 0.8)',
        'rgba(248, 113, 113, 0.8)',
        'rgba(251, 191, 36, 0.8)',
      ],
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right' as const } },
    // options.onClick is the Chart.js native handler (not a React event prop).
    // It receives (event, elements[]) with clicked element indices — the only
    // way to identify which arc was clicked in react-chartjs-2 v5 / Chart.js v4.
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (!elements.length) return
      // chartData is closed over — it is the local object defined above, not a callback param
      const label    = chartData.labels[elements[0].index]
      const typeCode = SLICE_TYPE[label]
      // Guard: if label is somehow not in the map, skip rather than send undefined type
      if (typeCode === undefined) return
      onDrillDown({ type: typeCode, label })
    },
    onHover: (_event: unknown, elements: unknown[], chart: { canvas: HTMLCanvasElement }) => {
      chart.canvas.style.cursor = (elements as unknown[]).length ? 'pointer' : 'default'
    },
  }

  return (
    <div style={{ height: '280px' }}>
      <Doughnut data={chartData} options={options} />
    </div>
  )
}
```

- [ ] **Step 2: Update `CategoryBar.tsx` — add `onDrillDown` prop and Chart.js `options.onClick`**

```tsx
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import type { DrawerFilter } from '../../types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

interface CategoryBarProps {
  labels:      string[]
  values:      number[]
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}

export function CategoryBar({ labels, values, onDrillDown }: CategoryBarProps) {
  const data = {
    labels,
    datasets: [{ data: values, backgroundColor: 'rgba(192, 132, 252, 0.7)' }],
  }

  const options = {
    indexAxis:           'y' as const,
    responsive:          true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (!elements.length) return
      const category = labels[elements[0].index]
      onDrillDown({ category, label: category })
    },
    onHover: (_event: unknown, elements: unknown[], chart: { canvas: HTMLCanvasElement }) => {
      chart.canvas.style.cursor = (elements as unknown[]).length ? 'pointer' : 'default'
    },
  }

  return (
    <div style={{ height: Math.max(200, labels.length * 28) + 'px' }}>
      <Bar data={data} options={options} />
    </div>
  )
}
```

- [ ] **Step 3: Update `DiscretionaryBar.tsx` — add `onDrillDown` prop and HTML `onClick` handlers**

Add `onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void` to `DiscretionaryBarProps` and import `DrawerFilter`.

For each of the four segment `<div>` elements, make the following changes:

**Necessary block** — change `cursor: 'help'` to `cursor: 'pointer'` and add:
```tsx
onClick={() => onDrillDown({ type: 'N', label: 'Necessities' })}
```

**Optional spending block** — change `cursor: 'help'` to `cursor: 'pointer'` and add:
```tsx
onClick={() => onDrillDown({ type: 'O', label: 'Optional' })}
```

**Extra debt block** — change `cursor: 'help'` to `cursor: 'pointer'` and add:
```tsx
onClick={() => onDrillDown({ type: 'D', label: 'Debt Payments' })}
```

**Unspent / Savings block** — leave `cursor: 'help'` and do NOT add `onClick` (unspent cash has no transactions).

**Overspent block** — change `cursor: 'help'` to `cursor: 'pointer'` and add:
```tsx
onClick={() => onDrillDown({ type: 'O', label: 'Optional (over budget)' })}
```

- [ ] **Step 4: Build and verify**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
npm run build
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/components/charts/SpendingDonut.tsx frontend/src/components/charts/CategoryBar.tsx frontend/src/components/charts/DiscretionaryBar.tsx
git commit -m "feat: wire onDrillDown onClick handlers to SpendingDonut, CategoryBar, DiscretionaryBar charts"
```

---

## Task 10: Wire `App.tsx` drawer state and thread `onDrillDown` to all tabs + BudgetTab doughnut

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/OverviewTab.tsx`
- Modify: `frontend/src/pages/SpendingTab.tsx`
- Modify: `frontend/src/pages/BudgetTab.tsx` (add doughnut onClick + accept onDrillDown prop)

- [ ] **Step 1: Add drawer state and `openDrawer` to `App.tsx`**

At the very top of the `App()` function body, immediately after the existing `useState` declarations (before any conditional logic), add:

```tsx
// ── Drill-down drawer — declared unconditionally so BudgetTab (pre-guard) gets it safely ──
const [drawerFilter, setDrawerFilter] = useState<DrawerFilter | null>(null)
const openDrawer  = useCallback(
  (f: Omit<DrawerFilter, 'period'>) => setDrawerFilter({ ...f, period: activePeriod }),
  [activePeriod],
)
const closeDrawer = useCallback(() => setDrawerFilter(null), [])
```

Add the import:
```tsx
import { useState, useEffect, useCallback } from 'react'  // add useCallback to existing React import
import { AnimatePresence } from 'framer-motion'  // already imported if framer-motion is used
import { TransactionDrawer } from './components/modals'
import type { DrawerFilter } from './types'
```

Note: `useCallback` must be added to the React import — the existing `App.tsx` only imports `useState` and `useEffect`.

- [ ] **Step 2: Add the `TransactionDrawer` render to the JSX, outside the tab switcher**

At the very bottom of the returned JSX, before the closing `</div>`:

```tsx
{/* Drill-down drawer — rendered at root so any chart on any tab can trigger it */}
<AnimatePresence>
  {drawerFilter && (
    <TransactionDrawer filter={drawerFilter} onClose={closeDrawer} />
  )}
</AnimatePresence>
```

- [ ] **Step 3: Thread `onDrillDown` into `OverviewTab` and `SpendingTab` via `renderTab()`**

In the `renderTab()` switch, update the `overview` and `spending` cases:

```tsx
case 'overview':  return <OverviewTab  data={data} activePeriod={activePeriod} onDrillDown={openDrawer} />;
case 'spending':  return <SpendingTab  data={data} activePeriod={activePeriod} onDrillDown={openDrawer} />;
```

All other cases are unchanged.

- [ ] **Step 4: Thread `onDrillDown` into `BudgetTab` in the pre-guard block**

```tsx
} : activeTab === 'budget' ? (
  <div style={{ padding: '1.5rem' }}>
    <BudgetTab onDrillDown={openDrawer} />
  </div>
```

- [ ] **Step 5: Update `OverviewTab.tsx` — accept and pass `onDrillDown` to `DiscretionaryBar`**

Add to `OverviewTabProps`:
```tsx
interface OverviewTabProps {
  data:        DashboardPayload
  activePeriod: PeriodKey
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}
```

Add import:
```tsx
import type { DrawerFilter } from '../types'
```

Find the `<DiscretionaryBar waterfall={period.cash_flow_waterfall} />` render call and add the prop:
```tsx
<DiscretionaryBar
  waterfall={period.cash_flow_waterfall}
  onDrillDown={onDrillDown}
/>
```

- [ ] **Step 6: Update `SpendingTab.tsx` — accept and pass `onDrillDown` to charts**

Add to `SpendingTabProps`:
```tsx
interface SpendingTabProps {
  data:        DashboardPayload
  activePeriod: PeriodKey
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}
```

Add import:
```tsx
import type { DrawerFilter } from '../types'
```

Update chart render calls:
```tsx
<SpendingDonut nec={nec} opt={opt} debt={debt} other={other} onDrillDown={onDrillDown} />
// ...
<CategoryBar labels={period.cat_labels} values={period.cat_values} onDrillDown={onDrillDown} />
```

- [ ] **Step 7: Update `BudgetTab.tsx` — accept `onDrillDown` and pass to `PaycheckRouter` + add doughnut onClick**

Add `onDrillDown` to `BudgetTab`'s props:

```tsx
interface BudgetTabProps {
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}

export function BudgetTab({ onDrillDown }: BudgetTabProps) {
```

Pass it to `PaycheckRouter`:
```tsx
<PaycheckRouter targets={targets} onDrillDown={onDrillDown} />
```

Update `PaycheckRouter`'s props:
```tsx
function PaycheckRouter({
  targets,
  onDrillDown,
}: {
  targets:     RoutingTarget[]
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}) {
```

In `PaycheckRouter`, add `onClick` to the imperative Chart.js config inside the `useEffect`:

```typescript
// Inside the chartInst.current = new Chart(...) call, in the `options` object:
onClick: (_event: unknown, elements: { index: number }[]) => {
  if (!elements.length) return
  const idx = elements[0].index
  if (idx < allocations.length) {
    const allocation = allocations[idx]
    // Guard: skip if routing target has no category mapped (empty string default)
    if (!allocation.target.category) return
    onDrillDown({
      category: allocation.target.category,
      label:    allocation.target.name,
    })
  }
  // "Debt / Overflow" slice is at index allocations.length — intentionally no drill-down
},
onHover: (_event: unknown, elements: unknown[]) => {
  if (chartInst.current) {
    (chartInst.current.canvas as HTMLCanvasElement).style.cursor =
      elements.length ? 'pointer' : 'default'
  }
},
```

Add `onDrillDown` to the `useEffect` dependency array since it's closed over.

Add the import at the top of `BudgetTab.tsx`:
```tsx
import type { DrawerFilter } from '../types'
```

- [ ] **Step 8: Final build**

```bash
cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
npm run build
```

Expected: exits 0, no TypeScript errors. This is the definitive check that all prop types line up.

- [ ] **Step 9: Commit**

```bash
cd ..
git add frontend/src/App.tsx frontend/src/pages/OverviewTab.tsx frontend/src/pages/SpendingTab.tsx frontend/src/pages/BudgetTab.tsx
git commit -m "feat: add TransactionDrawer to App root and wire onDrillDown through OverviewTab, SpendingTab, BudgetTab"
```

---

## Final Verification

- [ ] **Start the full stack and smoke-test the drill-down flow**

```bash
# Terminal 1 — Backend
call venv\Scripts\activate
uvicorn backend.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend && npm run build && npx serve dist -p 3000
```

Open `http://localhost:3000` and verify:

1. Navigate to **Spending** tab → hover over donut slices (cursor changes to pointer) → click "Optional" → drawer opens on the right with Optional transactions for the active period.
2. Click a bar in the **Category Bar** chart → drawer opens filtered to that category.
3. Navigate to **Overview** tab → click the "Optional" or "Necessary" segment of the DiscretionaryBar → drawer opens.
4. Navigate to **Budget** tab → enter a paycheck amount → click a doughnut slice → drawer opens filtered to that routing target's category.
5. Verify the **Sidebar** shows section labels ("Daily Ops", "Wealth Building", "System") when hovering the rail.
6. Navigate to **Equity** tab → add a grant → tab refreshes automatically (no page reload needed).

- [ ] **Final commit (if any last-minute fixes)**

```bash
git add -A
git commit -m "fix: phase 5.5 smoke-test corrections"
```
