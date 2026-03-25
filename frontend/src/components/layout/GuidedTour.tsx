import { useState, useEffect } from 'react';
import Joyride, { STATUS, ACTIONS, EVENTS } from 'react-joyride';
import type { CallBackProps, Step } from 'react-joyride';
import type { TourType } from '../../hooks/useTour';
import { useNavigate } from 'react-router-dom';

interface GuidedTourProps {
  activeTour:   TourType | null;
  onFinish:     (type: TourType) => void;
  stepIndex:    number;
  setStepIndex: (i: number) => void;
}

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

// -----------------------------------------------------------------------------
// 1. MASTER TOUR DEFINITIONS
// Add, remove, or reorder steps here. Everything else is calculated automatically.
// -----------------------------------------------------------------------------

interface TourDefinition {
  path: string;
  target: string;
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const MASTER_BASIC_STEPS: TourDefinition[] = [
  { path: '/', target: '#tour-period-filter', title: 'Time Period Filter', content: 'Start here. Select the timeframe for your analysis. All charts, budgets, and cash flow data instantly recalculate based on this selection.', placement: 'bottom' },
  { path: '/', target: '#tour-ledger-switcher', title: 'Workspace Switcher', content: 'This is a true multi-tenant platform. Toggle between Personal, Joint, or Business ledgers. Each workspace has completely isolated data.', placement: 'bottom' },
  { path: '/', target: '#tour-net-worth-kpi', title: 'Overview: Net Worth', content: 'Welcome to the Overview tab. This is your financial true north. It aggregates your cash, equity, and retirement accounts, subtracting all tracked debt to give you a single health metric.', placement: 'bottom' },
  { path: '/', target: '#tour-sankey-chart', title: 'Overview: Money Flow', content: 'This Sankey diagram maps exactly how your gross income cascades down into taxes, necessary expenses, discretionary spending, and finally, your net savings.', placement: 'top' },
  { path: '/cashflow', target: '#tour-cashflow-chart', title: 'Cash Flow: Velocity Tracking', content: 'The Cash Flow tab tracks the velocity of your money. This chart visualizes month-over-month inflows versus outflows so you can easily spot periods where you burned more cash than you earned.', placement: 'top' },
  { path: '/spending', target: '#tour-spending-donut', title: 'Spending: Expense Breakdown', content: 'The Spending tab analyzes your outflows. This donut splits your expenses into Necessities (housing, insurance) and Optional (dining, entertainment) to check your lifestyle ratios.', placement: 'bottom' },
  { path: '/spending', target: '#tour-category-bars', title: 'Spending: Category Drill-down', content: 'Scroll down to see exactly where your money goes. Every swipe and deposit is auto-categorized and charted against your historical averages.', placement: 'top' },
  { path: '/debt', target: '#tour-debt-trend', title: 'Debt: Payoff Forecaster', content: "The Debt tab is your dedicated payoff forecaster. Simulate strategies (Snowball vs Avalanche) and watch this trend line to see exactly when you'll be debt-free.", placement: 'top' },
  { path: '/equity', target: '#tour-equity-kpi', title: 'Equity & Options', content: 'The Equity tab tracks your unvested stock options and RSUs. It forecasts your future liquidity events based on current, real-time market prices.', placement: 'bottom' },
  { path: '/tax', target: '#tour-tax-cards', title: 'Tax & Retirement', content: 'This dual-engine tab provides live tax liability estimation and tracks your 401k/IRA balances, automatically updating as you log new income.', placement: 'bottom' },
  { path: '/budget', target: '#tour-budget-bars', title: 'Budget: Live Pacing', content: 'The Budget tab keeps you on track. These real-time health bars show exactly how much discretionary income remains in each category for the current period.', placement: 'bottom' },
  { path: '/transactions', target: '#tour-transaction-table', title: 'Transactions: The Raw Ledger', content: 'The Transactions tab contains the raw data underlying everything. Easily search, re-categorize, and filter thousands of individual transactions here.', placement: 'top' },
  { path: '/transactions', target: '#tour-settings-tab', title: 'Settings & Configurations', content: 'Finally, the Settings tab! Head over here to import CSVs, invite family members to your workspaces, and restart this tutorial at any time.', placement: 'right' },
];

const MASTER_ADVANCED_STEPS: TourDefinition[] = [
  {
    path: '/',
    target: '#tour-ledger-switcher',
    title: '1. Multi-Tenant Architecture',
    content: 'Under the hood, this dashboard uses a strictly isolated multi-tenant architecture. Every ledger (Personal, Business, Joint) operates as a separate SQLite data silo, guaranteeing your business expenses never accidentally co-mingle with your personal cash flow algorithms.',
    placement: 'bottom'
  },
  {
    path: '/',
    target: '#tour-user-switcher',
    title: '2. Identity & Context Management',
    content: 'The platform supports multiple distinct financial profiles within a single household. Switching users here changes the active context, allowing the backend to calculate individual tax burdens, separate W2 incomes, or track individual equity grants.',
    placement: 'bottom'
  },
  {
    path: '/',
    target: '#tour-ai-export',
    title: '3. Bring-Your-Own-AI (BYOAI)',
    content: 'Instead of building a brittle, hardcoded AI wrapper, we engineered an agnostic LLM bridge. This compiles a sanitized, structured markdown snapshot of your exact financial state, perfectly formatted to be pasted into Claude or ChatGPT for complex strategic coaching.',
    placement: 'bottom'
  },
  {
    path: '/',
    target: '#tour-sankey-chart',
    title: '4. Global State & Drill-Downs',
    content: 'The charts here are not static SVGs. The Sankey diagram acts as a UI controller. Clicking on any flow node (like "Housing" or "Taxes") instantly updates the global state, filtering the underlying React context to show only the exact transactions comprising that node.',
    placement: 'top'
  },
  {
    path: '/spending',
    target: '#tour-category-bars',
    title: '5. Sub-Ledger Interactivity',
    content: 'Similarly, these category bars are interactive query triggers. Clicking a specific category dynamically fetches the sub-ledger for that group, allowing you to audit or re-categorize anomalous transactions on the fly while the historical averages recalculate instantly.',
    placement: 'top'
  },
  {
    path: '/debt',
    target: '#tour-debt-trend',
    title: '6. Algorithmic Amortization',
    content: 'The Debt Engine doesn\'t just plot static balances; it calculates live amortization schedules. If you specify $500 in "extra cash," the engine simulates future payments. Once a loan is eliminated in the simulation, it automatically cascades that $500 to the next loan.',
    placement: 'top'
  },
  {
    path: '/debt',
    target: '#tour-debt-trend',
    title: '7. Strategy: Snowball vs Avalanche',
    content: 'The engine supports two core algorithms. The "Snowball" method mathematically targets the lowest balance first to build psychological momentum. The "Avalanche" method targets the highest APR first, mathematically minimizing the total interest paid. Toggling them redraws the projection curves in real-time.',
    placement: 'bottom'
  },
  {
    path: '/equity',
    target: '#tour-equity-kpi',
    title: '8. The Projection Engine (GBM)',
    content: 'The Equity Engine dynamically pulls real-time market data via yfinance. It then utilizes Geometric Brownian Motion (GBM) to simulate market volatility, projecting the realistic future value of your unvested RSUs and Options based on historical variance.',
    placement: 'bottom'
  },
  {
    path: '/tax',
    target: '#tour-tax-cards',
    title: '9. Dual Tax Engine',
    content: 'This dual-engine dynamically computes your effective tax rate based on aggregated income across all active ledgers. Simultaneously, it calculates the "Tax Shield" — exactly how many dollars your 401k/IRA contributions are legally protecting from the IRS.',
    placement: 'bottom'
  },
  {
    path: '/settings',
    target: '#tour-data-import',
    title: '10. Pandas Ingestion Pipeline',
    content: 'CSVs are processed through a robust Pandas-based backend pipeline. The engine normalizes the data, applies fuzzy-matching for auto-categorization based on your historical spending patterns, and strictly prevents duplicate ledger entries via cryptographic hash checking.',
    placement: 'top'
  },
  {
    path: '/settings',
    target: '#tour-workspace-access',
    title: '11. RBAC (Role-Based Access Control)',
    content: 'Enterprise-grade access control at the household level. As an Admin, you can invite a partner to a "Joint" ledger with full edit rights, while keeping your "Business" ledger completely invisible and computationally segregated from their account.',
    placement: 'top'
  },
];

// -----------------------------------------------------------------------------
// 2. PROGRAMMATIC DERIVATION
// This automatically splits the Master lists into the arrays Joyride and the Interceptor need.
// -----------------------------------------------------------------------------

export const BASIC_STEP_TABS = MASTER_BASIC_STEPS.map(s => s.path);
export const ADVANCED_STEP_TABS = MASTER_ADVANCED_STEPS.map(s => s.path);

const mapToJoyride = (steps: TourDefinition[]): Step[] => 
  steps.map(s => ({
    target: s.target,
    title: s.title,
    content: s.content,
    placement: s.placement || 'bottom',
    disableBeacon: true,
  }));

const BASIC_STEPS: Step[] = mapToJoyride(MASTER_BASIC_STEPS);
const ADVANCED_STEPS: Step[] = mapToJoyride(MASTER_ADVANCED_STEPS);

// Maximum poll attempts before auto-advancing (50 × 100ms = 5 seconds).
const MAX_POLL_ATTEMPTS = 50;

export function GuidedTour({ activeTour, onFinish, stepIndex, setStepIndex }: GuidedTourProps) {
  const navigate = useNavigate();
  const [runTour, setRunTour] = useState(false);

  const steps    = activeTour === 'basic' ? BASIC_STEPS    : ADVANCED_STEPS;
  const stepTabs = activeTour === 'basic' ? BASIC_STEP_TABS : ADVANCED_STEP_TABS;

  // Polling interceptor. Fires on every activeTour / stepIndex change.
  useEffect(() => {
    if (!activeTour) {
      setRunTour(false);
      return;
    }

    setRunTour(false); // pause while we wait for the target

    const targetSelector = steps[stepIndex]?.target as string | undefined;
    if (!targetSelector) {
      console.warn(`[Tour Interceptor] Step ${stepIndex} has no target selector!`);
      setRunTour(false);
      return;
    }

    console.log(`[Tour Interceptor] Step ${stepIndex}: Pausing Joyride. Searching DOM for "${targetSelector}"...`);
    let attempts = 0;

    const intervalId = setInterval(() => {
      attempts++;
      const el = document.querySelector(targetSelector);
      const width = el ? (el as HTMLElement).getBoundingClientRect().width : 0;

      if (el && width > 0) {
        console.log(`[Tour Interceptor] Step ${stepIndex}: Target "${targetSelector}" FOUND and painted (width: ${width}px) on attempt ${attempts}. Resuming Joyride.`);
        setRunTour(true);
        clearInterval(intervalId);
        return;
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        clearInterval(intervalId);
        console.error(`[Tour Interceptor] Step ${stepIndex}: Target "${targetSelector}" NOT FOUND after 5s. Auto-advancing to step ${stepIndex + 1}.`);

        const nextIndex = stepIndex + 1;
        if (nextIndex < steps.length) {
          console.log(`[Tour Interceptor] Navigating router to: ${stepTabs[nextIndex]}`);
          navigate(stepTabs[nextIndex]);
          setStepIndex(nextIndex);
        } else {
          console.log(`[Tour Interceptor] Reached end of tour. Finishing.`);
          onFinish(activeTour!);
        }
      }
    }, 100);

    return () => clearInterval(intervalId); // eslint-disable-line react-hooks/exhaustive-deps
  }, [activeTour, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Early return AFTER hooks (React rules of hooks require unconditional hook calls).
  if (!activeTour) return null;

  function handleCallback(data: CallBackProps) {
    const { action, index, status, type, lifecycle } = data;

    // Log EVERY event fired by Joyride
    console.log(
      `[Joyride Event] Step: ${index} | Type: ${type} | Lifecycle: ${lifecycle} | Action: ${action} | Status: ${status}`
    );

    // Handle tour completion or skip first — no navigation needed.
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      console.log(`[Joyride] Tour ended with status: ${status}. Calling onFinish.`);
      onFinish(activeTour!);
      return;
    }

    // Explicitly catch the "Close" (X) button at any point in the tour
    if (action === ACTIONS.CLOSE) {
      console.log(`[Joyride] User clicked Close (X). Calling onFinish.`);
      onFinish(activeTour!);
      return;
    }

    // Intercept next/back: pause Joyride, navigate to the required tab, set the new step index.
    if (type === EVENTS.STEP_AFTER) {
      if (action === ACTIONS.NEXT) {
        const nextIndex = index + 1;
        if (nextIndex < steps.length) {
          console.log(`[Joyride Navigation] User clicked NEXT. Navigating router to ${stepTabs[nextIndex]} and setting step to ${nextIndex}`);
          setRunTour(false);
          navigate(stepTabs[nextIndex]);
          setStepIndex(nextIndex);
        } else {
          // Catch the "Finish" button click on the very last step
          console.log(`[Joyride] User clicked Finish on the last step. Calling onFinish.`);
          onFinish(activeTour!);
        }
      } else if (action === ACTIONS.PREV) {
        const prevIndex = index - 1;
        if (prevIndex >= 0) {
          console.log(`[Joyride Navigation] User clicked PREV. Navigating router to ${stepTabs[prevIndex]} and setting step to ${prevIndex}`);
          setRunTour(false);
          navigate(stepTabs[prevIndex]);
          setStepIndex(prevIndex);
        }
      }
    }

    // Safety net: if Joyride fires TARGET_NOT_FOUND
    if (type === EVENTS.TARGET_NOT_FOUND) {
      console.error(`[Joyride Error] Target not found natively by Joyride on step ${index}. Forcing navigation to next step.`);
      const nextIndex = index + 1;
      if (nextIndex < steps.length) {
        setRunTour(false);
        navigate(stepTabs[nextIndex]);
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
