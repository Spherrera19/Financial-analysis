# Financial Dashboard Architecture & Context

## Project State
Phase 1 is COMPLETE (2026-03-12). The monolithic Vanilla HTML/Python script has been migrated to a decoupled React (Frontend) + Python (Backend) architecture.

## Tech Stack
* **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Chart.js.
* **Backend:** Python (generate_dashboard.py).
* **Data Handoff:** Python writes `frontend/public/data.json`. React fetches `./data.json` on mount.

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
* **Phase 2:** Refactor Python backend to use Pydantic models and SQLite. (PENDING)
* **Phase 3:** Add RSU tracking and Debt Snowball forecasting algorithms. (PENDING)
