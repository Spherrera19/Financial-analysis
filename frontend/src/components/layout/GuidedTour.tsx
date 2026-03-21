import Joyride, { STATUS } from 'react-joyride';
import type { CallBackProps, Step } from 'react-joyride';
import type { TourType } from '../../hooks/useTour';

interface GuidedTourProps {
  activeTour: TourType | null;
  onFinish: (type: TourType) => void;
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
  buttonNext: { backgroundColor: '#2563eb', borderRadius: '0.5rem', fontSize: '0.875rem' },
  buttonBack: { color: '#2563eb', fontSize: '0.875rem' },
  buttonSkip: { color: '#64748b', fontSize: '0.875rem' },
  tooltip: { borderRadius: '0.75rem', fontSize: '0.9375rem', padding: '1.25rem', maxWidth: 380 },
  tooltipTitle: { fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' },
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
    target: '#tour-nav-overview',
    title: 'Overview',
    content: 'Your high-level command center. Displays your total net worth, 30-day cash flow velocity, and overall financial health at a glance.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-cashflow',
    title: 'Cash Flow',
    content: 'The Sankey Waterfall. Visualizes exactly how every dollar of income flows through your taxes, living expenses, and into your savings and investments.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-spending',
    title: 'Spending',
    content: 'Granular expense tracking. See your spending grouped by category with month-over-month trend lines, so you can spot patterns before they become problems.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-debt',
    title: 'Debt Payoff Planner',
    content: 'Your debt snowball and avalanche forecaster. Configure minimum payments and APRs to calculate your exact payoff date and the total interest you\'ll save.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-equity',
    title: 'Equity & RSUs',
    content: 'Track your unvested RSUs and stock options. Forecasts your future liquidity events based on current stock prices and your vesting schedule.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-tax',
    title: 'Tax & Retirement',
    content: 'Dual-simulation tax engine. Estimates your federal and self-employment tax liability while tracking 401(k) and IRA contribution progress toward annual limits.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-budget',
    title: 'Budget',
    content: 'Set monthly category limits and track your pacing in real time. See exactly how much discretionary income remains — and whether you\'re ahead or behind.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-transactions',
    title: 'Transactions',
    content: 'The raw ledger. Every individual swipe and deposit, fully searchable and categorizable. Drill into any chart across the app to land here with pre-applied filters.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-settings',
    title: 'Settings',
    content: 'Import new data, manage household members and workspace access, configure debt accounts, and customize your theme — all from one place.',
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

export function GuidedTour({ activeTour, onFinish }: GuidedTourProps) {
  if (!activeTour) return null;

  const currentTour: TourType = activeTour;
  const steps = currentTour === 'basic' ? BASIC_STEPS : ADVANCED_STEPS;

  function handleCallback(data: CallBackProps) {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      onFinish(currentTour);
    }
  }

  return (
    <Joyride
      key={activeTour}
      steps={steps}
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
