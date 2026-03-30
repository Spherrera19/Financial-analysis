import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KpiCard, CollapsibleCard } from '../components/cards';
import { TransactionTable } from '../components/tables';
import { useLedger } from '../context/LedgerContext';
import type { Transaction, DashboardPayload, PeriodKey } from '../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const LIMIT = 100;

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

interface TransactionsTabProps {
  data: DashboardPayload;
  activePeriod: PeriodKey;
}

function TransactionsTab({ data, activePeriod }: TransactionsTabProps) {
  const period = data.periods[activePeriod];
  const { selectedLedgerId } = useLedger();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);

  // ── Paginated transactions — Guardrail #2: ledger ID as first key discriminator ──
  const { data: transactions = [], isFetching } = useQuery<Transaction[]>({
    queryKey: ['transactions', selectedLedgerId, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        skip:  String(page * LIMIT),
        limit: String(LIMIT),
      });
      if (selectedLedgerId != null) params.set('ledger_id', String(selectedLedgerId));
      const r = await fetch(`${API}/api/transactions?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  // ── Category list for dropdowns — Guardrail #2: ledger ID in key ──
  const { data: categoryItems = [] } = useQuery<{ name: string }[]>({
    queryKey: ['categories', selectedLedgerId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedLedgerId != null) params.set('ledger_id', String(selectedLedgerId));
      const r = await fetch(`${API}/api/categories?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });
  const categoryNames = categoryItems.map((c) => c.name);

  // ── Recategorize mutation — invalidates all pages for this ledger ──
  const recategorizeMutation = useMutation({
    mutationFn: ({ id, category }: { id: number; category: string }) =>
      fetch(`${API}/api/transactions/${id}/category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => {
      // Invalidate all cached pages for this ledger so retroactive row changes appear
      queryClient.invalidateQueries({ queryKey: ['transactions', selectedLedgerId] });
    },
  });

  const isLastPage = transactions.length < LIMIT;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Summary Stats Row */}
      <div
        className="grid-3"
        style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}
      >
        <KpiCard
          label="This Page"
          value={`${transactions.length}`}
          variant="neutral"
        />
        <KpiCard
          label="Period Income"
          value={fmt(period.kpi_income)}
          variant="positive"
        />
        <KpiCard
          label="Period Spending"
          value={fmt(period.kpi_spending)}
          variant="negative"
        />
      </div>

      {/* Transaction Table */}
      <div id="tour-transaction-table" style={{ marginBottom: '1rem' }}>
        <CollapsibleCard
          title="Transaction Ledger"
          helpText="The raw, searchable ledger of all imported and manual transactions. Change a category inline — it retroactively updates all transactions from the same merchant."
        >
          <TransactionTable
            transactions={transactions}
            categories={categoryNames}
            onRecategorize={(id, category) => recategorizeMutation.mutate({ id, category })}
          />

          {/* Pagination Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface-2)',
                color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                fontSize: 13,
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                opacity: page === 0 ? 0.5 : 1,
              }}
            >
              ← Previous
            </button>

            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isFetching ? 'Loading…' : `Page ${page + 1}`}
            </span>

            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={isLastPage || isFetching}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface-2)',
                color: isLastPage ? 'var(--text-muted)' : 'var(--text-primary)',
                fontSize: 13,
                cursor: isLastPage ? 'not-allowed' : 'pointer',
                opacity: isLastPage ? 0.5 : 1,
              }}
            >
              Next →
            </button>
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
}

export { TransactionsTab };
