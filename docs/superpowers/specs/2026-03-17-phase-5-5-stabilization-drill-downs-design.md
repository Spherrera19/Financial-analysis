# Phase 5.5: Stabilization & Interactive Drill-Downs — Design Spec

**Date:** 2026-03-17
**Phase:** 5.5 (Stabilization sprint between Phase 5 Equity and Phase 6 Tax/Retire)
**Status:** Approved for implementation

---

## Overview

Phase 5.5 is an architecture stabilization sprint that also delivers the app's first interactive
drill-down capability. As the codebase grows toward multi-user and tax features, this phase
establishes the structural patterns that all future feature work will follow.

**Three goals:**
1. **Backend:** Split the monolithic `main.py` into FastAPI `APIRouter` files — one per domain.
2. **Frontend:** Adopt `@tanstack/react-query` for CRUD-heavy tabs; add a universal
   `TransactionDrawer` component with `DrawerFilter` state at the App root.
3. **UX:** Wire Chart.js `onClick` handlers across every major chart so any slice or bar opens
   the drawer with correctly scoped, period-bounded transaction data.

---

## Success Criteria

- `backend/main.py` contains **only** app initialization, middleware, exception handler, and
  `include_router()` calls — no route handlers.
- `GET /api/transactions` returns filtered rows for all combinations of `?period=`, `?type=`,
  and `?category=`.
- `BudgetTab` and `EquityTab` use `useQuery` / `useMutation`; raw `fetch + useEffect` patterns
  are eliminated from both.
- Clicking any chart element on SpendingTab, CashFlowTab, or BudgetTab opens the
  `TransactionDrawer` showing transactions that **exactly match the period shown on that chart**.
- The Sidebar navigation rail groups items into three labeled sections.

---

## Part 1: Backend Refactor — FastAPI APIRouter

### 1.1 New File Structure

```
backend/
  deps.py                 ← NEW: shared get_db(), DIR, DB_PATH, PERIOD_KEYS
  routers/
    __init__.py           ← empty
    dashboard.py          ← GET /api/dashboard
    budget.py             ← /api/routing, /api/categories, /api/categories/progress
    equity.py             ← GET /api/equity, POST /api/equity/grants
    debt.py               ← GET /api/debt/settings, POST /api/debt/settings
    transactions.py       ← NEW: GET /api/transactions (filterable)
    settings.py           ← POST /api/upload/csv, GET /api/logs
  main.py                 ← app init, CORS, middleware, exception handler, include_router() only
```

### 1.2 `backend/deps.py` — Shared Dependencies

Move the following out of `main.py` into `deps.py` to avoid circular imports when routers need them:

```python
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

All routers import `get_db`, `DIR`, `DB_PATH`, and `PERIOD_KEYS` from `backend.deps`.
`main.py` also imports from `backend.deps` for anything it still needs (e.g., `DIR` for startup).

### 1.3 Router Breakdown

| Router file      | Routes migrated from `main.py`                                              |
|------------------|-----------------------------------------------------------------------------|
| `dashboard.py`   | `GET /api/dashboard`                                                        |
| `budget.py`      | `GET /api/routing`, `PUT /api/routing`, `GET /api/categories`, `POST /api/categories`, `PUT /api/categories/{id}`, `DELETE /api/categories/{id}`, `GET /api/categories/progress` |
| `equity.py`      | `GET /api/equity`, `POST /api/equity/grants`                                |
| `debt.py`        | `GET /api/debt/settings`, `POST /api/debt/settings`                         |
| `transactions.py`| NEW — see Section 1.4                                                       |
| `settings.py`    | `POST /api/upload/csv`, `GET /api/logs`                                     |

Router-specific Pydantic request/response models (`AccountTerm`, `DebtSettingsUpdate`,
`VestTranche`, `NewEquityGrant`) move from `main.py` into their respective router files.
Models that are part of `backend/models.py` (e.g., `CategoryCreate`, `CategoryUpdate`,
`RoutingUpdate`) stay in `models.py`.

### 1.4 `routers/transactions.py` — New Filterable Transactions Endpoint

```
GET /api/transactions
```

**Query parameters (all optional, all combinable):**

| Param      | Type     | Example         | Description                                        |
|------------|----------|-----------------|----------------------------------------------------|
| `period`   | PeriodKey| `current`       | Date boundary; uses existing `get_period_months()` |
| `category` | string   | `Groceries`     | Exact match on `transactions.category` column      |
| `type`     | string   | `O`             | Exact match on `transactions.type` column          |

**Valid `period` values:** `current`, `last`, `past2`, `quarter`, `year`.
Return `HTTP 400` if an unrecognized `period` value is passed.

**SQL builder logic:**

```python
clauses: list[str] = []
params:  list      = []

# Default exclusion: hide income (I) and internal transfers (X) from the spending drawer.
# IMPORTANT: When `type_` is provided explicitly, the caller has declared what they want —
# skip the default exclusion entirely so ?type=I or ?type=X can work if ever wired.
if not type_:
    clauses.append("type NOT IN ('I', 'X')")

if period:
    if period not in PERIOD_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid period '{period}'. Must be one of: {PERIOD_KEYS}")
    months       = get_period_months(period)   # returns list[str] of "YYYY-MM"
    placeholders = ",".join("?" * len(months))
    clauses.append(f"strftime('%Y-%m', date) IN ({placeholders})")
    params.extend(months)

if category:
    clauses.append("category = ?")
    params.append(category)

if type_:                              # 'type' is a reserved word in Python; use type_
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
```

**Default exclusion:** `type='I'` (income) and `type='X'` (internal transfers) are excluded
when no `type` filter is provided. When `?type=` is given explicitly, the caller's intent
overrides the default — the condition is conditionally omitted so a future `?type=I` call
returns income rows without conflict.

**Response shape (full field names, not compact aliases):**
```json
[
  {
    "date":     "2026-03-05",
    "merchant": "Whole Foods",
    "category": "Groceries",
    "amount":   -87.43,
    "type":     "N"
  }
]
```

### 1.5 `"Uncategorized"` Transactions

The `?category=Uncategorized` filter works via standard SQL string matching — no special
handling needed. This is the intended path for users who click the "Other" chart slice and want
to see transactions that haven't been categorized yet, so they can then navigate to BudgetTab →
Edit Budgets to create a rule. Ensure the base SQL exclusion clause does **not** filter out
`category = 'Uncategorized'` rows.

---

## Part 2: Frontend — React Query Integration

### 2.1 Installation

```bash
npm install @tanstack/react-query
```

Target version: `^5.x` (current stable). No devtools package needed.

### 2.2 `main.tsx` — QueryClientProvider

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

createRoot(...).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
```

`staleTime: 30_000` (30 seconds) prevents hammering the FastAPI server on tab switches.

### 2.3 `BudgetTab.tsx` Refactor

**TanStack Query v5 uses an object-style API** — the two-argument overload `useQuery(key, fn)`
was removed in v5. All examples below use the correct v5 syntax.

Replace all `useState + useCallback + useEffect` data fetching with `useQuery` / `useMutation`:

| Old pattern                                       | New pattern (v5 object syntax)                                                       |
|---------------------------------------------------|--------------------------------------------------------------------------------------|
| `useState<RoutingTarget[]>([])` + `loadTargets()` | `useQuery({ queryKey: ['routing'], queryFn: fetchRouting })`                         |
| `useState<CategoryRow[]>([])` + `loadCategories()`| `useQuery({ queryKey: ['categories'], queryFn: fetchCategories })`                   |
| `LivePacing` useEffect fetch                      | `useQuery({ queryKey: ['categories/progress'], queryFn: fetchProgress })`            |
| `handleSave` PUT + `onSaved()` callback           | `useMutation({ mutationFn: saveRouting, onSuccess: () => qc.invalidateQueries({ queryKey: ['routing'] }) })` |
| `handleSave` / `handleDelete` per category row    | `useMutation({ mutationFn: ... , onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }) })` |

Use `useQueryClient()` hook to obtain `qc` for `invalidateQueries` calls inside mutation handlers.
The `RoutingEditor.onSaved` prop is removed — mutations invalidate the routing query directly.
`LivePacing` and `CategoryManager` become standalone components that call `useQuery` themselves
(no prop drilling of data arrays).

### 2.4 `EquityTab.tsx` Refactor

All examples use TanStack Query v5 object-style syntax (see note in 2.3).

| Old pattern                                              | New pattern (v5 object syntax)                                                      |
|----------------------------------------------------------|-------------------------------------------------------------------------------------|
| `useState(0)` refreshKey counter + `useEffect([refreshKey])` | `useQuery({ queryKey: ['equity'], queryFn: fetchEquity })`                    |
| `setRefreshKey(k => k + 1)` after grant save            | `useMutation({ mutationFn: createGrant, onSuccess: () => qc.invalidateQueries({ queryKey: ['equity'] }) })` |
| Manual loading / error states                            | `isLoading`, `isError`, `error` from `useQuery`                                     |

The `refresh` callback and the `refreshKey` state are eliminated.

### 2.5 Scope Boundary

**Not migrated in this phase:** `OverviewTab`, `CashFlowTab`, `SpendingTab`, `DebtTab`,
`TransactionsTab`. These consume the bulk `DashboardPayload` fetched once in `App.tsx` via
`/api/dashboard`. That bulk-fetch pattern remains correct and does not benefit from per-query
caching. Migration of those tabs is deferred to a future phase if/when individual endpoints
replace the bulk payload.

---

## Part 3: Sidebar Navigation Grouping

### 3.1 Section Definitions

| Section Label     | Tab Items                                              |
|-------------------|--------------------------------------------------------|
| **Daily Ops**     | Overview, Cash Flow, Spending, Budget, Transactions    |
| **Wealth Building**| Debt, Equity                                          |
| **System**        | Settings                                               |

*(Spending is included in Daily Ops — omitted from the original brief but logically belongs there.)*

### 3.2 Desktop Rail Implementation

The `NAV_ITEMS` array gains a `section` field. The Sidebar renders section label headers between
groups. Section labels are:
- `14px`, `font-weight: 600`, `color: var(--text-muted)`, `letter-spacing: 0.08em`, `uppercase`
- `opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75` (same fade-in
  pattern as nav item labels — invisible when collapsed, visible on hover)
- No divider line needed; the section label itself provides visual separation

Section label padding: `padding: 1rem 1.25rem 0.25rem` (top breathing room, no bottom overkill).

### 3.3 Mobile Bottom Tab Bar

**Unchanged.** The mobile bottom bar is a flat list of icon + label pairs. There is no room
for section headers at 44px tap-target height. All 8 items stay in the existing flat layout.

---

## Part 4: TransactionDrawer Component

### 4.1 `DrawerFilter` Type

```typescript
// frontend/src/types.ts — add alongside existing types
// DrawerFilter is placed here (not in a local component file) because it is passed
// through App.tsx → tab components → chart components, all of which already import
// from types.ts. Keeping it here avoids adding a second import source to every call site.

export interface DrawerFilter {
  category?: string;   // e.g. "Groceries" — exact match on transactions.category
  period?:   PeriodKey; // e.g. "current" — maps to date range via backend get_period_months()
  type?:     string;   // e.g. "O" — transaction type code (N, O, D, I, T, X)
  label?:    string;   // display-only: header text in the drawer, never sent to the API
}
```

`PeriodKey` is already defined in `types.ts` — no additional import needed at the definition site.

### 4.2 State Location: `App.tsx`

The drawer is opened from charts on multiple tabs. A single instance at the root prevents
z-index conflicts and duplicate animations.

**`openDrawer` closes over `activePeriod`** — charts never need to know the current period;
they only pass `category` or `type`. The period is injected automatically at the App level:

```tsx
// App.tsx
const [drawerFilter, setDrawerFilter] = useState<DrawerFilter | null>(null);

// Charts call onDrillDown with Omit<DrawerFilter, 'period'>; period is injected here.
const openDrawer  = useCallback(
  (f: Omit<DrawerFilter, 'period'>) => setDrawerFilter({ ...f, period: activePeriod }),
  [activePeriod],
);
const closeDrawer = useCallback(() => setDrawerFilter(null), []);

// Rendered once at root level, outside the tab switcher:
<AnimatePresence>
  {drawerFilter && (
    <TransactionDrawer filter={drawerFilter} onClose={closeDrawer} />
  )}
</AnimatePresence>
```

**Prop threading — which tabs and render paths receive `onDrillDown`:**

`App.tsx` has two distinct render paths that must both be updated:

| Render path         | Tabs affected                              | Receives `onDrillDown`? |
|---------------------|--------------------------------------------|------------------------|
| Pre-guard block     | `BudgetTab`, `EquityTab`                   | `BudgetTab`: YES; `EquityTab`: NO (no wired charts) |
| `renderTab()` switch| `OverviewTab`, `CashFlowTab`, `SpendingTab`, `DebtTab`, `TransactionsTab`, `SettingsTab` | `OverviewTab`: YES (DiscretionaryBar); `SpendingTab`: YES (SpendingDonut + CategoryBar); others: NO |

**Uniform prop signature** at every level (tab → chart component):
```tsx
onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
```
Tabs receive this from `App.tsx` and pass the exact same signature straight down — no adaptation
at the tab layer.

### 4.3 Component File

**`frontend/src/components/modals/TransactionDrawer.tsx`**

Layout:
- Fixed overlay backdrop: `position: fixed; inset: 0; z-index: 299; background: rgba(0,0,0,0.35)`
  — click to close.
- Drawer panel: `position: fixed; right: 0; top: 0; bottom: 0; width: 440px; z-index: 300;`
  `background: var(--bg-card); border-left: 1px solid var(--border-subtle);`
  `display: flex; flex-direction: column;`
- Framer Motion on the panel: `initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}`
  `transition={{ type: 'spring', stiffness: 320, damping: 32 }}`

Structure (top to bottom):
1. **Header** (fixed, ~64px): auto-generated label from `DrawerFilter.label` fallback to a
   computed string (e.g., "Optional · Current month"), ✕ close button.
2. **Body** (flex-1, overflow-y: auto): transaction list or loading/error state.
3. **Footer** (fixed, ~48px): "N transactions · Net: $−XXX" summary line.

### 4.4 Transaction Row Design

Each row:
```
[Date]     [Merchant name (truncated)]     [Category badge]     [Amount]
Mar 5      Whole Foods                      Groceries            −$87.43
```
- Amount: green for positive (income), red for negative (expense).
- Category badge: small pill chip, `background: color-mix(in srgb, var(--accent-blue) 12%, transparent)`.
- Alternating row background for readability.

### 4.5 `useQuery` in the Drawer

```typescript
const { data, isLoading, isError } = useQuery({
  queryKey: ['transactions', filter],
  queryFn: () => fetchTransactions(filter),
  enabled: !!filter,
});
```

`fetchTransactions` builds the URL from `filter.period`, `filter.category`, `filter.type`
(omitting undefined params). React Query caches by `queryKey`, so re-opening the same filter
context is instant.

### 4.6 Type → Human Label Map

Used to generate the drawer header label when `filter.label` is not explicitly set:

```typescript
const TYPE_LABELS: Record<string, string> = {
  N: 'Necessities',
  O: 'Optional',
  D: 'Debt',
  I: 'Income',
  T: 'Other',
  X: 'Transfers',
};

const PERIOD_LABELS: Record<PeriodKey, string> = {
  current: 'Current month',
  last:    'Last month',
  past2:   '2 months ago',
  quarter: 'This quarter',
  year:    'YTD',
};
```

Generated label examples:
- `{ type: 'O', period: 'current' }` → "Optional · Current month"
- `{ category: 'Groceries', period: 'quarter' }` → "Groceries · This quarter"
- `{ type: 'N', period: 'last' }` → "Necessities · Last month"

---

## Part 5: Interactive Chart Wiring

### 5.1 Period Context Propagation

The active dashboard period (`PeriodKey`) lives in `App.tsx` state as `activePeriod`. This
already exists to drive the period selector. It is passed as a prop to every tab so charts
can include it in the `DrawerFilter`.

```tsx
// App.tsx — existing state already present, just needs to be threaded to charts:
const openDrawer = (f: Omit<DrawerFilter, 'period'>) =>
  setDrawerFilter({ ...f, period: activePeriod });
```

By closing over `activePeriod` in `openDrawer`, no individual chart needs to know the period —
it's injected automatically. Charts only need to pass `category` or `type`.

### 5.2 SpendingDonut (`SpendingDonut.tsx`)

**New prop:** `onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void`

Type code map (label → type):
```typescript
const SLICE_TYPE: Record<string, string | undefined> = {
  'Necessities': 'N',
  'Optional':    'O',
  'Debt':        'D',
  'Other':       'T',
};
```

Chart.js `options.onClick` addition:
```typescript
onClick: (_event, elements) => {
  if (!elements.length) return;
  // `chartData` is the local `const chartData = { labels: [...], datasets: [...] }` object
  // defined in this component — it is closed over here, not a Chart.js callback parameter.
  const label    = chartData.labels![elements[0].index] as string;
  const typeCode = SLICE_TYPE[label];
  onDrillDown({ type: typeCode, label });
},
```

Chart.js `options.onHover`:
```typescript
onHover: (_event, elements, chart) => {
  chart.canvas.style.cursor = elements.length ? 'pointer' : 'default';
},
```

### 5.3 CategoryBar (`CategoryBar.tsx`)

**New prop:** `onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void`

Chart.js `options.onClick` addition:
```typescript
onClick: (_event, elements) => {
  if (!elements.length) return;
  const category = labels[elements[0].index];
  onDrillDown({ category, label: category });
},
```

`onHover` cursor change same as above.

### 5.4 DiscretionaryBar (`DiscretionaryBar.tsx`)

**New prop:** `onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void`

Since this is a pure HTML bar (not Chart.js), `onClick` goes directly on each `<div>` segment:

| Segment div       | Filter passed                               |
|-------------------|---------------------------------------------|
| Necessary block   | `{ type: 'N', label: 'Necessities' }`       |
| Optional block    | `{ type: 'O', label: 'Optional' }`          |
| Extra Debt block  | `{ type: 'D', label: 'Debt Payments' }`     |
| Savings block     | No onClick (unspent cash = no transactions) |
| Overspent block   | `{ type: 'O', label: 'Optional (over budget)' }` |

Each clickable segment adds `cursor: 'pointer'` (replace `cursor: 'help'`).

### 5.5 BudgetTab Doughnut (PaycheckRouter)

The PaycheckRouter's doughnut shows routing target *names* (e.g., "Rent", "Emergency Fund").
Each routing target has a `category` field that maps to a transaction category.

**`PaycheckRouter` receives:** `onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void`

In the imperative `Chart` constructor, add to `options`:
```typescript
onClick: (_event, elements) => {
  if (!elements.length) return;
  const idx = elements[0].index;
  if (idx < allocations.length) {
    const allocation = allocations[idx];
    // Guard: some routing targets have an empty category string (DB default '').
    // An empty-string filter returns zero rows silently — skip drill-down instead.
    if (!allocation.target.category) return;
    onDrillDown({
      category: allocation.target.category,
      label:    allocation.target.name,
    });
  }
  // The "Debt / Overflow" slice (appended at index allocations.length) has no
  // category mapping and intentionally never triggers a drill-down.
},
```

**`BudgetTab`** receives `onDrillDown` and passes it to `PaycheckRouter`.

### 5.6 Chart Wiring Summary Table

| Chart              | File                 | Parent tab       | Trigger          | Filter built                                   |
|--------------------|----------------------|------------------|------------------|------------------------------------------------|
| SpendingDonut      | SpendingDonut.tsx    | SpendingTab      | Click arc slice  | `{ type: 'N'/'O'/'D'/'T' }` + activePeriod    |
| CategoryBar        | CategoryBar.tsx      | SpendingTab      | Click bar        | `{ category: <label> }` + activePeriod         |
| DiscretionaryBar   | DiscretionaryBar.tsx | **OverviewTab**  | Click div segment| `{ type: 'N'/'O'/'D' }` + activePeriod        |
| BudgetTab Doughnut | BudgetTab.tsx        | BudgetTab        | Click arc slice  | `{ category: target.category }` + activePeriod |

**Note on DiscretionaryBar location:** The component is rendered in `OverviewTab`, not
`BudgetTab`. `App.tsx` must thread `onDrillDown` into `OverviewTab` via the `renderTab()`
switch, not the pre-guard block. `OverviewTab` already receives `activePeriod` (for the period
selector), so the threading path is consistent with the existing prop pattern.

---

## Part 6: Out of Scope for Phase 5.5

- Editing transactions from the drawer (read-only; editing is Phase 6+)
- Drill-down from DebtTab charts (debt trend line is balance history, not transaction-level)
- Drill-down from EquityTab charts (no transaction mapping)
- Migrating OverviewTab / CashFlowTab / SpendingTab / DebtTab to React Query
- Pagination in the drawer (500-row cap is sufficient for personal finance data)

---

## Part 7: Open Questions / Future Work

- **Tax/Retire tab** placeholder in Sidebar "Wealth Building" section: add greyed-out
  "Tax/Retire" item with a "(Soon)" label once Phase 6 begins.
- **Drawer editability:** A future iteration could add inline category reassignment directly
  from the drawer, eliminating the need to navigate to Budget → Edit Budgets.
- **Multi-select filters:** The drawer could eventually support multiple type codes
  (e.g., `?type=N,O`) to show all non-debt spending at once.
