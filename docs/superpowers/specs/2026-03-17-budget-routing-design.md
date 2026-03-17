# Budget & Routing Tab — Design Spec

**Date:** 2026-03-17
**Phase:** 4.5 (between Phase 4 and Phase 5)
**Status:** Approved — ready for implementation

---

## Overview

A new "Budget & Routing" tab that combines two tightly related features:

1. **Paycheck Router** — zero-based waterfall calculator that tells the user exactly how to distribute a paycheck across named funding buckets using strict priority ordering with proportional intra-tier allocation on shortfalls.
2. **Category Manager** — a CRUD interface for transaction categories with inline budget targets and cascade rename/delete operations that keep historical transaction data consistent.

---

## 1. Database Architecture

### 1.1 `routing_targets` table

```sql
CREATE TABLE IF NOT EXISTS routing_targets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    monthly_amount  REAL    NOT NULL,
    category        TEXT    NOT NULL,
    priority        INTEGER NOT NULL DEFAULT 99
);
```

**Pre-seeded rows** (inserted in `_migrate()` only when the table is empty):

| name | monthly_amount | category | priority |
|---|---|---|---|
| Fixed Auto-Pay (x6011) | 2500.0 | bills | 1 |
| Shared Living (x5252) | 950.0 | living | 2 |
| Wife Personal | 815.0 | allowance | 3 |
| Steven Personal | 410.0 | allowance | 3 |

### 1.2 `categories` table

```sql
CREATE TABLE IF NOT EXISTS categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE,
    monthly_budget  REAL    NOT NULL DEFAULT 0.0
);
```

### 1.3 `sync_categories_from_transactions(conn)`

A standalone helper function in `backend/database.py`:

```python
def sync_categories_from_transactions(conn):
    conn.execute("""
        INSERT OR IGNORE INTO categories (name)
        SELECT DISTINCT category FROM transactions
    """)
    conn.commit()
```

**Called from:**
- `backend/ingest.py` — at the end of `build_database()` after all transaction rows are inserted
- `backend/_migrate()` — to backfill categories from existing transaction data on first migration

### 1.4 Migration safety

Both tables are added via `_migrate()` using `CREATE TABLE IF NOT EXISTS`. No destructive ALTER TABLE operations are needed for initial creation. The pre-seed insert is guarded by `SELECT COUNT(*) FROM routing_targets` — only runs when the count is 0.

---

## 2. Pydantic Models (`backend/models.py`)

```python
class RoutingTarget(BaseModel):
    id:             int
    name:           str
    monthly_amount: float
    category:       str
    priority:       int

class RoutingUpdate(BaseModel):
    targets: list[RoutingTarget]

class CategoryRow(BaseModel):
    id:             int
    name:           str
    monthly_budget: float

class CategoryCreate(BaseModel):
    name:           str
    monthly_budget: float = 0.0

class CategoryUpdate(BaseModel):
    name:           str | None = None
    monthly_budget: float | None = None
```

---

## 3. API Routes (`backend/main.py`)

### 3.1 Routing endpoints

**`GET /api/routing`**
- Returns all rows from `routing_targets` ordered by `priority ASC, name ASC`
- Response: `list[RoutingTarget]`

**`PUT /api/routing`**
- Body: `RoutingUpdate` (full list of targets)
- Deletes all existing rows, bulk-inserts the new set atomically
- Returns `{"saved": N}`
- Follows the same bulk-upsert pattern as `POST /api/debt/settings`

### 3.2 Category endpoints

**`GET /api/categories`**
- Returns all rows from `categories` ordered by `name ASC`
- Response: `list[CategoryRow]`

**`POST /api/categories`**
- Body: `CategoryCreate`
- Inserts new row; raises 409 if name already exists (UNIQUE constraint)
- Returns the new `CategoryRow` with its assigned id

**`PUT /api/categories/{id}`**
- Body: `CategoryUpdate` (name and/or monthly_budget, both optional)
- If `name` is provided and differs from current name: executes `UPDATE transactions SET category = new_name WHERE category = old_name` in the same transaction as the category rename — atomic, no orphaned transaction rows
- Returns the updated `CategoryRow`

**`DELETE /api/categories/{id}`**
- Fetches current name before deleting
- Executes `UPDATE transactions SET category = 'Uncategorized' WHERE category = old_name`
- Ensures 'Uncategorized' exists in `categories` via `INSERT OR IGNORE INTO categories (name) VALUES ('Uncategorized')`
- Deletes the category row
- Returns `{"deleted": old_name}`

---

## 4. Frontend

### 4.1 Navigation

- Add `'budget'` to the `TabKey` union in `frontend/src/types.ts`
- Add nav item to `NAV_ITEMS` in `Sidebar.tsx`: `{ id: 'budget', label: 'Budget & Routing', icon: SplitSquareVertical }`
- Register in `App.tsx` renderTab switch: `case 'budget': return <BudgetTab />;`
- `BudgetTab` is data-independent (like EquityTab) — added outside the `data &&` guard, handled via its own internal fetch

### 4.2 File: `frontend/src/pages/BudgetTab.tsx`

Single file, three internal sections.

#### Section A — Paycheck Router (top)

**Controls:**
- Large dollar input: "Paycheck Deposit Amount"
- Toggle: "Full Month" / "Half Month" — Half Month divides all `monthly_amount` targets by 2

**Waterfall computation** (pure client-side, runs on every input change):

```
1. Fetch routing targets from GET /api/routing on mount
2. Sort by priority ASC
3. Group into tiers (all targets sharing the same priority value)
4. Initialize remaining = paycheck amount (or paycheck / 2 for half-month)
5. For each tier (ascending priority):
     tier_total = sum of monthly_amounts in tier (already halved if half-month)
     if remaining >= tier_total:
       each target funded fully → status: 'full' (green)
       remaining -= tier_total
     else if remaining > 0:
       each target funded proportionally:
         allocation = (target.monthly_amount / tier_total) * remaining
       status: 'partial' (yellow)
       remaining = 0
     else:
       each target allocation = 0 → status: 'unfunded' (red)
6. overflow = remaining  →  "Debt / Overflow" bucket
```

**Visualization — Doughnut chart:**
- One slice per funded/partial target (green/yellow)
- Unfunded targets get a thin grey slice (or are omitted)
- "Debt / Overflow" slice in blue-green accent color
- Uses Chart.js via `chart.js/auto` (consistent with EquityTab)
- Chart re-renders on every paycheck amount change via `useRef` + `chart.destroy()` pattern

**Allocation list** (below chart):
- Sorted by priority
- Each row: Priority badge | Name | Allocated $ | Target $ | Status chip
- Status chips: "✓ Fully Funded" (green) | "⚠ Pro-rata" (yellow, shows formula) | "✗ Unfunded" (red)
- Pro-rata rows display tooltip: "(${target} / ${tier_total}) × ${remaining} = ${allocation}"
- "Debt / Overflow" shown as a final row in blue

#### Section B — Adjust Routing Targets (middle)

- Inline-editable table: Name | Category | Priority | Monthly Target ($) | Actions
- Edit-on-click inputs, `Save All` button posts to `PUT /api/routing`
- Follows same draft-state pattern as DebtConfigSection (edit locally, commit on save)

#### Section C — Category Manager (bottom)

- Heading: "Transaction Categories & Budgets"
- Inline-editable table: Category Name | Monthly Budget ($) | Actions
- Each row has individual Save and Delete buttons
- Save fires `PUT /api/categories/{id}` — if name changed, the cascade happens server-side
- Delete shows a confirmation inline banner: "This will set all matching transactions to 'Uncategorized'. Confirm?" with Yes/Cancel
- "+ Add Category" button at the bottom opens an inline input row
- Loads via `GET /api/categories` on mount, refetches after any mutation

---

## 5. Data Flow Diagram

```
Mount BudgetTab
  ├── GET /api/routing        → routing targets state
  └── GET /api/categories     → categories state

User types paycheck amount
  └── pure JS waterfall calc  → allocation results (no API)

User saves routing targets
  └── PUT /api/routing        → re-fetch targets

User renames category "Restaurants" → "Dining Out"
  └── PUT /api/categories/5   → server cascades UPDATE transactions
      └── re-fetch categories

User deletes category
  └── DELETE /api/categories/7  → server sets transactions to Uncategorized
      └── re-fetch categories
```

---

## 6. Error Handling

- All API mutations show inline success/error feedback (same pattern as SettingsTab)
- Category name conflicts (409) surface as: "A category named '...' already exists."
- If `GET /api/routing` fails, the Router section shows a loading error state — the Calculator input is disabled until targets load
- Chart.js canvas is guarded by a null check before render

---

## 7. Files Changed / Created

| File | Change |
|---|---|
| `backend/database.py` | Add `routing_targets`, `categories` tables; `sync_categories_from_transactions()`; migration seeding |
| `backend/models.py` | Add `RoutingTarget`, `RoutingUpdate`, `CategoryRow`, `CategoryCreate`, `CategoryUpdate` |
| `backend/main.py` | Add routing + category API routes; call `sync_categories_from_transactions` in upload handler |
| `backend/ingest.py` | Call `sync_categories_from_transactions(conn)` at end of `build_database()` |
| `frontend/src/types.ts` | Add `'budget'` to `TabKey` |
| `frontend/src/components/layout/Sidebar.tsx` | Add Budget & Routing nav item |
| `frontend/src/pages/BudgetTab.tsx` | New file — full tab implementation |
| `frontend/src/pages/index.ts` | Export `BudgetTab` |
| `frontend/src/App.tsx` | Register BudgetTab in renderTab and outside data guard |
