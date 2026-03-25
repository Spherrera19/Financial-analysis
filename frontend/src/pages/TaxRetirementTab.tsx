import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { HelpCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { RetirementAccount, UserProfile } from '../types';
import { RetirementCard } from '../components/cards/RetirementCard';
import { RetirementModal } from '../components/modals/RetirementModal';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const MARGINAL_RATE = 0.24; // Federal marginal tax rate assumption for tax shield estimate

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TaxRetirementTab() {
  const { data: accounts = [], isLoading, error, refetch } = useQuery<RetirementAccount[]>({
    queryKey: ['retirement'],
    queryFn: () => fetch(`${API}/api/retirement`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
  });

  const { data: profiles = [] } = useQuery<UserProfile[]>({
    queryKey: ['profiles'],
    queryFn: () => fetch(`${API}/api/profiles`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
  });

  // null = closed | 'new' = create mode | RetirementAccount = edit mode
  const [modalAccount, setModalAccount] = useState<RetirementAccount | 'new' | null>(null);

  // KPI calculations
  const totalContributions = accounts.reduce((s, a) => s + a.ytd_contributions, 0);
  const totalShield        = totalContributions * MARGINAL_RATE;
  const matchCount         = accounts.filter(
    a => a.employer_match_target !== null && a.ytd_contributions >= a.employer_match_target!
  ).length;

  if (isLoading) {
    return (
      <div className="flex justify-center p-16 text-[var(--text-muted)]">
        Loading retirement data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-[var(--accent-red)]">
        Failed to load retirement accounts.
      </div>
    );
  }

  return (
    <div>
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="m-0 text-2xl font-extrabold text-[var(--text-primary)]">
            Tax Shield
          </h1>
          <p className="mt-1 mb-0 text-sm text-[var(--text-muted)]">
            Tax-advantaged contribution tracker
          </p>
        </div>
        <button
          onClick={() => setModalAccount('new')}
          className="px-5 py-2.5 bg-[var(--accent-blue)] text-white border-none rounded-lg font-bold text-[0.9375rem] cursor-pointer"
        >
          + Add Account
        </button>
      </div>

      {/* ── KPI Scoreboard ─────────────────────────────────────────────── */}
      <div id="tour-tax-cards" className="bg-[linear-gradient(135deg,var(--accent-blue),#6366f1)] rounded-2xl p-8 mb-8 text-white">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div className="text-xs font-semibold tracking-[0.1em] uppercase opacity-80">
            Total Tax Shield
          </div>
          <div title="Dynamically calculates the exact dollar amount your 401k/IRA contributions are legally protecting from the IRS." style={{ display: 'flex', cursor: 'help', opacity: 0.8 }}>
            <HelpCircle size={14} strokeWidth={2} />
          </div>
        </div>
        <div className="text-5xl font-black leading-none mb-2">
          {fmt(totalShield)}
        </div>
        <div className="text-sm opacity-75 mb-6">
          Estimated taxes saved YTD · Based on 24% marginal rate
        </div>

        {/* Secondary KPIs */}
        <div className="flex gap-8 flex-wrap">
          <div>
            <div className="text-xl font-bold">{fmt(totalContributions)}</div>
            <div className="text-xs opacity-75">Total YTD Contributions</div>
          </div>
          <div>
            <div className="text-xl font-bold">{accounts.length}</div>
            <div className="text-xs opacity-75">Active Accounts</div>
          </div>
          {matchCount > 0 && (
            <div>
              <div className="text-xl font-bold">🏆 {matchCount}</div>
              <div className="text-xs opacity-75">Matches Secured</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {accounts.length === 0 && (
        <div className="text-center py-16 px-8 border-2 border-dashed border-[var(--border-subtle)] rounded-2xl text-[var(--text-muted)]">
          <div className="text-[2.5rem] mb-4">🛡️</div>
          <p className="text-base m-0">No accounts yet. Add one to start tracking your Tax Shield.</p>
        </div>
      )}

      {/* ── Player grid ────────────────────────────────────────────────── */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 gap-8">
          {profiles.map(profile => {
            const profileAccounts = accounts.filter(a => a.user_id === profile.id);
            return (
              <div key={profile.id}>
                <h2 className="text-base font-bold text-[var(--text-secondary)] mb-4 uppercase tracking-[0.06em]">
                  {profile.name}
                </h2>
                {profileAccounts.length === 0 ? (
                  <p className="text-[var(--text-muted)] text-sm">No accounts.</p>
                ) : (
                  profileAccounts.map(acc => (
                    <RetirementCard
                      key={acc.id}
                      account={acc}
                      onEdit={setModalAccount}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalAccount !== null && (
          <RetirementModal
            account={modalAccount === 'new' ? null : modalAccount}
            profiles={profiles}
            onClose={() => setModalAccount(null)}
            onSaved={() => refetch()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
