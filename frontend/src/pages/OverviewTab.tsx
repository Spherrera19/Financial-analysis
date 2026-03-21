import { useState, useEffect } from 'react';
import { KpiCard, CollapsibleCard } from '../components/cards';
import { SankeyChart, DiscretionaryBar } from '../components/charts';
import { AccountList } from '../components/tables';
import type { DashboardPayload, DrawerFilter, EquitySection, PeriodKey } from '../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

interface OverviewTabProps {
  data:         DashboardPayload;
  activePeriod: PeriodKey;
  onDrillDown:  (f: Omit<DrawerFilter, 'period'>) => void;
}

function OverviewTab({ data, activePeriod, onDrillDown }: OverviewTabProps) {
  const period = data.periods[activePeriod];

  // Equity data — fetched in the background; tab works fine if unavailable
  const [equity, setEquity] = useState<EquitySection | null>(null);
  useEffect(() => {
    fetch(`${API}/api/equity`)
      .then(r => r.ok ? r.json() : null)
      .then((d: EquitySection | null) => setEquity(d))
      .catch(() => setEquity(null));
  }, []);

  const unvestedValue  = equity?.total_unvested_value ?? 0;
  const totalWealth    = data.summary.net_worth + unvestedValue;
  const hasEquity      = unvestedValue > 0;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Discretionary Waterfall — most critical metric, shown first */}
      <div style={{ marginBottom: '1.25rem' }}>
        <CollapsibleCard title="Discretionary Income Breakdown">
          <DiscretionaryBar waterfall={period.cash_flow_waterfall} onDrillDown={onDrillDown} />
        </CollapsibleCard>
      </div>

      {/* KPI Row — 5 cards when equity data is available, 4 otherwise */}
      <div
        className="grid-kpi"
        style={{
          display: 'grid',
          gap: '1rem',
          marginBottom: '1rem',
          gridTemplateColumns: hasEquity
            ? 'repeat(5, minmax(0, 1fr))'
            : 'repeat(4, minmax(0, 1fr))',
        }}
      >
        <div id="tour-net-worth-kpi">
          <KpiCard
            label="Net Worth"
            value={fmt(data.summary.net_worth)}
            variant={data.summary.net_worth >= 0 ? 'positive' : 'negative'}
            subtitle={hasEquity ? `Total Wealth w/ Equity: ${fmt(totalWealth)}` : 'Assets − Liabilities'}
          />
        </div>
        <KpiCard
          label="Total Assets"
          value={fmt(data.summary.total_assets)}
          variant="positive"
          subtitle={`${data.summary.asset_count} accounts`}
        />
        <KpiCard
          label="Total Debt"
          value={fmt(data.summary.total_liabilities)}
          variant="negative"
          subtitle={`${data.summary.liability_count} accounts`}
        />
        <KpiCard
          label="Net Cash Flow"
          value={fmt(period.kpi_net)}
          variant={period.kpi_net >= 0 ? 'positive' : 'negative'}
          subtitle={`In ${fmt(period.kpi_income)} · Out ${fmt(period.kpi_spending)}`}
        />
        {hasEquity && (
          <KpiCard
            label="Unvested Equity"
            value={fmt(unvestedValue)}
            variant="positive"
            subtitle="at current price · net of 30% tax"
          />
        )}
      </div>

      {/* Sankey Chart */}
      <div style={{ marginBottom: '1rem' }}>
        <CollapsibleCard title="Money Flow — Income Sources to Spending">
          <SankeyChart flows={period.sankey} onDrillDown={onDrillDown} />
        </CollapsibleCard>
      </div>

      {/* Account Lists */}
      <div
        className="grid-2"
        style={{ display: 'grid', gap: '1rem' }}
      >
        <CollapsibleCard title="Assets">
          <AccountList accounts={data.accounts} showType="assets" />
        </CollapsibleCard>
        <CollapsibleCard title="Liabilities">
          <AccountList accounts={data.accounts} showType="liabilities" />
        </CollapsibleCard>
      </div>
    </div>
  );
}

export { OverviewTab };
