import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KpiCard, CollapsibleCard } from '../components/cards';
import { TransactionTable } from '../components/tables';
import { RouteTransactionModal, type RoutePayload } from '../components/modals/RouteTransactionModal';
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
  const [routingTx, setRoutingTx] = useState<Transaction | null>(null);

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

  // ── Unified PATCH mutation ──
  // Polish note #1: fuzzy base-key invalidation covers both source + destination ledger caches
  const patchMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: RoutePayload }) =>
      fetch(`${API}/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => {
      // Fuzzy invalidation: purges ALL ledger caches, covering cross-ledger moves
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  // Inline category edit → always applies force-multiplier (systemic correction intent)
  function handleRecategorize(id: number, category: string) {
    patchMutation.mutate({
      id,
      payload: { category, apply_category_to_merchant: true, apply_routing_to_account: false },
    });
  }

  // Route modal save
  function handleRouteSave(id: number, payload: RoutePayload) {
    patchMutation.mutate({ id, payload });
  }

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
          helpText="Edit categories inline or use the Route button for full 3D routing (category, profile, account). Inline edits apply the correction to all transactions from the same merchant."
        >
          <TransactionTable
            transactions={transactions}
            categories={categoryNames}
            onRecategorize={handleRecategorize}
            onRoute={(tx) => setRoutingTx(tx)}
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

      {/* Route Transaction Modal */}
      <RouteTransactionModal
        tx={routingTx}
        categories={categoryNames}
        onClose={() => setRoutingTx(null)}
        onSave={handleRouteSave}
      />
    </div>
  );
}

export { TransactionsTab };
