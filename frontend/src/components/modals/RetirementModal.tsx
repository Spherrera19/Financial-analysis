import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import type { RetirementAccount, RetirementCreate, RetirementUpdate, UserProfile } from '../../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// ── Shared class strings ──────────────────────────────────────────────────────

const INPUT = 'w-full px-3 py-2 rounded-[0.4375rem] border border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-primary)] text-[0.9375rem] outline-none box-border';
const LABEL = 'block text-[0.8125rem] font-semibold text-[var(--text-secondary)] mb-1.5';
const FIELD = 'mb-4';

// ── Props ─────────────────────────────────────────────────────────────────────

interface RetirementModalProps {
  account:  RetirementAccount | null;  // null = create mode
  profiles: UserProfile[];
  onClose:  () => void;
  onSaved:  () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RetirementModal({ account, profiles, onClose, onSaved }: RetirementModalProps) {
  const isEdit = account !== null;
  const defaultUserId = profiles.find(p => p.is_primary)?.id ?? profiles[0]?.id ?? 1;

  const [form, setForm] = useState({
    account_name:          account?.account_name          ?? '',
    account_type:          account?.account_type          ?? '401k',
    user_id:               String(account?.user_id ?? defaultUserId),
    annual_limit:          String(account?.annual_limit          ?? ''),
    ytd_contributions:     String(account?.ytd_contributions     ?? '0'),
    employer_match_amount: String(account?.employer_match_amount ?? ''),
    employer_match_target: String(account?.employer_match_target ?? ''),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (field: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const parseOpt = (s: string): number | null =>
    s.trim() === '' ? null : parseFloat(s);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (body: RetirementCreate) =>
      fetch(`${API}/api/retirement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const updateMutation = useMutation({
    mutationFn: (body: RetirementUpdate) =>
      fetch(`${API}/api/retirement/${account!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetch(`${API}/api/retirement/${account!.id}`, { method: 'DELETE' })
      .then(r => {
        if (!r.ok) return r.text().then(t => Promise.reject(new Error(t || `HTTP ${r.status}`)));
      }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      account_name:          form.account_name,
      account_type:          form.account_type,
      user_id:               parseInt(form.user_id, 10),
      annual_limit:          parseFloat(form.annual_limit),
      ytd_contributions:     parseFloat(form.ytd_contributions),
      employer_match_amount: parseOpt(form.employer_match_amount),
      employer_match_target: parseOpt(form.employer_match_target),
    };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload as RetirementCreate);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-[200]"
      />

      {/* Panel */}
      <motion.div
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 bottom-0 w-[440px] bg-[var(--bg-card)] border-l border-[var(--border-subtle)] z-[201] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--border-subtle)] flex justify-between items-center">
          <h2 className="m-0 text-lg font-bold text-[var(--text-primary)]">
            {isEdit ? 'Edit Account' : 'Add Account'}
          </h2>
          <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-xl text-[var(--text-muted)]">
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className={FIELD}>
            <label className={LABEL}>Account Name</label>
            <input className={INPUT} value={form.account_name} onChange={e => set('account_name', e.target.value)} required />
          </div>

          <div className={FIELD}>
            <label className={LABEL}>Account Type</label>
            <input className={INPUT} value={form.account_type} onChange={e => set('account_type', e.target.value)}
              placeholder="e.g. 401k, HSA, Roth IRA" required />
          </div>

          <div className={FIELD}>
            <label className={LABEL}>Owner</label>
            <select className={INPUT} value={form.user_id} onChange={e => set('user_id', e.target.value)}>
              {profiles.map(p => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className={FIELD}>
            <label className={LABEL}>Annual Limit ($)</label>
            <input className={INPUT} type="number" min={1} step={1} value={form.annual_limit}
              onChange={e => set('annual_limit', e.target.value)} required />
          </div>

          <div className={FIELD}>
            <label className={LABEL}>YTD Contributions ($)</label>
            <input className={INPUT} type="number" min={0} step={0.01} value={form.ytd_contributions}
              onChange={e => set('ytd_contributions', e.target.value)} required />
          </div>

          <div className="border-t border-[var(--border-subtle)] my-4 pt-4">
            <div className="text-xs text-[var(--text-muted)] mb-3 font-semibold uppercase tracking-[0.06em]">
              Employer Match (optional)
            </div>

            <div className={FIELD}>
              <label className={LABEL}>Match Target ($) — contribute this much to earn full match</label>
              <input className={INPUT} type="number" min={0} step={0.01} value={form.employer_match_target}
                onChange={e => set('employer_match_target', e.target.value)}
                placeholder="Leave blank if no match" />
            </div>

            <div className={FIELD}>
              <label className={LABEL}>Match Amount YTD ($) — dollars matched so far</label>
              <input className={INPUT} type="number" min={0} step={0.01} value={form.employer_match_amount}
                onChange={e => set('employer_match_amount', e.target.value)}
                placeholder="Leave blank if no match" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className={`w-full py-3 bg-[var(--accent-blue)] text-white border-none rounded-lg font-bold text-base ${isPending ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </form>

        {/* Delete (edit mode only) */}
        {isEdit && (
          <div className="px-6 py-4 border-t border-[var(--border-subtle)]">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-[0.625rem] bg-transparent border border-[var(--accent-red)] rounded-lg text-[var(--accent-red)] font-semibold cursor-pointer"
              >
                Delete Account
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={isPending}
                  className="flex-1 py-[0.625rem] bg-[var(--accent-red)] border-none rounded-lg text-white font-bold cursor-pointer"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-[0.625rem] bg-transparent border border-[var(--border-subtle)] rounded-lg text-[var(--text-secondary)] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}
