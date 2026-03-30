import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRightLeft } from 'lucide-react';
import { useLedger } from '../../context/LedgerContext';
import type { Transaction } from '../../types';

interface RouteTransactionModalProps {
  tx: Transaction | null;
  categories: string[];
  onClose: () => void;
  onSave: (id: number, payload: RoutePayload) => void;
}

export interface RoutePayload {
  category?: string;
  type?: string;
  ledger_id?: number;
  account?: string;
  apply_category_to_merchant: boolean;
  apply_routing_to_account: boolean;
}

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'N', label: 'Necessity' },
  { value: 'O', label: 'Optional' },
  { value: 'I', label: 'Income' },
  { value: 'D', label: 'Debt / Repayment' },
  { value: 'X', label: 'Excluded / Ignore' },
  { value: 'T', label: 'Transfer' },
];

function labelStyle(): React.CSSProperties {
  return {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 4,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };
}

function checkboxRowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    cursor: 'pointer',
  };
}

export function RouteTransactionModal({
  tx,
  categories,
  onClose,
  onSave,
}: RouteTransactionModalProps) {
  const { ledgers, selectedLedgerId } = useLedger();

  const [category, setCategory]   = useState('');
  const [txType, setTxType]       = useState('');
  const [account, setAccount]     = useState('');
  const [ledgerId, setLedgerId]   = useState<number | ''>('');
  const [applyCategory, setApplyCategory] = useState(false);
  const [applyRouting, setApplyRouting]   = useState(false);

  // Reset fields whenever a new transaction is loaded
  useEffect(() => {
    if (!tx) return;
    setCategory(tx.category);
    setTxType(tx.type);
    setAccount(tx.account);
    setApplyCategory(false);
    setApplyRouting(false);
    // Pre-select the currently active ledger; fall back to first in list
    const defaultId = selectedLedgerId ?? ledgers[0]?.id ?? '';
    setLedgerId(defaultId);
  }, [tx, ledgers]);

  if (!tx) return null;

  function handleSave() {
    if (!tx) return;
    const payload: RoutePayload = {
      apply_category_to_merchant: applyCategory,
      apply_routing_to_account:   applyRouting,
    };
    if (category !== tx.category)  payload.category  = category;
    if (txType   !== tx.type)      payload.type      = txType;
    if (ledgerId !== '')           payload.ledger_id = ledgerId as number;
    if (account  !== tx.account)   payload.account   = account;
    onSave(tx.id, payload);
    onClose();
  }

  const merchantLabel = tx.merchant.length > 22 ? tx.merchant.slice(0, 22) + '…' : tx.merchant;
  const accountLabel  = account.length > 24 ? account.slice(0, 24) + '…' : account;

  return (
    <AnimatePresence>
      <motion.div
        key="route-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}
      >
        <motion.div
          key="route-modal"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 480,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ArrowRightLeft size={15} style={{ color: 'var(--accent-blue)' }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Route Transaction
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  {tx.date} · {tx.merchant}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* datalist for category autocomplete — rendered once */}
            <datalist id="route-categories-datalist">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>

            {/* Axis 1 — Category */}
            <div>
              <label style={labelStyle()}>Category</label>
              <input
                list="route-categories-datalist"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Groceries"
                style={inputStyle()}
              />
            </div>

            {/* Axis 1 — Type */}
            <div>
              <label style={labelStyle()}>Type</label>
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value)}
                style={{ ...inputStyle(), cursor: 'pointer' }}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Axis 2 — Account */}
            <div>
              <label style={labelStyle()}>Account</label>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="e.g. Chase Sapphire ...4821"
                style={inputStyle()}
              />
            </div>

            {/* Axis 2 — Ledger / Profile */}
            <div>
              <label style={labelStyle()}>Profile / Ledger</label>
              <select
                value={ledgerId}
                onChange={(e) => setLedgerId(Number(e.target.value))}
                style={{ ...inputStyle(), cursor: 'pointer' }}
              >
                {ledgers.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '0 -4px' }} />

            {/* Explicit Intent: Category force-multiplier */}
            <label style={{ ...checkboxRowStyle(), userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={applyCategory}
                onChange={(e) => setApplyCategory(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--accent-blue)', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Apply category to all <em style={{ fontStyle: 'normal', color: 'var(--accent-blue)' }}>"{merchantLabel}"</em> transactions in this Profile
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Bulk-updates history and teaches the classification engine
                </div>
              </div>
            </label>

            {/* Explicit Intent: Account routing force-multiplier */}
            <label style={{ ...checkboxRowStyle(), userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={applyRouting}
                onChange={(e) => setApplyRouting(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--accent-blue)', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Always route <em style={{ fontStyle: 'normal', color: 'var(--accent-blue)' }}>"{accountLabel}"</em> to this Profile
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Bulk-updates all transactions from this account and saves the routing rule
                </div>
              </div>
            </label>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex', justifyContent: 'flex-end', gap: 10,
              padding: '14px 20px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 18px',
                background: 'var(--accent-blue)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ArrowRightLeft size={13} />
              Save Routing
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
