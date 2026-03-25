# Controlled Multi-Tab Guided Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the react-joyride guided tour from an uncontrolled tour targeting nav rail items into a fully controlled tour that programmatically navigates the app to the correct tab before each step, targeting actual chart/KPI elements.

**Architecture:** `useTour.ts` owns `stepIndex` state; `GuidedTour.tsx` receives `stepIndex`, `setStepIndex`, and `setActiveTab` as props and runs a `handleJoyrideCallback` interceptor that navigates the app and delays index advancement with `setTimeout(..., 400)` to give React time to mount the target DOM element before Joyride tries to attach. Five tab pages get lightweight `id` attributes on chart wrappers; `App.tsx` passes the new props down.

**Tech Stack:** React 19, TypeScript, react-joyride (existing), Framer Motion (existing)

---

## File Map

| File | Change |
|---|---|
| `frontend/src/hooks/useTour.ts` | Add `stepIndex` + `setStepIndex` to hook state and return value |
| `frontend/src/components/layout/GuidedTour.tsx` | New steps, STEP_TABS arrays, controlled Joyride, callback interceptor, new props |
| `frontend/src/pages/OverviewTab.tsx` | Wrap Net Worth KpiCard with `id="tour-net-worth-kpi"` div |
| `frontend/src/pages/CashFlowTab.tsx` | Add `id="tour-cashflow-chart"` to Income vs Spending wrapper |
| `frontend/src/pages/SpendingTab.tsx` | Add `id="tour-spending-donut"` to the SpendingDonut outer div |
| `frontend/src/pages/DebtTab.tsx` | Add `id="tour-debt-trend"` to the Debt Trend outer div |
| `frontend/src/pages/BudgetTab.tsx` | Add `id="tour-budget-bars"` to the LivePacing `motion.div` |
| `frontend/src/App.tsx` | Destructure `stepIndex`/`setStepIndex` from `useTour`, pass all three new props to `<GuidedTour>` |

---

## Task 1: Add Tour Target IDs to Tab Pages

**Files:**
- Modify: `frontend/src/pages/OverviewTab.tsx` (KPI grid, ~line 57)
- Modify: `frontend/src/pages/CashFlowTab.tsx` (grid-2 first card, ~line 56)
- Modify: `frontend/src/pages/SpendingTab.tsx` (donut outer div, ~line 18)
- Modify: `frontend/src/pages/DebtTab.tsx` (debt trend outer div, ~line 294)
- Modify: `frontend/src/pages/BudgetTab.tsx` (pacing motion.div, ~line 789)

- [ ] **Step 1: OverviewTab — wrap Net Worth KpiCard**

  In `OverviewTab.tsx`, find the Net Worth `<KpiCard>` (first card in the `grid-kpi` div) and wrap it in a `<div id="tour-net-worth-kpi">`:

  ```tsx
  // Before:
  <KpiCard
    label="Net Worth"
    value={fmt(data.summary.net_worth)}
    variant={data.summary.net_worth >= 0 ? 'positive' : 'negative'}
    subtitle={hasEquity ? `Total Wealth w/ Equity: ${fmt(totalWealth)}` : 'Assets − Liabilities'}
  />

  // After:
  <div id="tour-net-worth-kpi">
    <KpiCard
      label="Net Worth"
      value={fmt(data.summary.net_worth)}
      variant={data.summary.net_worth >= 0 ? 'positive' : 'negative'}
      subtitle={hasEquity ? `Total Wealth w/ Equity: ${fmt(totalWealth)}` : 'Assets − Liabilities'}
    />
  </div>
  ```

- [ ] **Step 2: CashFlowTab — add id to Income vs Spending wrapper**

  In `CashFlowTab.tsx`, find the `grid-2` div and wrap the first `CollapsibleCard` with a div:

  ```tsx
  // Before:
  <CollapsibleCard title="Income vs Spending">
    <FlowChart periodData={period} />
  </CollapsibleCard>

  // After:
  <div id="tour-cashflow-chart">
    <CollapsibleCard title="Income vs Spending">
      <FlowChart periodData={period} />
    </CollapsibleCard>
  </div>
  ```

- [ ] **Step 3: SpendingTab — add id to SpendingDonut outer div**

  In `SpendingTab.tsx`, add `id="tour-spending-donut"` to the existing wrapper div:

  ```tsx
  // Before:
  <div style={{ marginBottom: '1rem' }}>
    <CollapsibleCard title="Necessity vs Optional Breakdown">

  // After:
  <div id="tour-spending-donut" style={{ marginBottom: '1rem' }}>
    <CollapsibleCard title="Necessity vs Optional Breakdown">
  ```

- [ ] **Step 4: DebtTab — add id to Debt Trend outer div**

  In `DebtTab.tsx`, find the `<CollapsibleCard title="Debt Trend">` wrapper and add the id:

  ```tsx
  // Before:
  <div style={{ marginBottom: '1rem' }}>
    <CollapsibleCard title="Debt Trend">

  // After:
  <div id="tour-debt-trend" style={{ marginBottom: '1rem' }}>
    <CollapsibleCard title="Debt Trend">
  ```

- [ ] **Step 5: BudgetTab — add id to LivePacing motion.div**

  In `BudgetTab.tsx`, inside `CategoryManager`, find the `motion.div` with `key="pacing"` and add the id:

  ```tsx
  // Before:
  <motion.div
    key="pacing"
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ duration: 0.18 }}
  >
    <LivePacing />

  // After:
  <motion.div
    id="tour-budget-bars"
    key="pacing"
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ duration: 0.18 }}
  >
    <LivePacing />
  ```

- [ ] **Step 6: Build check**

  ```bash
  cd frontend && npm run build
  ```
  Expected: No TypeScript errors. Build succeeds.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/pages/OverviewTab.tsx frontend/src/pages/CashFlowTab.tsx frontend/src/pages/SpendingTab.tsx frontend/src/pages/DebtTab.tsx frontend/src/pages/BudgetTab.tsx
  git commit -m "feat: add tour target IDs to chart wrappers in tab pages"
  ```

---

## Task 2: Upgrade useTour.ts with stepIndex State

**Files:**
- Modify: `frontend/src/hooks/useTour.ts`

- [ ] **Step 1: Add `stepIndex` state and expose it**

  Replace the entire file content:

  ```typescript
  import { useState, useCallback } from 'react';
  import { useUser } from '../context/UserContext';

  export type TourType = 'basic' | 'advanced';

  function tourKey(type: TourType, userId: number): string {
    return `hasSeen_${type}_user_${userId}`;
  }

  export interface TourState {
    activeTour: TourType | null;
  }

  export function useTour() {
    const { activeUserId } = useUser();

    const [activeTour, setActiveTour] = useState<TourType | null>(() => {
      const basicKey = tourKey('basic', activeUserId);
      return localStorage.getItem(basicKey) !== 'true' ? 'basic' : null;
    });

    const [stepIndex, setStepIndex] = useState(0);

    const finishTour = useCallback((type: TourType) => {
      localStorage.setItem(tourKey(type, activeUserId), 'true');
      setActiveTour(null);
      setStepIndex(0);
    }, [activeUserId]);

    const startTour = useCallback((type: TourType) => {
      setStepIndex(0);
      setActiveTour(type);
    }, []);

    return { activeTour, finishTour, startTour, stepIndex, setStepIndex };
  }
  ```

- [ ] **Step 2: Build check**

  ```bash
  cd frontend && npm run build
  ```
  Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/hooks/useTour.ts
  git commit -m "feat: add stepIndex state to useTour hook"
  ```

---

## Task 3: Overhaul GuidedTour.tsx

**Files:**
- Modify: `frontend/src/components/layout/GuidedTour.tsx`

This is the most complex change. The new file:
- Adds `BASIC_STEP_TABS` and `ADVANCED_STEP_TABS` lookup arrays
- Replaces the 11 nav-targeting steps with 7 chart-targeting steps for basic, keeps 3 settings steps for advanced
- Accepts `stepIndex`, `setStepIndex`, and `setActiveTab` props
- Drives Joyride with `stepIndex` (controlled mode)
- Intercepts next/back/finish in `handleJoyrideCallback`

- [ ] **Step 1: Replace GuidedTour.tsx with the new controlled implementation**

  ```typescript
  import Joyride, { STATUS, ACTIONS, EVENTS } from 'react-joyride';
  import type { CallBackProps, Step } from 'react-joyride';
  import type { TourType } from '../../hooks/useTour';
  import type { TabKey } from '../../types';

  interface GuidedTourProps {
    activeTour:   TourType | null;
    onFinish:     (type: TourType) => void;
    setActiveTab: (tab: TabKey) => void;
    stepIndex:    number;
    setStepIndex: (i: number) => void;
  }

  // Maps each step index to the tab that must be active for the target to exist in the DOM.
  // TopBar (#tour-period-filter, #tour-ledger-switcher) is only rendered on data tabs — 'overview' works.
  const BASIC_STEP_TABS: TabKey[] = [
    'overview',   // 0 — #tour-period-filter   (TopBar, visible on all data tabs)
    'overview',   // 1 — #tour-ledger-switcher (TopBar, visible on all data tabs)
    'overview',   // 2 — #tour-net-worth-kpi
    'cashflow',   // 3 — #tour-cashflow-chart
    'spending',   // 4 — #tour-spending-donut
    'debt',       // 5 — #tour-debt-trend
    'budget',     // 6 — #tour-budget-bars
  ];

  // Advanced tour tab routing:
  // Step 0 targets #tour-ai-export, which lives in TopBar.tsx. TopBar is ONLY rendered
  // on data tabs (overview, cashflow, spending, debt, transactions) — it is NOT rendered
  // when activeTab === 'settings'. So step 0 must navigate to 'overview' to mount the
  // TopBar before Joyride tries to attach the tooltip. Steps 1 & 2 are in SettingsTab.
  const ADVANCED_STEP_TABS: TabKey[] = [
    'overview',   // 0 — #tour-ai-export (TopBar — only rendered on data tabs)
    'settings',   // 1 — [data-tour="data-import-section"]
    'settings',   // 2 — [data-tour="workspace-section"]
  ];

  const JOYRIDE_STYLES = {
    options: {
      primaryColor: '#2563eb',
      backgroundColor: '#ffffff',
      textColor: '#1e293b',
      arrowColor: '#ffffff',
      overlayColor: 'rgba(0, 0, 0, 0.5)',
      zIndex: 10000,
    },
    buttonNext:     { backgroundColor: '#2563eb', borderRadius: '0.5rem', fontSize: '0.875rem' },
    buttonBack:     { color: '#2563eb', fontSize: '0.875rem' },
    buttonSkip:     { color: '#64748b', fontSize: '0.875rem' },
    tooltip:        { borderRadius: '0.75rem', fontSize: '0.9375rem', padding: '1.25rem', maxWidth: 380 },
    tooltipTitle:   { fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' },
  };

  const BASIC_STEPS: Step[] = [
    {
      target: '#tour-period-filter',
      title: 'Time Period Filter',
      content: 'Start here. All charts and figures respond to this selector — toggle between the current month, last month, or the past quarter to slice your data in time.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#tour-ledger-switcher',
      title: 'Workspace Switcher',
      content: 'Switch between your Personal, Joint, and Business financial workspaces. Each ledger holds its own transactions, balances, and settings — fully isolated from the others.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#tour-net-worth-kpi',
      title: 'Net Worth',
      content: 'Your complete financial picture. Net Worth is your total assets minus liabilities — the single most important number on the dashboard. Watch it grow as you pay down debt and build savings.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#tour-cashflow-chart',
      title: 'Cash Flow Velocity',
      content: 'This chart visualizes your historical Cash Flow velocity. It tracks your total inflows versus outflows over time so you can easily spot months where you burned more cash than you earned.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#tour-spending-donut',
      title: 'Spending Breakdown',
      content: 'Your spending divided into Necessities (housing, utilities, insurance), Optional (dining, entertainment), and Debt payments. Click any segment to drill into the exact transactions behind it.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#tour-debt-trend',
      title: 'Debt Trend',
      content: 'Your total debt balance over time. The trend line shows whether you\'re making meaningful progress — a consistently downward slope means your payoff strategy is working.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '#tour-budget-bars',
      title: 'Budget Pacing',
      content: 'Your real-time Budget Pacing. These health bars show exactly how much discretionary income you have left in each category for the current period, keeping your spending on track.',
      placement: 'bottom',
      disableBeacon: true,
    },
  ];

  const ADVANCED_STEPS: Step[] = [
    {
      target: '#tour-ai-export',
      title: 'AI Summary Export',
      content: 'Generate a plain-text snapshot of your current dashboard — income, expenses, debt status, and net worth — formatted for pasting directly into an LLM like ChatGPT or Claude for personalized financial coaching.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-tour="data-import-section"]',
      title: 'Data Import',
      content: 'Drag and drop your Monarch Money CSVs or brokerage statements here. The engine automatically parses, categorizes, and upserts the data — existing manual entries are never overwritten.',
      placement: 'top',
      disableBeacon: true,
    },
    {
      target: '[data-tour="workspace-section"]',
      title: 'Workspace Access Control',
      content: 'As an Admin, you can create new business or joint ledgers and securely provision access for other household members — granting Viewer or Admin roles per workspace.',
      placement: 'top',
      disableBeacon: true,
    },
  ];

  export function GuidedTour({ activeTour, onFinish, setActiveTab, stepIndex, setStepIndex }: GuidedTourProps) {
    if (!activeTour) return null;

    const currentTour = activeTour;
    const steps    = currentTour === 'basic' ? BASIC_STEPS    : ADVANCED_STEPS;
    const stepTabs = currentTour === 'basic' ? BASIC_STEP_TABS : ADVANCED_STEP_TABS;

    function handleCallback(data: CallBackProps) {
      const { action, index, status, type } = data;

      // Handle tour completion or skip first — no navigation needed.
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        setStepIndex(0);
        onFinish(currentTour);
        return;
      }

      // Intercept next/back to navigate tabs before advancing the step index.
      if (type === EVENTS.STEP_AFTER) {
        if (action === ACTIONS.NEXT) {
          const nextIndex = index + 1;
          if (nextIndex < stepTabs.length) {
            setActiveTab(stepTabs[nextIndex]);
          }
          setTimeout(() => setStepIndex(nextIndex), 400);
        } else if (action === ACTIONS.PREV) {
          const prevIndex = index - 1;
          if (prevIndex >= 0) {
            setActiveTab(stepTabs[prevIndex]);
          }
          setTimeout(() => setStepIndex(prevIndex), 400);
        }
      }
    }

    return (
      <Joyride
        key={activeTour}
        steps={steps}
        stepIndex={stepIndex}
        run={true}
        continuous={true}
        showSkipButton={true}
        showProgress={true}
        disableScrolling={false}
        spotlightClicks={false}
        callback={handleCallback}
        locale={{ last: 'Finish', skip: 'Skip tour' }}
        styles={JOYRIDE_STYLES}
      />
    );
  }
  ```

  **Important import note:** `ACTIONS` and `EVENTS` are named exports from `react-joyride`. The string values are `'next'`, `'prev'`, `'step:after'` — using the exported constants prevents typo bugs.

- [ ] **Step 2: Build check**

  ```bash
  cd frontend && npm run build
  ```
  Expected: No TypeScript errors. If `ACTIONS` or `EVENTS` are not exported from the installed version, fall back to string literals `'next'`, `'prev'`, `'step:after'`.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/layout/GuidedTour.tsx
  git commit -m "feat: overhaul GuidedTour to controlled multi-tab tour with tab-navigation interceptor"
  ```

---

## Task 4: Wire App.tsx

**Files:**
- Modify: `frontend/src/App.tsx` (~line 76 and ~line 223)

- [ ] **Step 1: Destructure new values from useTour and pass to GuidedTour**

  Change the `useTour` destructure line:

  ```typescript
  // Before:
  const { activeTour, finishTour, startTour } = useTour();

  // After:
  const { activeTour, finishTour, startTour, stepIndex, setStepIndex } = useTour();
  ```

  Change the `<GuidedTour>` render line:

  ```tsx
  // Before:
  <GuidedTour activeTour={activeTour} onFinish={finishTour} />

  // After:
  <GuidedTour
    activeTour={activeTour}
    onFinish={finishTour}
    setActiveTab={setActiveTab}
    stepIndex={stepIndex}
    setStepIndex={setStepIndex}
  />
  ```

- [ ] **Step 2: Build check — full pipeline**

  ```bash
  cd frontend && npm run build
  ```
  Expected: Clean build, zero TypeScript errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/App.tsx
  git commit -m "feat: wire setActiveTab and stepIndex props into GuidedTour"
  ```

---

## Task 5: Smoke Test

No automated frontend test suite exists. Verify manually:

- [ ] **Step 1: Start the servers**

  ```bash
  # Terminal 1:
  cd C:/Users/steve/OneDrive/Desktop/IDocs/Pv/Finance/March
  call venv/Scripts/activate && uvicorn backend.main:app --reload --port 8000

  # Terminal 2:
  cd frontend && npx serve dist -p 3000
  ```

- [ ] **Step 2: Basic tour flow**
  1. Clear localStorage for the tour key (or open a fresh private window)
  2. Load `http://localhost:3000` — the basic tour should auto-start on the Overview tab
  3. **Step 0** — tooltip attaches to `#tour-period-filter` (period selector, TopBar)
  4. Click **Next** → **Step 1** — app stays on `overview`, tooltip attaches to `#tour-ledger-switcher` (workspace switcher, TopBar)
  5. Click **Next** → **Step 2** — app stays on `overview`, tooltip attaches to `#tour-net-worth-kpi` (Net Worth KPI card)
  6. Click **Next** → **Step 3** — app navigates to `cashflow` tab, tooltip attaches to `#tour-cashflow-chart` after ~400ms
  7. Click **Next** → **Step 4** — app navigates to `spending` tab, tooltip attaches to `#tour-spending-donut`
  8. Click **Next** → **Step 5** — app navigates to `debt` tab, tooltip attaches to `#tour-debt-trend`
  9. Click **Next** → **Step 6** — app navigates to `budget` tab, tooltip attaches to `#tour-budget-bars` (LivePacing health bars)
  10. Click **Finish** — tour ends, `localStorage` key is set, tour does not re-appear on refresh

- [ ] **Step 3: Back navigation**
  1. Restart the tour from Settings tab → "Restart Basic Tour"
  2. Click **Next** twice to reach Step 2 (Net Worth KPI, Overview tab)
  3. Click **Next** once more to reach Step 3 (Cash Flow tab)
  4. Click **Back** — app navigates back to `overview`, tooltip attaches to `#tour-net-worth-kpi`

- [ ] **Step 4: Skip behavior**
  1. Restart tour, click **Skip tour** at any step
  2. Tour closes, `localStorage` key is set, tour does not auto-start on next load

- [ ] **Step 5: Advanced tour**
  1. Go to Settings tab → "Start Advanced Tour"
  2. App navigates to `overview` tab (step 0 = `#tour-ai-export` is in TopBar, which only renders on data tabs)
  3. Tooltip attaches to `#tour-ai-export` (export buttons in top-right of TopBar)
  4. Click **Next** — app navigates to `settings`, tooltip attaches to `[data-tour="data-import-section"]`
  5. Click **Next** — app stays on `settings`, tooltip attaches to `[data-tour="workspace-section"]`
  6. Click **Finish** — tour completes, `localStorage` key for advanced tour is set

- [ ] **Step 6: Final commit**

  ```bash
  git add -A
  git commit -m "chore: verify controlled tour smoke test complete"
  ```
  *(Only needed if any last-minute tweaks were made during testing.)*
