import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import type { RetirementAccount, RetirementCreate, RetirementUpdate } from '../../types';

const API = 'http://localhost:8000';

// ── Shared input styles ───────────────────────────────────────────────────────

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
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '0.375rem',
};

const FIELD: React.CSSProperties = {
  marginBottom: '1rem',
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface RetirementModalProps {
  account: RetirementAccount | null;  // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RetirementModal({ account, onClose, onSaved }: RetirementModalProps) {
  const isEdit = account !== null;

  const [form, setForm] = useState({
    account_name:          account?.account_name          ?? '',
    account_type:          account?.account_type          ?? '401k',
    owner:                 account?.owner                 ?? 'Steven',
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
      }).then(r => r.json()),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const updateMutation = useMutation({
    mutationFn: (body: RetirementUpdate) =>
      fetch(`${API}/api/retirement/${account!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetch(`${API}/api/retirement/${account!.id}`, { method: 'DELETE' }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      account_name:          form.account_name,
      account_type:          form.account_type,
      owner:                 form.owner,
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
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 200,
        }}
      />

      {/* Panel */}
      <motion.div
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0,
          width: 440,
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-subtle)',
          zIndex: 201,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit Account' : 'Add Account'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div style={FIELD}>
            <label style={LABEL}>Account Name</label>
            <input style={INPUT} value={form.account_name} onChange={e => set('account_name', e.target.value)} required />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Account Type</label>
            <input style={INPUT} value={form.account_type} onChange={e => set('account_type', e.target.value)}
              placeholder="e.g. 401k, HSA, Roth IRA" required />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Owner</label>
            <select style={INPUT} value={form.owner} onChange={e => set('owner', e.target.value)}>
              <option value="Steven">Steven</option>
              <option value="Wife">Wife</option>
            </select>
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Annual Limit ($)</label>
            <input style={INPUT} type="number" min={0} step={1} value={form.annual_limit}
              onChange={e => set('annual_limit', e.target.value)} required />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>YTD Contributions ($)</label>
            <input style={INPUT} type="number" min={0} step={0.01} value={form.ytd_contributions}
              onChange={e => set('ytd_contributions', e.target.value)} required />
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '1rem 0', paddingTop: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Employer Match (optional)
            </div>

            <div style={FIELD}>
              <label style={LABEL}>Match Target ($) — contribute this much to earn full match</label>
              <input style={INPUT} type="number" min={0} step={0.01} value={form.employer_match_target}
                onChange={e => set('employer_match_target', e.target.value)}
                placeholder="Leave blank if no match" />
            </div>

            <div style={FIELD}>
              <label style={LABEL}>Match Amount YTD ($) — dollars matched so far</label>
              <input style={INPUT} type="number" min={0} step={0.01} value={form.employer_match_amount}
                onChange={e => set('employer_match_amount', e.target.value)}
                placeholder="Leave blank if no match" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'var(--accent-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </form>

        {/* Delete (edit mode only) */}
        {isEdit && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  width: '100%', padding: '0.625rem',
                  background: 'transparent',
                  border: '1px solid var(--accent-red)',
                  borderRadius: '0.5rem',
                  color: 'var(--accent-red)',
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                Delete Account
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={isPending}
                  style={{
                    flex: 1, padding: '0.625rem',
                    background: 'var(--accent-red)',
                    border: 'none', borderRadius: '0.5rem',
                    color: '#fff', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    flex: 1, padding: '0.625rem',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '0.5rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 600, cursor: 'pointer',
                  }}
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
