# Transaction Ledger Pagination & Recategorization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Transaction Ledger with server-side pagination, inline recategorization with force-multiplier bulk updates, and type standardization (compact keys → full names) across the full stack.

**Architecture:** Replace the static `data.transactions` dashboard payload with a `useQuery`-backed paginated API. Add a `PUT /api/transactions/{id}/category` endpoint that updates one row, bulk-fixes history for the same merchant (ledger-scoped), and upserts a `ClassificationRule` for future ingest learning. All 4 guardrails (ledger-scope, query-key context, `original_merchant` fallback, status filter) are enforced.

**Tech Stack:** Python FastAPI + SQLModel ORM, React 19 + TypeScript, `@tanstack/react-query v5`, `useLedger()` context hook.

---

## File Map

| File | Change |
|---|---|
| `frontend/src/types.ts` | Replace compact `Transaction` keys; make `DashboardPayload.transactions` optional |
| `frontend/src/components/tables/TransactionTable.tsx` | New props; full-name keys; `<select>` category cell; updated sort type |
| `frontend/src/pages/TransactionsTab.tsx` | Replace `data.transactions` with `useQuery` + pagination + `useMutation` |
| `backend/routers/transactions.py` | ORM `GET` with pagination/filters; new `PUT /{id}/category` endpoint |

`TransactionDrawer.tsx` — **no changes needed** (uses its own `DrawerRow` local type, not `Transaction`).

---

## Task 1: Update `Transaction` type in `frontend/src/types.ts`

**Files:**
- Modify: `frontend/src/types.ts:106-115`

- [ ] **Step 1: Replace the `Transaction` interface and make `DashboardPayload.transactions` optional**

In `frontend/src/types.ts`, replace lines 106–115:

```ts
// BEFORE
export interface Transaction {
  d: string;   // date YYYY-MM-DD
  m: string;   // merchant
  c: string;   // category
  a: string;   // account (last 25 chars)
  v: number;   // amount (neg=expense, pos=income)
  o: string;   // owner
  t: 'I' | 'N' | 'O' | 'D' | 'X' | 'T'; // type code
  k: 0 | 1;   // 1 = checking account
}
```

```ts
// AFTER
export interface Transaction {
  id: number;
  date: string;
  merchant: string;
  category: string;
  account: string;
  amount: number;
  owner: string;
  type: 'I' | 'N' | 'O' | 'D' | 'X' | 'T';
  is_checking: boolean;
}
```

Also update `DashboardPayload.transactions` to optional (line ~123):

```ts
// BEFORE
  transactions: Transaction[];

// AFTER
  transactions?: Transaction[];
```

This prevents TypeScript errors since `TransactionsTab` will no longer read from the dashboard payload for its table data. The backend still returns `transactions` in the JSON but the field won't be strictly type-checked.

---

## Task 2: Update `TransactionTable.tsx`

**Files:**
- Modify: `frontend/src/components/tables/TransactionTable.tsx`

- [ ] **Step 1: Update props interface and sort field type**

```tsx
// BEFORE
interface TransactionTableProps {
  transactions: Transaction[];
  maxRows?: number;
}

type SortField = 'd' | 'm' | 'c' | 'v';
```

```tsx
// AFTER
interface TransactionTableProps {
  transactions: Transaction[];
  categories: string[];
  onRecategorize: (id: number, category: string) => void;
}

type SortField = 'date' | 'merchant' | 'category' | 'amount';
```

- [ ] **Step 2: Update sort state initial value and sort comparators**

```tsx
// BEFORE
const [sort, setSort] = useState<SortState>({ field: 'd', direction: 'desc' });
```

```tsx
// AFTER
const [sort, setSort] = useState<SortState>({ field: 'date', direction: 'desc' });
```

Replace the sort comparator block in `useMemo`:

```tsx
// BEFORE
copy.sort((a, b) => {
  let cmp = 0;
  if (sort.field === 'd') cmp = a.d.localeCompare(b.d);
  else if (sort.field === 'm') cmp = a.m.localeCompare(b.m);
  else if (sort.field === 'c') cmp = a.c.localeCompare(b.c);
  else if (sort.field === 'v') cmp = a.v - b.v;
  return sort.direction === 'asc' ? cmp : -cmp;
});
```

```tsx
// AFTER
copy.sort((a, b) => {
  let cmp = 0;
  if (sort.field === 'date')     cmp = a.date.localeCompare(b.date);
  else if (sort.field === 'merchant') cmp = a.merchant.localeCompare(b.merchant);
  else if (sort.field === 'category') cmp = a.category.localeCompare(b.category);
  else if (sort.field === 'amount')   cmp = a.amount - b.amount;
  return sort.direction === 'asc' ? cmp : -cmp;
});
```

Remove the `maxRows` slice line (server now controls page size):

```tsx
// BEFORE
return maxRows !== undefined ? copy.slice(0, maxRows) : copy;

// AFTER
return copy;
```

- [ ] **Step 3: Update the search filter to use full-name keys**

```tsx
// BEFORE
return transactions.filter(
  (tx) =>
    tx.m.toLowerCase().includes(q) ||
    tx.c.toLowerCase().includes(q) ||
    tx.a.toLowerCase().includes(q),
);
```

```tsx
// AFTER
return transactions.filter(
  (tx) =>
    tx.merchant.toLowerCase().includes(q) ||
    tx.category.toLowerCase().includes(q) ||
    tx.account.toLowerCase().includes(q),
);
```

- [ ] **Step 4: Update the header cells to use new sort fields**

```tsx
// BEFORE
const headerCells: { label: string; field?: SortField; align?: 'right' }[] = [
  { label: 'Date', field: 'd' },
  { label: 'Merchant', field: 'm' },
  { label: 'Category', field: 'c' },
  { label: 'Account' },
  { label: 'Amount', field: 'v', align: 'right' },
  { label: 'Type' },
];
```

```tsx
// AFTER
const headerCells: { label: string; field?: SortField; align?: 'right' }[] = [
  { label: 'Date',     field: 'date' },
  { label: 'Merchant', field: 'merchant' },
  { label: 'Category', field: 'category' },
  { label: 'Account' },
  { label: 'Amount',   field: 'amount', align: 'right' },
  { label: 'Type' },
];
```

- [ ] **Step 5: Update `typeBadgeStyle` call site and row render to full-name keys**

Update the function signature (was using `Transaction['t']`):

```tsx
// BEFORE
function typeBadgeStyle(t: Transaction['t']): React.CSSProperties {

// AFTER
function typeBadgeStyle(t: Transaction['type']): React.CSSProperties {
```

Update `TYPE_LABELS`:
```tsx
// BEFORE
const TYPE_LABELS: Record<Transaction['t'], string> = {

// AFTER
const TYPE_LABELS: Record<Transaction['type'], string> = {
```

Update all compact field references in the row render block. Replace the entire `tbody` row JSX:

```tsx
{sorted.map((tx, i) => (
  <tr
    key={`${tx.date}-${tx.merchant}-${i}`}
    className={cn(useAnimation && 'tx-row-anim')}
    style={useAnimation ? { animationDelay: `${i * 18}ms` } : undefined}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-surface-2)';
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
        {/* Always include current value in case it's not in the list */}
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
```

- [ ] **Step 6: Update `TransactionTable` function signature**

```tsx
// BEFORE
function TransactionTable({ transactions, maxRows = 50 }: TransactionTableProps) {

// AFTER
function TransactionTable({ transactions, categories, onRecategorize }: TransactionTableProps) {
```

---

## Task 3: Refactor `backend/routers/transactions.py`

**Files:**
- Modify: `backend/routers/transactions.py`

- [ ] **Step 1: Add `CategoryUpdateRequest` Pydantic model**

Add after the existing `TriageResolveRequest` class:

```python
class CategoryUpdateRequest(BaseModel):
    category: str
```

- [ ] **Step 2: Refactor `GET /api/transactions` to use SQLModel ORM with pagination**

Replace the entire `list_transactions` function:

```python
from sqlalchemy import func, not_

@router.get("/api/transactions")
def list_transactions(
    period:    str | None = Query(default=None),
    category:  str | None = Query(default=None),
    type:      str | None = Query(default=None, alias="type"),
    ledger_id: int | None = Query(default=None),
    skip:      int        = Query(default=0,   ge=0),
    limit:     int        = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Paginated transaction list. Always filtered to status='cleared'.
    Pass ?ledger_id=<id> to scope to a ledger. Excludes I/X types by default.
    """
    type_ = type  # noqa: A001

    # Guardrail #4: always filter cleared only
    stmt = select(TransactionRecord).where(TransactionRecord.status == "cleared")

    # Guardrail #4: scope to ledger when provided
    if ledger_id is not None:
        stmt = stmt.where(TransactionRecord.ledger_id == ledger_id)

    # Default: exclude income (I) and transfers (X) unless caller specifies type
    if not type_:
        stmt = stmt.where(not_(TransactionRecord.type.in_(["I", "X"])))

    if period is not None:
        if period not in PERIOD_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid period '{period}'. Must be one of: {PERIOD_KEYS}",
            )
        months = get_period_months(period)
        stmt = stmt.where(func.strftime("%Y-%m", TransactionRecord.date).in_(months))

    if category is not None:
        stmt = stmt.where(TransactionRecord.category == category)

    if type_ is not None:
        stmt = stmt.where(TransactionRecord.type == type_)

    stmt = stmt.order_by(TransactionRecord.date.desc()).offset(skip).limit(limit)

    records = session.exec(stmt).all()
    return JSONResponse(content=[
        {
            "id":          r.id,
            "date":        r.date,
            "merchant":    r.merchant,
            "category":    r.category,
            "account":     r.account,
            "amount":      r.amount,
            "owner":       r.owner,
            "type":        r.type,
            "is_checking": bool(r.is_checking),
        }
        for r in records
    ])
```

Also add `func, not_` to the sqlalchemy import at the top of the file:

```python
# BEFORE
from sqlalchemy import text

# AFTER
from sqlalchemy import func, not_, text
```

- [ ] **Step 3: Add `PUT /api/transactions/{transaction_id}/category` endpoint**

Add this function after `list_transactions`:

```python
@router.put("/api/transactions/{transaction_id}/category")
def update_transaction_category(
    transaction_id: int,
    payload: CategoryUpdateRequest,
    session: Session = Depends(get_db),
):
    """
    Recategorize a single transaction, then bulk-fix all rows from the same
    merchant (ledger-scoped), and upsert a ClassificationRule for future ingest.

    Guardrail #1: bulk update is scoped to tx.ledger_id (no cross-ledger contamination).
    Guardrail #3: falls back to tx.merchant if tx.original_merchant is None.
    """
    tx = session.get(TransactionRecord, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")

    # Guardrail #3: original_merchant fallback
    use_original = bool(tx.original_merchant)
    merchant_key = tx.original_merchant if use_original else tx.merchant

    # 1. Update the specific transaction
    tx.category = payload.category
    session.add(tx)

    # 2. Bulk update — Guardrail #1: ledger-scoped
    bulk_stmt = (
        update(TransactionRecord)
        .where(TransactionRecord.ledger_id == tx.ledger_id)
        .values(category=payload.category)
    )
    if use_original:
        bulk_stmt = bulk_stmt.where(TransactionRecord.original_merchant == merchant_key)
    else:
        bulk_stmt = bulk_stmt.where(TransactionRecord.merchant == merchant_key)
    session.execute(bulk_stmt)

    # 3. Upsert ClassificationRule (learning engine)
    rule = session.exec(
        select(ClassificationRule).where(ClassificationRule.merchant_pattern == merchant_key)
    ).first()
    if not rule:
        rule = ClassificationRule(
            merchant_pattern=merchant_key,
            assigned_category=payload.category,
            match_type="exact",
        )
    else:
        rule.assigned_category = payload.category
    session.add(rule)

    session.commit()
    return {"updated_merchant": merchant_key, "category": payload.category}
```

---

## Task 4: Refactor `TransactionsTab.tsx`

**Files:**
- Modify: `frontend/src/pages/TransactionsTab.tsx`

- [ ] **Step 1: Rewrite `TransactionsTab` with React Query pagination and mutation**

Replace the entire file content:

```tsx
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

  // ── Paginated transactions (Guardrail #2: ledger ID in query key) ──
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

  // ── Category list for the dropdown (Guardrail #2: ledger ID in query key) ──
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

  // ── Recategorize mutation ──
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
      // Invalidate all pages for this ledger so retroactive changes appear
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
```

---

## Task 5: Build check

**Files:** All modified files

- [ ] **Step 1: Run the TypeScript build and confirm zero errors**

```bash
cd "C:/Users/steve/OneDrive/Desktop/IDocs/Pv/Finance/Finance App"
npm run build
```

Expected: build completes with no TypeScript errors. Common errors to watch for:
- `Property 'd' does not exist on type 'Transaction'` → compact key missed somewhere
- `Property 'transactions' does not exist` → `DashboardPayload.transactions` is optional now, check any remaining `data.transactions` usages
- `useLedger` import path wrong → verify `from '../context/LedgerContext'`

- [ ] **Step 2: Start backend and verify GET endpoint**

```bash
cd "C:/Users/steve/OneDrive/Desktop/IDocs/Pv/Finance/Finance App"
call venv/Scripts/activate && uvicorn backend.main:app --reload --port 8000
```

In a second terminal:
```bash
curl "http://localhost:8000/api/transactions?skip=0&limit=5&ledger_id=1"
```

Expected: JSON array of up to 5 objects each with keys `id`, `date`, `merchant`, `category`, `account`, `amount`, `owner`, `type`, `is_checking`. No `needs_review` rows.

- [ ] **Step 3: Verify PUT endpoint**

```bash
# Get an id from the GET response above, e.g. 42
curl -X PUT "http://localhost:8000/api/transactions/42/category" \
  -H "Content-Type: application/json" \
  -d '{"category": "Groceries"}'
```

Expected: `{"updated_merchant": "...", "category": "Groceries"}`

```bash
# Verify the bulk update took effect
curl "http://localhost:8000/api/transactions?limit=5&ledger_id=1" | python -m json.tool
```

Expected: rows with the same merchant now show `"category": "Groceries"`.

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Type standardization → Task 1 + Task 2 (all compact fields replaced)
  - Pagination `skip`/`limit` → Task 3 Step 2
  - `status == 'cleared'` filter (Guardrail #4) → Task 3 Step 2
  - `ledger_id` filter (Guardrail #4) → Task 3 Step 2
  - `PUT /{id}/category` endpoint → Task 3 Step 3
  - `original_merchant` fallback (Guardrail #3) → Task 3 Step 3
  - Bulk update ledger-scoped (Guardrail #1) → Task 3 Step 3
  - ClassificationRule upsert → Task 3 Step 3
  - `useQuery` with `selectedLedgerId` in key (Guardrail #2) → Task 4 Step 1
  - `invalidateQueries` on mutation success → Task 4 Step 1
  - Prev/Next pagination buttons → Task 4 Step 1
  - `<select>` category cell → Task 2 Step 5
  - Categories fetched from API → Task 4 Step 1

- [x] **No placeholders or TBDs found**

- [x] **Type consistency:**
  - `Transaction` full keys defined in Task 1, used consistently in Tasks 2, 3, 4
  - `TransactionTableProps` new props defined in Task 2 Step 1, passed in Task 4 Step 1
  - `SortField` updated in Task 2 Step 1, comparators updated in Task 2 Step 2
  - `CategoryUpdateRequest` defined in Task 3 Step 1, used in Step 3
  - `useLedger` import from `'../context/LedgerContext'` consistent with existing App.tsx
