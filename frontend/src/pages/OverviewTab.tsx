import React from 'react';
import { KpiCard, CollapsibleCard } from '../components/cards';
import { SankeyChart } from '../components/charts';
import { AccountList } from '../components/tables';
import type { DashboardPayload, PeriodKey } from '../types';

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

interface OverviewTabProps {
  data: DashboardPayload;
  activePeriod: PeriodKey;
}

function OverviewTab({ data, activePeriod }: OverviewTabProps) {
  const period = data.periods[activePeriod];

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* KPI Row */}
      <div
        className="grid-kpi"
        style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}
      >
        <KpiCard
          label="Net Worth"
          value={fmt(data.summary.net_worth)}
          variant={data.summary.net_worth >= 0 ? 'positive' : 'negative'}
          subtitle="Assets − Liabilities"
        />
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
      </div>

      {/* Sankey Chart */}
      <div style={{ marginBottom: '1rem' }}>
        <CollapsibleCard title="Money Flow — Income Sources to Spending">
          <SankeyChart flows={period.sankey} />
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
