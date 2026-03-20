# Phase 6: Tax Shield Dashboard — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Phase:** 6 (Retirement & Gamified Tax Strategy — Step 1)

---

## Overview

Add a "Tax & Retirement" tab to the Finance Dashboard that tracks tax-advantaged account contributions (401k, HSA, IRA, etc.) using gamified pacing mechanics. The tab shows each account as a progress-bar card with a ghost car target pacer, a gold match checkpoint, and a top-line KPI estimating total taxes saved YTD.

---

## Goals

- Track `ytd_contributions` against `annual_limit` per account with a visual progress bar.
- Show a **Ghost Car** — a pacing marker at `(dayOfYear / daysInYear) × annual_limit` — so the user knows if they are ahead or behind optimal contribution pace.
- Show a **Free Money Checkpoint** — a gold marker on the bar at `employer_match_target` — replaced by a `🏆 Match Secured` badge once crossed.
- Display a **Total Tax Shield** KPI: `sum(ytd_contributions) × 0.24`, estimating taxes saved YTD at a 24% marginal rate.
- Split cards into two player columns: **Steven** and **Wife**.
- Support full CRUD (create, edit, delete) via a slide-out modal.

---

## Architecture

### File Map

```
backend/
  database.py                  — new `retirement_accounts` table in _create_tables() + _migrate() v5
  models.py                    — RetirementAccount, RetirementCreate, RetirementUpdate
  routers/retirement.py        — GET/POST/PUT/{id}/DELETE/{id} under /api/retirement
  main.py                      — include_router(retirement.router)

frontend/src/
  types.ts                     — add 'tax' to TabKey; add RetirementAccount interface
  components/layout/Sidebar.tsx — add 'Tax & Retirement' nav item (Wealth Building section)
  App.tsx                      — render TaxRetirementTab in pre-guard block; add case 'tax' to renderTab()
  pages/index.ts               — export TaxRetirementTab
  pages/TaxRetirementTab.tsx   — React Query fetch, KPI scoreboard, two-column grid
  components/cards/RetirementCard.tsx  — gamified progress bar, ghost car, match checkpoint
  components/modals/RetirementModal.tsx — create/edit form with useMutation
```

---

## Backend

### Database Schema (`backend/database.py`)

**Step 1 — Add to `_create_tables()`** (idempotent, runs on every startup including fresh databases):

```sql
CREATE TABLE IF NOT EXISTS retirement_accounts (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name          TEXT NOT NULL,
    account_type          TEXT NOT NULL,   -- e.g. '401k', 'HSA', 'Roth IRA'
    owner                 TEXT NOT NULL,   -- 'Steven' or 'Wife'
    annual_limit          REAL NOT NULL,
    ytd_contributions     REAL NOT NULL DEFAULT 0.0,
    employer_match_amount REAL,            -- nullable: YTD matched dollars
    employer_match_target REAL             -- nullable: $ threshold to earn full match
);
```

**Step 2 — Add migration block in `_migrate()` (v5)** (guards existing databases):

```python
# v5: add retirement_accounts table (for databases created before this migration)
tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
if "retirement_accounts" not in tables:
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

The table belongs in **both** `_create_tables()` (for clean database initialisation, consistent with all other tables) and `_migrate()` (for existing databases that were created before this migration). The `CREATE TABLE IF NOT EXISTS` in `_create_tables()` and the `if "retirement_accounts" not in tables` guard in `_migrate()` together make both blocks fully idempotent.

Note: `backend/routers/__init__.py` does not need to be modified. The existing flat-import pattern (`from backend.routers import retirement`) works without touching `__init__.py`.

---

### Pydantic Models (`backend/models.py`)

```python
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

---

### Router (`backend/routers/retirement.py`)

Four endpoints under `/api/retirement`:

| Method   | Path                    | Description                              | Status |
|----------|-------------------------|------------------------------------------|--------|
| GET      | `/api/retirement`       | All accounts ordered by owner, type      | 200    |
| POST     | `/api/retirement`       | Create new account                       | 201    |
| PUT      | `/api/retirement/{id}`  | Partial update (any subset of fields)    | 200    |
| DELETE   | `/api/retirement/{id}`  | Delete account                           | 204    |

- GET returns `list[RetirementAccount]` ordered `ORDER BY owner, account_type`.
- POST validates with `RetirementCreate`, inserts, returns `{"id": <new_id>}`.
- PUT validates with `RetirementUpdate`, applies only non-None fields via dynamic SQL, returns the updated `RetirementAccount` row. Returns 404 if id not found.
- DELETE returns 204 No Content. Returns 404 if id not found.

Registered in `backend/main.py` using the same direct import style as existing routers:
```python
from backend.routers import dashboard, budget, equity, debt, settings as settings_router, transactions, retirement
# ...
app.include_router(retirement.router)
```

---

## Frontend

### `frontend/src/types.ts`

```typescript
// Update TabKey union:
export type TabKey = 'overview' | 'cashflow' | 'spending' | 'debt' | 'transactions'
                   | 'settings' | 'equity' | 'budget' | 'tax';

// New interface (mirrors RetirementAccount Pydantic model exactly):
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
```

---

### `frontend/src/components/layout/Sidebar.tsx`

- Import `ShieldCheck` from `lucide-react`.
- Add to `NAV_ITEMS` array after the `equity` entry:
  ```ts
  { id: 'tax', label: 'Tax & Retirement', icon: ShieldCheck, section: 'Wealth Building' }
  ```

---

### `frontend/src/App.tsx`

Two changes are required:

**1. Pre-guard render block** — add alongside `BudgetTab`, `EquityTab`, `SettingsTab`:
```tsx
{activeTab === 'tax' && <TaxRetirementTab />}
```
This lives outside the `{data && ...}` guard because `TaxRetirementTab` fetches its own data via React Query.

**2. `renderTab()` switch statement** — add a no-op case so TypeScript's exhaustiveness check passes:
```ts
case 'tax':
  return null; // handled in pre-guard block above
```

---

### `frontend/src/pages/index.ts`

Add the barrel export:
```ts
export { default as TaxRetirementTab } from './TaxRetirementTab';
```

---

### `frontend/src/pages/TaxRetirementTab.tsx`

**Responsibilities:** React Query data fetch, KPI scoreboard, two-column player grid layout.

**Data fetch:**
```ts
const API = 'http://localhost:8000';

const { data: accounts = [], isLoading, error, refetch } =
  useQuery<RetirementAccount[]>({
    queryKey: ['retirement'],
    queryFn: () => fetch(`${API}/api/retirement`).then(r => r.json()),
  });
```

**KPI Scoreboard (top):**
- Single large premium card spanning full width.
- `totalShield = accounts.reduce((sum, a) => sum + a.ytd_contributions, 0) * 0.24`
- Label: "Estimated Taxes Saved YTD" with subtitle "Based on 24% marginal rate"
- Secondary KPIs below: total YTD contributions, number of accounts, number with match secured.

**Player grid:**
```tsx
const steven = accounts.filter(a => a.owner === 'Steven');
const wife   = accounts.filter(a => a.owner === 'Wife');
// Render two columns, each with a heading and stacked RetirementCards
```

**Add Account button:** top-right corner, opens `RetirementModal` with `account={null}`.

**Modal state:**
```ts
const [modalAccount, setModalAccount] = useState<RetirementAccount | 'new' | null>(null);
```
- `null` = modal closed
- `'new'` = modal open in create mode
- `RetirementAccount` = modal open in edit mode

When rendering `RetirementModal`, convert the `'new'` sentinel:
```tsx
{modalAccount !== null && (
  <RetirementModal
    account={modalAccount === 'new' ? null : modalAccount}
    onClose={() => setModalAccount(null)}
    onSaved={() => { refetch(); setModalAccount(null); }}
  />
)}
```
The `refetch` here is the function returned by the `useQuery` call in this component — not a stale reference.

---

### `frontend/src/components/cards/RetirementCard.tsx`

**Props:** `account: RetirementAccount`, `onEdit: (account: RetirementAccount) => void`

**Ghost Car calculation (computed at render time):**
```ts
const now = new Date();
const startOfYear = new Date(now.getFullYear(), 0, 1);
const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86_400_000) + 1;
// Handle leap years correctly
const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInYear = isLeapYear(now.getFullYear()) ? 366 : 365;
const targetPace = (dayOfYear / daysInYear) * account.annual_limit;
```

**Color state:**
- `ytd_contributions >= targetPace` → bar fill color: green (`#22c55e`)
- `ytd_contributions < targetPace` → bar fill color: amber (`#f59e0b`)

**Catch-up text (only when behind):**
```ts
const monthOfYear = now.getMonth(); // 0-indexed; December = 11
const monthsRemaining = Math.max(1, 12 - monthOfYear); // floor at 1 to avoid divide-by-zero
const deficit = targetPace - account.ytd_contributions;
const monthlyNeeded = deficit / monthsRemaining;
// Display: "+$X/mo to catch up"
```
The `Math.max(1, ...)` guard prevents division by zero and is correct: in December (month 11), `12 - 11 = 1` month remaining, which is accurate.

**Progress bar structure (all positioned relative):**
```
[Track: full width, rounded, bg-muted]
  [Fill: width = (ytd_contributions / annual_limit) * 100%, colored green/amber]
  [Ghost Car notch: absolute, left = (targetPace / annual_limit) * 100%,
      2px wide, full bar height, semi-transparent white vertical line]
  [Match Checkpoint (if employer_match_target != null AND not yet secured):
      absolute, left = (employer_match_target / annual_limit) * 100%,
      gold dashed vertical line + ⭐ pin rendered above the track]
```

**Match secured state (`ytd_contributions >= employer_match_target`):**
- Gold checkpoint line and pin disappear from bar.
- `🏆 Match Secured` vibrant badge appears in the card header area.

**Card footer:** Edit button (pencil icon) triggers `onEdit(account)`.

---

### `frontend/src/components/modals/RetirementModal.tsx`

**Props:**
```ts
interface RetirementModalProps {
  account: RetirementAccount | null;  // null = create mode; RetirementAccount = edit mode
  onClose: () => void;
  onSaved: () => void;   // parent calls refetch() then setModalAccount(null) via this
}
```

**Form fields:** account_name, account_type (text input or select), owner (select: Steven / Wife), annual_limit, ytd_contributions, employer_match_amount (optional), employer_match_target (optional).

**Mutations** — all fetches use the absolute base URL and serialize JSON correctly:
```ts
const API = 'http://localhost:8000';

// Create:
useMutation({
  mutationFn: (body: RetirementCreate) =>
    fetch(`${API}/api/retirement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()),
})

// Update:
useMutation({
  mutationFn: (body: RetirementUpdate) =>
    fetch(`${API}/api/retirement/${account!.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()),
})
```

On success: call `onSaved()` (which triggers `refetch()` and closes the modal in the parent).

**Delete:** Red delete button at bottom. Calls `DELETE /api/retirement/{id}` with a confirmation prompt before executing. On success: call `onSaved()`.

**Layout:** Framer Motion slide-in panel from the right (same animation pattern as `TransactionDrawer` — fixed position, right-anchored, width ~440px, backdrop overlay).

---

## Clarified Design Decisions

| Decision | Rationale |
|---|---|
| Three-file frontend split | `RetirementCard` has significant domain logic (ghost car math, color state, checkpoint rendering) — extracting it keeps `TaxRetirementTab` declarative |
| Tax rate hardcoded at 24% | Specified in requirements; subtitle makes the assumption explicit to the user |
| 24% applied to all account types including Roth | Known approximation for Step 1 — Roth contributions are post-tax so there is no current-year tax shield, but differentiating by account type is deferred to a future iteration. The subtitle ("Based on 24% marginal rate") signals this is an estimate |
| Table added to both `_create_tables()` and `_migrate()` | `_create_tables()` handles clean databases (consistent with all other tables); `_migrate()` v5 handles existing databases |
| Modal handles both create and edit | Eliminates duplicate form code; `account` prop drives mode (null = create) |
| `modalAccount === 'new'` sentinel | Separates "modal open in create mode" from "modal closed" (null), avoiding overloading null for both states |
| `refetch()` called directly (not `queryClient.invalidateQueries`) | Simpler; `retirement` query has no cross-tab cache consumers |
| `Math.max(1, 12 - monthOfYear)` in catch-up formula | Prevents divide-by-zero; December correctly produces 1 month remaining |
| Leap year handling in ghost car | Dividing by `daysInYear` (366 or 365) ensures the ghost car never exceeds `annual_limit` on leap years |
| Absolute `http://localhost:8000` base URL in all fetches | Matches existing codebase pattern; required because the frontend is served from `npx serve dist -p 3000` with no proxy |
| `case 'tax': return null` in `renderTab()` | Required to satisfy TypeScript exhaustiveness check when `'tax'` is added to `TabKey` |

---

## Out of Scope (Phase 6 Step 1)

- Tax Liability Estimator (`backend/tax_engine.py`) — Phase 6 Step 2
- Multi-entity / multi-user profiles — Phase 7
- Automatic contribution sync from CSV imports
- Historical contribution trend chart
- Per-account-type tax shield accuracy (Roth vs. pre-tax differentiation)
