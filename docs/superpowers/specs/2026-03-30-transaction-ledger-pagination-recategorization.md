# Transaction Ledger: Pagination & Inline Recategorization
**Date:** 2026-03-30
**Status:** Approved
**Phase:** 6 (Ledger Upgrade)

---

## Overview

Upgrade the Transaction Ledger to support:
1. **Infinite pagination** via server-side `skip`/`limit` params
2. **Inline recategorization** with a force-multiplier bulk update and triage rule learning
3. **Type standardization** — eliminate compact keys (`d`, `m`, `c`, `v`, etc.) across the full stack in favour of full-name fields matching the ORM

---

## 1. Type Standardization (`frontend/src/types.ts`)

Replace the `Transaction` interface compact keys entirely:

```ts
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

**Files requiring cascade updates** (compact key → full key):
- `frontend/src/components/tables/TransactionTable.tsx` — `tx.d` → `tx.date`, `tx.m` → `tx.merchant`, `tx.c` → `tx.category`, `tx.a` → `tx.account`, `tx.v` → `tx.amount`, `tx.o` → `tx.owner`, `tx.t` → `tx.type`, `tx.k` → `tx.is_checking`
- `frontend/src/pages/TransactionsTab.tsx` — remove usage of compact fields
- `frontend/src/modals/TransactionDrawer.tsx` — update any compact field references
- Sort field keys in `TransactionTable.tsx` — change `SortField` type from `'d' | 'm' | 'c' | 'v'` to `'date' | 'merchant' | 'category' | 'amount'`

---

## 2. Backend: `GET /api/transactions` (Pagination)

### Query Parameters
| Param | Type | Default | Description |
|---|---|---|---|
| `period` | `str \| None` | `None` | Date range filter |
| `category` | `str \| None` | `None` | Category filter |
| `type` | `str \| None` | `None` | Type code filter |
| `ledger_id` | `int \| None` | `None` | Ledger scope (required for production use) |
| `skip` | `int` | `0` | Pagination offset |
| `limit` | `int` | `100` | Page size |

### Implementation

Switch from raw SQL to a **SQLModel ORM select** on `TransactionRecord` so `id`, `account`, `owner`, and `is_checking` are naturally included.

**Guardrails:**
- **Status filter (Guardrail #4):** Query MUST include `.where(TransactionRecord.status == "cleared")`. `needs_review` rows must never appear in the main ledger view.
- **Ledger filter (Guardrail #4):** When `ledger_id` is provided, filter `.where(TransactionRecord.ledger_id == ledger_id)`.
- **Pagination:** Apply `.offset(skip).limit(limit)` — remove the hardcoded `LIMIT 500`.

### Response Shape
Return a list of dicts matching the new `Transaction` interface:
```json
[
  {
    "id": 42,
    "date": "2026-03-15",
    "merchant": "Whole Foods",
    "category": "Groceries",
    "account": "Chase Sapphire ...4821",
    "amount": -87.43,
    "owner": "Steven",
    "type": "N",
    "is_checking": false
  }
]
```

---

## 3. Backend: `PUT /api/transactions/{transaction_id}/category`

### Request Body
```python
class CategoryUpdateRequest(BaseModel):
    category: str
```

### Logic

```
1. tx = session.get(TransactionRecord, transaction_id)
   → 404 if not found

2. merchant_key = tx.original_merchant or tx.merchant  # Guardrail #3: fallback

3. tx.category = payload.category
   session.add(tx)

4. Bulk update (Guardrail #1 — ledger scoped):
   UPDATE transactions
   SET category = payload.category
   WHERE original_merchant = merchant_key
     AND ledger_id = tx.ledger_id          ← MUST include ledger_id

5. Upsert ClassificationRule:
   - SELECT where merchant_pattern = merchant_key
   - If not found: INSERT new rule
   - If found: UPDATE assigned_category
   session.add(rule)

6. session.commit()

7. Return: { "updated_merchant": merchant_key, "category": payload.category }
```

**Guardrail #1 — Cross-Contamination:** The bulk update `WHERE` clause must always include `AND ledger_id == tx.ledger_id`. This prevents a multi-user scenario (Phase 7) from overwriting another user's "Uber" transactions.

**Guardrail #3 — `original_merchant` Fallback:** Use `merchant_key = tx.original_merchant or tx.merchant`. Manual entries or pre-triage rows may have `original_merchant = None`. The fallback to `tx.merchant` ensures the bulk update and rule learning still work.

---

## 4. Frontend: `TransactionsTab.tsx`

### State
```ts
const [page, setPage] = useState(0);
const LIMIT = 100;
```

### Data Fetching (React Query)

```ts
// Guardrail #2 — ledger ID in query key:
const { selectedLedgerId } = useLedger();

const { data: transactions = [], refetch } = useQuery({
  queryKey: ['transactions', selectedLedgerId, page],
  queryFn: () =>
    fetch(`/api/transactions?ledger_id=${selectedLedgerId}&skip=${page * LIMIT}&limit=${LIMIT}`)
      .then(r => r.json()),
});

const { data: allCategories = [] } = useQuery({
  queryKey: ['categories', selectedLedgerId],
  queryFn: () =>
    fetch(`/api/categories?ledger_id=${selectedLedgerId}`)
      .then(r => r.json())
      .then(cats => cats.map((c: { name: string }) => c.name)),
});

const recategorizeMutation = useMutation({
  mutationFn: ({ id, category }: { id: number; category: string }) =>
    fetch(`/api/transactions/${id}/category`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    }).then(r => r.json()),
  onSuccess: () => {
    // Invalidate all pages for the current ledger so retroactive row updates appear
    queryClient.invalidateQueries({ queryKey: ['transactions', selectedLedgerId] });
  },
});
```

**Guardrail #2 — Cache Key Context:** `selectedLedgerId` is the first discriminator in both `['transactions', selectedLedgerId, page]` and `['categories', selectedLedgerId]`. Switching ledgers in the TopBar produces a fresh cache miss and forces a new fetch.

### Pagination Controls

- "Previous" button: disabled when `page === 0`
- "Next" button: disabled when `transactions.length < LIMIT` (signals last page)
- Displayed below `TransactionTable`

### KPI Cards

Replace `data.transactions.length` with `transactions.length` (current page count). Period income/spending KPIs can stay bound to `data.periods[activePeriod]` from the dashboard payload.

---

## 5. Frontend: `TransactionTable.tsx`

### Updated Props

```ts
interface TransactionTableProps {
  transactions: Transaction[];
  categories: string[];
  onRecategorize: (id: number, category: string) => void;
}
```

Remove `maxRows` prop (server controls page size).

### Category Cell

Replace the plain-text category cell with a `<select>` dropdown:

```tsx
<select
  value={tx.category}
  onChange={(e) => onRecategorize(tx.id, e.target.value)}
  style={{
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    fontSize: 12,
    padding: '2px 6px',
    cursor: 'pointer',
  }}
>
  {categories.map((cat) => (
    <option key={cat} value={cat}>{cat}</option>
  ))}
</select>
```

### Sort Field Type Update

```ts
type SortField = 'date' | 'merchant' | 'category' | 'amount';
```

Update all sort comparator logic to use the new full-name keys.

---

## Data Flow

```
TopBar selects ledger → selectedLedgerId changes
  ↓
TransactionsTab
  useQuery(['transactions', selectedLedgerId, page]) → GET /api/transactions?ledger_id=X&skip=N&limit=100
  useQuery(['categories', selectedLedgerId])          → GET /api/categories?ledger_id=X
  useMutation → PUT /api/transactions/{id}/category
    onSuccess → invalidateQueries(['transactions', selectedLedgerId])
                → React Query refetches current page
  ↓
TransactionTable
  Category <select> onChange → onRecategorize(tx.id, newCategory)
  Rows update to show retroactive category changes
```

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/types.ts` | Replace compact `Transaction` keys with full-name fields |
| `backend/routers/transactions.py` | Add `skip`/`limit` params; ORM select; add `PUT /{id}/category` |
| `frontend/src/pages/TransactionsTab.tsx` | React Query pagination + mutation + Prev/Next buttons |
| `frontend/src/components/tables/TransactionTable.tsx` | New props; `<select>` category cell; full-key sort |
| `frontend/src/modals/TransactionDrawer.tsx` | Update compact key references |

---

## Guardrails Summary

| # | Risk | Fix |
|---|---|---|
| 1 | Cross-contamination in bulk update | `WHERE ... AND ledger_id = tx.ledger_id` |
| 2 | Stale React Query cache on ledger switch | `selectedLedgerId` as first query key discriminator |
| 3 | `original_merchant` is None | Fallback: `merchant_key = tx.original_merchant or tx.merchant` |
| 4 | `needs_review` rows in main ledger | Always filter `status == 'cleared'` in ORM query |
