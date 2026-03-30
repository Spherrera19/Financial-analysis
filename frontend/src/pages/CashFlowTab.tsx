import { KpiCard, CollapsibleCard } from '../components/cards';
import { FlowChart, SankeyChart } from '../components/charts';
import type { DashboardPayload, DrawerFilter, PeriodKey } from '../types';

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

interface CashFlowTabProps {
  data: DashboardPayload;
  activePeriod: PeriodKey;
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void;
}

function CashFlowTab({ data, activePeriod, onDrillDown }: CashFlowTabProps) {
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

      {/* Macro Flow Sankey */}
      <div style={{ marginBottom: '1rem' }}>
        <CollapsibleCard
          title="Macro Money Flow (By Type)"
          helpText="High-level view of where your income goes — from source to spend type — without category clutter."
        >
          <SankeyChart flows={period.macro_sankey} onDrillDown={onDrillDown} />
        </CollapsibleCard>
      </div>

      {/* Charts */}
      <div
        className="grid-2"
        style={{ display: 'grid', gap: '1rem' }}
      >
        <div id="tour-cashflow-chart">
          <CollapsibleCard title="Income vs Spending" helpText="Tracks your monthly inflows versus outflows to calculate your net cash velocity and savings rate.">
            <FlowChart periodData={period} />
          </CollapsibleCard>
        </div>
        <CollapsibleCard title="Checking: Income vs Direct Expenses" helpText="A detailed breakdown of your primary cash flow vehicle.">
          <FlowChart periodData={chkData} />
        </CollapsibleCard>
      </div>
    </div>
  );
}

export { CashFlowTab };
