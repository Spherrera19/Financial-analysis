import { useState, useEffect, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto';

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const API = 'http://localhost:8000';

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

type FundingStatus = 'full' | 'partial' | 'unfunded';

interface Allocation {
  target:    RoutingTarget;
  allocated: number;
  status:    FundingStatus;
  tierTotal: number;   // sum of all targets in the same tier (for pro-rata label)
  remaining: number;   // remaining balance when this tier was reached
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

  // Sort by priority, group into tiers
  const sorted  = [...targets].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  const tiers   = new Map<number, RoutingTarget[]>();
  for (const t of sorted) {
    if (!tiers.has(t.priority)) tiers.set(t.priority, []);
    tiers.get(t.priority)!.push(t);
  }

  let remaining = paycheck;
  const allocations: Allocation[] = [];

  for (const [, tier] of tiers) {
    const tierTotal = tier.reduce((s, t) => s + t.monthly_amount / divisor, 0);
    const tierRemaining = remaining; // snapshot before this tier consumes anything

    if (remaining >= tierTotal) {
      // Full funding for every target in this tier
      for (const t of tier) {
        allocations.push({
          target: t, allocated: t.monthly_amount / divisor,
          status: 'full', tierTotal, remaining: tierRemaining,
        });
      }
      remaining -= tierTotal;
    } else if (remaining > 0) {
      // Proportional allocation across this tier
      for (const t of tier) {
        const share = (t.monthly_amount / divisor) / tierTotal;
        allocations.push({
          target: t, allocated: Math.round(remaining * share * 100) / 100,
          status: 'partial', tierTotal, remaining: tierRemaining,
        });
      }
      remaining = 0;
    } else {
      // Nothing left
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

// Doughnut segment colours (one per target slot + overflow)
const SEGMENT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
];

// ---------------------------------------------------------------------------
// Section A — Paycheck Router
// ---------------------------------------------------------------------------

function PaycheckRouter({ targets }: { targets: RoutingTarget[] }) {
  const [amount, setAmount]       = useState('');
  const [halfMonth, setHalfMonth] = useState(false);
  const chartRef  = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);

  const paycheck = parseFloat(amount.replace(/,/g, '')) || 0;
  const hasAmount = paycheck > 0 && targets.length > 0;
  const { allocations, overflow } = hasAmount
    ? computeWaterfall(targets, paycheck, halfMonth)
    : { allocations: [], overflow: 0 };

  // Build chart
  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null; }
    if (!hasAmount) return;

    const labels: string[]  = [];
    const data:   number[]  = [];
    const colors: string[]  = [];

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
      colors.push('var(--accent-blue)');
    }
    if (data.length === 0) return; // entire paycheck unfunded (shouldn't happen)

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
      },
    });

    return () => { chartInst.current?.destroy(); chartInst.current = null; };
  }, [hasAmount, allocations, overflow, paycheck]);

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

        {/* Full / Half toggle */}
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

          {/* Allocation list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {allocations.map((a, i) => (
              <div
                key={i}
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

                {/* Allocated amount */}
                <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: STATUS_COLOR[a.status], whiteSpace: 'nowrap' }}>
                  {fmtDec(a.allocated)}
                </span>

                {/* Status chip */}
                <span style={{
                  fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem',
                  borderRadius: '999px', whiteSpace: 'nowrap',
                  color: STATUS_COLOR[a.status],
                  background: STATUS_BG[a.status],
                }}>
                  {STATUS_LABEL[a.status]}
                </span>
              </div>
            ))}

            {/* Overflow / Debt row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '28px 1fr auto auto',
              alignItems: 'center', gap: '0.625rem',
              padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', background: 'var(--bg-muted)', borderRadius: '0.25rem', padding: '0.1rem 0.3rem' }}>↩</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>Debt / Overflow</span>
              <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--accent-blue)', whiteSpace: 'nowrap' }}>{fmtDec(overflow)}</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '999px', color: 'var(--accent-blue)', background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)' }}>
                Send to Debt
              </span>
            </div>
          </div>
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

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function RoutingEditor({
  targets,
  onSaved,
}: {
  targets: RoutingTarget[];
  onSaved: () => void;
}) {
  const [draft, setDraft]       = useState<RoutingTarget[]>(() => targets.map(t => ({ ...t })));
  const [saveState, setSave]    = useState<SaveState>('idle');
  const [saveError, setSaveErr] = useState<string | null>(null);

  // Keep draft in sync when parent reloads (e.g. after save → refetch)
  useEffect(() => { setDraft(targets.map(t => ({ ...t }))); }, [targets]);

  const updateField = (idx: number, field: keyof RoutingTarget, value: string | number) => {
    setDraft(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
    setSave('idle');
  };

  const handleSave = async () => {
    setSave('saving'); setSaveErr(null);
    try {
      const res = await fetch(`${API}/api/routing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: draft }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      setSave('saved');
      onSaved(); // triggers parent refetch → updates draft via useEffect above
    } catch (e) {
      setSave('error');
      setSaveErr((e as Error).message);
    }
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
      {/* Header row */}
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
            <input style={inputStyle} value={t.name} onChange={e => updateField(i, 'name', e.target.value)} />
            <input style={inputStyle} value={t.category} onChange={e => updateField(i, 'category', e.target.value)} />
            <input style={inputStyle} type="number" min={1} max={99} value={t.priority} onChange={e => updateField(i, 'priority', parseInt(e.target.value) || 99)} />
            <input style={inputStyle} type="number" min={0} step={10} value={t.monthly_amount} onChange={e => updateField(i, 'monthly_amount', parseFloat(e.target.value) || 0)} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: saveState === 'saving' ? 'var(--border-subtle)' : 'var(--accent-blue)', color: saveState === 'saving' ? 'var(--text-muted)' : '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: saveState === 'saving' ? 'not-allowed' : 'pointer' }}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save Targets'}
        </button>
        {saveState === 'saved' && <span style={{ fontSize: '0.875rem', color: 'var(--accent-green)' }}>✓ Saved</span>}
        {saveState === 'error'  && <span style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Error: {saveError}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section C — Category Manager
// ---------------------------------------------------------------------------

interface CategoryRowDraft extends CategoryRow {
  _nameDraft:   string;
  _budgetDraft: string;
  _saveState:   SaveState;
  _saveError:   string | null;
  _confirmDel:  boolean;
}

function toDraft(c: CategoryRow): CategoryRowDraft {
  return { ...c, _nameDraft: c.name, _budgetDraft: String(c.monthly_budget), _saveState: 'idle', _saveError: null, _confirmDel: false };
}

function CategoryManager() {
  const [rows, setRows]         = useState<CategoryRowDraft[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadErr, setLoadErr]   = useState<string | null>(null);
  const [adding, setAdding]     = useState(false);
  const [newName, setNewName]   = useState('');
  const [addErr, setAddErr]     = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const res = await fetch(`${API}/api/categories`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as CategoryRow[];
      setRows(data.map(toDraft));
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const updateRow = (idx: number, patch: Partial<CategoryRowDraft>) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const handleSave = async (idx: number) => {
    const row = rows[idx];
    updateRow(idx, { _saveState: 'saving', _saveError: null });
    try {
      const body: Record<string, unknown> = {};
      if (row._nameDraft.trim() !== row.name) body.name = row._nameDraft.trim();
      const bval = parseFloat(row._budgetDraft);
      if (!isNaN(bval) && bval !== row.monthly_budget) body.monthly_budget = bval;

      const res = await fetch(`${API}/api/categories/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as CategoryRow;
      updateRow(idx, { ...toDraft(updated), _saveState: 'saved' });
    } catch (e) {
      updateRow(idx, { _saveState: 'error', _saveError: (e as Error).message });
    }
  };

  const handleDelete = async (idx: number) => {
    const row = rows[idx];
    try {
      const res = await fetch(`${API}/api/categories/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      await loadCategories();
    } catch (e) {
      updateRow(idx, { _saveState: 'error', _saveError: (e as Error).message, _confirmDel: false });
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAddErr(null);
    try {
      const res = await fetch(`${API}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, monthly_budget: 0 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      setNewName(''); setAdding(false);
      await loadCategories();
    } catch (e) {
      setAddErr((e as Error).message);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.375rem 0.5rem', borderRadius: '0.375rem',
    border: '1px solid var(--border-subtle)', background: 'var(--bg-base)',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
    boxSizing: 'border-box',
  };

  if (loading) return <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading categories…</p>;
  if (loadErr)  return <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Could not load categories: {loadErr}</p>;

  const COL = '1fr 130px 170px';

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0.5rem', padding: '0.4rem 0.875rem', background: 'var(--bg-muted)', borderRadius: '0.625rem 0.625rem 0 0', border: '1px solid var(--border-subtle)', borderBottom: 'none' }}>
        {['Category Name', 'Monthly Budget', 'Actions'].map(h => (
          <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-subtle)', borderTop: 'none', borderRadius: '0 0 0.625rem 0.625rem', overflow: 'hidden', marginBottom: '0.75rem' }}>
        {rows.map((row, idx) => (
          <div key={row.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.875rem' }}>
              {/* Name */}
              <input
                style={inputStyle}
                value={row._nameDraft}
                onChange={e => updateRow(idx, { _nameDraft: e.target.value, _saveState: 'idle', _saveError: null })}
              />

              {/* Budget */}
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.875rem', pointerEvents: 'none' }}>$</span>
                <input
                  style={{ ...inputStyle, paddingLeft: '1.375rem' }}
                  type="number" min={0} step={10}
                  value={row._budgetDraft}
                  onChange={e => updateRow(idx, { _budgetDraft: e.target.value, _saveState: 'idle', _saveError: null })}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <button
                  onClick={() => handleSave(idx)}
                  disabled={row._saveState === 'saving'}
                  style={{ padding: '0.3rem 0.625rem', borderRadius: '0.375rem', border: 'none', background: row._saveState === 'saving' ? 'var(--border-subtle)' : 'var(--accent-blue)', color: row._saveState === 'saving' ? 'var(--text-muted)' : '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: row._saveState === 'saving' ? 'not-allowed' : 'pointer' }}
                >
                  {row._saveState === 'saving' ? '…' : 'Save'}
                </button>
                {!row._confirmDel ? (
                  <button
                    onClick={() => updateRow(idx, { _confirmDel: true })}
                    style={{ padding: '0.3rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--accent-red)', fontSize: '0.8125rem', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>→ Uncategorized?</span>
                    <button onClick={() => handleDelete(idx)} style={{ padding: '0.2rem 0.5rem', borderRadius: '0.25rem', border: 'none', background: 'var(--accent-red)', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Yes</button>
                    <button onClick={() => updateRow(idx, { _confirmDel: false })} style={{ padding: '0.2rem 0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' }}>No</button>
                  </div>
                )}
                {row._saveState === 'saved' && <span style={{ fontSize: '0.75rem', color: 'var(--accent-green)' }}>✓</span>}
                {row._saveState === 'error'  && <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }} title={row._saveError ?? ''}>⚠</span>}
              </div>
            </div>

            {/* Inline error */}
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
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewName(''); setAddErr(null); } }}
              style={{ ...inputStyle, width: 240 }}
            />
            <button onClick={handleAdd} style={{ padding: '0.375rem 0.875rem', borderRadius: '0.375rem', border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Add</button>
            <button onClick={() => { setAdding(false); setNewName(''); setAddErr(null); }} style={{ padding: '0.375rem 0.625rem', borderRadius: '0.375rem', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
            {addErr && <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>{addErr}</span>}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// BudgetTab — main export
// ---------------------------------------------------------------------------

export function BudgetTab() {
  const [targets, setTargets]     = useState<RoutingTarget[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadErr, setLoadErr]     = useState<string | null>(null);

  const loadTargets = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const res = await fetch(`${API}/api/routing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTargets(await res.json() as RoutingTarget[]);
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTargets(); }, [loadTargets]);

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
        Adjust budget targets and manage transaction categories below.
      </p>

      {/* ── Section A: Paycheck Router ── */}
      <h2 style={sectionHeader}>Paycheck Router</h2>
      {loading && <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading routing targets…</p>}
      {loadErr  && <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Could not load targets: {loadErr}</p>}
      {!loading && !loadErr && <PaycheckRouter targets={targets} />}

      {divider}

      {/* ── Section B: Routing Targets editor ── */}
      <h2 style={sectionHeader}>Routing Targets</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Edit bucket names, categories, priority order, and monthly amounts. Priority 1 is funded first.
        Targets sharing the same priority receive proportional allocations on a shortfall.
      </p>
      {!loading && !loadErr && <RoutingEditor targets={targets} onSaved={loadTargets} />}

      {divider}

      {/* ── Section C: Category Manager ── */}
      <h2 style={sectionHeader}>Transaction Categories &amp; Budgets</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Set monthly budget targets for each spending category. Categories are synced automatically
        from your transaction data when you import a new CSV.
      </p>
      <CategoryManager />

      <div style={{ height: '2rem' }} />
    </div>
  );
}
