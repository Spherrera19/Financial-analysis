# Polling Interceptor for GuidedTour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 400ms `setTimeout` delay in the guided tour with a polling interceptor that pauses Joyride after every step transition and resumes it only once the target DOM element exists and has a non-zero rendered width.

**Architecture:** `GuidedTour.tsx` gains a `runTour` boolean state and a `useEffect` polling interceptor. The effect fires on `[activeTour, stepIndex]` changes, immediately pauses Joyride, then polls `document.querySelector` at 100ms intervals until the target is visible. `handleCallback` loses its `setTimeout` calls and instead sets `stepIndex` directly, trusting the effect to handle the wait. A 5-second / 50-attempt timeout auto-advances the tour if a target never appears.

**Tech Stack:** React 19, TypeScript, react-joyride (existing)

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/layout/GuidedTour.tsx` | Add `useState`/`useEffect` imports; add `runTour` state; restructure component so hooks precede early return; add polling `useEffect`; remove `setTimeout` from `handleCallback`; add `TARGET_NOT_FOUND` handler; change `run={true}` → `run={runTour}` |

No other files change.

---

## Task 1: Implement the Polling Interceptor

**Files:**
- Modify: `frontend/src/components/layout/GuidedTour.tsx`

This is a complete file replacement. Read the current file first to understand what you're replacing, then write the new content.

### Context for the implementer

The current `handleCallback` uses `setTimeout(..., 400)` to delay `setStepIndex` after a tab navigation, giving React time to mount the new tab's DOM. This is a fixed delay that is too short on slow machines and too long on fast ones. The polling interceptor solves this by actively waiting for the element rather than guessing.

**Key structural change:** The current component calls `if (!activeTour) return null` before any other logic. React's rules of hooks require all hooks to be declared before any conditional return. The restructured component must place `useState` and `useEffect` at the top, then move the early return below them.

**`useEffect` deps are intentionally `[activeTour, stepIndex]` only.** The other values used inside the effect (`steps`, `stepTabs`, `setActiveTab`, `setStepIndex`, `onFinish`) are either module-level constants or stable React state setters/callbacks. Add `// eslint-disable-line react-hooks/exhaustive-deps` to suppress the lint warning.

- [ ] **Step 1: Replace `GuidedTour.tsx` with the complete new implementation**

  ```typescript
  import { useState, useEffect } from 'react';
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
  export const BASIC_STEP_TABS: TabKey[] = [
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
  export const ADVANCED_STEP_TABS: TabKey[] = [
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

  // Maximum poll attempts before auto-advancing (50 × 100ms = 5 seconds).
  const MAX_POLL_ATTEMPTS = 50;

  export function GuidedTour({ activeTour, onFinish, setActiveTab, stepIndex, setStepIndex }: GuidedTourProps) {
    // runTour drives Joyride's run prop. The polling interceptor (useEffect below)
    // sets this false on every step change and only sets it true once the target element
    // is confirmed to exist and have a non-zero rendered width.
    const [runTour, setRunTour] = useState(false);

    // Derived before the early return so the useEffect can reference them.
    // When activeTour is null these default to ADVANCED_* but the effect guards on
    // !activeTour before accessing them.
    const steps    = activeTour === 'basic' ? BASIC_STEPS    : ADVANCED_STEPS;
    const stepTabs = activeTour === 'basic' ? BASIC_STEP_TABS : ADVANCED_STEP_TABS;

    // Polling interceptor. Fires on every activeTour / stepIndex change.
    // Pauses Joyride immediately, then polls document.querySelector until the target
    // element is in the DOM and has a non-zero rendered width (i.e. has actually painted).
    // Cleans up the interval on re-run or unmount to prevent stale callbacks.
    useEffect(() => {
      if (!activeTour) {
        setRunTour(false);
        return;
      }

      setRunTour(false); // pause while we wait for the target

      const targetSelector = steps[stepIndex]?.target as string;
      let attempts = 0;

      const intervalId = setInterval(() => {
        attempts++;
        const el = document.querySelector(targetSelector);

        if (el && el.getBoundingClientRect().width > 0) {
          setRunTour(true);
          clearInterval(intervalId);
          return;
        }

        if (attempts >= MAX_POLL_ATTEMPTS) {
          clearInterval(intervalId);
          console.warn(`[GuidedTour] Target "${targetSelector}" not found after 5s — auto-advancing.`);

          const nextIndex = stepIndex + 1;
          if (nextIndex < steps.length) {
            setActiveTab(stepTabs[nextIndex]);
            setStepIndex(nextIndex);
          } else {
            // activeTour is guaranteed non-null: the !activeTour guard above
            // prevents the interval from ever starting when activeTour is null.
            onFinish(activeTour!);
          }
        }
      }, 100);

      return () => clearInterval(intervalId); // eslint-disable-line react-hooks/exhaustive-deps
    }, [activeTour, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // Early return AFTER hooks (React rules of hooks require unconditional hook calls).
    if (!activeTour) return null;

    function handleCallback(data: CallBackProps) {
      const { action, index, status, type } = data;

      // Handle tour completion or skip first — no navigation needed.
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        onFinish(activeTour!);
        return;
      }

      // Intercept next/back: pause Joyride, navigate to the required tab, set the new
      // step index. The polling useEffect takes over from here — no setTimeout needed.
      if (type === EVENTS.STEP_AFTER) {
        if (action === ACTIONS.NEXT) {
          const nextIndex = index + 1;
          if (nextIndex < steps.length) {
            setRunTour(false);
            setActiveTab(stepTabs[nextIndex]);
            setStepIndex(nextIndex);
          }
        } else if (action === ACTIONS.PREV) {
          const prevIndex = index - 1;
          if (prevIndex >= 0) {
            setRunTour(false);
            setActiveTab(stepTabs[prevIndex]);
            setStepIndex(prevIndex);
          }
        }
      }

      // Safety net: if Joyride fires TARGET_NOT_FOUND despite polling confirming the
      // element existed, force-advance to the next step rather than freezing.
      if (type === EVENTS.TARGET_NOT_FOUND) {
        const nextIndex = index + 1;
        if (nextIndex < steps.length) {
          setRunTour(false);
          setActiveTab(stepTabs[nextIndex]);
          setStepIndex(nextIndex);
        } else {
          onFinish(activeTour!);
        }
      }
    }

    return (
      <Joyride
        key={activeTour}
        steps={steps}
        stepIndex={stepIndex}
        run={runTour}
        continuous={true}
        showSkipButton={true}
        showProgress={true}
        disableScrolling={false}
        disableOverlayClose={true}
        spotlightClicks={false}
        callback={handleCallback}
        locale={{ last: 'Finish', skip: 'Skip tour' }}
        styles={JOYRIDE_STYLES}
      />
    );
  }
  ```

- [ ] **Step 2: Build check**

  ```bash
  cd frontend && npm run build
  ```

  Expected: `✓ built in Xms` with zero TypeScript errors. The only warning allowed is the pre-existing chunk size warning.

  If you see a TypeScript error on `el.getBoundingClientRect()`, add a cast: `(el as HTMLElement).getBoundingClientRect()`.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/layout/GuidedTour.tsx
  git commit -m "feat: replace setTimeout tour delay with DOM polling interceptor"
  ```
