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
