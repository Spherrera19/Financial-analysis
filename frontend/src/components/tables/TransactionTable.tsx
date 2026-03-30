import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Transaction } from '../../types';

interface TransactionTableProps {
  transactions: Transaction[];
  categories?: string[];
  onRecategorize?: (id: number, category: string) => void;
}

type SortField = 'date' | 'merchant' | 'category' | 'amount';
type SortDir = 'asc' | 'desc';

interface SortState {
  field: SortField;
  direction: SortDir;
}

const TYPE_LABELS: Record<Transaction['type'], string> = {
  I: 'Income',
  N: 'Necessity',
  O: 'Optional',
  D: 'Debt',
  X: 'Transfer',
  T: 'Other',
};

function typeBadgeStyle(t: Transaction['type']): React.CSSProperties {
  switch (t) {
    case 'I':
      return {
        backgroundColor: 'color-mix(in srgb, var(--accent-green) 15%, transparent)',
        color: 'var(--accent-green)',
      };
    case 'N':
      return {
        backgroundColor: 'color-mix(in srgb, var(--accent-blue) 15%, transparent)',
        color: 'var(--accent-blue)',
      };
    case 'O':
      return {
        backgroundColor: 'color-mix(in srgb, var(--accent-purple) 15%, transparent)',
        color: 'var(--accent-purple)',
      };
    case 'D':
      return {
        backgroundColor: 'color-mix(in srgb, var(--accent-red) 15%, transparent)',
        color: 'var(--accent-red)',
      };
    default:
      return {
        backgroundColor: 'color-mix(in srgb, var(--text-muted) 15%, transparent)',
        color: 'var(--text-muted)',
      };
  }
}

function formatAmount(v: number): string {
  const abs = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
}

function SortIcon({
  field,
  sort,
}: {
  field: SortField;
  sort: SortState;
}) {
  if (sort.field !== field)
    return <ChevronDown size={14} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />;
  return sort.direction === 'asc' ? (
    <ChevronUp size={14} style={{ color: 'var(--accent-blue)' }} />
  ) : (
    <ChevronDown size={14} style={{ color: 'var(--accent-blue)' }} />
  );
}

function TransactionTable({ transactions, categories = [], onRecategorize = () => {} }: TransactionTableProps) {
  const [sort, setSort] = useState<SortState>({ field: 'date', direction: 'desc' });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return transactions;
    return transactions.filter(
      (tx) =>
        tx.merchant.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.account.toLowerCase().includes(q),
    );
  }, [transactions, search]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sort.field === 'date')          cmp = a.date.localeCompare(b.date);
      else if (sort.field === 'merchant') cmp = a.merchant.localeCompare(b.merchant);
      else if (sort.field === 'category') cmp = a.category.localeCompare(b.category);
      else if (sort.field === 'amount')   cmp = a.amount - b.amount;
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort]);

  const useAnimation = sorted.length <= 100;

  function toggleSort(field: SortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'desc' },
    );
  }

  const headerCells: { label: string; field?: SortField; align?: 'right' }[] = [
    { label: 'Date',     field: 'date' },
    { label: 'Merchant', field: 'merchant' },
    { label: 'Category', field: 'category' },
    { label: 'Account' },
    { label: 'Amount',   field: 'amount', align: 'right' },
    { label: 'Type' },
  ];

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 12,
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      {/* Search */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ position: 'relative', maxWidth: 320 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search merchant, category, account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: 32,
              paddingRight: 12,
              paddingTop: 7,
              paddingBottom: 7,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr
              style={{
                position: 'sticky',
                top: 0,
                background: 'var(--bg-surface)',
                zIndex: 10,
                boxShadow: '0 1px 0 var(--border-subtle)',
              }}
            >
              {headerCells.map(({ label, field, align }) => (
                <th
                  key={label}
                  onClick={field ? () => toggleSort(field) : undefined}
                  style={{
                    padding: '10px 12px',
                    textAlign: align === 'right' ? 'right' : 'left',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    fontSize: 12,
                    cursor: field ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {label}
                    {field && <SortIcon field={field} sort={sort} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: 'center',
                    padding: '32px 0',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                  }}
                >
                  No transactions found.
                </td>
              </tr>
            )}
            {sorted.map((tx, i) => (
              <tr
                key={`${tx.id}-${i}`}
                className={cn(useAnimation && 'tx-row-anim')}
                style={
                  useAnimation
                    ? { animationDelay: `${i * 18}ms` }
                    : undefined
                }
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    'var(--bg-surface-2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                }}
              >
                <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {tx.date}
                </td>
                <td
                  style={{
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tx.merchant}
                </td>
                <td style={{ padding: '4px 12px' }}>
                  <select
                    value={tx.category}
                    onChange={(e) => onRecategorize(tx.id, e.target.value)}
                    style={{
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      padding: '3px 6px',
                      cursor: 'pointer',
                      maxWidth: 150,
                    }}
                  >
                    {/* Ensure current value is always an option (e.g. legacy or uncategorized) */}
                    {!categories.includes(tx.category) && (
                      <option value={tx.category}>{tx.category}</option>
                    )}
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </td>
                <td
                  style={{
                    padding: '9px 12px',
                    color: 'var(--text-muted)',
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tx.account}
                </td>
                <td
                  style={{
                    padding: '9px 12px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 500,
                    color: tx.amount >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatAmount(tx.amount)}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <span
                    style={{
                      ...typeBadgeStyle(tx.type),
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      display: 'inline-block',
                    }}
                  >
                    {TYPE_LABELS[tx.type]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Row count footer */}
      {filtered.length > 0 && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
            fontSize: 12,
            textAlign: 'right',
          }}
        >
          {sorted.length < filtered.length
            ? `Showing ${sorted.length} of ${filtered.length} transactions`
            : `${sorted.length} transaction${sorted.length !== 1 ? 's' : ''}`}
        </div>
      )}
    </div>
  );
}

export { TransactionTable };
