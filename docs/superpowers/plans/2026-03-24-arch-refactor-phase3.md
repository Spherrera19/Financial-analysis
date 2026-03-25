# Architecture Refactor — Phase 3: React Frontend Routing & Query Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `activeTab` React state with real URL routing (`react-router-dom`), fix the GuidedTour interceptor that calls `setActiveTab`, and migrate the dashboard `fetch` from `useState/useEffect` to `useQuery`.

**Architecture:** Three sequential tasks. Task 1 installs `react-router-dom` and rewires navigation (removing `activeTab`/`setActiveTab`). Task 2 fixes `GuidedTour.tsx`, which currently calls `setActiveTab` and will crash once that state is gone. Task 3 replaces the manual `refreshData` fetch pattern in `App.tsx` with `useQuery` — the `QueryClientProvider` and `@tanstack/react-query` package are already present in `main.tsx`/`package.json`. Each task is independently committable.

**Tech Stack:** React 19, TypeScript, `react-router-dom` v7 (new), `@tanstack/react-query` v5 (already installed), Vite, `npx serve` (static file server).

---

## Scope Check

Three tasks, each independently committable. Tasks 1 and 2 are co-dependent at the `setActiveTab` seam — Task 1 leaves a temporary no-op in place, Task 2 removes it.

- **Task 1** — Install `react-router-dom`; replace `activeTab` state with URL routing
- **Task 2** — Fix GuidedTour interceptor: `setActiveTab` → `useNavigate` + route path strings
- **Task 3** — Migrate `GET /api/dashboard` fetch from `useState/useEffect` to `useQuery`

---

## Codebase Context (read before touching code)

### What exists today

| File | Current role |
|---|---|
| `frontend/src/App.tsx` | Holds `activeTab: TabKey` state + `setActiveTab` callback. The tab switch, data fetch (`refreshData`/`useEffect`), loading/error guards, and `renderTab()` all live here. |
| `frontend/src/components/layout/Sidebar.tsx` | Receives `activeTab: TabKey` + `onTabChange: (tab: TabKey) => void` props. Uses `activeTab` to highlight the active nav item and calls `onTabChange(id)` on click. |
| `frontend/src/components/layout/GuidedTour.tsx` | Receives `setActiveTab: (tab: TabKey) => void` prop. Both the polling interceptor and `handleCallback` call `setActiveTab(stepTabs[nextIndex])` to navigate tabs during the tour. `BASIC_STEP_TABS` is `TabKey[]`. |
| `frontend/src/hooks/useTour.ts` | Tour state only — no navigation logic. No changes needed. |
| `frontend/src/main.tsx` | Already has `<QueryClientProvider>`. No `<BrowserRouter>` yet. |
| `frontend/package.json` | Has `@tanstack/react-query`. Does NOT have `react-router-dom`. |

### Key invariants to preserve

- **Navigation rail is CSS-hover-driven** — the Sidebar uses Tailwind `group`/`group-hover:` for the expand animation. The JS change (router hooks) must not touch the CSS hover logic.
- **`activePeriod`** is a UI filter (indexes into `data.periods`), not a navigation destination. It stays as `useState` in `App.tsx` after this refactor.
- **Data-independent tabs** (equity, budget, tax, settings) use their own `useQuery`/`useMutation` hooks internally. They render fine without the dashboard payload.
- **Data-dependent tabs** (overview, cashflow, spending, debt, transactions) need `data: DashboardPayload` from `GET /api/dashboard`.
- **`AnimatePresence`** needs a changing `key` prop on the `motion.div` to trigger enter/exit animations. After routing, use `location.pathname` as the key (replaces `activeTab`).

---

## File Map

| File | Action | What changes |
|---|---|---|
| `frontend/package.json` | Modify | Add `react-router-dom` dependency |
| `frontend/public/serve.json` | **Create** | SPA rewrite: all unmatched paths → `/index.html` |
| `frontend/src/main.tsx` | Modify | Wrap app in `<BrowserRouter>` (inside QueryClientProvider, outside UserProvider) |
| `frontend/src/components/layout/Sidebar.tsx` | Modify | Remove `activeTab`/`onTabChange` props; add `useNavigate`/`useLocation`; local `tabToPath` helper |
| `frontend/src/App.tsx` | Modify (Task 1) | Remove `activeTab`/`setActiveTab`; add `<Routes>`/`<Route>`; use `useLocation`/`useNavigate` |
| `frontend/src/App.tsx` | Modify (Task 2) | Remove temporary `setActiveTab={() => {}}` no-op on `<GuidedTour>` |
| `frontend/src/App.tsx` | Modify (Task 3) | Replace `useState/useEffect` dashboard fetch with `useQuery`; `onRefresh` → `invalidateQueries` |
| `frontend/src/components/layout/GuidedTour.tsx` | Modify (Task 2) | Remove `setActiveTab` prop; add `useNavigate()`; `BASIC/ADVANCED_STEP_TABS` → `string[]` route paths |
| `frontend/src/components/layout/index.ts` | No change | Still exports `GuidedTour`, `BASIC_STEP_TABS`, `ADVANCED_STEP_TABS` — types change but exports are still valid |

---

## Task 1: React Router — Installation & Navigation Refactor

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/public/serve.json`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

---

### Step 1.1: Install react-router-dom

- [ ] From `frontend/`:
  ```bash
  npm install react-router-dom
  ```
- [ ] Verify `frontend/package.json` shows `"react-router-dom": "^7.x.x"` in `dependencies`.

---

### Step 1.2: Create `frontend/public/serve.json` — SPA rewrite config

- [ ] Create `frontend/public/serve.json`:
  ```json
  {
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
  ```
- [ ] **Why this file exists:** `BrowserRouter` uses real URL paths (e.g., `/cashflow`). When a user refreshes at `/cashflow`, `npx serve` looks for `/cashflow.html` on disk — which doesn't exist — and returns 404. Vite copies everything in `frontend/public/` into `dist/` during `npm run build`, so `dist/serve.json` will be present when `npx serve dist -p 3000` runs. The `serve` package automatically reads `serve.json` from the directory it's serving and applies the SPA rewrite, redirecting all unmatched paths to `/index.html`. No change to the `npx serve` command is needed.

---

### Step 1.3: Wrap `<App />` in `<BrowserRouter>` — `main.tsx`

- [ ] Open `frontend/src/main.tsx`
- [ ] Add import:
  ```typescript
  import { BrowserRouter } from 'react-router-dom';
  ```
- [ ] Wrap `<App />` in `<BrowserRouter>`. The final render tree:
  ```tsx
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <UserProvider>
              <LedgerProvider>
                <App />
              </LedgerProvider>
            </UserProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
  ```
- [ ] **Why `BrowserRouter` wraps providers (not vice versa):** `LedgerContext` and `UserContext` don't call router hooks, so they don't need to be inside `BrowserRouter`. Placing `BrowserRouter` outside them is fine. `QueryClientProvider` must remain the outermost wrapper because `SettingsTab` and other components call `useQueryClient()`.

---

### Step 1.4: Refactor `Sidebar.tsx` — remove props, add router hooks

- [ ] Open `frontend/src/components/layout/Sidebar.tsx`
- [ ] Add router imports (keep existing lucide/framer imports):
  ```typescript
  import { useNavigate, useLocation } from 'react-router-dom';
  ```
- [ ] Replace the `SidebarProps` interface:
  ```typescript
  // REMOVE:
  interface SidebarProps {
    activeTab: TabKey;
    onTabChange: (tab: TabKey) => void;
    asOfDate?: string;
  }
  // ADD:
  interface SidebarProps {
    asOfDate?: string;
  }
  ```
- [ ] Add a module-level helper (above the component, after `NAV_ITEMS`):
  ```typescript
  /** Maps a TabKey to its URL path. 'overview' is the index route '/'. */
  function tabToPath(tab: TabKey): string {
    return tab === 'overview' ? '/' : `/${tab}`;
  }
  ```
- [ ] Update the component signature and add hook calls:
  ```typescript
  export function Sidebar({ asOfDate }: SidebarProps) {
    const navigate  = useNavigate();
    const location  = useLocation();

    /** True when this tab's path matches the current URL. */
    const isActive = (tab: TabKey): boolean => {
      const path = tabToPath(tab);
      // Use exact match for '/' to avoid matching every path
      return path === '/' ? location.pathname === '/' : location.pathname === path;
    };
    ...
  ```
- [ ] In the desktop nav rail button map, replace `isActive = activeTab === id` with `isActive(id)`:
  ```tsx
  {sectionItems.map(({ id, label, icon: Icon }) => {
    const active = isActive(id);
    return (
      <button
        key={id}
        id={id === 'settings' ? 'tour-settings-tab' : `tour-nav-${id}`}
        onClick={() => navigate(tabToPath(id))}
        style={{
          ...
          fontWeight: active ? 600 : 400,
          background: active
            ? 'color-mix(in srgb, var(--accent-blue) 15%, transparent)'
            : 'transparent',
          color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
          ...
        }}
        onMouseEnter={e => {
          if (!active) (e.currentTarget as HTMLButtonElement).style.background =
            'color-mix(in srgb, var(--text-muted) 10%, transparent)';
        }}
        onMouseLeave={e => {
          if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <AnimatePresence>
          {active && (
            <motion.span
              layoutId="activeNav"
              style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                       width: 3, height: '60%', borderRadius: '0 3px 3px 0',
                       background: 'var(--accent-blue)' }}
              transition={SPRING}
            />
          )}
        </AnimatePresence>
        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
          {label}
        </span>
      </button>
    );
  })}
  ```
- [ ] In the mobile bottom tab bar, apply the same substitutions: `activeTab === id` → `isActive(id)`, `onClick={() => onTabChange(id)}` → `onClick={() => navigate(tabToPath(id))}`.
- [ ] The `import type { TabKey }` at the top of `Sidebar.tsx` is still needed (used by `NAV_ITEMS`, `tabToPath`, and `isActive`). Keep it.

---

### Step 1.5: Refactor `App.tsx` — remove `activeTab`, add `<Routes>`

This is the largest change. Work through it section by section.

- [ ] Open `frontend/src/App.tsx`

**Imports — add:**
```typescript
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
```

**Imports — remove `TabKey` from the types import** (it's no longer used in App.tsx after this refactor):
```typescript
// Was:
import type { DashboardPayload, PeriodKey, TabKey, DrawerFilter } from './types';
// Becomes:
import type { DashboardPayload, PeriodKey, DrawerFilter } from './types';
```

**Inside `App()`— add router hooks immediately after the existing context hook:**
```typescript
const location  = useLocation();
const navigate  = useNavigate();
```

**Remove `activeTab` state:**
```typescript
// REMOVE this line:
const [activeTab, setActiveTab] = useState<TabKey>('overview');
```

**Remove the `renderTab()` function** (the entire block from `const renderTab = () => {` to the closing `}`).

**Update `<Sidebar>` usage** — remove the two props that no longer exist:
```tsx
// Was:
<Sidebar activeTab={activeTab} onTabChange={setActiveTab} asOfDate={data?.meta.as_of_date} />
// Becomes:
<Sidebar asOfDate={data?.meta.as_of_date} />
```

**Update tour start handlers in SettingsTab** (both tours start at the Overview route):
```tsx
// Was:
onStartBasicTour={() => { setActiveTab(BASIC_STEP_TABS[0]); startTour('basic'); }}
onStartAdvancedTour={() => { setActiveTab(ADVANCED_STEP_TABS[0]); startTour('advanced'); }}
// Becomes:
onStartBasicTour={() => { navigate('/'); startTour('basic'); }}
onStartAdvancedTour={() => { navigate('/'); startTour('advanced'); }}
```

**Remove `BASIC_STEP_TABS` and `ADVANCED_STEP_TABS` from the layout import** — after Task 1 they are no longer referenced in App.tsx (tour-start handlers now use `navigate('/')` directly). TypeScript's `noUnusedLocals` will fail the build otherwise:
```typescript
// Was:
import { Sidebar, TopBar, GuidedTour, BASIC_STEP_TABS, ADVANCED_STEP_TABS } from './components/layout';
// Becomes:
import { Sidebar, TopBar, GuidedTour } from './components/layout';
```

**Add `INDEPENDENT_PATHS` and `isDataTab` constants to the component body** (these must be in the function body, before `return`, NOT inside the JSX expression):
```typescript
// Add these two lines inside App(), before the return statement:
const INDEPENDENT_PATHS = ['/settings', '/equity', '/budget', '/tax'];
const isDataTab = !INDEPENDENT_PATHS.includes(location.pathname);
```

**Replace the entire JSX return block** with the structure below:

```tsx
return (
  <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>

    {/* Nav rail — CSS hover-driven, floats over content on expand */}
    <Sidebar asOfDate={data?.meta.as_of_date} />

    {/* Main content — static 72px left margin on desktop matches collapsed rail width */}
    <main
      className="main-content md:ml-[72px] flex-1 flex flex-col"
      style={{ minHeight: '100vh' }}
    >
      {/* Loading / error screens — only for data-dependent tabs */}
      {isDataTab && isLoading && <LoadingScreen />}
      {isDataTab && error    && <ErrorScreen message={error.message} />}

      {/* TopBar: sticky header with period filter + AI export — data-dependent tabs only */}
      {isDataTab && data && (
        <TopBar
          activePeriod={activePeriod}
          onPeriodChange={setActivePeriod}
          asOfDate={data.meta.as_of_date}
          onCopyAISummary={handleCopyAISummary}
          onDownloadAISummary={handleDownloadAISummary}
          onRestartTour={() => startTour('basic')}
        />
      )}

      <div style={{ padding: '1.5rem' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
          >
            <Routes>
              {/* ── Data-independent routes — render without dashboard payload ── */}
              <Route path="/settings" element={
                <SettingsTab
                  activeTheme={activeTheme}
                  onThemeChange={handleThemeChange}
                  onRefresh={refreshData}
                  onStartBasicTour={() => { navigate('/'); startTour('basic'); }}
                  onStartAdvancedTour={() => { navigate('/'); startTour('advanced'); }}
                />
              } />
              <Route path="/equity"   element={<EquityTab />} />
              <Route path="/budget"   element={<BudgetTab onDrillDown={openDrawer} />} />
              <Route path="/tax"      element={<TaxRetirementTab />} />

              {/* ── Data-dependent routes — unconditional <Route> elements; each element
                  renders null while data is loading (loading screen is shown above routes).
                  React Router v7 does NOT support <React.Fragment> as a direct child of
                  <Routes>; use unconditional Route + conditional element instead. ── */}
              <Route index element={
                data ? <OverviewTab data={data} activePeriod={activePeriod} onDrillDown={openDrawer} /> : null
              } />
              <Route path="/cashflow" element={
                data ? <CashFlowTab data={data} activePeriod={activePeriod} /> : null
              } />
              <Route path="/spending" element={
                data ? <SpendingTab data={data} activePeriod={activePeriod} onDrillDown={openDrawer} /> : null
              } />
              <Route path="/debt" element={
                data ? <DebtTab data={data} /> : null
              } />
              <Route path="/transactions" element={
                data ? <TransactionsTab data={data} activePeriod={activePeriod} /> : null
              } />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
    </main>

    {/* Drill-down drawer — rendered at root so any chart on any tab can trigger it */}
    <AnimatePresence>
      {drawerFilter && (
        <TransactionDrawer filter={drawerFilter} onClose={closeDrawer} />
      )}
    </AnimatePresence>

    {/* Guided tour — setActiveTab is a temporary no-op; replaced in Task 2 */}
    <GuidedTour
      activeTour={activeTour}
      onFinish={finishTour}
      setActiveTab={() => {}}  // TODO: removed in Task 2
      stepIndex={stepIndex}
      setStepIndex={setStepIndex}
    />
  </div>
);
```

> **Note — `isLoading` vs `loading`:** App.tsx still uses the `useState`-based `loading` flag after Task 1 (the `useQuery` migration is Task 3). Keep `loading` and `error` (string) as-is for Task 1; replace `isLoading`/`error.message` in the snippet above with the Task 1 equivalents:
> ```tsx
> {isDataTab && loading && <LoadingScreen />}
> {isDataTab && error   && <ErrorScreen message={error} />}
> ```
> After Task 3, these become `isLoading` and `(error as Error).message` respectively.

> **Note — unconditional `<Route>` elements with conditional `element` props:** React Router v7 does not support `<React.Fragment>` or bare `{expression && <>...</>}` as direct children of `<Routes>`. All `<Route>` elements must be unconditional direct children of `<Routes>`. Guard data-dependent content inside each `element` prop: `element={data ? <Tab data={data} .../> : null}`. When `data` is null, the route matches but renders nothing — the `<LoadingScreen />` rendered above the `<Routes>` block already fills the space.

---

### Step 1.6: Verify TypeScript compilation

- [ ] Run:
  ```bash
  cd frontend && npm run build
  ```
- [ ] Expected: zero TypeScript errors, successful Vite build output
- [ ] If TypeScript reports `TabKey` no longer found in App.tsx imports: confirm the type was only used for `activeTab` and `renderTab()`, which were removed

---

### Step 1.7: Manual smoke test

- [ ] Start backend: `uvicorn backend.main:app --reload --port 8000` (activate venv first)
- [ ] `cd frontend && npm run build && npx serve dist -p 3000`
- [ ] Open `http://localhost:3000` → Overview tab loads, URL is `/`
- [ ] Click "Cash Flow" in nav rail → URL changes to `/cashflow`, content updates
- [ ] **Refresh** the page at `/cashflow` → stays on Cash Flow (not 404) — confirms `serve.json` is working
- [ ] Click through all tabs — verify each URL updates and active nav highlight follows
- [ ] Verify Settings, Equity, Budget, Tax tabs render without a loading screen
- [ ] Verify the period filter and ledger switcher in TopBar still work
- [ ] Verify the tour does NOT navigate (it's broken by design until Task 2 — the tour should still launch and display tooltips, just not switch tabs)

---

### Step 1.8: Commit

```bash
git add frontend/package.json frontend/package-lock.json \
        frontend/public/serve.json \
        frontend/src/main.tsx \
        frontend/src/App.tsx \
        frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: add react-router-dom; replace activeTab state with URL routing"
```

---

## Task 2: GuidedTour Interceptor Fix

**Files:**
- Modify: `frontend/src/components/layout/GuidedTour.tsx`
- Modify: `frontend/src/App.tsx`

The tour currently calls `setActiveTab(stepTabs[nextIndex])` in three places: the polling interceptor `useEffect`, `handleCallback`'s NEXT/PREV handler, and the TARGET_NOT_FOUND safety net. All three must be replaced with `navigate(stepTabs[nextIndex])` where `stepTabs` now contains route path strings.

---

### Step 2.1: Change `BASIC_STEP_TABS` and `ADVANCED_STEP_TABS` to route path strings

- [ ] Open `frontend/src/components/layout/GuidedTour.tsx`
- [ ] Change the type of `BASIC_STEP_TABS` from `TabKey[]` to `string[]` and update every entry to its route path:
  ```typescript
  // Was: export const BASIC_STEP_TABS: TabKey[] = [
  //   'overview', 'overview', 'overview', 'overview',
  //   'cashflow', 'spending', 'spending', 'debt', 'equity', 'tax', 'budget', 'transactions', 'transactions',
  // ];
  export const BASIC_STEP_TABS: string[] = [
    '/',             // 0: Period Filter
    '/',             // 1: Ledger Switcher
    '/',             // 2: Net Worth
    '/',             // 3: Sankey Chart
    '/cashflow',     // 4: Flow Chart
    '/spending',     // 5: Donut Chart
    '/spending',     // 6: Category Bars
    '/debt',         // 7: Trend Line
    '/equity',       // 8: KPI Cards
    '/tax',          // 9: KPI Cards
    '/budget',       // 10: Pacing Bars
    '/transactions', // 11: Ledger Table
    '/transactions', // 12: Settings Button
  ];
  ```
- [ ] Change `ADVANCED_STEP_TABS`:
  ```typescript
  // Was: export const ADVANCED_STEP_TABS: TabKey[] = ['overview', 'settings', 'settings'];
  export const ADVANCED_STEP_TABS: string[] = [
    '/',         // 0 — #tour-ai-export (TopBar — only rendered on data tabs)
    '/settings', // 1 — [data-tour="data-import-section"]
    '/settings', // 2 — [data-tour="workspace-section"]
  ];
  ```

---

### Step 2.2: Remove `setActiveTab` from `GuidedTourProps`; add `useNavigate`

- [ ] Update imports at the top of the file:
  ```typescript
  // REMOVE:
  import type { TabKey } from '../../types';
  // ADD:
  import { useNavigate } from 'react-router-dom';
  ```
- [ ] Update the `GuidedTourProps` interface:
  ```typescript
  interface GuidedTourProps {
    activeTour:   TourType | null;
    onFinish:     (type: TourType) => void;
    // REMOVED: setActiveTab: (tab: TabKey) => void;
    stepIndex:    number;
    setStepIndex: (i: number) => void;
  }
  ```
- [ ] Update the component signature:
  ```typescript
  export function GuidedTour({ activeTour, onFinish, stepIndex, setStepIndex }: GuidedTourProps) {
    const navigate = useNavigate();
    ...
  ```

---

### Step 2.3: Replace all `setActiveTab` calls with `navigate`

There are four call sites. Replace each one:

**In the polling interceptor `useEffect` — the auto-advance when target not found:**
```typescript
// Was:
setActiveTab(stepTabs[nextIndex]);
// Becomes:
navigate(stepTabs[nextIndex]);
```

**In `handleCallback` — STEP_AFTER + ACTIONS.NEXT:**
```typescript
// Was:
setRunTour(false);
setActiveTab(stepTabs[nextIndex]);
setStepIndex(nextIndex);
// Becomes:
setRunTour(false);
navigate(stepTabs[nextIndex]);
setStepIndex(nextIndex);
```

**In `handleCallback` — STEP_AFTER + ACTIONS.PREV:**
```typescript
// Was:
setRunTour(false);
setActiveTab(stepTabs[prevIndex]);
setStepIndex(prevIndex);
// Becomes:
setRunTour(false);
navigate(stepTabs[prevIndex]);
setStepIndex(prevIndex);
```

**In `handleCallback` — TARGET_NOT_FOUND:**
```typescript
// Was:
setRunTour(false);
setActiveTab(stepTabs[nextIndex]);
setStepIndex(nextIndex);
// Becomes:
setRunTour(false);
navigate(stepTabs[nextIndex]);
setStepIndex(nextIndex);
```

---

### Step 2.4: Remove the temporary no-op from `App.tsx`

- [ ] Open `frontend/src/App.tsx`
- [ ] Find the `<GuidedTour>` JSX and remove the `setActiveTab` prop:
  ```tsx
  // Was:
  <GuidedTour
    activeTour={activeTour}
    onFinish={finishTour}
    setActiveTab={() => {}}  // TODO: removed in Task 2
    stepIndex={stepIndex}
    setStepIndex={setStepIndex}
  />
  // Becomes:
  <GuidedTour
    activeTour={activeTour}
    onFinish={finishTour}
    stepIndex={stepIndex}
    setStepIndex={setStepIndex}
  />
  ```

---

### Step 2.5: Verify TypeScript compilation

- [ ] Run:
  ```bash
  cd frontend && npm run build
  ```
- [ ] Expected: zero errors. In particular, verify:
  - `GuidedTourProps` no longer mentions `TabKey`
  - `App.tsx` no longer passes `setActiveTab` to `<GuidedTour>`
  - `BASIC_STEP_TABS`/`ADVANCED_STEP_TABS` are typed as `string[]` and consumers in `App.tsx` and `GuidedTour.tsx` are happy

---

### Step 2.6: Manual smoke test — full tour navigation

- [ ] Start backend + frontend (`npm run build && npx serve dist -p 3000`)
- [ ] Open Settings tab → click "Start Basic Tour"
- [ ] Advance through all **13 steps** using the Next button:
  - Steps 0–3: URL stays at `/` (Overview)
  - Step 4: URL changes to `/cashflow`
  - Steps 5–6: URL changes to `/spending`
  - Step 7: URL changes to `/debt`
  - Step 8: URL changes to `/equity`
  - Step 9: URL changes to `/tax`
  - Step 10: URL changes to `/budget`
  - Steps 11–12: URL changes to `/transactions`
- [ ] Verify the joyride tooltip is correctly positioned on each step's target element
- [ ] Click **Back** from step 4 → URL returns to `/` and step 3 tooltip appears
- [ ] Click **Skip** mid-tour → tour ends without errors, tour persists as "seen" in localStorage

---

### Step 2.7: Commit

```bash
git add frontend/src/components/layout/GuidedTour.tsx frontend/src/App.tsx
git commit -m "fix: refactor GuidedTour to use useNavigate; remove setActiveTab prop"
```

---

## Task 3: Migrate Dashboard Fetch to React Query

**Files:**
- Modify: `frontend/src/App.tsx`

`QueryClientProvider` is already in `main.tsx`. `@tanstack/react-query` v5 is already installed. This task just migrates the `GET /api/dashboard` fetch.

---

### Step 3.1: Replace `useState/useEffect` fetch with `useQuery` in `App.tsx`

- [ ] Open `frontend/src/App.tsx`
- [ ] Add imports:
  ```typescript
  import { useQuery, useQueryClient } from '@tanstack/react-query';
  ```
- [ ] Remove the manual state declarations:
  ```typescript
  // REMOVE:
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  ```
- [ ] Remove the `refreshData` callback and its `useEffect`:
  ```typescript
  // REMOVE:
  const refreshData = useCallback(() => {
    setLoading(true);
    setError(null);
    const base = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/dashboard`;
    const url = selectedLedgerId != null ? `${base}?ledger_id=${selectedLedgerId}` : base;
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DashboardPayload) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [selectedLedgerId]);
  useEffect(() => { refreshData(); }, [refreshData]);
  ```
- [ ] Add `useQuery` and a `handleRefresh` function:
  ```typescript
  const queryClient = useQueryClient();
  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  const { data, isLoading, error } = useQuery<DashboardPayload>({
    queryKey: ['dashboardData', selectedLedgerId],
    queryFn: async () => {
      const base = `${API_BASE}/api/dashboard`;
      const url = selectedLedgerId != null ? `${base}?ledger_id=${selectedLedgerId}` : base;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<DashboardPayload>;
    },
  });

  /** Called by SettingsTab after a CSV upload to refetch the dashboard payload. */
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
  };
  ```

  > **Why `queryKey: ['dashboardData', selectedLedgerId]`:** When `selectedLedgerId` changes (user switches ledger), React Query sees a new key and automatically triggers a fresh fetch. This replaces the `useEffect(() => { refreshData(); }, [refreshData])` pattern and the `useCallback([selectedLedgerId])` dependency.

  > **Why `invalidateQueries` instead of `refreshData`:** `invalidateQueries` marks the cached entry stale and triggers a background refetch. During the refetch, `data` still holds the previous payload (no loading flicker). This is better UX than the old behaviour which blanked the screen with `<LoadingScreen />` on every CSV upload.

- [ ] Update `<SettingsTab>` — replace `onRefresh={refreshData}` with `onRefresh={handleRefresh}`:
  ```tsx
  <Route path="/settings" element={
    <SettingsTab
      activeTheme={activeTheme}
      onThemeChange={handleThemeChange}
      onRefresh={handleRefresh}       {/* was: refreshData */}
      onStartBasicTour={() => { navigate('/'); startTour('basic'); }}
      onStartAdvancedTour={() => { navigate('/'); startTour('advanced'); }}
    />
  } />
  ```
- [ ] Update the loading/error guards — `loading` → `isLoading`, `error` (string) → cast and access `.message`:
  ```tsx
  {isDataTab && isLoading && <LoadingScreen />}
  {isDataTab && error     && <ErrorScreen message={(error as Error).message} />}
  ```
  > **Why the cast:** TypeScript types `useQuery`'s `error` as `unknown` by default in strict mode (React Query v5 changed from `Error | null` to `Error | null` when the generic is provided — but to be safe, cast to `Error`). The `&&` guard ensures `error` is non-null before `.message` is accessed at runtime.
- [ ] Remove stale imports that are no longer used after this refactor. Check each:
  - `useState` — still used for `activePeriod`, `drawerFilter`, `activeTheme`. **Keep.**
  - `useEffect` — still used for theme application. **Keep.**
  - `useCallback` — still used for `openDrawer` and `closeDrawer`. **Keep.**

---

### Step 3.2: Verify TypeScript compilation

- [ ] Run:
  ```bash
  cd frontend && npm run build
  ```
- [ ] Expected: zero TypeScript errors. Specifically verify:
  - `data` from `useQuery` is typed as `DashboardPayload | undefined` (not `DashboardPayload | null`). The template argument `useQuery<DashboardPayload>` ensures `data` is `DashboardPayload | undefined`.
  - Existing consumers of `data` use `data && ...` guards — these work for both `null` and `undefined`, so no changes needed to child components.
  - `error` is `Error | null`. `error.message` is safe inside `{error && <ErrorScreen message={error.message} />}`.

---

### Step 3.3: Manual smoke test — data loading and cache behaviour

- [ ] Start backend: `uvicorn backend.main:app --reload --port 8000`
- [ ] `cd frontend && npm run build && npx serve dist -p 3000`
- [ ] Navigate to `http://localhost:3000` → data loads, Overview tab renders
- [ ] Switch ledger in TopBar → data refetches for the new ledger (verify in browser Network tab)
- [ ] Switch between Overview/CashFlow/Spending tabs → **no additional network requests** (data is cached by React Query, 30s `staleTime`)
- [ ] Navigate to Settings → upload a valid CSV → verify the dashboard data updates after upload (handleRefresh triggers re-fetch)
- [ ] Run the payload validator: `cd frontend && npm run validate`
- [ ] Expected: all validations pass

---

### Step 3.4: Commit

```bash
git add frontend/src/App.tsx
git commit -m "refactor: replace manual dashboard fetch with useQuery; onRefresh via invalidateQueries"
```

---

## Gotchas & Risk Notes

| Risk | Mitigation |
|---|---|
| `serve.json` rewrite not applied after `npm run build` | Verify `dist/serve.json` exists post-build. It should — Vite copies all files from `frontend/public/` to `dist/`. If missing, check `vite.config.ts` `publicDir` setting. |
| Fragment or `{expr && <>...</>}` as direct child of `<Routes>` | React Router v7 does NOT support `<React.Fragment>` as a direct child of `<Routes>`. All routes use unconditional `<Route element={condition ? <Tab/> : null} />` — this is already the pattern in Step 1.5. |
| AnimatePresence exit animations not firing | The `key` must be on the `motion.div` wrapping `<Routes>`, not on `<Routes>` itself. `key={location.pathname}` on `motion.div` is correct. |
| `useNavigate()` in `GuidedTour` called outside `<BrowserRouter>` | Won't happen — `GuidedTour` is rendered inside `App`, which is inside `<BrowserRouter>` (added in Task 1 Step 1.3). |
| React Query `data` is `undefined` (not `null`) on first load | `useState` initialized to `null`; `useQuery` uses `undefined`. All existing `data && <Tab data={data} ...>` guards work identically for both. No child component changes needed. |
| `isLoading` vs `isPending` in React Query v5 | Use `isLoading` (= `isPending && isFetching`). It is `true` only when there is no cached data AND a fetch is in progress — exactly the right condition for showing `<LoadingScreen />`. |
| `onRefresh` after CSV upload — brief stale data shown | By design. `invalidateQueries` refetches in the background; `data` holds stale values during refetch. This is better than blanking the screen. The SettingsTab's upload success state ("✓ uploaded") already communicates that data is updating. |
| `tabToPath` duplicated in Sidebar.tsx vs App.tsx | App.tsx only uses hardcoded `'/'` (for tour start). Sidebar.tsx defines its own `tabToPath`. No shared file needed — the function is 2 lines and only called in one place per file. |
