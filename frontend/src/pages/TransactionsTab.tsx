import { KpiCard } from '../components/cards';
import { TransactionTable } from '../components/tables';
import type { DashboardPayload, PeriodKey } from '../types';

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

interface TransactionsTabProps {
  data: DashboardPayload;
  activePeriod: PeriodKey;
}

function TransactionsTab({ data, activePeriod }: TransactionsTabProps) {
  const period = data.periods[activePeriod];

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Summary Stats Row */}
      <div
        className="grid-3"
        style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}
      >
        <KpiCard
          label="Total Transactions"
          value={`${data.transactions.length}`}
          variant="neutral"
        />
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
      </div>

      {/* Transaction Table */}
      <div style={{ marginBottom: '1rem' }}>
        <TransactionTable transactions={data.transactions} />
      </div>
    </div>
  );
}

export { TransactionsTab };
