import { KpiCard, CollapsibleCard } from '../components/cards';
import { DebtTrendLine } from '../components/charts';
import { AccountList } from '../components/tables';
import type { DashboardPayload } from '../types';

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

interface DebtTabProps {
  data: DashboardPayload;
}

function DebtTab({ data }: DebtTabProps) {
  const debtAccounts = data.debt.accounts;

  // Compute weighted average interest rate
  const totalAbsBalance = debtAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const weightedRate =
    totalAbsBalance > 0
      ? debtAccounts.reduce((sum, a) => sum + Math.abs(a.balance) * a.rate, 0) / totalAbsBalance
      : 0;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* KPI Row */}
      <div
        className="grid-3"
        style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}
      >
        <KpiCard
          label="Total Debt"
          value={fmt(data.summary.total_liabilities)}
          variant="negative"
        />
        <KpiCard
          label="Accounts"
          value={`${data.summary.liability_count} accounts`}
          variant="neutral"
        />
        <KpiCard
          label="Avg Rate"
          value={`${(weightedRate * 100).toFixed(1)}%`}
          variant="neutral"
        />
      </div>

      {/* Debt Trend Chart */}
      <div style={{ marginBottom: '1rem' }}>
        <CollapsibleCard title="Debt Trend">
          <DebtTrendLine debtSection={data.debt} />
        </CollapsibleCard>
      </div>

      {/* Debt Accounts */}
      <div style={{ marginBottom: '1rem' }}>
        <CollapsibleCard title="Debt Accounts">
          <AccountList accounts={data.accounts} showType="liabilities" />
          <div style={{ marginTop: '1rem' }}>
            {debtAccounts.map((a) => (
              <div
                key={a.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.875rem',
                }}
              >
                <span>{a.name}</span>
                <span>{(a.rate * 100).toFixed(1)}% APR</span>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
}

export { DebtTab };
