import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, ArrowUp, ArrowDown, X } from 'lucide-react'
import type { DrawerFilter } from '../../types'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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

type SortField = 'amount' | 'date' | 'merchant'
type SortDir   = 'asc' | 'desc'

interface SortKey { field: SortField; dir: SortDir }

const SORT_LABELS: Record<SortField, string> = {
  amount:   'Amount',
  date:     'Date',
  merchant: 'A–Z',
}

const DEFAULT_SORT: SortKey[] = [{ field: 'date', dir: 'desc' }]

interface TransactionDrawerProps {
  filter:  DrawerFilter
  onClose: () => void
}

export function TransactionDrawer({ filter, onClose }: TransactionDrawerProps) {
  const { data: rows = [], isLoading, isError, error } = useQuery<DrawerRow[]>({
    queryKey: ['transactions', filter],
    queryFn:  () => fetchTransactions(filter),
  })

  const [search,   setSearch]   = useState('')
  const [sortKeys, setSortKeys] = useState<SortKey[]>(DEFAULT_SORT)

  // Reset controls whenever a new filter opens the drawer
  useEffect(() => {
    setSearch('')
    setSortKeys(DEFAULT_SORT)
  }, [filter])

  // Click cycle: inactive → add (desc) → flip to asc → remove.
  // Always keep at least one key — falling back to DEFAULT_SORT if all removed.
  function toggleSort(field: SortField) {
    setSortKeys(prev => {
      const idx = prev.findIndex(k => k.field === field)
      if (idx === -1) {
        // Not active — append as new tiebreaker
        return [...prev, { field, dir: 'desc' }]
      }
      if (prev[idx].dir === 'desc') {
        // desc → asc
        return prev.map((k, i) => i === idx ? { ...k, dir: 'asc' } : k)
      }
      // asc → remove; never leave the list empty
      const next = prev.filter((_, i) => i !== idx)
      return next.length > 0 ? next : DEFAULT_SORT
    })
  }

  const displayRows = useMemo(() => {
    let result = rows
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(r =>
        r.merchant.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      )
    }
    return [...result].sort((a, b) => {
      for (const { field, dir } of sortKeys) {
        let cmp = 0
        if (field === 'amount')   cmp = Math.abs(a.amount) - Math.abs(b.amount)
        if (field === 'date')     cmp = a.date.localeCompare(b.date)
        if (field === 'merchant') cmp = a.merchant.localeCompare(b.merchant)
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }, [rows, search, sortKeys])

  const netSum = displayRows.reduce((s, r) => s + r.amount, 0)
  const hasRows = !isLoading && !isError && rows.length > 0

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,0.35)' }}
      />

      {/* Drawer panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
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
              color: 'var(--text-muted)', padding: '0.25rem', borderRadius: '0.375rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Controls strip — only shown when there are rows to interact with */}
        {hasRows && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.625rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-2)',
            flexShrink: 0,
          }}>
            {/* Search input */}
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Search
                size={12}
                style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Search merchant or category…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', paddingLeft: 26, paddingRight: search ? 26 : 8,
                  paddingTop: 5, paddingBottom: 5,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6, color: 'var(--text-primary)',
                  fontSize: 12, outline: 'none', boxSizing: 'border-box',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: 0, display: 'flex',
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Sort pills */}
            <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
              {(['amount', 'date', 'merchant'] as SortField[]).map(field => {
                const keyIdx = sortKeys.findIndex(k => k.field === field)
                const active = keyIdx !== -1
                const key    = active ? sortKeys[keyIdx] : null
                const multi  = sortKeys.length > 1
                return (
                  <button
                    key={field}
                    onClick={() => toggleSort(field)}
                    title={active ? 'Click to flip direction · click again to remove' : 'Add to sort'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '4px 9px', borderRadius: 999,
                      border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                      background: active
                        ? 'color-mix(in srgb, var(--accent-blue) 12%, transparent)'
                        : 'transparent',
                      color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
                      fontSize: 11, fontWeight: active ? 600 : 400,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                      transition: 'border-color 0.12s, color 0.12s, background 0.12s',
                    }}
                  >
                    {/* Priority badge — only shown when 2+ sorts are active */}
                    {active && multi && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 14, height: 14, borderRadius: '50%',
                        background: 'var(--accent-blue)', color: '#fff',
                        fontSize: 9, fontWeight: 700, flexShrink: 0,
                      }}>
                        {keyIdx + 1}
                      </span>
                    )}
                    {SORT_LABELS[field]}
                    {active && (
                      key!.dir === 'desc'
                        ? <ArrowDown size={10} strokeWidth={2.5} />
                        : <ArrowUp   size={10} strokeWidth={2.5} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

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
          {!isLoading && !isError && rows.length > 0 && displayRows.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No results for "<strong>{search}</strong>"
            </div>
          )}
          {displayRows.map((row, i) => (
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
                fontVariantNumeric: 'tabular-nums',
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
            <span>
              {search
                ? `${displayRows.length} of ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`
                : `${rows.length} transaction${rows.length !== 1 ? 's' : ''}`
              }
            </span>
            <span style={{ fontWeight: 700, color: netSum >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              Net: {fmtAmt(netSum)}
            </span>
          </div>
        )}
      </motion.div>
    </>
  )
}
