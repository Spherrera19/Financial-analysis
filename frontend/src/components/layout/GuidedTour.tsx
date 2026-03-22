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
  'overview',     // 0: Period Filter
  'overview',     // 1: Ledger Switcher
  'overview',     // 2: Net Worth
  'overview',     // 3: Sankey Chart
  'cashflow',     // 4: Flow Chart
  'spending',     // 5: Donut Chart
  'spending',     // 6: Category Bars
  'debt',         // 7: Trend Line
  'equity',       // 8: KPI Cards
  'tax',          // 9: KPI Cards
  'budget',       // 10: Pacing Bars
  'transactions', // 11: Ledger Table
  'transactions', // 12: Settings Button (Sidebar is visible from Transactions)
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
    content: 'Start here. Select the timeframe for your analysis. All charts, budgets, and cash flow data instantly recalculate based on this selection.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '#tour-ledger-switcher',
    title: 'Workspace Switcher',
    content: 'This is a true multi-tenant platform. Toggle between Personal, Joint, or Business ledgers. Each workspace has completely isolated data.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '#tour-net-worth-kpi',
    title: 'Overview: Net Worth',
    content: 'Welcome to the Overview tab. This is your financial true north. It aggregates your cash, equity, and retirement accounts, subtracting all tracked debt to give you a single health metric.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '#tour-sankey-chart',
    title: 'Overview: Money Flow',
    content: 'This Sankey diagram maps exactly how your gross income cascades down into taxes, necessary expenses, discretionary spending, and finally, your net savings.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '#tour-cashflow-chart',
    title: 'Cash Flow: Velocity Tracking',
    content: 'The Cash Flow tab tracks the velocity of your money. This chart visualizes month-over-month inflows versus outflows so you can easily spot periods where you burned more cash than you earned.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '#tour-spending-donut',
    title: 'Spending: Expense Breakdown',
    content: 'The Spending tab analyzes your outflows. This donut splits your expenses into Necessities (housing, insurance) and Optional (dining, entertainment) to check your lifestyle ratios.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '#tour-category-bars',
    title: 'Spending: Category Drill-down',
    content: 'Scroll down to see exactly where your money goes. Every swipe and deposit is auto-categorized and charted against your historical averages.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '#tour-debt-trend',
    title: 'Debt: Payoff Forecaster',
    content: 'The Debt tab is your dedicated payoff forecaster. Simulate strategies (Snowball vs Avalanche) and watch this trend line to see exactly when you\'ll be debt-free.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '#tour-equity-kpi',
    title: 'Equity & Options',
    content: 'The Equity tab tracks your unvested stock options and RSUs. It forecasts your future liquidity events based on current, real-time market prices.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '#tour-tax-cards',
    title: 'Tax & Retirement',
    content: 'This dual-engine tab provides live tax liability estimation and tracks your 401k/IRA balances, automatically updating as you log new income.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '#tour-budget-bars',
    title: 'Budget: Live Pacing',
    content: 'The Budget tab keeps you on track. These real-time health bars show exactly how much discretionary income remains in each category for the current period.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '#tour-transaction-table',
    title: 'Transactions: The Raw Ledger',
    content: 'The Transactions tab contains the raw data underlying everything. Easily search, re-categorize, and filter thousands of individual transactions here.',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '#tour-settings-tab',
    title: 'Settings & Configurations',
    content: 'Finally, the Settings tab! Head over here to import CSVs, invite family members to your workspaces, and restart this tutorial at any time.',
    placement: 'right',
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

    const targetSelector = steps[stepIndex]?.target as string | undefined;
    if (!targetSelector) { setRunTour(false); return; }
    let attempts = 0;

    const intervalId = setInterval(() => {
      attempts++;
      const el = document.querySelector(targetSelector);

      if (el && (el as HTMLElement).getBoundingClientRect().width > 0) {
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
