import { KpiCard, CollapsibleCard } from '../components/cards';
import { FlowChart } from '../components/charts';
import type { DashboardPayload, PeriodKey } from '../types';

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

interface CashFlowTabProps {
  data: DashboardPayload;
  activePeriod: PeriodKey;
}

function CashFlowTab({ data, activePeriod }: CashFlowTabProps) {
  const period = data.periods[activePeriod];

  const chkData = {
    ...period,
    income: period.chk_income,
    spending: period.chk_outflow,
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* KPI Row */}
      <div
        className="grid-3"
        style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}
      >
        <KpiCard
          label="Period Income"
          value={fmt(period.kpi_income)}
          variant="positive"
        />
        <KpiCard
          label="Period Spending"
          value={fmt(period.kpi_spending)}
          variant="negative"
        />
        <KpiCard
          label="Debt Payoff Power"
          value={fmt(period.kpi_disposable)}
          variant="special"
          highlighted={true}
          subtitle={`Income − Necessities − Debt (${fmt(period.kpi_debt)} debt)`}
        />
      </div>

      {/* Charts */}
      <div
        className="grid-2"
        style={{ display: 'grid', gap: '1rem' }}
      >
        <CollapsibleCard title="Income vs Spending">
          <FlowChart periodData={period} />
        </CollapsibleCard>
        <CollapsibleCard title="Checking: Income vs Direct Expenses">
          <FlowChart periodData={chkData} />
        </CollapsibleCard>
      </div>
    </div>
  );
}

export { CashFlowTab };
