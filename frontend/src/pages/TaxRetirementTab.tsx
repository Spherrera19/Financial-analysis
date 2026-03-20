import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import type { RetirementAccount } from '../types';
import { RetirementCard } from '../components/cards/RetirementCard';
import { RetirementModal } from '../components/modals/RetirementModal';

const API = 'http://localhost:8000';
const MARGINAL_RATE = 0.24; // Federal marginal tax rate assumption for tax shield estimate

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TaxRetirementTab() {
  const { data: accounts = [], isLoading, error, refetch } = useQuery<RetirementAccount[]>({
    queryKey: ['retirement'],
    queryFn: () => fetch(`${API}/api/retirement`).then(r => r.json()),
  });

  // null = closed | 'new' = create mode | RetirementAccount = edit mode
  const [modalAccount, setModalAccount] = useState<RetirementAccount | 'new' | null>(null);

  const steven = accounts.filter(a => a.owner === 'Steven');
  const wife   = accounts.filter(a => a.owner === 'Wife');

  // KPI calculations
  const totalContributions = accounts.reduce((s, a) => s + a.ytd_contributions, 0);
  const totalShield        = totalContributions * MARGINAL_RATE;
  const matchCount         = accounts.filter(
    a => a.employer_match_target !== null && a.ytd_contributions >= a.employer_match_target!
  ).length;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        Loading retirement data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'var(--accent-red)' }}>
        Failed to load retirement accounts.
      </div>
    );
  }

  return (
    <div>
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Tax Shield
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Tax-advantaged contribution tracker
          </p>
        </div>
        <button
          onClick={() => setModalAccount('new')}
          style={{
            padding: '0.625rem 1.25rem',
            background: 'var(--accent-blue)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 700,
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          + Add Account
        </button>
      </div>

      {/* ── KPI Scoreboard ─────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-blue), #6366f1)',
        borderRadius: '1rem',
        padding: '2rem',
        marginBottom: '2rem',
        color: '#fff',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8, marginBottom: '0.5rem' }}>
          Total Tax Shield
        </div>
        <div style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, marginBottom: '0.5rem' }}>
          {fmt(totalShield)}
        </div>
        <div style={{ fontSize: '0.875rem', opacity: 0.75, marginBottom: '1.5rem' }}>
          Estimated taxes saved YTD · Based on 24% marginal rate
        </div>

        {/* Secondary KPIs */}
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{fmt(totalContributions)}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>Total YTD Contributions</div>
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{accounts.length}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>Active Accounts</div>
          </div>
          {matchCount > 0 && (
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>🏆 {matchCount}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>Matches Secured</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {accounts.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '4rem 2rem',
          border: '2px dashed var(--border-subtle)',
          borderRadius: '1rem',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛡️</div>
          <p style={{ fontSize: '1rem', margin: 0 }}>No accounts yet. Add one to start tracking your Tax Shield.</p>
        </div>
      )}

      {/* ── Player grid ────────────────────────────────────────────────── */}
      {accounts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Steven */}
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Steven
            </h2>
            {steven.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No accounts.</p>
            ) : (
              steven.map(acc => (
                <RetirementCard
                  key={acc.id}
                  account={acc}
                  onEdit={setModalAccount}
                />
              ))
            )}
          </div>

          {/* Wife */}
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Wife
            </h2>
            {wife.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No accounts.</p>
            ) : (
              wife.map(acc => (
                <RetirementCard
                  key={acc.id}
                  account={acc}
                  onEdit={setModalAccount}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalAccount !== null && (
          <RetirementModal
            account={modalAccount === 'new' ? null : modalAccount}
            onClose={() => setModalAccount(null)}
            onSaved={() => refetch()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
