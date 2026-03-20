# Phase 6.5 — ORM Migration & Config Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove hardcoded API URLs from all frontend files and migrate backend CRUD endpoints from raw `sqlite3` to SQLModel `Session` while keeping engine-delegating endpoints on a stable raw-connection path.

**Architecture:** A dual-dependency design in `deps.py` introduces `get_db()` (yields `Session`) for the three pure-CRUD routers (`retirement`, `budget`, `transactions`) and renames the existing `get_db()` to `get_raw_db()` for routers that delegate to `engine.py` functions (`dashboard`, `equity`, `settings`, `debt`). SQLModel table-class definitions live in `models.py` alongside the existing Pydantic API-response models; `database.py` calls `SQLModel.metadata.create_all(engine)` to replace the raw `CREATE TABLE IF NOT EXISTS` block while preserving `_migrate()` for post-deploy schema changes.

**Tech Stack:** React 19, Vite (VITE_API_URL env var), Python FastAPI, SQLModel ≥ 0.0.21, SQLAlchemy (bundled with SQLModel), pytest, httpx.

---

## Critical design decisions (read before touching any file)

### 1. Dual dependency — `get_db()` vs `get_raw_db()`

`dashboard.py`, `equity.py`, `settings.py`, and `debt.py` all call into `engine.py` / `ingest.py` which use `sqlite3.Row` factory access. Changing their dependency to `Session` would break those engine functions without a separate large-scope migration. The plan avoids that risk by keeping them on `get_raw_db()`.

### 2. Naming collisions between DB table models and API models

Two existing models cannot be turned into `table=True` classes with the same field names as their DB columns:

| Model | Problem | Solution |
|---|---|---|
| `Transaction` | DB columns = full names (`date`, `merchant`, …); API response = compact names (`d`, `m`, …) | Define new `TransactionRecord(SQLModel, table=True)` with full names; keep `Transaction(BaseModel)` for API responses |
| `EquityGrant` | DB column `vesting_schedule TEXT` (JSON string); API field `vesting_schedule: list[VestEvent]` | Define new `EquityGrantRecord(SQLModel, table=True)` with `vesting_schedule: str`; keep `EquityGrant(BaseModel)` for API responses |

Simple models (`RetirementAccount`, `RoutingTarget`, `Category`) can be cleanly converted to `SQLModel, table=True` and double as response models. Existing request models (`RetirementCreate`, `CategoryCreate`, etc.) stay as pure Pydantic.

### 3. `SQLModel.metadata.create_all(engine)` replaces raw CREATE TABLE block

All seven table-class definitions must be **imported** before `create_all` is called. `database.py` imports `models` at the top to register them with SQLModel metadata. `create_db_tables()` is wired into a FastAPI **lifespan** startup event in `main.py` — this guarantees `create_all` runs before any request is handled, and therefore before `get_raw_db()` ever calls `init_db()` and its `_migrate()` function. **`_migrate()` must not run before `create_all` — it queries `routing_targets` and `categories` which may not exist on a fresh database.**

### 4. Complex SQL stays as `text()`

`transactions.py` builds WHERE clauses dynamically. `budget.py`'s `get_categories_progress` uses a JOIN with COALESCE. `budget.py`'s `save_routing` deletes from `sqlite_sequence`. All three are expressed as `session.execute(text(sql), params)` rather than ORM queries — this is the correct SQLModel/SQLAlchemy pattern for non-trivial SQL.

### 5. Test fixture update required

Both `test_retirement_api.py` and `test_transactions_api.py` override `get_db` with a raw `sqlite3.Connection`. After migration, the overrides must yield a `Session` backed by an in-memory engine.

---

## File map

| Action | File |
|---|---|
| Create | `frontend/.env` |
| Modify | `frontend/src/App.tsx` |
| Modify | `frontend/src/pages/BudgetTab.tsx` |
| Modify | `frontend/src/pages/EquityTab.tsx` |
| Modify | `frontend/src/pages/OverviewTab.tsx` |
| Modify | `frontend/src/pages/SettingsTab.tsx` |
| Modify | `frontend/src/pages/TaxRetirementTab.tsx` |
| Modify | `frontend/src/components/modals/RetirementModal.tsx` |
| Modify | `frontend/src/components/modals/TransactionDrawer.tsx` |
| Modify | `requirements.txt` |
| Modify | `backend/models.py` (add 7 SQLModel table classes) |
| Modify | `backend/database.py` (add engine, replace _create_tables body) |
| Modify | `backend/main.py` (add lifespan startup event) |
| Modify | `backend/deps.py` (add engine, get_db Session, rename to get_raw_db) |
| Modify | `backend/routers/dashboard.py` (switch to get_raw_db) |
| Modify | `backend/routers/equity.py` (switch to get_raw_db) |
| Modify | `backend/routers/settings.py` (switch to get_raw_db) |
| Modify | `backend/routers/debt.py` (switch to get_raw_db) |
| Modify | `backend/routers/retirement.py` (full Session migration) |
| Modify | `backend/routers/budget.py` (full Session migration) |
| Modify | `backend/routers/transactions.py` (full Session migration) |
| Modify | `tests/test_retirement_api.py` (update fixture) |
| Modify | `tests/test_transactions_api.py` (update fixture) |

---

## Task 1: Frontend .env + replace hardcoded API URLs

**Files:**
- Create: `frontend/.env`
- Modify: `frontend/src/App.tsx:90`
- Modify: `frontend/src/pages/BudgetTab.tsx:11`
- Modify: `frontend/src/pages/EquityTab.tsx:7`
- Modify: `frontend/src/pages/OverviewTab.tsx:7`
- Modify: `frontend/src/pages/SettingsTab.tsx:222`
- Modify: `frontend/src/pages/TaxRetirementTab.tsx:8`
- Modify: `frontend/src/components/modals/RetirementModal.tsx:6`
- Modify: `frontend/src/components/modals/TransactionDrawer.tsx:5`

- [ ] **Step 1: Create `frontend/.env`**

```
VITE_API_URL=http://localhost:8000
```

- [ ] **Step 2: Replace the hardcoded fetch in `App.tsx:90`**

Find:
```typescript
fetch('http://localhost:8000/api/dashboard')
```
Replace with:
```typescript
fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/dashboard`)
```

- [ ] **Step 3: Replace `const API` in each of the 7 page/modal files**

In each of the 7 files that contain `const API = 'http://localhost:8000';`, replace that line with:

```typescript
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
```

The 7 files are:
- `frontend/src/pages/BudgetTab.tsx`
- `frontend/src/pages/EquityTab.tsx`
- `frontend/src/pages/OverviewTab.tsx`
- `frontend/src/pages/SettingsTab.tsx`
- `frontend/src/pages/TaxRetirementTab.tsx`
- `frontend/src/components/modals/RetirementModal.tsx`
- `frontend/src/components/modals/TransactionDrawer.tsx`

- [ ] **Step 4: Verify no hardcoded URLs remain**

Run:
```bash
grep -r "http://localhost:8000" frontend/src/
```
Expected: zero matches.

- [ ] **Step 5: Build to confirm no TypeScript errors**

```bash
npm run build
```
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/.env frontend/src/App.tsx \
  frontend/src/pages/BudgetTab.tsx frontend/src/pages/EquityTab.tsx \
  frontend/src/pages/OverviewTab.tsx frontend/src/pages/SettingsTab.tsx \
  frontend/src/pages/TaxRetirementTab.tsx \
  frontend/src/components/modals/RetirementModal.tsx \
  frontend/src/components/modals/TransactionDrawer.tsx
git commit -m "feat: replace hardcoded API URLs with VITE_API_URL env var"
```

---

## Task 2: Add sqlmodel to requirements.txt

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add sqlmodel**

Append to `requirements.txt`:
```
sqlmodel>=0.0.21
```

- [ ] **Step 2: Install in venv**

```bash
call venv\Scripts\activate && pip install sqlmodel
```
Expected: `Successfully installed sqlmodel-...`

- [ ] **Step 3: Verify import works**

```bash
python -c "import sqlmodel; print(sqlmodel.__version__)"
```
Expected: a version string (no ImportError).

- [ ] **Step 4: Commit**

```bash
git add requirements.txt
git commit -m "chore: add sqlmodel dependency"
```

---

## Task 3: Add SQLModel table classes to `backend/models.py`

**Files:**
- Modify: `backend/models.py`

The seven table classes replace raw `CREATE TABLE IF NOT EXISTS` statements. They are appended **below** the existing Pydantic models so nothing that imports `models.py` breaks.

- [ ] **Step 1: Add imports at top of `backend/models.py`**

Add to the existing `from __future__ import annotations` block (after line 8):

```python
from typing import Optional
from sqlmodel import SQLModel as _SQLModel, Field as _Field
```

Use private aliases (`_SQLModel`, `_Field`) to avoid collision with the `Field` already imported from pydantic on line 8.

- [ ] **Step 2: Replace existing Pydantic models that become SQLModel table classes**

> **IMPORTANT:** `RetirementAccount` (line 207) and `RoutingTarget` (line 175) already exist in `models.py` as pure Pydantic `BaseModel` classes. Do **not** append new classes with the same names — Python would silently have the second definition shadow the first, producing confusing `id: int` vs `id: Optional[int]` mismatches. Instead, **delete the existing Pydantic blocks and replace them in-place** with the SQLModel table classes below.

**3a. Replace `class RetirementAccount(BaseModel)` (lines 207-215) with:**

```python
class RetirementAccount(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "retirement_accounts"
    id:                    Optional[int]   = _Field(default=None, primary_key=True)
    account_name:          str             = ""
    account_type:          str             = ""
    owner:                 str             = ""
    annual_limit:          float           = 0.0
    ytd_contributions:     float           = _Field(default=0.0)
    employer_match_amount: Optional[float] = None
    employer_match_target: Optional[float] = None
```

**3b. Replace `class RoutingTarget(BaseModel)` (lines 175-180) with:**

```python
class RoutingTarget(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "routing_targets"
    id:             Optional[int] = _Field(default=None, primary_key=True)
    name:           str           = ""
    monthly_amount: float         = 0.0
    category:       str           = _Field(default="")
    priority:       int           = _Field(default=99)
```

**3c. Append the remaining five table classes at the bottom of `backend/models.py`** (these are new — no existing Pydantic models to replace):

```python
# ---------------------------------------------------------------------------
# SQLModel ORM table classes — additive (no existing Pydantic model displaced)
# ---------------------------------------------------------------------------

class Category(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "categories"
    id:             Optional[int] = _Field(default=None, primary_key=True)
    name:           str           = _Field(default="", unique=True)
    monthly_budget: float         = _Field(default=0.0)


class AccountHistoryRecord(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "accounts_history"
    id:      Optional[int] = _Field(default=None, primary_key=True)
    name:    str            = ""
    balance: float          = 0.0
    date:    str            = ""
    type:    str            = ""   # 'asset' | 'liability'


class AccountTermRecord(_SQLModel, table=True):  # type: ignore[call-arg]
    __tablename__ = "account_terms"
    account_name: str           = _Field(primary_key=True)
    apr:          float         = 0.0
    min_payment:  float         = 0.0
    display_name: Optional[str] = None


class TransactionRecord(_SQLModel, table=True):  # type: ignore[call-arg]
    """DB-layer model with full column names. Separate from the compact Transaction API model."""
    __tablename__ = "transactions"
    id:          Optional[int] = _Field(default=None, primary_key=True)
    date:        str           = ""
    merchant:    str           = ""
    category:    str           = ""
    account:     str           = ""
    amount:      float         = 0.0
    owner:       str           = ""
    type:        str           = ""   # 'I'|'N'|'O'|'D'|'X'|'T'
    is_checking: int           = _Field(default=0)


class EquityGrantRecord(_SQLModel, table=True):  # type: ignore[call-arg]
    """DB-layer model. vesting_schedule stored as JSON string (see EquityGrant for typed API model)."""
    __tablename__ = "equity_grants"
    id:               Optional[int] = _Field(default=None, primary_key=True)
    ticker:           str           = ""
    grant_date:       str           = ""
    total_shares:     float         = 0.0
    vesting_schedule: str           = ""   # JSON: [{"date": "YYYY-MM-DD", "shares": 50.0}, ...]
    source:           str           = _Field(default="manual")
```

- [ ] **Step 3: Verify the module imports cleanly**

```bash
python -c "from backend.models import RetirementAccount, RoutingTarget, Category, TransactionRecord, EquityGrantRecord, AccountHistoryRecord, AccountTermRecord; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/models.py
git commit -m "feat: add SQLModel table=True classes to models.py"
```

---

## Task 4: Refactor `backend/database.py` — add engine, replace CREATE TABLE block

**Files:**
- Modify: `backend/database.py`

- [ ] **Step 1: Write a failing test for engine availability**

Add to a new `tests/test_orm_setup.py`:

```python
"""Verify SQLModel engine and table creation work correctly."""
import pytest
from sqlmodel import Session, create_engine, SQLModel

# Must import models so SQLModel metadata is populated before create_all
import backend.models  # noqa: F401


def test_create_all_creates_all_tables():
    """SQLModel.metadata.create_all creates all seven expected tables."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
    expected = {
        "retirement_accounts", "routing_targets", "categories",
        "accounts_history", "account_terms", "transactions", "equity_grants",
    }
    assert expected.issubset(tables), f"Missing tables: {expected - tables}"
```

Run:
```bash
pytest tests/test_orm_setup.py -v
```
Expected: **FAIL** (engine not yet defined in database.py)

- [ ] **Step 2: Refactor `backend/database.py`**

Replace the full file content:

```python
"""
SQLite schema initialisation for the Finance dashboard backend.

Usage:
    from backend.database import engine, init_db
    conn = init_db()          # uses default path "finance.db"

`engine` is a SQLModel/SQLAlchemy engine used by get_db() (Session).
`init_db()` returns a raw sqlite3.Connection used by get_raw_db() and ingest.py.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from sqlmodel import SQLModel, create_engine

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DIR     = Path(__file__).parent.parent
DB_PATH = DIR / "finance.db"

# ---------------------------------------------------------------------------
# SQLModel engine (used by Session-based CRUD routers via get_db())
# Imports models so SQLModel metadata is populated before any create_all call.
# ---------------------------------------------------------------------------
import backend.models  # noqa: F401 — registers table classes with SQLModel.metadata

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def create_db_tables() -> None:
    """Create all tables defined as SQLModel table=True classes."""
    SQLModel.metadata.create_all(engine)


# ---------------------------------------------------------------------------
# Raw sqlite3 init (used by get_raw_db(), ingest.py, and engine.py)
# ---------------------------------------------------------------------------

def init_db(db_path: str | Path = DB_PATH) -> sqlite3.Connection:
    """
    Create (or open) the SQLite database and ensure all tables exist.
    Returns an open connection with row_factory set to sqlite3.Row.
    """
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")

    _migrate(conn)
    conn.commit()
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """
    Idempotent migrations for schema changes added after initial deployment.
    Each step is safe to run on an already-migrated database.
    SQLModel.metadata.create_all() handles table creation; _migrate() handles
    additive ALTER TABLE changes and data backfills on existing databases.
    """
    # v2: add display_name column to account_terms
    existing = {row[1] for row in conn.execute("PRAGMA table_info(account_terms)")}
    if "display_name" not in existing:
        conn.execute("ALTER TABLE account_terms ADD COLUMN display_name TEXT")

    # v2: purge any rows written with the old 28-char truncated-name scheme.
    conn.execute("DELETE FROM account_terms WHERE length(account_name) <= 28")

    # v3: add source column to equity_grants
    existing_eq = {row[1] for row in conn.execute("PRAGMA table_info(equity_grants)")}
    if "source" not in existing_eq:
        conn.execute(
            "ALTER TABLE equity_grants ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"
        )

    # v4: seed routing_targets when table is empty
    if conn.execute("SELECT COUNT(*) FROM routing_targets").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO routing_targets (name, monthly_amount, category, priority) VALUES (?, ?, ?, ?)",
            [
                ("Fixed Auto-Pay (x6011)", 2500.0, "bills",     1),
                ("Shared Living (x5252)",   950.0, "living",    2),
                ("Wife Personal",           815.0, "allowance", 3),
                ("Steven Personal",         410.0, "allowance", 3),
            ],
        )

    # v4: one-time backfill — populate categories from existing transaction data.
    conn.execute("""
        INSERT OR IGNORE INTO categories (name)
        SELECT DISTINCT category FROM transactions
        WHERE category IS NOT NULL AND category != ''
    """)

    # v5: add retirement_accounts table (for databases predating SQLModel migration)
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


def sync_categories_from_transactions(conn: sqlite3.Connection) -> None:
    """
    Keep the categories table in sync with the distinct category values in
    the transactions table. Called exclusively from ingest.build_database().
    Does NOT call conn.commit() — callers are responsible for committing.
    """
    conn.execute("""
        INSERT OR IGNORE INTO categories (name)
        SELECT DISTINCT category FROM transactions
        WHERE category IS NOT NULL AND category != ''
    """)
    conn.execute("""
        DELETE FROM categories
        WHERE  monthly_budget = 0.0
          AND  name != 'Uncategorized'
          AND  name NOT IN (SELECT DISTINCT category FROM transactions)
    """)
```

> **Why remove `_create_tables()`?** SQLModel's `create_all()` now owns table creation. The raw CREATE TABLE block is replaced; `_migrate()` still handles ALTER TABLE changes on live databases that predate the SQLModel migration.

- [ ] **Step 3: Run the test**

```bash
pytest tests/test_orm_setup.py -v
```
Expected: PASS

- [ ] **Step 4: Verify existing tests still pass**

```bash
pytest tests/ -v
```
Expected: all tests pass (some fixture-dependent tests may fail — those are fixed in Task 9).

- [ ] **Step 5: Commit**

```bash
git add backend/database.py tests/test_orm_setup.py
git commit -m "feat: add SQLModel engine to database.py, replace _create_tables with create_all"
```

---

## Task 4.5: Wire `create_db_tables()` into FastAPI startup via lifespan

**Files:**
- Modify: `backend/main.py`

`_migrate()` inside `init_db()` queries `routing_targets` and `categories`. On a fresh database these tables do not exist until `create_all` runs. The lifespan event guarantees `create_all` fires **before any request is handled** — and therefore before `get_raw_db()` ever calls `init_db()`.

- [ ] **Step 1: Add lifespan startup to `backend/main.py`**

Add after the existing imports at the top of `main.py` (near line 24, after the router imports):

```python
from contextlib import asynccontextmanager
from backend.database import create_db_tables
```

Then replace the existing `app = FastAPI(...)` line with:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_tables()          # create all SQLModel tables before first request
    yield


app = FastAPI(title="Finance Dashboard API", lifespan=lifespan)
```

- [ ] **Step 2: Verify the app starts without errors**

```bash
python -c "from backend.main import app; print('app loaded ok')"
```
Expected: `app loaded ok` with no OperationalError.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: add lifespan startup event to create SQLModel tables before first request"
```

---

## Task 5: Refactor `backend/deps.py` — add `get_db()` (Session) and `get_raw_db()` (sqlite3)

**Files:**
- Modify: `backend/deps.py`

- [ ] **Step 1: Replace `backend/deps.py` entirely**

```python
"""
Shared FastAPI dependencies used by all routers.
Centralising here avoids circular imports between main.py and router modules.

Two database dependencies are available:

  get_db()      → yields SQLModel Session  (for CRUD routers: retirement, budget, transactions)
  get_raw_db()  → yields sqlite3.Connection (for engine-delegating routers: dashboard, equity,
                  settings, debt — these call engine.py functions that use sqlite3.Row access)
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Generator

from sqlmodel import Session

from backend.database import engine, init_db
from backend.models import PeriodKey

DIR      = Path(__file__).parent.parent
DB_PATH  = DIR / "finance.db"

PERIOD_KEYS: list[PeriodKey] = ["current", "last", "past2", "quarter", "year"]


def get_db() -> Generator[Session, None, None]:
    """Yield a SQLModel Session. Used by CRUD routers (retirement, budget, transactions)."""
    with Session(engine) as session:
        yield session


def get_raw_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Yield a raw sqlite3.Connection. Used by routers that delegate to engine.py functions
    (dashboard, equity, settings, debt) which rely on sqlite3.Row dict-style access.
    """
    conn = init_db(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()
```

- [ ] **Step 2: Update the four engine-delegating routers to use `get_raw_db()`**

In each of the four files below, change the import and type hint:

**`backend/routers/dashboard.py`** — find:
```python
from backend.deps import get_db, PERIOD_KEYS
```
Replace with:
```python
from backend.deps import get_raw_db, PERIOD_KEYS
```
And find:
```python
def get_dashboard(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
```
Replace with:
```python
def get_dashboard(conn: sqlite3.Connection = Depends(get_raw_db)) -> JSONResponse:
```

**`backend/routers/equity.py`** — same pattern (`get_db` → `get_raw_db`):
```python
from backend.deps import get_raw_db
# ...
def create_equity_grant(body: NewEquityGrant, conn: sqlite3.Connection = Depends(get_raw_db))
def get_equity(conn: sqlite3.Connection = Depends(get_raw_db))
```

**`backend/routers/settings.py`** — same pattern:
```python
from backend.deps import get_raw_db, DIR, DB_PATH
# ...
async def upload_csv(files: list[UploadFile] = File(...), conn: sqlite3.Connection = Depends(get_raw_db))
```

**`backend/routers/debt.py`** — same pattern:
```python
from backend.deps import get_raw_db
# ...
def get_debt_settings(conn: sqlite3.Connection = Depends(get_raw_db))
def save_debt_settings(body: DebtSettingsUpdate, conn: sqlite3.Connection = Depends(get_raw_db))
```

- [ ] **Step 3: Verify the backend starts cleanly**

```bash
python -c "from backend.main import app; print('app loaded ok')"
```
Expected: `app loaded ok`

- [ ] **Step 4: Commit**

```bash
git add backend/deps.py backend/routers/dashboard.py backend/routers/equity.py \
        backend/routers/settings.py backend/routers/debt.py
git commit -m "refactor: split get_db (Session) and get_raw_db (sqlite3) in deps.py"
```

---

## Task 6: Migrate `backend/routers/retirement.py` to SQLModel Session

**Files:**
- Modify: `backend/routers/retirement.py`

This is the cleanest migration — pure CRUD on one table, no engine-function delegation.

- [ ] **Step 1: Run the existing retirement tests to confirm they pass before changes**

```bash
pytest tests/test_retirement_api.py -v
```

Note the current result (some may fail if the fixture still uses `get_db` yielding raw conn — that's fixed in Task 9 after this task).

- [ ] **Step 2: Replace `backend/routers/retirement.py`**

```python
"""Retirement account CRUD routes: /api/retirement."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from sqlmodel import Session, select

from backend.deps import get_db
from backend.models import RetirementAccount, RetirementCreate, RetirementUpdate

router = APIRouter()


@router.get("/api/retirement")
def list_retirement_accounts(session: Session = Depends(get_db)) -> JSONResponse:
    """Return all retirement accounts ordered by owner, then account_type."""
    accounts = session.exec(
        select(RetirementAccount).order_by(RetirementAccount.owner, RetirementAccount.account_type)
    ).all()
    return JSONResponse(content=[a.model_dump() for a in accounts])


@router.post("/api/retirement", status_code=201)
def create_retirement_account(
    body: RetirementCreate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Insert a new retirement account."""
    account = RetirementAccount(
        account_name=body.account_name,
        account_type=body.account_type,
        owner=body.owner,
        annual_limit=body.annual_limit,
        ytd_contributions=body.ytd_contributions,
        employer_match_amount=body.employer_match_amount,
        employer_match_target=body.employer_match_target,
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return JSONResponse(status_code=201, content={"id": account.id})


@router.put("/api/retirement/{account_id}")
def update_retirement_account(
    account_id: int,
    body: RetirementUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Partial update — only fields present in the request body are written."""
    account = session.get(RetirementAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    for field, value in updates.items():
        setattr(account, field, value)

    session.add(account)
    session.commit()
    session.refresh(account)
    return JSONResponse(content=account.model_dump())


@router.delete("/api/retirement/{account_id}", status_code=204)
def delete_retirement_account(
    account_id: int,
    session: Session = Depends(get_db),
) -> Response:
    """Delete a retirement account by id."""
    account = session.get(RetirementAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found.")
    session.delete(account)
    session.commit()
    return Response(status_code=204)
```

- [ ] **Step 3: Commit**

```bash
git add backend/routers/retirement.py
git commit -m "refactor: migrate retirement.py router to SQLModel Session"
```

---

## Task 7: Migrate `backend/routers/budget.py` to SQLModel Session

**Files:**
- Modify: `backend/routers/budget.py`

Note: `get_categories_progress` uses a JOIN with COALESCE — expressed as `text()`. `save_routing` deletes from `sqlite_sequence` — also `text()`. Simple CRUD uses ORM style.

- [ ] **Step 1: Replace `backend/routers/budget.py`**

```python
"""Budget routes: /api/routing, /api/categories, /api/categories/progress."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from sqlalchemy import text

from backend.deps import get_db
from backend.models import (
    Category, CategoryCreate, CategoryUpdate, CategoryRow,
    RoutingTarget, RoutingUpdate,
)

router = APIRouter()


# ── Routing ──────────────────────────────────────────────────────────────────

@router.get("/api/routing")
def get_routing(session: Session = Depends(get_db)) -> JSONResponse:
    """Return all routing targets ordered by priority then name."""
    targets = session.exec(
        select(RoutingTarget).order_by(RoutingTarget.priority, RoutingTarget.name)
    ).all()
    return JSONResponse(content=[t.model_dump() for t in targets])


@router.put("/api/routing")
def save_routing(
    body: RoutingUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Full replace of routing_targets.
    DELETE + reset autoincrement + bulk INSERT — all within one transaction.
    Frontend must refetch GET /api/routing after success to get new IDs.
    """
    if not body.targets:
        raise HTTPException(status_code=400, detail="targets list must not be empty.")

    session.execute(text("DELETE FROM routing_targets"))
    # Note: no sqlite_sequence reset — SQLModel's create_all uses INTEGER PRIMARY KEY
    # without AUTOINCREMENT, so sqlite_sequence may not exist on fresh installs.
    # ID gaps after a full replace are acceptable; the frontend uses IDs as opaque keys.
    for t in body.targets:
        session.add(RoutingTarget(
            name=t.name,
            monthly_amount=t.monthly_amount,
            category=t.category,
            priority=t.priority,
        ))
    session.commit()
    return JSONResponse(content={"saved": len(body.targets)})


# ── Categories ───────────────────────────────────────────────────────────────

@router.get("/api/categories")
def get_categories(session: Session = Depends(get_db)) -> JSONResponse:
    """Return all categories ordered alphabetically."""
    cats = session.exec(select(Category).order_by(Category.name)).all()
    return JSONResponse(content=[{"id": c.id, "name": c.name, "monthly_budget": c.monthly_budget} for c in cats])


@router.get("/api/categories/progress")
def get_categories_progress(session: Session = Depends(get_db)) -> JSONResponse:
    """
    Return budgeted categories (monthly_budget > 0) with actual spending
    summed for the current calendar month.
    """
    rows = session.execute(text("""
        SELECT
            c.name,
            c.monthly_budget,
            COALESCE(
                SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END),
                0
            ) AS current_spend
        FROM categories c
        LEFT JOIN transactions t
            ON  t.category = c.name
            AND strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
            AND t.type NOT IN ('I', 'X')
        WHERE c.monthly_budget > 0
        GROUP BY c.id, c.name, c.monthly_budget
        ORDER BY c.name ASC
    """)).mappings().all()
    return JSONResponse(content=[dict(r) for r in rows])


@router.post("/api/categories")
def create_category(
    body: CategoryCreate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Create a new category. Returns 409 if the name already exists."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name must not be empty.")
    existing = session.exec(select(Category).where(Category.name == name)).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{name}' already exists.")
    cat = Category(name=name, monthly_budget=body.monthly_budget)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return JSONResponse(
        status_code=201,
        content={"id": cat.id, "name": cat.name, "monthly_budget": cat.monthly_budget},
    )


@router.put("/api/categories/{category_id}")
def update_category(
    category_id: int,
    body: CategoryUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Update a category's name and/or monthly_budget.
    Cascades a rename to all matching transaction rows atomically.
    """
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found.")

    old_name   = cat.name
    new_name   = body.name.strip() if body.name is not None else old_name
    new_budget = body.monthly_budget if body.monthly_budget is not None else cat.monthly_budget

    if new_name != old_name:
        conflict = session.exec(
            select(Category).where(Category.name == new_name, Category.id != category_id)
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail=f"Category '{new_name}' already exists.")
        # Cascade rename to transaction history
        session.execute(
            text("UPDATE transactions SET category = :new WHERE category = :old"),
            {"new": new_name, "old": old_name},
        )

    cat.name = new_name
    cat.monthly_budget = new_budget
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return JSONResponse(content={"id": cat.id, "name": cat.name, "monthly_budget": cat.monthly_budget})


@router.delete("/api/categories/{category_id}")
def delete_category(
    category_id: int,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Delete a category. Cascades all matching transactions to 'Uncategorized'.
    """
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found.")

    old_name = cat.name

    # Ensure 'Uncategorized' exists before cascading
    session.execute(text("INSERT OR IGNORE INTO categories (name) VALUES ('Uncategorized')"))
    # Cascade transactions
    session.execute(
        text("UPDATE transactions SET category = 'Uncategorized' WHERE category = :old"),
        {"old": old_name},
    )
    session.delete(cat)
    session.commit()
    return JSONResponse(content={"deleted": old_name})
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/budget.py
git commit -m "refactor: migrate budget.py router to SQLModel Session"
```

---

## Task 8: Migrate `backend/routers/transactions.py` to SQLModel Session

**Files:**
- Modify: `backend/routers/transactions.py`

The dynamic WHERE-clause SQL stays as `text()` — the ORM cannot easily express runtime-composed predicates without a query builder. `session.execute(text(sql), params)` is the correct SQLModel pattern here. Note that SQLAlchemy's `text()` requires named parameters (`:param`) rather than positional `?`.

- [ ] **Step 1: Replace `backend/routers/transactions.py`**

```python
"""
GET /api/transactions — filterable transaction drill-down endpoint.

Supports ?period=, ?type=, ?category= (all optional, all combinable).
Period filter uses get_period_months() to match the exact date range shown on
charts, preventing data leaks across period boundaries.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlmodel import Session
from sqlalchemy import text

from backend.deps import get_db, PERIOD_KEYS
from backend.engine import get_period_months

router = APIRouter()


@router.get("/api/transactions")
def list_transactions(
    period:   str | None = Query(default=None),
    category: str | None = Query(default=None),
    type:     str | None = Query(default=None, alias="type"),
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Return transactions matching the given filters, ordered newest-first.

    When `type` is provided the caller's intent is explicit — the default
    exclusion of income (I) and transfers (X) is suppressed.
    """
    type_ = type  # noqa: A001

    clauses: list[str] = []
    params:  dict      = {}

    if not type_:
        clauses.append("type NOT IN ('I', 'X')")

    if period is not None:
        if period not in PERIOD_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid period '{period}'. Must be one of: {PERIOD_KEYS}",
            )
        months = get_period_months(period)
        # SQLAlchemy text() requires named params; build a list of :m0, :m1, ...
        placeholders = ",".join(f":m{i}" for i in range(len(months)))
        clauses.append(f"strftime('%Y-%m', date) IN ({placeholders})")
        params.update({f"m{i}": m for i, m in enumerate(months)})

    if category is not None:
        clauses.append("category = :category")
        params["category"] = category

    if type_ is not None:
        clauses.append("type = :type_val")
        params["type_val"] = type_

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    sql = text(f"""
        SELECT date, merchant, category, amount, type
        FROM   transactions
        {where}
        ORDER  BY date DESC
        LIMIT  500
    """)

    rows = session.execute(sql, params).mappings().all()
    return JSONResponse(content=[dict(r) for r in rows])
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/transactions.py
git commit -m "refactor: migrate transactions.py router to SQLModel Session"
```

---

## Task 9: Update test fixtures for Session-based dependencies

**Files:**
- Modify: `tests/test_retirement_api.py`
- Modify: `tests/test_transactions_api.py`

The current fixtures create a raw `sqlite3.Connection` and override `get_db`. After migration, `get_db` yields `Session`. The fixtures must create an in-memory SQLModel engine and yield a `Session`.

- [ ] **Step 1: Update `tests/test_retirement_api.py` fixture**

Replace the fixture and imports at the top of the file:

```python
"""Tests for the retirement_accounts CRUD API."""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

# Import models so SQLModel metadata is populated before create_all
import backend.models  # noqa: F401
from backend.main import app
from backend.deps import get_db


@pytest.fixture()
def client():
    """TestClient backed by an isolated in-memory SQLModel database."""
    test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(test_engine)

    def override():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

Also remove the `from backend.database import init_db` import line (no longer used in this fixture).

Keep the two schema-assertion tests (`test_retirement_accounts_table_exists` and `test_retirement_accounts_columns`) — but update them to use SQLModel instead of `init_db`:

```python
def test_retirement_accounts_table_exists():
    """SQLModel creates the retirement_accounts table."""
    from sqlalchemy import inspect
    test_engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(test_engine)
    tables = set(inspect(test_engine).get_table_names())
    assert "retirement_accounts" in tables


def test_retirement_accounts_columns():
    """retirement_accounts has the expected columns."""
    from sqlalchemy import inspect
    test_engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(test_engine)
    cols = {c["name"] for c in inspect(test_engine).get_columns("retirement_accounts")}
    expected = {
        "id", "account_name", "account_type", "owner",
        "annual_limit", "ytd_contributions",
        "employer_match_amount", "employer_match_target",
    }
    assert expected == cols
```

- [ ] **Step 2: Update `tests/test_transactions_api.py` fixture**

Replace the fixture and imports at the top:

```python
"""
Tests for GET /api/transactions — the filterable transaction drill-down endpoint.
Uses FastAPI TestClient with an in-memory SQLModel database seeded with known rows.
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy import text

import backend.models  # noqa: F401 — registers table classes with SQLModel.metadata
from backend.main import app
from backend.deps import get_db


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
    test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
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
```

- [ ] **Step 3: Run the full test suite**

```bash
pytest tests/ -v
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/test_retirement_api.py tests/test_transactions_api.py
git commit -m "test: update fixtures to use SQLModel Session for in-memory test DB"
```

---

## Task 10: End-to-end smoke test

- [ ] **Step 1: Start the backend**

```bash
call venv\Scripts\activate && uvicorn backend.main:app --reload --port 8000
```

- [ ] **Step 2: Hit each migrated endpoint**

```bash
curl http://localhost:8000/api/retirement
curl http://localhost:8000/api/routing
curl http://localhost:8000/api/categories
curl http://localhost:8000/api/transactions
```
Expected: all return JSON with HTTP 200.

- [ ] **Step 3: Build the frontend**

```bash
npm run build
```
Expected: no errors, no hardcoded `localhost:8000` strings in output.

- [ ] **Step 4: Final grep sanity check**

```bash
grep -r "http://localhost:8000" frontend/src/ frontend/dist/
```
Expected: zero matches.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: Phase 6.5 ORM migration complete — SQLModel Session for CRUD routers"
```

---

## Summary of what was NOT migrated (and why)

| Router | Reason |
|---|---|
| `dashboard.py` | Delegates entirely to `engine.py` functions that use `sqlite3.Row` — full engine migration is a separate phase |
| `equity.py` | Calls `build_equity_section(conn)` from `engine.py` — same reason |
| `settings.py` | Calls `build_database()` from `ingest.py` which uses raw sqlite3 — same reason |
| `debt.py` | Calls `get_apr_for_account()` / `get_default_min_payment()` from `debt_engine.py`; also uses complex merged-dict logic that doesn't benefit from ORM |

These four routers now use `get_raw_db()` explicitly, making the boundary visible. A future "Phase 7 Engine Migration" can port `engine.py`, `ingest.py`, and `debt_engine.py` to SQLAlchemy Core and then remove `get_raw_db()` entirely.
