import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Chart from 'chart.js/auto';
import { KpiCard, CollapsibleCard } from '../components/cards';
import type { EquitySection, EquityVestSummary } from '../types';

const API = 'http://localhost:8000';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtShares(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtPrice(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysLabel(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

// ── Shared styles ───────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.4375rem',
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontSize: '0.9375rem',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '0.375rem',
  letterSpacing: '0.02em',
};

// ── Add Grant Modal ─────────────────────────────────────────────────────────

interface Tranche { date: string; shares: string; }

interface AddGrantModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddGrantModal({ onClose, onSuccess }: AddGrantModalProps) {
  const qc = useQueryClient();
  const [ticker,      setTicker]      = useState('');
  const [grantDate,   setGrantDate]   = useState('');
  const [totalShares, setTotalShares] = useState('');
  const [tranches,    setTranches]    = useState<Tranche[]>([{ date: '', shares: '' }]);
  const [formError,   setFormError]   = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: object) =>
      fetch(`${API}/api/equity/grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => {
        if (!r.ok) return r.json().then((e: { detail?: string }) => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equity'] });
      onSuccess();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const addTranche = () =>
    setTranches(prev => [...prev, { date: '', shares: '' }]);

  const removeTranche = (i: number) =>
    setTranches(prev => prev.filter((_, idx) => idx !== i));

  const updateTranche = (i: number, field: keyof Tranche, value: string) =>
    setTranches(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side validation
    if (!ticker.trim())       return setFormError('Ticker symbol is required.');
    if (!grantDate)           return setFormError('Grant date is required.');
    if (!totalShares || Number(totalShares) <= 0)
      return setFormError('Total shares must be a positive number.');
    if (tranches.some(t => !t.date || !t.shares || Number(t.shares) <= 0))
      return setFormError('All tranche rows need a valid date and share count.');

    mutation.mutate({
      ticker: ticker.trim().toUpperCase(),
      grant_date: grantDate,
      total_shares: Number(totalShares),
      vesting_schedule: tranches.map(t => ({
        date: t.date,
        shares: Number(t.shares),
      })),
    });
  };

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      {/* Panel — stop propagation so clicks inside don't close */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderRadius: '0.875rem',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-primary)' }}>
              Add Equity Grant
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              30% tax withholding will be applied automatically
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '1.25rem', lineHeight: 1,
              padding: '0.25rem', borderRadius: '0.375rem',
              transition: 'color 0.15s',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>

          {/* Row 1: Ticker + Grant Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={LABEL}>Ticker Symbol</label>
              <input
                style={INPUT}
                type="text"
                placeholder="e.g. AAPL"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                autoFocus
              />
            </div>
            <div>
              <label style={LABEL}>Grant Date</label>
              <input
                style={INPUT}
                type="date"
                value={grantDate}
                onChange={e => setGrantDate(e.target.value)}
              />
            </div>
          </div>

          {/* Total Shares */}
          <div>
            <label style={LABEL}>Total Shares Granted</label>
            <input
              style={INPUT}
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 200"
              value={totalShares}
              onChange={e => setTotalShares(e.target.value)}
            />
          </div>

          {/* Vesting Schedule */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
              <label style={{ ...LABEL, marginBottom: 0 }}>Vesting Schedule</label>
              <button
                type="button"
                onClick={addTranche}
                style={{
                  background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                  color: 'var(--accent-blue)',
                  border: 'none', borderRadius: '0.4375rem',
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.8125rem', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add Vest Date
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 32px', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span style={{ ...LABEL, marginBottom: 0 }}>Vest Date</span>
              <span style={{ ...LABEL, marginBottom: 0 }}>Shares</span>
              <span />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tranches.map((t, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 32px', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    style={INPUT}
                    type="date"
                    value={t.date}
                    onChange={e => updateTranche(i, 'date', e.target.value)}
                  />
                  <input
                    style={INPUT}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={t.shares}
                    onChange={e => updateTranche(i, 'shares', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeTranche(i)}
                    disabled={tranches.length === 1}
                    style={{
                      width: 32, height: 32,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: tranches.length === 1 ? 'transparent' : 'color-mix(in srgb, var(--accent-red, #ef4444) 12%, transparent)',
                      color: tranches.length === 1 ? 'var(--border-subtle)' : 'var(--accent-red, #ef4444)',
                      border: 'none', borderRadius: '0.375rem',
                      cursor: tranches.length === 1 ? 'default' : 'pointer',
                      fontSize: '1rem', lineHeight: 1, flexShrink: 0,
                    }}
                    aria-label="Remove tranche"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {tranches.length > 1 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                {tranches.length} tranches · {tranches.reduce((s, t) => s + (Number(t.shares) || 0), 0).toLocaleString()} shares scheduled
              </div>
            )}
          </div>

          {/* Error */}
          {formError && (
            <div style={{
              padding: '0.625rem 0.875rem',
              background: 'color-mix(in srgb, var(--accent-red, #ef4444) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-red, #ef4444) 30%, transparent)',
              borderRadius: '0.4375rem',
              color: 'var(--accent-red, #ef4444)',
              fontSize: '0.875rem',
            }}>
              {formError}
            </div>
          )}

          {/* Footer actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              style={{
                padding: '0.5625rem 1.25rem',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '0.5rem',
                fontWeight: 600, fontSize: '0.9375rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                padding: '0.5625rem 1.5rem',
                background: mutation.isPending ? 'var(--text-muted)' : 'var(--accent-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 600, fontSize: '0.9375rem',
                cursor: mutation.isPending ? 'default' : 'pointer',
                minWidth: 120,
                transition: 'background 0.15s',
              }}
            >
              {mutation.isPending ? 'Saving…' : 'Save Grant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Vesting cash-flow bar chart ─────────────────────────────────────────────

interface VestingChartProps {
  vests: EquityVestSummary[];
}

function VestingChart({ vests }: VestingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || vests.length === 0) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels:   vests.map(v => fmtDate(v.date)),
        datasets: [
          {
            label: 'Best (+1σ)',
            data: vests.map(v => v.projected_best),
            backgroundColor: 'rgba(34,197,94,0.25)',
            borderColor: 'rgba(34,197,94,0.8)',
            borderWidth: 1, borderRadius: 4,
          },
          {
            label: 'Average',
            data: vests.map(v => v.projected_avg),
            backgroundColor: 'rgba(59,130,246,0.5)',
            borderColor: 'rgba(59,130,246,0.9)',
            borderWidth: 1, borderRadius: 4,
          },
          {
            label: 'Worst (-1σ)',
            data: vests.map(v => v.projected_worst),
            backgroundColor: 'rgba(239,68,68,0.2)',
            borderColor: 'rgba(239,68,68,0.7)',
            borderWidth: 1, borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { color: 'var(--text-secondary)', font: { size: 11 }, boxWidth: 12 },
          },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y ?? 0)}` },
          },
        },
        scales: {
          x: { ticks: { color: 'var(--text-secondary)', font: { size: 11 } }, grid: { color: 'var(--border-subtle)' } },
          y: {
            ticks: { color: 'var(--text-secondary)', font: { size: 11 }, callback: v => fmt(Number(v)) },
            grid: { color: 'var(--border-subtle)' },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [vests]);

  if (vests.length === 0) return (
    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>No upcoming vests</div>
  );

  return <canvas ref={canvasRef} style={{ width: '100%', height: '260px' }} />;
}

// ── Price cone-of-uncertainty line chart ────────────────────────────────────

interface PriceConeChartProps {
  vests: EquityVestSummary[];  // filtered to one ticker, sorted chronologically
}

function PriceConeChart({ vests }: PriceConeChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || vests.length === 0) return;
    if (chartRef.current) chartRef.current.destroy();

    // Derive per-share prices from the pre-computed cash values
    const currentPrice = vests[0].net_shares > 0 ? vests[0].current_value / vests[0].net_shares : 0;
    const toPrice = (cash: number, shares: number) => shares > 0 ? cash / shares : 0;

    const xLabels   = ['Today', ...vests.map(v => fmtDate(v.date))];
    const avgPrices  = [currentPrice, ...vests.map(v => toPrice(v.projected_avg,   v.net_shares))];
    const bestPrices = [currentPrice, ...vests.map(v => toPrice(v.projected_best,  v.net_shares))];
    const worstPrices= [currentPrice, ...vests.map(v => toPrice(v.projected_worst, v.net_shares))];

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: xLabels,
        datasets: [
          {
            label: 'Best (+1σ)',
            data: bestPrices,
            borderColor: 'rgba(34,197,94,0.9)',
            backgroundColor: 'rgba(34,197,94,0.06)',
            borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
            fill: false, tension: 0.3,
          },
          {
            label: 'Average',
            data: avgPrices,
            borderColor: 'rgba(59,130,246,0.9)',
            backgroundColor: 'rgba(59,130,246,0.06)',
            borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
            fill: false, tension: 0.3,
          },
          {
            label: 'Worst (-1σ)',
            data: worstPrices,
            borderColor: 'rgba(239,68,68,0.8)',
            backgroundColor: 'rgba(239,68,68,0.04)',
            borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
            fill: false, tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { color: 'var(--text-secondary)', font: { size: 11 }, boxWidth: 12 },
          },
          tooltip: {
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtPrice(ctx.parsed.y ?? 0)}` },
          },
        },
        scales: {
          x: {
            ticks: { color: 'var(--text-secondary)', font: { size: 11 } },
            grid:  { color: 'var(--border-subtle)' },
          },
          y: {
            ticks: {
              color: 'var(--text-secondary)', font: { size: 11 },
              callback: v => fmtPrice(Number(v)),
            },
            grid: { color: 'var(--border-subtle)' },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [vests]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '220px' }} />;
}

// ── Vesting timeline table ──────────────────────────────────────────────────

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  fontSize: '0.6875rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  fontSize: '0.875rem', color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'middle',
};
const TD_MUTED: React.CSSProperties = { ...TD, color: 'var(--text-secondary)' };

function VestingTable({ vests }: { vests: EquityVestSummary[] }) {
  if (vests.length === 0) return (
    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>No upcoming vests found.</div>
  );
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr>
            <th style={TH}>Date</th>
            <th style={TH}>Ticker</th>
            <th style={{ ...TH, textAlign: 'right' }}>Net Shares</th>
            <th style={{ ...TH, textAlign: 'right' }}>Current Value</th>
            <th style={{ ...TH, textAlign: 'right' }}>Proj. Avg</th>
            <th style={{ ...TH, textAlign: 'right' }}>Best</th>
            <th style={{ ...TH, textAlign: 'right' }}>Worst</th>
            <th style={{ ...TH, textAlign: 'right' }}>Vol</th>
            <th style={{ ...TH, textAlign: 'right' }}>In</th>
          </tr>
        </thead>
        <tbody>
          {vests.map((v, i) => (
            <tr
              key={`${v.ticker}-${v.date}-${i}`}
              style={{ background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--border-subtle) 30%, transparent)' }}
            >
              <td style={TD}>{fmtDate(v.date)}</td>
              <td style={{ ...TD, fontWeight: 600, color: 'var(--accent-blue)' }}>{v.ticker}</td>
              <td style={{ ...TD, textAlign: 'right' }}>
                {fmtShares(v.net_shares)}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({fmtShares(v.gross_shares)} gross)
                </span>
              </td>
              <td style={{ ...TD, textAlign: 'right' }}>{fmt(v.current_value)}</td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{fmt(v.projected_avg)}</td>
              <td style={{ ...TD_MUTED, textAlign: 'right', color: '#22c55e' }}>{fmt(v.projected_best)}</td>
              <td style={{ ...TD_MUTED, textAlign: 'right', color: '#ef4444' }}>{fmt(v.projected_worst)}</td>
              <td style={{ ...TD_MUTED, textAlign: 'right' }}>{(v.annualized_volatility * 100).toFixed(0)}%</td>
              <td style={{ ...TD_MUTED, textAlign: 'right' }}>{daysLabel(v.days_until_vest)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onAddGrant }: { onAddGrant: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '40vh', gap: '1rem',
      padding: '2rem', textAlign: 'center',
    }}>
      <span style={{ fontSize: '2.5rem' }}>📈</span>
      <p style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        No equity grants yet
      </p>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.6, margin: 0 }}>
        Add your RSU or stock grants to see your projected vesting timeline, tax-adjusted net shares, and GBM price scenarios.
      </p>
      <button
        onClick={onAddGrant}
        style={{
          marginTop: '0.25rem',
          padding: '0.625rem 1.5rem',
          background: 'var(--accent-blue)',
          color: '#fff', border: 'none', borderRadius: '0.5rem',
          fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer',
        }}
      >
        + Add Your First Grant
      </button>
    </div>
  );
}

// ── Loading / error micro-states ────────────────────────────────────────────

function TabLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '0.75rem', color: 'var(--text-muted)' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-blue)',
        animation: 'spin 0.75s linear infinite',
      }} />
      <span>Fetching equity data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function TabError({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '0.5rem', color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>
      <span style={{ fontSize: '1.75rem' }}>⚠️</span>
      <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Failed to load equity data</p>
      <p style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: '#ef4444', margin: 0 }}>{message}</p>
    </div>
  );
}

// ── EquityTab ───────────────────────────────────────────────────────────────

function EquityTab() {
  const [showModal, setShowModal] = useState(false);

  const { data: equityData, isLoading: loading, isError, error } = useQuery<EquitySection>({
    queryKey: ['equity'],
    queryFn:  () =>
      fetch(`${API}/api/equity`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  const globalErrors = isError ? [(error as Error).message] : [];

  // Derived values — computed unconditionally (before early returns) to satisfy Rules of Hooks
  const upcoming_vests = equityData?.upcoming_vests ?? [];

  const tickerGroups = useMemo(() => {
    const map = new Map<string, EquityVestSummary[]>();
    for (const v of upcoming_vests) {
      if (!map.has(v.ticker)) map.set(v.ticker, []);
      map.get(v.ticker)!.push(v);
    }
    for (const vests of map.values()) {
      vests.sort((a, b) => a.date.localeCompare(b.date));
    }
    return [...map.entries()];
  }, [upcoming_vests]);

  // Early returns — all hooks are above this line
  if (loading) return (
    <>
      {showModal && <AddGrantModal onClose={() => setShowModal(false)} onSuccess={() => setShowModal(false)} />}
      <TabLoading />
    </>
  );

  if (!loading && globalErrors.length > 0 && !equityData) return (
    <>
      {showModal && <AddGrantModal onClose={() => setShowModal(false)} onSuccess={() => setShowModal(false)} />}
      <TabError message={globalErrors[globalErrors.length - 1]} />
    </>
  );

  if (!upcoming_vests.length) return (
    <>
      {showModal && <AddGrantModal onClose={() => setShowModal(false)} onSuccess={() => setShowModal(false)} />}
      <EmptyState onAddGrant={() => setShowModal(true)} />
    </>
  );

  const total_unvested_value   = equityData?.total_unvested_value   ?? 0;
  const next_vest_date         = equityData?.next_vest_date         ?? null;
  const projected_net_cash_12m = equityData?.projected_net_cash_12m ?? 0;

  const volByTicker = Object.fromEntries(
    upcoming_vests.map(v => [v.ticker, v.annualized_volatility])
  );

  return (
    <>
      {showModal && <AddGrantModal onClose={() => setShowModal(false)} onSuccess={() => setShowModal(false)} />}

      <div style={{ padding: '1.5rem' }}>

        {/* ── Global error banner ──────────────────────────────────────────── */}
        {globalErrors.length > 0 && (
          <div style={{
            padding: '0.75rem 1rem', marginBottom: '1rem',
            background: 'color-mix(in srgb, #ef4444 10%, transparent)',
            border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)',
            borderRadius: '0.5rem',
          }}>
            <div style={{ fontSize: '0.8125rem', color: '#ef4444', lineHeight: 1.5 }}>
              {globalErrors.map((msg, i) => <div key={i}>{msg}</div>)}
            </div>
          </div>
        )}

        {/* ── Tab header ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {Object.entries(volByTicker).map(([ticker, vol]) => (
              <div
                key={ticker}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.25rem 0.625rem', borderRadius: '999px',
                  background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                  fontSize: '0.8125rem', color: 'var(--accent-blue)', fontWeight: 600,
                }}
              >
                <span>{ticker}</span>
                <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>{(vol * 100).toFixed(0)}% vol</span>
              </div>
            ))}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              30% withholding · GBM ±1σ
            </span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '0.5rem 1.125rem',
              background: 'var(--accent-blue)',
              color: '#fff', border: 'none', borderRadius: '0.5rem',
              fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            + Add Grant
          </button>
        </div>

        {/* ── KPI row ─────────────────────────────────────────────────────── */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}
          className="grid-3"
        >
          <KpiCard label="Total Unvested Value"        value={fmt(total_unvested_value)}    variant="positive" />
          <KpiCard label="Next Vest Date"              value={next_vest_date ? fmtDate(next_vest_date) : '—'} variant="neutral" />
          <KpiCard label="Projected Net Cash (12 mo)"  value={fmt(projected_net_cash_12m)}  variant="positive" />
        </div>

        {/* ── Vesting timeline ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem' }}>
          <CollapsibleCard title="Vesting Timeline">
            <VestingTable vests={upcoming_vests} />
          </CollapsibleCard>
        </div>

        {/* ── Cash payout chart ────────────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem' }}>
          <CollapsibleCard title="Projected Cash Payouts">
            <div style={{ height: '260px' }}>
              <VestingChart vests={upcoming_vests} />
            </div>
          </CollapsibleCard>
        </div>

        {/* ── Price cone of uncertainty ─────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem' }}>
          <CollapsibleCard title="Market Data &amp; Price Projections">
            {tickerGroups.map(([ticker, tickerVests]) => {
              const currentPrice = tickerVests[0].net_shares > 0
                ? tickerVests[0].current_value / tickerVests[0].net_shares
                : 0;
              const vol = tickerVests[0].annualized_volatility;
              return (
                <div key={ticker} style={{ marginBottom: '1.75rem' }}>
                  {/* Ticker header row */}
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: '0.625rem',
                    marginBottom: '0.875rem', flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {ticker}
                    </span>
                    <span style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--accent-blue)', lineHeight: 1 }}>
                      {fmtPrice(currentPrice)}
                    </span>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      current price
                    </span>
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.8125rem', color: 'var(--text-muted)',
                      background: 'var(--surface-2)', padding: '0.2rem 0.5rem',
                      borderRadius: '0.375rem',
                    }}>
                      {(vol * 100).toFixed(0)}% annualized vol
                    </span>
                  </div>
                  <div style={{ height: '220px' }}>
                    <PriceConeChart vests={tickerVests} />
                  </div>
                </div>
              );
            })}
            {/* Methodology footnote */}
            <div style={{
              fontSize: '0.75rem', color: 'var(--text-muted)',
              paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)',
              lineHeight: 1.6,
            }}>
              Projection uses Geometric Brownian Motion (GBM) based on 2 years of historical daily log-returns.
              Best / Worst bands represent ±1 standard deviation of annualized volatility.
            </div>
          </CollapsibleCard>
        </div>

      </div>
    </>
  );
}

export { EquityTab };
