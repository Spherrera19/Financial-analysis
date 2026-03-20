import { useEffect, useRef, useState, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { KpiCard, CollapsibleCard } from '../components/cards';
import { DebtTrendLine } from '../components/charts';
import { AccountList } from '../components/tables';
import type { DashboardPayload, DebtProjection, PayoffScenario } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_MONTHS_DISPLAY = 600;  // mirrors MAX_SIMULATION_MONTHS in debt_engine.py

// ── Sparkline chart ────────────────────────────────────────────────────────

interface SparklineProps {
  balances: number[];
  color: string;
}

function PayoffSparkline({ balances, color }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: balances.map((_, i) => `M${i + 1}`),
        datasets: [{
          data: balances,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          backgroundColor: color + '1A',   // 10% opacity fill
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { display: false },
          y: {
            display: true,
            ticks: {
              color: 'var(--text-secondary)',
              font: { size: 11 },
              callback: (v) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }),
            },
            grid: { color: 'var(--border-subtle)' },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [balances, color]);

  if (balances.length === 0) {
    return <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem' }}>No data</div>;
  }

  return <canvas ref={canvasRef} style={{ width: '100%', height: '160px' }} />;
}

// ── PayoffForecaster card ─────────────────────────────────────────────────

interface PayoffForecasterProps {
  projection: DebtProjection;
}

function PayoffForecaster({ projection }: PayoffForecasterProps) {
  const [strategy, setStrategy] = useState<'snowball' | 'avalanche'>('snowball');

  const active: PayoffScenario = projection[strategy];
  const other:  PayoffScenario = projection[strategy === 'snowball' ? 'avalanche' : 'snowball'];
  const otherLabel = strategy === 'snowball' ? 'Avalanche' : 'Snowball';

  const payoffDate = useMemo(() => addMonths(active.payoff_months), [active.payoff_months]);
  // interestDiff > 0 → active is more expensive → other saves money
  // interestDiff < 0 → active is cheaper → other costs more
  const interestDiff = active.total_interest_paid - other.total_interest_paid;
  const savingsAmount = Math.abs(interestDiff);
  const otherSavesMore = interestDiff > 1;    // switching would save money

  const toggleStyle = (s: 'snowball' | 'avalanche') => ({
    padding: '0.35rem 0.9rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
    transition: 'background 0.15s, color 0.15s',
    background: strategy === s ? 'var(--accent)' : 'transparent',
    color:      strategy === s ? '#fff' : 'var(--text-secondary)',
  });

  return (
    <CollapsibleCard title="Payoff Forecaster">
      {/* Strategy toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '1.25rem',
        background: 'var(--surface-2)',
        borderRadius: '0.5rem',
        padding: '0.25rem',
        gap: '0.25rem',
        width: 'fit-content',
        marginLeft: 'auto',
      }}>
        <button style={toggleStyle('snowball')}  onClick={() => setStrategy('snowball')}>
          Snowball
        </button>
        <button style={toggleStyle('avalanche')} onClick={() => setStrategy('avalanche')}>
          Avalanche
        </button>
      </div>

      {/* Primary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Debt Free In
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
            {active.payoff_months === MAX_MONTHS_DISPLAY
              ? '50+ years'
              : `${active.payoff_months} months`}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {active.payoff_months < MAX_MONTHS_DISPLAY ? payoffDate : 'Increase allocation'}
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Includes projected equity vesting lump sums
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Interest
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--negative)', lineHeight: 1.1 }}>
            {fmt(active.total_interest_paid)}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {fmt(projection.monthly_allocation)}/mo allocation
          </div>
        </div>
      </div>

      {/* Comparative sub-text */}
      {Math.abs(interestDiff) > 1 && (
        <div style={{
          fontSize: '0.8125rem',
          color: otherSavesMore ? 'var(--positive)' : 'var(--text-secondary)',
          marginBottom: '1rem',
          padding: '0.5rem 0.75rem',
          background: otherSavesMore ? 'var(--positive-subtle, rgba(34,197,94,0.1))' : 'var(--surface-2)',
          borderRadius: '0.375rem',
        }}>
          {otherSavesMore
            ? `💡 ${otherLabel} saves you ${fmt(savingsAmount)} in interest`
            : `${otherLabel} would cost ${fmt(savingsAmount)} more`}
        </div>
      )}
      {Math.abs(interestDiff) <= 1 && active.payoff_months > 0 && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Both strategies cost the same in interest.
        </div>
      )}

      {/* Balance sparkline */}
      <div style={{ height: '160px' }}>
        <PayoffSparkline
          balances={active.monthly_balances}
          color={strategy === 'snowball' ? 'var(--accent)' : '#f59e0b'}
        />
      </div>
    </CollapsibleCard>
  );
}

// ── DebtTab ───────────────────────────────────────────────────────────────

interface DebtTabProps {
  data: DashboardPayload;
}

function DebtTab({ data }: DebtTabProps) {
  const debtAccounts = data.debt.accounts;

  const totalAbsBalance = debtAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const weightedRate =
    totalAbsBalance > 0
      ? debtAccounts.reduce((sum, a) => sum + Math.abs(a.balance) * a.rate, 0) / totalAbsBalance
      : 0;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Payoff Forecaster — top of tab */}
      <div style={{ marginBottom: '1rem' }}>
        <PayoffForecaster projection={data.debt.projection} />
      </div>

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
