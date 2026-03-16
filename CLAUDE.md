# Financial Dashboard Architecture & Context

## Project State
Phase 1 is COMPLETE (2026-03-12). The monolithic Vanilla HTML/Python script has been migrated to a decoupled React (Frontend) + Python (Backend) architecture.

## Tech Stack
* **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Chart.js.
* **Backend:** Python (generate_dashboard.py + `backend/` package). Pydantic v2, SQLite, Pandas.
* **Data Handoff:** Python writes `frontend/public/data.json`. React fetches `./data.json` on mount.
* **Dependencies:** Managed via `requirements.txt`; install into `venv/` (`call venv\Scripts\activate`).

## Component Structure
```
frontend/src/
  components/
    layout/    — Sidebar, TopBar
    cards/     — KpiCard, CollapsibleCard
    charts/    — FlowChart, SpendingDonut, CategoryBar, DebtTrendLine, SankeyChart
    tables/    — TransactionTable, AccountList
    modals/    — TransactionModal
  pages/       — OverviewTab, CashFlowTab, SpendingTab, DebtTab, TransactionsTab
  types.ts     — TypeScript interfaces (source of truth)
  App.tsx      — Main app, data fetch, state
  lib/utils.ts — cn() helper
```

## Data Handoff
Python writes `frontend/public/data.json`. React fetches `./data.json` on mount via a `useEffect` in `App.tsx`. The TypeScript interfaces in `frontend/src/types.ts` are the ultimate source of truth — Python output must match them exactly.

## Running the Dashboard
Run `refresh.bat` — this generates data.json, builds the React app, and opens the dashboard at `http://localhost:3000`.

Note: `npx serve` is used instead of opening `index.html` directly because the `file://` protocol blocks `fetch('./data.json')` due to CORS restrictions.

## Strict Development Rules
1. **Tailwind v4:** Do NOT create or look for `tailwind.config.js`. All Tailwind v4 configuration lives in `src/index.css`.
2. **UI Generation:** Always use the `21st-dev-magic` MCP server to generate complex UI components (like KPI cards, tables, and navbars) rather than writing them from scratch.
3. **Data Integrity:** The TypeScript interfaces in `/frontend/src/types.ts` are the ultimate source of truth. Python output must match them exactly.
4. **No Dev Servers:** The final output must be buildable via `npm run build` so it can be served as a static file via `npx serve`.

## Current Objective
* **Phase 1:** ✅ COMPLETE (2026-03-12) — React UI rebuild with data.json pipeline
* **Phase 1.5:** ✅ COMPLETE (2026-03-14) — 5-theme system
* **Phase 1.6:** ✅ COMPLETE (2026-03-14) — Navigation Rail (replaces hamburger/drawer)
* **Phase 2:** Refactor Python backend to use Pydantic models and SQLite. (IN PROGRESS — scaffolding complete 2026-03-14)
* **Phase 3:** Add RSU tracking and Debt Snowball forecasting algorithms. (PENDING)

---

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

## Phase 2 — Backend Refactor (IN PROGRESS)

**Goal:** Move from purely in-memory Pandas processing to a proper SQLite-backed data pipeline with strict Pydantic serialisation.

### Backend folder structure
```
backend/
  __init__.py       — makes backend a Python package
  classify.py       — classification constants + helpers (shared source of truth)
  models.py         — Pydantic v2 models (mirrors frontend/src/types.ts exactly)
  database.py       — SQLite schema + init_db() factory
  ingest.py         — CSV → SQLite ETL (build_database(); wipe-and-reload)
```

### Key design decisions
- **`backend/models.py`** is the Python source of truth for the JSON schema — all data that flows into `data.json` must pass through `DashboardPayload.to_json()` to guarantee validity.
- **`SankeyFlow`** uses `Field(alias="from")` + `model_config = ConfigDict(populate_by_name=True)` because `from` is a reserved Python keyword.
- **`database.py`** exposes a single `init_db(db_path)` function that returns an open `sqlite3.Connection` with WAL mode and FK enforcement enabled.
- The `transactions` table stores full column names for query ergonomics; the compact alias names (`d`, `m`, …) are used only in the JSON payload layer.
- The `accounts_history` table stores month-end balance snapshots for trend charts and net-worth-over-time calculations.
- **`backend/classify.py`** holds `NECESSITY_CATEGORIES`, `OPTIONAL_CATEGORIES`, `DEBT_CATEGORIES`, `classify()`, `is_checking()`, and `guess_interest_rate()` — extracted from the monolith so `ingest.py` and the future migrated `generate_dashboard.py` share one copy.
- **`backend/ingest.py`** exposes `build_database(db_path, data_dir)`. It reads the single most-recent `Transactions_*.csv` and **all** `Balances_*.csv` files (full history needed for the debt trend). Run standalone: `python -m backend.ingest`.
- **`generate_dashboard.py` is not modified yet** — Phase 2 will wire it to use these modules incrementally.

### Phase 2 milestones
1. ✅ Scaffolding — `backend/` package, `models.py`, `database.py`, `requirements.txt`, venv activation in `refresh.bat`
2. ✅ Ingest — `backend/ingest.py` + `backend/classify.py`; wipe-and-reload ETL populates SQLite from CSVs
3. ✅ Compute — `backend/engine.py` (2026-03-16) + `generate_dashboard.py` refactored to lightweight orchestrator (2026-03-16). Full pipeline: Ingest → Engine → DashboardPayload.to_json() → data.json. Vite build verified.
4. [ ] Validate — add round-trip test: Python → JSON → TypeScript parse (CI)

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
