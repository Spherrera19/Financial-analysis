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
* **Phase 1.5:** ✅ COMPLETE (2026-03-14) — Collapsible sidebar + 5-theme system (see below)
* **Phase 2:** Refactor Python backend to use Pydantic models and SQLite. (PENDING)
* **Phase 3:** Add RSU tracking and Debt Snowball forecasting algorithms. (PENDING)

---

## Phase 1.5 — Sidebar Theming (COMPLETE)

**Spec:** `docs/superpowers/specs/2026-03-12-sidebar-theming-design.md`
**Plan:** `docs/superpowers/plans/2026-03-14-sidebar-theming.md`

### What this adds
- Collapsible overlay sidebar drawer on desktop (hamburger toggle)
- Bottom tab bar on mobile (unchanged behavior)
- Settings tab with 5-theme switcher (System, Light, Dark, Pastel, High Contrast)
- Themes persisted via `localStorage` + `data-theme` on `<html>`

### Performance-critical design decisions
- Sidebar is a GPU-composited overlay (`motion.aside` with `x: -240 → 0`), **never** shifts `marginLeft` (avoids Chart.js stutter)
- Hamburger uses `motion.button` with `animate={{ x: sidebarOpen ? 240 : 0 }}` (translateX, not `left`)
- Mobile bottom bar has `paddingBottom: env(safe-area-inset-bottom, 0px)`

### Task progress
- [x] **Task 1** ✅ DONE — Added `'settings'` to `TabKey` in `types.ts`, created `frontend/src/lib/theme.ts` (commit `4511607`)
- [x] **Task 2** ✅ DONE — Add 4 `[data-theme]` CSS blocks to `index.css`, remove `.md-sidebar-offset` rule
- [x] **Task 3** ✅ DONE — Rewrite `Sidebar.tsx` as overlay drawer with `isOpen`/`onClose` props, Settings nav item
- [x] **Task 4** ✅ DONE — Rewrite `App.tsx` with sidebar state, GPU hamburger, theme init, SettingsTab routing
- [x] **Task 5** ✅ DONE — Create `SettingsTab.tsx` + update `pages/index.ts`
- [x] **Task 6** ✅ DONE — `npm run build` verification + append theming/nav docs to CLAUDE.md

### Phase 1.5 Complete
All tasks for Phase 1.5 (sidebar theming + responsive navigation) have been completed successfully. The dashboard now features:
- Collapsible overlay sidebar drawer on desktop (hamburger toggle)
- Bottom tab bar on mobile (unchanged behavior)
- Settings tab with 5-theme switcher (System, Light, Dark, Pastel, High Contrast)
- Themes persisted via `localStorage` + `data-theme` on `<html>`
- GPU-optimized animations (no layout shifts, no Chart.js stutter)

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
| Desktop (`md+`, ≥768px) | Overlay sidebar drawer (240px), toggled via hamburger |
| Mobile (`<md`, <768px) | Bottom tab bar only; sidebar never shown |

- `sidebarOpen` state lives in `App.tsx`, persisted to `localStorage` under key `sidebar-open`
- Sidebar uses `motion.aside` with `animate={{ x: isOpen ? 0 : -240 }}` — GPU-composited transform, never touches `marginLeft`
- Main content has **no left margin** — sidebar overlays it
- Hamburger uses `motion.button` with `animate={{ x: sidebarOpen ? 240 : 0 }}` (translateX, not `left`)
- Hamburger is `hidden md:flex` (desktop only); sidebar is `hidden md:flex` (desktop only)
- Bottom tab bar is `flex md:hidden` (mobile only) with `paddingBottom: env(safe-area-inset-bottom)`
- **Settings tab** renders outside the `{data && ...}` guard — it is data-independent
- Clicking any nav item or the backdrop closes the sidebar (`onClose`)
