import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import type { DrawerFilter } from '../../types'

const API = 'http://localhost:8000'

const TYPE_LABELS: Record<string, string> = {
  N: 'Necessities', O: 'Optional', D: 'Debt',
  I: 'Income',      T: 'Other',   X: 'Transfers',
}

const PERIOD_LABELS: Record<string, string> = {
  current: 'Current month', last: 'Last month',
  past2:   '2 months ago',  quarter: 'This quarter', year: 'YTD',
}

function buildLabel(f: DrawerFilter): string {
  if (f.label) return f.label
  const parts: string[] = []
  if (f.type)     parts.push(TYPE_LABELS[f.type]   ?? f.type)
  if (f.category) parts.push(f.category)
  if (f.period)   parts.push(PERIOD_LABELS[f.period] ?? f.period)
  return parts.join(' · ') || 'Transactions'
}

interface DrawerRow {
  date:     string
  merchant: string
  category: string
  amount:   number
  type:     string
}

function fetchTransactions(filter: DrawerFilter): Promise<DrawerRow[]> {
  const params = new URLSearchParams()
  if (filter.period)   params.set('period',   filter.period)
  if (filter.category) params.set('category', filter.category)
  if (filter.type)     params.set('type',     filter.type)
  return fetch(`${API}/api/transactions?${params.toString()}`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtAmt(n: number): string {
  return (n < 0 ? '−' : '+') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface TransactionDrawerProps {
  filter:  DrawerFilter
  onClose: () => void
}

export function TransactionDrawer({ filter, onClose }: TransactionDrawerProps) {
  const { data: rows = [], isLoading, isError, error } = useQuery<DrawerRow[]>({
    queryKey: ['transactions', filter],
    queryFn:  () => fetchTransactions(filter),
  })

  const netSum = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 299,
          background: 'rgba(0,0,0,0.35)',
        }}
      />

      {/* Drawer panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0,
          width: 440, zIndex: 300,
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
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
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {buildLabel(filter)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Drill-down · read-only
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '1.25rem', lineHeight: 1,
              padding: '0.25rem', borderRadius: '0.375rem',
            }}
            aria-label="Close"
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Loading transactions…
            </div>
          )}
          {isError && (
            <div style={{ padding: '1.5rem', color: 'var(--accent-red)', fontSize: '0.875rem' }}>
              {(error as Error).message}
            </div>
          )}
          {!isLoading && !isError && rows.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No transactions found for this filter.
            </div>
          )}
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr auto',
                gap: '0.5rem',
                alignItems: 'center',
                padding: '0.625rem 1.25rem',
                borderBottom: '1px solid var(--border-subtle)',
                background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--border-subtle) 20%, transparent)',
              }}
            >
              {/* Date */}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {fmtDate(row.date)}
              </span>

              {/* Merchant + category badge */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.merchant}
                </div>
                <span style={{
                  display: 'inline-block', marginTop: '0.15rem',
                  fontSize: '0.6875rem', fontWeight: 600,
                  padding: '0.1rem 0.45rem', borderRadius: '999px',
                  background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                  color: 'var(--accent-blue)',
                }}>
                  {row.category}
                </span>
              </div>

              {/* Amount */}
              <span style={{
                fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap',
                color: row.amount >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
                {fmtAmt(row.amount)}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        {!isLoading && !isError && (
          <div style={{
            padding: '0.875rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
            fontSize: '0.8125rem', color: 'var(--text-secondary)',
          }}>
            <span>{rows.length} transaction{rows.length !== 1 ? 's' : ''}</span>
            <span style={{ fontWeight: 700, color: netSum >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              Net: {fmtAmt(netSum)}
            </span>
          </div>
        )}
      </motion.div>
    </>
  )
}
