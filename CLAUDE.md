# Financial Dashboard Architecture & Context

## Project State
Phase 1 is COMPLETE (2026-03-12). The monolithic Vanilla HTML/Python script has been migrated to a decoupled React (Frontend) + Python (Backend) architecture.

The long-term vision is a full **household and business wealth management platform** — going beyond debt and spending to track unvested equity, tax-advantaged retirement accounts, estimated tax liabilities, and multi-entity finances (household, W2, and self-employment/Schedule C).

## Tech Stack
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Chart.js, @tanstack/react-query v5.
* **Backend:** Python FastAPI (uvicorn) + `backend/` package. Pydantic v2, SQLite, Pandas.
* **Data Handoff:** FastAPI serves `GET /api/dashboard` (bulk payload) and per-feature endpoints. React fetches via `useQuery` (BudgetTab, EquityTab) or raw `fetch` (App.tsx).
* **Dependencies:** Managed via `requirements.txt`; install into `venv/` (`call venv\Scripts\activate`).
* **Dev server:** `uvicorn backend.main:app --reload --port 8000` (backend) + `npx serve dist -p 3000` (frontend).

## Component Structure
```
frontend/src/
  components/
    layout/    — Sidebar (section-grouped nav rail), TopBar, ErrorBoundary
    cards/     — KpiCard, CollapsibleCard
    charts/    — FlowChart, SpendingDonut, CategoryBar, DiscretionaryBar, DebtTrendLine, SankeyChart
    tables/    — TransactionTable, AccountList
    modals/    — TransactionDrawer (drill-down slide panel)
  pages/       — OverviewTab, CashFlowTab, SpendingTab, DebtTab, TransactionsTab, EquityTab, BudgetTab, SettingsTab
  types.ts     — TypeScript interfaces (source of truth); includes DrawerFilter
  App.tsx      — Main app, data fetch, drawer state (openDrawer/closeDrawer), theme
  main.tsx     — ReactDOM root + QueryClientProvider + ErrorBoundary
  lib/utils.ts — cn() helper
  lib/theme.ts — applyTheme, loadTheme
```

## Data Handoff
FastAPI (`backend/main.py`) serves `GET /api/dashboard` (bulk payload) and per-feature endpoints (`/api/transactions`, `/api/routing`, `/api/equity`, etc.). React fetches the dashboard payload via raw `fetch` in `App.tsx`; BudgetTab and EquityTab use `@tanstack/react-query v5` `useQuery`/`useMutation` for their own endpoints. The TypeScript interfaces in `frontend/src/types.ts` are the ultimate source of truth — Python output must match them exactly.

## Running the Dashboard
**Backend:** `uvicorn backend.main:app --reload --port 8000` (activate venv first: `call venv\Scripts\activate`)
**Frontend:** `npm run build && npx serve dist -p 3000`
Or run `refresh.bat` for the full pipeline (ingest → engine → validate → build → serve).

Note: `npx serve` is used instead of opening `index.html` directly because the `file://` protocol blocks fetch requests due to CORS restrictions.

## Strict Development Rules
1. **Tailwind v4:** Do NOT create or look for `tailwind.config.js`. All Tailwind v4 configuration lives in `src/index.css`.
2. **UI Generation:** Always use the `21st-dev-magic` MCP server to generate complex UI components (like KPI cards, tables, and navbars) rather than writing them from scratch.
3. **Data Integrity:** The TypeScript interfaces in `/frontend/src/types.ts` are the ultimate source of truth. Python output must match them exactly.
4. **No Dev Servers:** The final output must be buildable via `npm run build` so it can be served as a static file via `npx serve`.

## Current Objective
* **Phase 1:** ✅ COMPLETE (2026-03-12) — React UI rebuild with data.json pipeline
* **Phase 1.5:** ✅ COMPLETE (2026-03-14) — 5-theme system
* **Phase 1.6:** ✅ COMPLETE (2026-03-14) — Navigation Rail (replaces hamburger/drawer)
* **Phase 2:** ✅ COMPLETE (2026-03-16) — SQLite + Pydantic backend pipeline
* **Phase 3 (Steps 1 & 2):** ✅ COMPLETE (2026-03-16) — Discretionary Waterfall & Debt Snowball Forecaster
* **Phase 4:** ✅ COMPLETE (2026-03-17) — FastAPI backend wrapper + Budget & Routing tab + Equity CSV import
* **Phase 5.5:** ✅ COMPLETE (2026-03-20) — Stabilization & Interactive Drill-Downs (backend split, React Query, TransactionDrawer, chart click-through)
* **Phase 5:** ⏳ UPCOMING — RSU & Equity Tracking (equity engine, vesting timeline UI)
* **Phase 6:** ⏳ UPCOMING — Retirement & Tax Strategy (401k/HSA tracking, tax liability estimator)
* **Phase 7:** ⏳ UPCOMING — Multi-Entity Household & Business Architecture

---

## Future Roadmap: Phases 5, 6, & 7

### Phase 5: RSU & Equity Tracking (CURRENT PHASE)
**Goal:** Build an automated tracker for unvested equity, projecting future liquidity and tax implications.
* [ ] **Step 1: Equity Engine & Database**
  * Add an `equity_grants` table to SQLite (`grant_id`, `ticker`, `grant_date`, `total_shares`, `vesting_schedule`).
  * Create `backend/equity_engine.py` to calculate vested vs. unvested shares and estimate post-tax liquidity.
* [ ] **Step 2: The Equity UI**
  * Build an 'Equity' tab visualizing the vesting timeline and total projected compensation.
* [ ] **Step 3: Data Integration (Manual & CSV)**
  * Build a manual entry form for quick grant additions.
  * Update the Phase 4 drag-and-drop zone to accept equity export CSVs (e.g., E*TRADE) for bulk imports.

### Phase 6: Retirement & Tax Strategy
**Goal:** Track tax-advantaged accounts and forecast end-of-year tax liabilities.
* [ ] **Step 1: 401k & HSA Tracking**
  * Expand the database to track contribution limits, employer matches, and historical balances for retirement accounts.
* [ ] **Step 2: Tax Liability Estimator**
  * Build a tax engine (`backend/tax_engine.py`) to estimate Federal and Self-Employment tax burdens based on YTD income and projected business revenue, tracking estimated quarterly payments.

### Phase 7: Multi-Entity Household & Business Architecture
**Goal:** Support multi-user profiles and isolate Schedule C business deductions from household cash flow.
* [ ] **Step 1: Multi-Profile Schema**
  * Refactor the database to support a `users` table and an `entities` table (e.g., 'Household', 'Steven Business', 'Wife Business').
* [ ] **Step 2: Expense Allocation Engine**
  * Build logic to flag and split single transactions. (e.g., allocating a percentage of a phone bill to a business entity to remove it from household discretionary spending).
* [ ] **Step 3: Entity Dashboards**
  * Create a global 'Household View' blending W2 income, alongside isolated 'Business Views' that track deductible expenses (travel, equipment, insurance) and calculate true net business income.


## Phase 1.5 — Sidebar Theming (COMPLETE)

**Spec:** `docs/superpowers/specs/2026-03-12-sidebar-theming-design.md`
**Plan:** `docs/superpowers/plans/2026-03-14-sidebar-theming.md`

### Phase 1.5 Complete
All tasks for Phase 1.5 (sidebar theming + responsive navigation) have been completed. The dashboard features:
- Navigation Rail on desktop (CSS hover-driven, see Phase 1.6 below)
- Bottom tab bar on mobile (unchanged behavior)
- Settings tab with 5-theme switcher (System, Light, Dark, Pastel, High Contrast)
- Themes persisted via `localStorage` + `data-theme` on `<html>`

---

## Phase 1.6 — Navigation Rail (COMPLETE, 2026-03-14)

**Replaces:** Hamburger toggle + collapsible overlay drawer (deprecated).

### What this adds
- Fixed left **Navigation Rail** on desktop: collapses to 72px (icons only), expands to 240px on hover
- Hover expansion is **CSS-driven** — no React state, no JS animation — using Tailwind `group` / `group-hover:`
- Text labels and footer fade in on hover via `group-hover:opacity-100 transition-opacity`
- Main content has a **static `margin-left: 72px`** (`md:ml-[72px]`) — no layout shifts on expansion
- Rail **floats** over content on expand via `z-index` + `box-shadow` — Chart.js canvases never reflow

### Performance-critical design decisions
- Rail width transition: CSS `transition-[width,box-shadow] duration-200 ease-in-out` — GPU-composited, no JS
- Main content margin is **static** (72px, never changes) — eliminates any reflow or Chart.js stutter
- `willChange: 'width'` on the `<aside>` promotes it to its own compositor layer
- Mobile bottom bar retains `paddingBottom: env(safe-area-inset-bottom, 0px)` — unchanged

---

## Phase 5.5 — Stabilization & Interactive Drill-Downs (COMPLETE, 2026-03-20)

**Spec:** `docs/superpowers/specs/2026-03-17-phase-5-5-stabilization-drill-downs.md`
**Plan:** `docs/superpowers/plans/2026-03-17-phase-5-5-stabilization-drill-downs.md`

### What this adds
- **Backend router split**: `backend/main.py` (664 lines) split into 6 `backend/routers/` modules (`dashboard`, `budget`, `equity`, `debt`, `settings`, `transactions`) + `backend/deps.py` (shared `get_db`, `DIR`, `DB_PATH`, `PERIOD_KEYS`)
- **`GET /api/transactions`**: Filterable drill-down endpoint — `?period=`, `?type=`, `?category=`; default excludes type `I`/`X`; 9 TDD tests covering all filter combinations and edge cases
- **`@tanstack/react-query v5`**: `QueryClientProvider` wraps app in `main.tsx`; BudgetTab and EquityTab replace manual `useEffect`/`useState` fetching with `useQuery`/`useMutation`; cache invalidation replaces refresh keys
- **`TransactionDrawer`**: Framer Motion slide-in panel (right side, 440px); triggered by chart clicks; shows filtered transactions with row count + net sum footer
- **`DrawerFilter` type**: `{ category?, period?, type?, label? }` in `types.ts`; period auto-injected by `openDrawer` from active period state
- **Chart click-through**: `SpendingDonut` (type drill-down), `CategoryBar` (category drill-down, optional), `DiscretionaryBar` (type drill-down by segment)
- **Sidebar section grouping**: Nav items grouped into Daily Ops / Wealth Building / System with fade-in section labels

### Key design decisions
- `openDrawer` uses `useCallback` over `activePeriod`; chart components only pass `{type, category, label}` — period injected automatically
- `CategoryBar.onDrillDown` is **optional** — income sources bar (employer names ≠ transaction categories) passes no `onDrillDown`
- React Query scope deliberately limited to BudgetTab + EquityTab; `GET /api/dashboard` stays as raw `fetch` in App.tsx (bulk payload, not per-feature)
- `backend/deps.py` prevents circular imports — routers import from `deps`, not from `main`

---

## Phase 4 — FastAPI & Budget Tab (COMPLETE, 2026-03-17)

**Spec/Plan:** `docs/superpowers/specs/` and `docs/superpowers/plans/` (2026-03-17 files)

### What this adds
- FastAPI app (`backend/main.py`) wrapping the engine with HTTP endpoints
- Budget & Routing tab with gamified waterfall animations and wealth badges
- Equity CSV bulk import (drag-and-drop zone accepting E*TRADE-format CSVs)

---

## Phase 2 — Backend Refactor (COMPLETE, 2026-03-16)

**Goal:** Move from purely in-memory Pandas processing to a proper SQLite-backed data pipeline with strict Pydantic serialisation.

### Backend folder structure
```
backend/
  __init__.py         — makes backend a Python package
  classify.py         — classification constants + helpers (shared source of truth)
  models.py           — Pydantic v2 models (mirrors frontend/src/types.ts exactly)
  database.py         — SQLite schema + init_db() factory
  ingest.py           — CSV → SQLite ETL (build_database(); wipe-and-reload)
  engine.py           — compute DashboardPayload from SQLite
  debt_engine.py      — debt snowball forecaster
  deps.py             — shared FastAPI deps: get_db(), DIR, DB_PATH, PERIOD_KEYS
  logger.py           — structured logging helpers
  main.py             — FastAPI app + include_router() calls (thin orchestrator)
  routers/
    __init__.py
    dashboard.py      — GET /api/dashboard
    budget.py         — GET|PUT /api/routing, GET|POST|PUT|DELETE /api/categories
    equity.py         — GET /api/equity, POST /api/equity/grants
    debt.py           — GET|POST /api/debt/settings
    settings.py       — POST /api/upload/csv, GET /api/logs
    transactions.py   — GET /api/transactions (filterable drill-down)
```

### Key design decisions
- **`backend/models.py`** is the Python source of truth for the JSON schema — all data that flows into `data.json` must pass through `DashboardPayload.to_json()` to guarantee validity.
- **`SankeyFlow`** uses `Field(alias="from")` + `model_config = ConfigDict(populate_by_name=True)` because `from` is a reserved Python keyword.
- **`database.py`** exposes a single `init_db(db_path)` function that returns an open `sqlite3.Connection` with WAL mode and FK enforcement enabled.
- The `transactions` table stores full column names for query ergonomics; the compact alias names (`d`, `m`, …) are used only in the JSON payload layer.
- The `accounts_history` table stores month-end balance snapshots for trend charts and net-worth-over-time calculations.
- **`backend/classify.py`** holds `NECESSITY_CATEGORIES`, `OPTIONAL_CATEGORIES`, `DEBT_CATEGORIES`, `classify()`, `is_checking()`, and `guess_interest_rate()` — extracted from the monolith so `ingest.py` and the future migrated `generate_dashboard.py` share one copy.
- **`backend/ingest.py`** exposes `build_database(db_path, data_dir)`. It reads the single most-recent `Transactions_*.csv` and **all** `Balances_*.csv` files (full history needed for the debt trend). Run standalone: `python -m backend.ingest`.
- **`generate_dashboard.py`** is a lightweight orchestrator: Ingest → Engine → DashboardPayload.to_json() → data.json.

### Phase 2 milestones
1. ✅ Scaffolding — `backend/` package, `models.py`, `database.py`, `requirements.txt`, venv activation in `refresh.bat`
2. ✅ Ingest — `backend/ingest.py` + `backend/classify.py`; wipe-and-reload ETL populates SQLite from CSVs
3. ✅ Compute — `backend/engine.py` + `generate_dashboard.py` refactored. Full pipeline: Ingest → Engine → DashboardPayload.to_json() → data.json.
4. ✅ Validate — `frontend/scripts/validate_payload.ts` (165+ checks); `npm run validate` wired into `refresh.bat` before Vite build

---

## Theming Architecture

Themes are controlled via a `data-theme` attribute on `<html>` (set by `src/lib/theme.ts`).

- **System** (default): no `data-theme` attribute; `@media (prefers-color-scheme: dark)` applies automatically
- **Light / Dark / Pastel / High Contrast**: `data-theme="light|dark|pastel|high-contrast"` overrides the system preference
- CSS variable blocks for each theme are defined in `src/index.css`, placed **after** the `@media` dark block so source-order cascade wins
- Preference is persisted to `localStorage` under the key `theme`
- The `Theme` type and `applyTheme` / `loadTheme` helpers live in `src/lib/theme.ts`
- `App.tsx` reads the stored preference on mount via `useState<Theme>(loadTheme)` and applies it via `useEffect([activeTheme])`

**Do not** use `.dark` class or `ThemeContext` — the `data-theme` attribute on `<html>` is the sole mechanism.

## Responsive Navigation Rules

| Screen | Navigation |
|---|---|
| Desktop (`md+`, ≥768px) | Navigation Rail: 72px collapsed (icons), 240px on hover (icons + labels) |
| Mobile (`<md`, <768px) | Bottom tab bar only; rail is `hidden md:flex` so never shown on mobile |

- **No `sidebarOpen` state** — desktop nav is entirely CSS-driven (hover)
- Rail `<aside>` uses Tailwind `group w-[72px] hover:w-60` — width transitions via CSS, never JS
- Child labels use `group-hover:opacity-100` to fade in without any React state
- Main content: `md:ml-[72px]` static margin — never changes, no reflow
- Rail floats over content on expand (`z-index: 40`, `hover:shadow-[4px_0_20px_...]`)
- Bottom tab bar is `flex md:hidden` (mobile only) with `paddingBottom: env(safe-area-inset-bottom)`
- **Settings tab** renders outside the `{data && ...}` guard — it is data-independent
- **Hamburger menu is deprecated** — do not reintroduce it
