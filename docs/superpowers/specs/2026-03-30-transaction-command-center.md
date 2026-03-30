# Transaction Command Center — Explicit 3D Routing
**Date:** 2026-03-30
**Status:** Approved

---

## Overview

Upgrade the Transaction Ledger inline edit and add a full Routing Modal, enabling 3-axis transaction management:
- **Axis 1 — Category:** Inline datalist cell + force-multiplier opt-in
- **Axis 2 — Ledger (Profile):** Modal dropdown, force-multiplier opt-in via account routing
- **Axis 3 — Account:** Modal text input

The "Explicit Intent" model uses checkboxes to protect Omni-Merchants (Amazon, Uber, etc.) from accidental bulk recategorization.

---

## 1. Backend: Replace `PUT /{id}/category` with `PATCH /api/transactions/{id}`

### Delete
Remove `PUT /api/transactions/{transaction_id}/category` entirely.

### New endpoint

```python
class TransactionUpdateRequest(BaseModel):
    category: str | None = None
    ledger_id: int | None = None
    account: str | None = None
    apply_category_to_merchant: bool = False
    apply_routing_to_account: bool = False
```

**Logic:**

```
merchant_key = tx.original_merchant or tx.merchant   # Guardrail #3

Axis 1 — Category:
  if category provided:
    tx.category = category
    if apply_category_to_merchant:
      bulk UPDATE category WHERE original_merchant == merchant_key
                              AND ledger_id == tx.ledger_id   # Guardrail #1
      upsert ClassificationRule(merchant_pattern=merchant_key, assigned_category=category)

Axis 2 — Routing:
  if ledger_id provided: tx.ledger_id = ledger_id
  if account provided:   tx.account   = account
  if apply_routing_to_account and (account or ledger_id provided):
    bulk UPDATE ledger_id WHERE account == (payload.account or tx.account)
    upsert AccountLedgerMap(account_name=..., ledger_id=payload.ledger_id or tx.ledger_id)

session.add(tx)
session.commit()
return { "merchant_key": merchant_key, "category": tx.category, "ledger_id": tx.ledger_id }
```

---

## 2. Frontend: Inline Category Cell (`TransactionTable.tsx`)

### Changes
- Replace `<select>` with `<input list="tx-categories-datalist" />`
- Render `<datalist id="tx-categories-datalist">` **once** outside the row loop (DOM optimization — avoids 100 duplicate nodes)
- Fire `onRecategorize` on `onBlur` or `Enter` keydown
- **Escape key cancellation:** `Escape` resets input value to `tx.category` and blurs without firing mutation

### Props update
```ts
interface TransactionTableProps {
  transactions: Transaction[];
  categories?: string[];
  onRecategorize?: (id: number, category: string) => void;
  onRoute?: (tx: Transaction) => void;   // new — opens RouteTransactionModal
}
```

### New "Route" column
Last column header: (no label). Each row: `<button>` with `<ArrowRightLeft size={14} />` icon. Calls `onRoute(tx)`. Optional — no-op default.

---

## 3. New `RouteTransactionModal.tsx`

**Path:** `frontend/src/components/modals/RouteTransactionModal.tsx`

Receives `tx: Transaction | null` and `onClose: () => void`. Renders nothing when `tx` is null.

Styled with CSS variable inline styles (same pattern as `TransactionDrawer` — not Tailwind classes).

### Fields

| Label | UI Control | Default value | Maps to |
|---|---|---|---|
| Category | `<input list="route-categories-datalist">` | `tx.category` | `category` |
| Account | `<input type="text">` | `tx.account` | `account` |
| Profile | `<select>` from `useLedger().ledgers` | `tx` ledger match or first | `ledger_id` |
| Apply category to all `[merchant]` transactions in this Profile | `<input type="checkbox">` | `false` | `apply_category_to_merchant` |
| Always route `[account]` to this Profile | `<input type="checkbox">` | `false` | `apply_routing_to_account` |

### Behaviour
- "Save" button: fires `PATCH /api/transactions/{tx.id}` → `onSave()` callback → parent invalidates cache
- "Cancel": closes without mutation

---

## 4. `TransactionsTab.tsx` — Wiring

### Mutation update
Replace the old `PUT /category` mutation with a single `PATCH` mutation:

```ts
useMutation({
  mutationFn: ({ id, payload }: { id: number; payload: TransactionUpdateRequest }) =>
    fetch(`${API}/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  onSuccess: () => {
    // Polish note #1: fuzzy invalidation covers both source + destination ledger caches
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
  },
})
```

**Inline category edit** (from `onRecategorize`): calls mutation with `{ category, apply_category_to_merchant: true }`.

**RouteTransactionModal save**: calls mutation with full `{ category?, ledger_id?, account?, apply_category_to_merchant?, apply_routing_to_account? }`.

### Modal state
```ts
const [routingTx, setRoutingTx] = useState<Transaction | null>(null);
```

Pass `onRoute={(tx) => setRoutingTx(tx)}` to `TransactionTable`.
Render `<RouteTransactionModal tx={routingTx} onClose={() => setRoutingTx(null)} onSave={...} categories={categoryNames} />`.

---

## Polish Notes

| # | Issue | Fix |
|---|---|---|
| 1 | Cache stale after cross-ledger move | `invalidateQueries({ queryKey: ['transactions'] })` — fuzzy base-key invalidation |
| 2 | `<datalist>` rendered 100× in row loop | Render once above/below `<tbody>` |
| 3 | No escape hatch for inline edit | `Escape` key resets value to `tx.category`, blurs, no mutation |

---

## Files Changed

| File | Change |
|---|---|
| `backend/routers/transactions.py` | Delete `PUT /{id}/category`; add `PATCH /{id}` |
| `frontend/src/components/tables/TransactionTable.tsx` | datalist input; datalist DOM opt; Escape cancel; Route column |
| `frontend/src/components/modals/RouteTransactionModal.tsx` | New modal |
| `frontend/src/pages/TransactionsTab.tsx` | Updated mutation; modal state; fuzzy invalidation |
