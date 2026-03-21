import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLedger } from '../context/LedgerContext';
import { motion, AnimatePresence } from 'framer-motion';
import Chart from 'chart.js/auto';
import type { DrawerFilter } from '../types';

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface RoutingTarget {
  id:             number | null;
  name:           string;
  monthly_amount: number;
  category:       string;
  priority:       number;
}

interface CategoryRow {
  id:             number;
  name:           string;
  monthly_budget: number;
}

interface CategoryProgress {
  name:           string;
  monthly_budget: number;
  current_spend:  number;
}

type FundingStatus = 'full' | 'partial' | 'unfunded';

interface Allocation {
  target:    RoutingTarget;
  allocated: number;
  status:    FundingStatus;
  tierTotal: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Waterfall calculation
// ---------------------------------------------------------------------------

function computeWaterfall(
  targets: RoutingTarget[],
  paycheck: number,
  halfMonth: boolean,
): { allocations: Allocation[]; overflow: number } {
  const divisor = halfMonth ? 2 : 1;

  const sorted = [...targets].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  const tiers  = new Map<number, RoutingTarget[]>();
  for (const t of sorted) {
    if (!tiers.has(t.priority)) tiers.set(t.priority, []);
    tiers.get(t.priority)!.push(t);
  }

  let remaining = paycheck;
  const allocations: Allocation[] = [];

  for (const [, tier] of tiers) {
    const tierTotal      = tier.reduce((s, t) => s + t.monthly_amount / divisor, 0);
    const tierRemaining  = remaining;

    if (remaining >= tierTotal) {
      for (const t of tier) {
        allocations.push({ target: t, allocated: t.monthly_amount / divisor, status: 'full', tierTotal, remaining: tierRemaining });
      }
      remaining -= tierTotal;
    } else if (remaining > 0) {
      for (const t of tier) {
        const share = (t.monthly_amount / divisor) / tierTotal;
        allocations.push({ target: t, allocated: Math.round(remaining * share * 100) / 100, status: 'partial', tierTotal, remaining: tierRemaining });
      }
      remaining = 0;
    } else {
      for (const t of tier) {
        allocations.push({ target: t, allocated: 0, status: 'unfunded', tierTotal, remaining: 0 });
      }
    }
  }

  return { allocations, overflow: Math.round(remaining * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDec(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_COLOR: Record<FundingStatus, string> = {
  full:     'var(--accent-green)',
  partial:  '#f59e0b',
  unfunded: 'var(--accent-red)',
};

const STATUS_BG: Record<FundingStatus, string> = {
  full:     'color-mix(in srgb, var(--accent-green) 12%, transparent)',
  partial:  'color-mix(in srgb, #f59e0b 12%, transparent)',
  unfunded: 'color-mix(in srgb, var(--accent-red) 12%, transparent)',
};

const STATUS_LABEL: Record<FundingStatus, string> = {
  full:     '✓ Fully Funded',
  partial:  '⚠ Pro-rata',
  unfunded: '✗ Unfunded',
};

const SEGMENT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
];

// ---------------------------------------------------------------------------
// Wealth Multiplier badge
// ---------------------------------------------------------------------------

interface WealthBadge {
  label: string;
  color: string;
  glowColor: string;
}

function getWealthBadge(overflowPct: number): WealthBadge {
  if (overflowPct >= 30) return { label: '🔥 S-Tier Wealth Builder', color: '#f97316', glowColor: 'rgba(249,115,22,0.45)' };
  if (overflowPct >= 21) return { label: '✦ Gold Optimizer',        color: '#f59e0b', glowColor: 'rgba(245,158,11,0.35)' };
  if (overflowPct >= 10) return { label: '◈ Bronze Saver',          color: '#a8a29e', glowColor: 'rgba(168,162,158,0.25)' };
  return                        { label: '→ Standard Routing',       color: 'var(--accent-blue)', glowColor: 'rgba(59,130,246,0.2)' };
}

// ---------------------------------------------------------------------------
// Framer-motion variants
// ---------------------------------------------------------------------------

const listContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const listRow = {
  hidden:  { opacity: 0, y: -14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 320, damping: 28 } },
};

// ---------------------------------------------------------------------------
// Section A — Paycheck Router
// ---------------------------------------------------------------------------

function PaycheckRouter({
  targets,
  onDrillDown,
}: {
  targets:     RoutingTarget[]
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}) {
  const [amount, setAmount]       = useState('');
  const [halfMonth, setHalfMonth] = useState(false);
  const chartRef  = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);

  const paycheck  = parseFloat(amount.replace(/,/g, '')) || 0;
  const hasAmount = paycheck > 0 && targets.length > 0;
  const { allocations, overflow } = hasAmount
    ? computeWaterfall(targets, paycheck, halfMonth)
    : { allocations: [], overflow: 0 };

  const overflowPct = paycheck > 0 ? (overflow / paycheck) * 100 : 0;
  const badge       = getWealthBadge(overflowPct);

  // Build doughnut chart
  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null; }
    if (!hasAmount) return;

    const labels: string[] = [];
    const data:   number[] = [];
    const colors: string[] = [];

    allocations.forEach((a, i) => {
      if (a.allocated > 0) {
        labels.push(a.target.name);
        data.push(a.allocated);
        colors.push(a.status === 'partial' ? '#f59e0b' : SEGMENT_COLORS[i % SEGMENT_COLORS.length]);
      }
    });
    if (overflow > 0) {
      labels.push('Debt / Overflow');
      data.push(overflow);
      colors.push(badge.color.startsWith('rgba') || badge.color.startsWith('#') ? badge.color : '#3b82f6');
    }
    if (data.length === 0) return;

    chartInst.current = new Chart(chartRef.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: 'var(--bg-card)' }] },
      options: {
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${fmtDec(ctx.parsed)} (${((ctx.parsed / paycheck) * 100).toFixed(1)}%)`,
            },
          },
        },
        onClick: (_event: unknown, elements: { index: number }[]) => {
          if (!elements.length) return
          const idx = elements[0].index
          if (idx < allocations.length) {
            const allocation = allocations[idx]
            // Guard: skip if routing target has no category mapped (empty string default)
            if (!allocation.target.category) return
            onDrillDown({
              category: allocation.target.category,
              label:    allocation.target.name,
            })
          }
          // "Debt / Overflow" slice is at index allocations.length — intentionally no drill-down
        },
        onHover: (_event: unknown, elements: unknown[]) => {
          if (chartInst.current) {
            (chartInst.current.canvas as HTMLCanvasElement).style.cursor =
              elements.length ? 'pointer' : 'default'
          }
        },
      },
    });

    return () => { chartInst.current?.destroy(); chartInst.current = null; };
  }, [hasAmount, allocations, overflow, paycheck, badge.color, onDrillDown]);

  const inputStyle: React.CSSProperties = {
    padding: '0.625rem 0.875rem',
    border: '1px solid var(--border-subtle)',
    borderRadius: '0.5rem',
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
    fontSize: '0.9375rem',
    outline: 'none',
  };

  return (
    <div>
      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.9375rem', pointerEvents: 'none' }}>$</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ ...inputStyle, width: '100%', paddingLeft: '1.75rem', boxSizing: 'border-box', fontSize: '1.375rem', fontWeight: 700 }}
          />
        </div>

        <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: '0.5rem', overflow: 'hidden' }}>
          {(['Full Month', 'Half Month'] as const).map((label, i) => {
            const active = (i === 0) === !halfMonth;
            return (
              <button
                key={label}
                onClick={() => setHalfMonth(i === 1)}
                style={{
                  padding: '0.5rem 1rem', border: 'none', cursor: 'pointer',
                  fontSize: '0.8125rem', fontWeight: active ? 600 : 400,
                  background: active ? 'var(--accent-blue)' : 'var(--bg-surface)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Visualizer ── */}
      {hasAmount && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2rem', alignItems: 'start', marginBottom: '1.5rem' }}>
          {/* Doughnut */}
          <div style={{ width: 180, flexShrink: 0 }}>
            <canvas ref={chartRef} width={180} height={180} />
          </div>

          {/* Staggered allocation list */}
          <motion.div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            variants={listContainer}
            initial="hidden"
            animate="visible"
            key={`${paycheck}-${halfMonth}`}
          >
            {allocations.map((a, i) => (
              <motion.div
                key={i}
                variants={listRow}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr auto auto',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  background: a.status === 'unfunded' ? 'color-mix(in srgb, var(--accent-red) 5%, var(--bg-surface))' : 'var(--bg-surface)',
                  border: `1px solid ${a.status === 'full' ? 'var(--border-subtle)' : STATUS_COLOR[a.status]}`,
                  opacity: a.status === 'unfunded' ? 0.8 : 1,
                }}
              >
                {/* Priority badge */}
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', background: 'var(--bg-muted)', borderRadius: '0.25rem', padding: '0.1rem 0.3rem' }}>
                  P{a.target.priority}
                </span>

                {/* Name + pro-rata formula */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.target.name}
                  </div>
                  {a.status === 'partial' && (
                    <div style={{ fontSize: '0.6875rem', color: '#f59e0b', marginTop: '0.1rem' }}>
                      ({fmt(a.target.monthly_amount / (halfMonth ? 2 : 1))} ÷ {fmt(a.tierTotal)}) × {fmt(a.remaining)} = {fmtDec(a.allocated)}
                    </div>
                  )}
                </div>

                <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: STATUS_COLOR[a.status], whiteSpace: 'nowrap' }}>
                  {fmtDec(a.allocated)}
                </span>

                <span style={{
                  fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                  borderRadius: '999px', whiteSpace: 'nowrap',
                  color: STATUS_COLOR[a.status], background: STATUS_BG[a.status],
                }}>
                  {STATUS_LABEL[a.status]}
                </span>
              </motion.div>
            ))}

            {/* ── Premium Overflow / Debt row ── */}
            <motion.div
              variants={listRow}
              style={{
                display: 'grid', gridTemplateColumns: '28px 1fr auto auto',
                alignItems: 'center', gap: '0.625rem',
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
                background: `color-mix(in srgb, ${badge.color} 8%, var(--bg-surface))`,
                border: `1.5px solid ${badge.color}`,
                boxShadow: `0 0 12px ${badge.glowColor}, inset 0 0 8px ${badge.glowColor}`,
                transition: 'box-shadow 0.3s ease',
              }}
            >
              {/* Icon */}
              <span style={{
                fontSize: '0.75rem', fontWeight: 700, textAlign: 'center',
                color: badge.color,
                background: `color-mix(in srgb, ${badge.color} 20%, transparent)`,
                borderRadius: '0.25rem', padding: '0.1rem 0.3rem',
              }}>↩</span>

              {/* Name + wealth multiplier label */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: badge.color }}>
                  Debt / Overflow
                </div>
                <div style={{ fontSize: '0.6875rem', color: badge.color, opacity: 0.8, marginTop: '0.1rem' }}>
                  {overflowPct.toFixed(1)}% of paycheck
                </div>
              </div>

              <span style={{ fontSize: '0.9375rem', fontWeight: 800, color: badge.color, whiteSpace: 'nowrap' }}>
                {fmtDec(overflow)}
              </span>

              {/* Wealth badge chip */}
              <span style={{
                fontSize: '0.6875rem', fontWeight: 700, padding: '0.2rem 0.6rem',
                borderRadius: '999px', whiteSpace: 'nowrap',
                color: badge.color,
                background: `color-mix(in srgb, ${badge.color} 18%, transparent)`,
                border: `1px solid color-mix(in srgb, ${badge.color} 40%, transparent)`,
              }}>
                {badge.label}
              </span>
            </motion.div>
          </motion.div>
        </div>
      )}

      {!hasAmount && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', background: 'var(--bg-surface)', borderRadius: '0.75rem', border: '1px solid var(--border-subtle)' }}>
          Enter a paycheck amount above to see your routing plan.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section B — Routing Targets editor
// ---------------------------------------------------------------------------

function RoutingEditor({ targets }: { targets: RoutingTarget[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<RoutingTarget[]>(() => targets.map(t => ({ ...t })));

  useEffect(() => { setDraft(targets.map(t => ({ ...t }))); }, [targets]);

  const saveMutation = useMutation({
    mutationFn: (ts: RoutingTarget[]) =>
      fetch(`${API}/api/routing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: ts }),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error((e as { detail?: string }).detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routing'] }),
  });

  const updateField = (idx: number, field: keyof RoutingTarget, value: string | number) => {
    setDraft(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.375rem 0.5rem', borderRadius: '0.375rem',
    border: '1px solid var(--border-subtle)', background: 'var(--bg-base)',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
    boxSizing: 'border-box',
  };

  const COL = '1fr 130px 80px 90px';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0.5rem', padding: '0.4rem 0.875rem', background: 'var(--bg-muted)', borderRadius: '0.625rem 0.625rem 0 0', border: '1px solid var(--border-subtle)', borderBottom: 'none' }}>
        {['Bucket Name', 'Category', 'Priority', 'Monthly ($)'].map(h => (
          <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-subtle)', borderTop: 'none', borderRadius: '0 0 0.625rem 0.625rem', overflow: 'hidden', marginBottom: '0.75rem' }}>
        {draft.map((t, i) => (
          <div
            key={i}
            style={{ display: 'grid', gridTemplateColumns: COL, gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.875rem', borderBottom: i < draft.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: 'var(--bg-surface)' }}
          >
            <input style={inputStyle} value={t.name}          onChange={e => updateField(i, 'name', e.target.value)} />
            <input style={inputStyle} value={t.category}      onChange={e => updateField(i, 'category', e.target.value)} />
            <input style={inputStyle} type="number" min={1} max={99} value={t.priority}       onChange={e => updateField(i, 'priority', parseInt(e.target.value) || 99)} />
            <input style={inputStyle} type="number" min={0} step={10} value={t.monthly_amount} onChange={e => updateField(i, 'monthly_amount', parseFloat(e.target.value) || 0)} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => saveMutation.mutate(draft)}
          disabled={saveMutation.isPending}
          style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: saveMutation.isPending ? 'var(--border-subtle)' : 'var(--accent-blue)', color: saveMutation.isPending ? 'var(--text-muted)' : '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: saveMutation.isPending ? 'not-allowed' : 'pointer' }}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Targets'}
        </button>
        {saveMutation.isSuccess && <span style={{ fontSize: '0.875rem', color: 'var(--accent-green)' }}>✓ Saved</span>}
        {saveMutation.isError   && <span style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Error: {saveMutation.error?.message}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section C — Live Pacing (health bars)
// ---------------------------------------------------------------------------

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function HealthBar({ item }: { item: CategoryProgress }) {
  const now           = new Date();
  const daysInMonth   = getDaysInMonth(now.getFullYear(), now.getMonth());
  const timeElapsed   = now.getDate() / daysInMonth;           // 0–1
  const spendPct      = item.current_spend / item.monthly_budget; // 0–1+

  // Color logic
  let barColor: string;
  if (spendPct >= 1.0) {
    barColor = '#ef4444'; // red — over budget
  } else if (spendPct > timeElapsed) {
    barColor = '#f59e0b'; // amber — ahead of pace
  } else {
    barColor = '#10b981'; // green — on/under pace
  }

  const fillPct   = Math.min(spendPct * 100, 100);
  const ghostLeft = Math.min(timeElapsed * 100, 100);

  return (
    <div style={{ marginBottom: '0.875rem' }}>
      {/* Label row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-primary)' }}>{item.name}</span>
        <span style={{ fontSize: '0.75rem', color: spendPct >= 1 ? '#ef4444' : 'var(--text-muted)', fontWeight: spendPct >= 1 ? 700 : 400 }}>
          {fmtDec(item.current_spend)} / {fmt(item.monthly_budget)}
          {spendPct >= 1 && <span style={{ marginLeft: '0.35rem' }}>⚠</span>}
        </span>
      </div>

      {/* Bar track */}
      <div style={{ position: 'relative', height: 10, borderRadius: 999, background: 'var(--bg-muted)', overflow: 'visible' }}>
        {/* Fill */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            borderRadius: 999,
            background: barColor,
            boxShadow: spendPct >= 1 ? `0 0 8px ${barColor}88` : undefined,
          }}
        />

        {/* Ghost car — time elapsed marker */}
        <div
          title={`${Math.round(timeElapsed * 100)}% of month elapsed`}
          style={{
            position: 'absolute',
            top: -3,
            left: `${ghostLeft}%`,
            transform: 'translateX(-50%)',
            width: 2,
            height: 16,
            borderRadius: 2,
            background: 'var(--text-muted)',
            opacity: 0.6,
            zIndex: 2,
          }}
        />
      </div>

      {/* Sub-label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
        <span style={{ fontSize: '0.6875rem', color: barColor, fontWeight: 600 }}>
          {spendPct >= 1
            ? `${((spendPct - 1) * 100).toFixed(0)}% over budget`
            : spendPct > timeElapsed
              ? `${((spendPct - timeElapsed) * 100).toFixed(0)}% ahead of pace`
              : `${((timeElapsed - spendPct) * 100).toFixed(0)}% under pace`}
        </span>
        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
          Day {now.getDate()} / {daysInMonth}
        </span>
      </div>
    </div>
  );
}

function LivePacing() {
  const { selectedLedgerId } = useLedger();
  const { data: items = [], isLoading: loading, error } =
    useQuery<CategoryProgress[]>({
      queryKey: ['categories/progress', selectedLedgerId],
      queryFn:  () =>
        fetch(`${API}/api/categories/progress${selectedLedgerId != null ? `?ledger_id=${selectedLedgerId}` : ''}`)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    });

  if (loading) return <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading live spend data…</p>;
  if (error)   return <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Could not load: {(error as Error).message}</p>;

  if (items.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '0.75rem', border: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💰</div>
        <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>No budgets set yet</p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Switch to <strong>Edit Budgets</strong> to set monthly targets for your categories.
          Only categories with a budget &gt; $0 appear here.
        </p>
      </div>
    );
  }

  // Sort: over-budget first, then by pacing deficit
  const now         = new Date();
  const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
  const timeElapsed = now.getDate() / daysInMonth;

  const sorted = [...items].sort((a, b) => {
    const pctA = a.current_spend / a.monthly_budget;
    const pctB = b.current_spend / b.monthly_budget;
    // Over-budget items bubble to top
    if (pctA >= 1 && pctB < 1) return -1;
    if (pctB >= 1 && pctA < 1) return 1;
    // Then sort by how far over pace (most problematic first)
    return (pctB - timeElapsed) - (pctA - timeElapsed);
  });

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {[
          { color: '#10b981', label: 'Under pace — on track' },
          { color: '#f59e0b', label: 'Ahead of pace — watch it' },
          { color: '#ef4444', label: 'Over budget' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div style={{ width: 2, height: 12, background: 'var(--text-muted)', opacity: 0.6, borderRadius: 2, flexShrink: 0 }} />
          Pace marker (today)
        </div>
      </div>

      {sorted.map(item => (
        <HealthBar key={item.name} item={item} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section C — Category Manager (Edit Budgets)
// ---------------------------------------------------------------------------

interface CategoryRowDraft extends CategoryRow {
  _nameDraft:   string;
  _budgetDraft: string;
  _saveState:   'idle' | 'saving' | 'saved' | 'error';
  _saveError:   string | null;
  _confirmDel:  boolean;
}

function toDraft(c: CategoryRow): CategoryRowDraft {
  return { ...c, _nameDraft: c.name, _budgetDraft: String(c.monthly_budget), _saveState: 'idle', _saveError: null, _confirmDel: false };
}

function CategoryManager() {
  const qc = useQueryClient();
  const { selectedLedgerId } = useLedger();
  const [catTab, setCatTab] = useState<'pacing' | 'budgets'>('pacing');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: rawRows = [], isLoading: loading, error: loadErr } =
    useQuery<CategoryRow[]>({
      queryKey: ['categories', selectedLedgerId],
      queryFn:  () =>
        fetch(`${API}/api/categories${selectedLedgerId != null ? `?ledger_id=${selectedLedgerId}` : ''}`)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    });

  // Local draft state layered on top of server data
  const [draftOverrides, setDraftOverrides] = useState<Map<number, Partial<CategoryRowDraft>>>(new Map());

  // Merge server rows with local draft overrides
  const rows: CategoryRowDraft[] = rawRows.map(r => {
    const base = toDraft(r);
    const override = draftOverrides.get(r.id);
    return override ? { ...base, ...override } : base;
  });

  const updateRow = (id: number, patch: Partial<CategoryRowDraft>) =>
    setDraftOverrides(prev => {
      const next = new Map(prev);
      next.set(id, { ...(next.get(id) ?? {}), ...patch });
      return next;
    });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CategoryRow> }) =>
      fetch(`${API}/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error((e as { detail?: string }).detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: (_data, { id }) => {
      // Clear draft overrides for this row and refetch
      setDraftOverrides(prev => { const next = new Map(prev); next.delete(id); return next; });
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err, { id }) => {
      updateRow(id, { _saveState: 'error', _saveError: (err as Error).message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${API}/api/categories/${id}`, { method: 'DELETE' })
        .then(r => {
          if (!r.ok) return r.json().then(e => Promise.reject(new Error((e as { detail?: string }).detail ?? `HTTP ${r.status}`)));
          return r.json();
        }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (err, id) => {
      updateRow(id, { _saveState: 'error', _saveError: (err as Error).message, _confirmDel: false });
    },
  });

  const addMutation = useMutation({
    mutationFn: (name: string) =>
      fetch(`${API}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, monthly_budget: 0 }),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error((e as { detail?: string }).detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => {
      setNewName('');
      setAdding(false);
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const handleSave = (row: CategoryRowDraft) => {
    const body: Partial<CategoryRow> = {};
    if (row._nameDraft.trim() !== row.name) body.name = row._nameDraft.trim();
    const bval = parseFloat(row._budgetDraft);
    if (!isNaN(bval) && bval !== row.monthly_budget) body.monthly_budget = bval;
    updateRow(row.id, { _saveState: 'saving', _saveError: null });
    updateMutation.mutate({ id: row.id, body });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.375rem 0.5rem', borderRadius: '0.375rem',
    border: '1px solid var(--border-subtle)', background: 'var(--bg-base)',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
    boxSizing: 'border-box',
  };

  const COL = '1fr 130px 170px';

  // ── Tab switcher ──
  const TabBar = () => (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: '0.625rem', overflow: 'hidden', width: 'fit-content', marginBottom: '1.25rem' }}>
      {([['pacing', 'Live Pacing'], ['budgets', 'Edit Budgets']] as const).map(([id, label]) => {
        const active = catTab === id;
        return (
          <button
            key={id}
            onClick={() => setCatTab(id)}
            style={{
              padding: '0.5rem 1.125rem', border: 'none', cursor: 'pointer',
              fontSize: '0.8125rem', fontWeight: active ? 600 : 400,
              background: active ? 'var(--accent-blue)' : 'var(--bg-surface)',
              color: active ? '#fff' : 'var(--text-secondary)',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <TabBar />

      <AnimatePresence mode="wait">
        {catTab === 'pacing' ? (
          <motion.div
            key="pacing"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <LivePacing />
          </motion.div>
        ) : (
          <motion.div
            key="budgets"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {loading  && <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading categories…</p>}
            {loadErr  && <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Could not load categories: {(loadErr as Error).message}</p>}

            {!loading && !loadErr && (
              <>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0.5rem', padding: '0.4rem 0.875rem', background: 'var(--bg-muted)', borderRadius: '0.625rem 0.625rem 0 0', border: '1px solid var(--border-subtle)', borderBottom: 'none' }}>
                  {['Category Name', 'Monthly Budget', 'Actions'].map(h => (
                    <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                  ))}
                </div>

                <div style={{ border: '1px solid var(--border-subtle)', borderTop: 'none', borderRadius: '0 0 0.625rem 0.625rem', overflow: 'hidden', marginBottom: '0.75rem' }}>
                  {rows.map((row) => (
                    <div key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.875rem' }}>
                        <input
                          style={inputStyle}
                          value={row._nameDraft}
                          onChange={e => updateRow(row.id, { _nameDraft: e.target.value, _saveState: 'idle', _saveError: null })}
                        />

                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.875rem', pointerEvents: 'none' }}>$</span>
                          <input
                            style={{ ...inputStyle, paddingLeft: '1.375rem' }}
                            type="number" min={0} step={10}
                            value={row._budgetDraft}
                            onChange={e => updateRow(row.id, { _budgetDraft: e.target.value, _saveState: 'idle', _saveError: null })}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleSave(row)}
                            disabled={row._saveState === 'saving'}
                            style={{ padding: '0.3rem 0.625rem', borderRadius: '0.375rem', border: 'none', background: row._saveState === 'saving' ? 'var(--border-subtle)' : 'var(--accent-blue)', color: row._saveState === 'saving' ? 'var(--text-muted)' : '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: row._saveState === 'saving' ? 'not-allowed' : 'pointer' }}
                          >
                            {row._saveState === 'saving' ? '…' : 'Save'}
                          </button>
                          {!row._confirmDel ? (
                            <button
                              onClick={() => updateRow(row.id, { _confirmDel: true })}
                              style={{ padding: '0.3rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--accent-red)', fontSize: '0.8125rem', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>→ Uncategorized?</span>
                              <button onClick={() => deleteMutation.mutate(row.id)} style={{ padding: '0.2rem 0.5rem', borderRadius: '0.25rem', border: 'none', background: 'var(--accent-red)', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Yes</button>
                              <button onClick={() => updateRow(row.id, { _confirmDel: false })} style={{ padding: '0.2rem 0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}>No</button>
                            </div>
                          )}
                          {row._saveState === 'saved' && <span style={{ fontSize: '0.75rem', color: 'var(--accent-green)' }}>✓</span>}
                          {row._saveState === 'error'  && <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }} title={row._saveError ?? ''}>⚠</span>}
                        </div>
                      </div>

                      {row._saveState === 'error' && row._saveError && (
                        <div style={{ padding: '0.25rem 0.875rem 0.375rem', fontSize: '0.75rem', color: 'var(--accent-red)' }}>{row._saveError}</div>
                      )}
                    </div>
                  ))}

                  {/* Add new row */}
                  {adding ? (
                    <div style={{ padding: '0.5rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)' }}>
                      <input
                        autoFocus
                        placeholder="New category name…"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addMutation.mutate(newName.trim()); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                        style={{ ...inputStyle, width: 240 }}
                      />
                      <button onClick={() => addMutation.mutate(newName.trim())} disabled={addMutation.isPending} style={{ padding: '0.375rem 0.875rem', borderRadius: '0.375rem', border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Add</button>
                      <button onClick={() => { setAdding(false); setNewName(''); }} style={{ padding: '0.375rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
                      {addMutation.isError && <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>{(addMutation.error as Error).message}</span>}
                    </div>
                  ) : (
                    <div style={{ padding: '0.5rem 0.875rem', background: 'var(--bg-surface)' }}>
                      <button
                        onClick={() => setAdding(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.8125rem', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span> Add Category
                      </button>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Renaming a category updates all historical transactions automatically. Deleting reassigns transactions to 'Uncategorized'.
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BudgetTab — main export
// ---------------------------------------------------------------------------

interface BudgetTabProps {
  onDrillDown: (f: Omit<DrawerFilter, 'period'>) => void
}

export function BudgetTab({ onDrillDown }: BudgetTabProps) {
  const { selectedLedgerId } = useLedger();
  const { data: targets = [], isLoading: loading, error: loadErr } =
    useQuery<RoutingTarget[]>({
      queryKey: ['routing', selectedLedgerId],
      queryFn:  () =>
        fetch(`${API}/api/routing${selectedLedgerId != null ? `?ledger_id=${selectedLedgerId}` : ''}`)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    });

  const sectionHeader: React.CSSProperties = {
    fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem',
  };

  const divider = <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2rem 0' }} />;

  return (
    <div style={{ maxWidth: 740 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
        Budget &amp; Routing
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Route a paycheck through your funding buckets using strict priority ordering.
        Adjust budget targets and track live spending pace below.
      </p>

      {/* ── Section A: Paycheck Router ── */}
      <h2 style={sectionHeader}>Paycheck Router</h2>
      {loading  && <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading routing targets…</p>}
      {loadErr  && <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Could not load targets: {loadErr?.message}</p>}
      {!loading && !loadErr && <PaycheckRouter targets={targets} onDrillDown={onDrillDown} />}

      {divider}

      {/* ── Section B: Routing Targets editor ── */}
      <h2 style={sectionHeader}>Routing Targets</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Edit bucket names, categories, priority order, and monthly amounts. Priority 1 is funded first.
        Targets sharing the same priority receive proportional allocations on a shortfall.
      </p>
      {!loading && !loadErr && <RoutingEditor targets={targets} />}

      {divider}

      {/* ── Section C: Category Manager ── */}
      <h2 style={sectionHeader}>Transaction Categories &amp; Budgets</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Track live spending pace against monthly targets, or edit category budgets.
        The pace marker shows where you <em>should</em> be given today's date.
      </p>
      <CategoryManager />

      <div style={{ height: '2rem' }} />
    </div>
  );
}
