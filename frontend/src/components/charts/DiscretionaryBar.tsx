import type { CashFlowWaterfall } from '../../types';

interface DiscretionaryBarProps {
  waterfall: CashFlowWaterfall;
}

function fmt(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return (n / total * 100).toFixed(1) + '%';
}

export function DiscretionaryBar({ waterfall }: DiscretionaryBarProps) {
  const {
    total_income,
    necessary_spending,
    true_discretionary_income,
    optional_spending,
    opt_subtotal,
    oth_subtotal,
    extra_debt_payments,
    unspent_free_cash,
  } = waterfall;

  // Guard against zero income (no data yet or empty period)
  if (total_income === 0) {
    return (
      <div className="w-full rounded-lg overflow-hidden" style={{ height: 52 }}>
        <div
          className="w-full h-full flex items-center justify-center text-sm"
          style={{ backgroundColor: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}
        >
          No income data for this period
        </div>
      </div>
    );
  }

  // Width as percentage of total_income (not applied to unspent — uses flex:1)
  const w = (value: number) => `${(value / total_income * 100).toFixed(4)}%`;

  const isOverspent =
    optional_spending + extra_debt_payments > true_discretionary_income &&
    true_discretionary_income >= 0;

  return (
    <div style={{ padding: '0.25rem 0' }}>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'var(--color-text-muted)', display: 'inline-block', opacity: 0.5 }} />
          Necessary
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#f59e0b', display: 'inline-block' }} />
          Optional
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#f43f5e', display: 'inline-block' }} />
          Extra Debt
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#10b981', display: 'inline-block' }} />
          Unspent / Savings
        </span>
      </div>

      {/* Bar */}
      <div
        className="w-full flex rounded-lg overflow-hidden"
        style={{ height: 52 }}
        role="img"
        aria-label={`Income breakdown: ${fmt(necessary_spending)} necessary, ${fmt(true_discretionary_income)} free cash`}
      >
        {/* Necessary block */}
        <div
          title={`Necessary: ${fmt(necessary_spending)} (${pct(necessary_spending, total_income)} of income)\nIncludes rent, utilities, groceries, insurance, and minimum debt payments.`}
          style={{
            width: w(necessary_spending),
            backgroundColor: 'var(--color-text-muted)',
            opacity: 0.45,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            cursor: 'help',
          }}
        >
          <span
            className="text-xs font-semibold px-1"
            style={{ color: 'white' }}
          >
            {necessary_spending > total_income * 0.06 ? `Necessary ${pct(necessary_spending, total_income)}` : ''}
          </span>
        </div>

        {/* Optional spending block */}
        {optional_spending > 0 && (
          <div
            title={`Optional: ${fmt(optional_spending)} (${pct(optional_spending, total_income)} of income)\nOptional ${fmt(opt_subtotal)} + Other ${fmt(oth_subtotal)}`}
            style={{
              width: w(isOverspent ? Math.min(optional_spending, true_discretionary_income) : optional_spending),
              backgroundColor: '#f59e0b',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'help',
            }}
          >
            <span className="text-xs font-semibold px-1 text-white">
              {optional_spending > total_income * 0.06 ? pct(optional_spending, total_income) : ''}
            </span>
          </div>
        )}

        {/* Extra debt block — suppressed when overspent (cap already consumes full discretionary) */}
        {extra_debt_payments > 0 && !isOverspent && (
          <div
            title={`Extra Debt Payments: ${fmt(extra_debt_payments)} (${pct(extra_debt_payments, total_income)} of income)\nDebt paid above minimum payments — accelerating payoff.`}
            style={{
              width: w(extra_debt_payments),
              backgroundColor: '#f43f5e',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'help',
            }}
          >
            <span className="text-xs font-semibold px-1 text-white">
              {extra_debt_payments > total_income * 0.06 ? pct(extra_debt_payments, total_income) : ''}
            </span>
          </div>
        )}

        {/* Unspent / Savings — flex:1 absorbs floating-point residual; replaced by Overspent block when over budget */}
        {isOverspent ? (
          <div
            title={`Overspent: optional + extra debt exceeds discretionary income by ${fmt(optional_spending + extra_debt_payments - true_discretionary_income)}.`}
            style={{
              flex: 1,
              backgroundColor: '#e11d48',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'help',
              minWidth: 0,
            }}
          >
            <span className="text-xs font-semibold px-1 text-white">
              Over budget
            </span>
          </div>
        ) : (
          <div
            title={`Unspent / Savings: ${fmt(unspent_free_cash)} (${pct(unspent_free_cash, total_income)} of income)\nFree cash not spent on optional items or extra debt.`}
            style={{
              flex: 1,
              backgroundColor: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'help',
              minWidth: 0,
            }}
          >
            <span className="text-xs font-semibold px-1 text-white">
              {unspent_free_cash > total_income * 0.06 ? `Savings ${pct(unspent_free_cash, total_income)}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Sub-labels row */}
      <div className="flex justify-between mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span>{fmt(necessary_spending)} necessary</span>
        {isOverspent ? (
          <span className="font-semibold" style={{ color: '#e11d48' }}>budget exceeded</span>
        ) : (
          <span className="font-semibold" style={{ color: '#10b981' }}>
            {fmt(true_discretionary_income)} free cash
          </span>
        )}
      </div>
    </div>
  );
}
