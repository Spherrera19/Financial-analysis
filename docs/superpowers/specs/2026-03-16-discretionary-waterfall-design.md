# Discretionary Waterfall — Design Spec
**Date:** 2026-03-16
**Phase:** 3 (first feature)
**Status:** Approved

---

## Problem

The user needs a single, prominent view that answers: *"Of all the money that came in this period, how much is truly free — and where did that free cash actually go?"*

The existing `kpi_disposable` field (Income − Necessities − Debt) is a single number. It doesn't reveal whether the "free" portion went to optional spending, extra debt payments, or true savings. `kpi_disposable` lives on the Cash Flow Tab; this new component lives on the Overview Tab and uses a more precise definition of "necessary."

---

## Solution: Discretionary Cash-Flow Waterfall

A thick, horizontal multi-segment bar mounted at the very top of the **Overview Tab**, above all KPI cards. It is the first thing the user sees when opening the dashboard.

### Waterfall Zones

```
|<------- total_income ---------------------------------------->|
|  necessary_spending  |<------ Free Cash --------------------->|
                       |  optional  |  extra debt  |  unspent  |
```

- **Necessary** (left, slate): `necessary_spending` = necessities + pro-rated minimum debt payments
- **Free Cash** (right zone): width = `true_discretionary_income`
  - **Optional Spending** (amber): `opt_total + oth_total` — "Optional" and "Other" categories are intentionally merged here because both represent wholly discretionary choices. The tooltip surfaces both sub-totals separately (e.g. "Optional $X + Other $Y").
  - **Extra Debt Payments** (rose): debt payments above the minimums
  - **Unspent / Savings** (emerald): remainder — this segment absorbs any floating-point residual to guarantee the bar always fills 100%

---

## Backend Changes

### `backend/classify.py`
Add a `MINIMUM_PAYMENTS` dict (static/mocked for Phase 3). Keys are **lowercase substrings of account names** — the same pattern used by `guess_interest_rate()` — so matching is flexible without requiring exact names:

```python
MINIMUM_PAYMENTS: dict[str, float] = {
    "chase sapphire": 150.0,
    "amex":           75.0,
}
```

> **Note:** This dict is intentionally simple for Phase 3. Phase 4 will replace it with a DB-backed or user-configured source.

Add a helper used by `engine.py`:
```python
def get_minimum_payment_total(n_months: int = 1) -> float:
    """Sum of all mocked minimum payments, scaled to n_months."""
    return sum(MINIMUM_PAYMENTS.values()) * n_months
```

**Edge case:** When `dbt_total == 0` for a period (no debt transactions), `min_total` is still non-zero. The `min(dbt_total, min_total)` clamp in `necessary` ensures necessary never exceeds actual spending. `extra_debt` will be 0. This is correct behavior.

### `backend/models.py`

New model (add before `PeriodData`):
```python
class CashFlowWaterfall(BaseModel):
    total_income:              float
    necessary_spending:        float   # necessities + min(dbt_total, sum_minimums)
    true_discretionary_income: float   # max(0, total_income - necessary_spending)
    optional_spending:         float   # opt_total + oth_total (both discretionary, merged)
    opt_subtotal:              float   # opt_total alone (for frontend tooltip sub-breakdown)
    oth_subtotal:              float   # oth_total alone (for frontend tooltip sub-breakdown)
    extra_debt_payments:       float   # max(0, dbt_total - sum_minimums)
    unspent_free_cash:         float   # max(0, true_discretionary - optional - extra_debt)
```

> **Why `opt_subtotal` / `oth_subtotal`:** `optional_spending` is the merged total used for bar-width math. The two sub-fields are passed through so `DiscretionaryBar` can show `"Optional $X + Other $Y"` in the tooltip without re-deriving the split from merged data.

`PeriodData` gains one field (add last):
```python
cash_flow_waterfall: CashFlowWaterfall
```

### `backend/engine.py` — `build_period()`

Add at end of the existing aggregation block, before the `return PeriodData(...)` call. All values are `round(..., 2)`:

```python
_n_months     = len(period_months)
_min_total    = get_minimum_payment_total(_n_months)
_extra_debt   = round(max(0.0, dbt_total - _min_total), 2)
_necessary    = round(nec_total + min(dbt_total, _min_total), 2)
_true_disc    = round(max(0.0, kpi_income - _necessary), 2)
_opt_spend    = round(opt_total + oth_total, 2)
_unspent      = round(max(0.0, _true_disc - _opt_spend - _extra_debt), 2)

waterfall = CashFlowWaterfall(
    total_income=round(kpi_income, 2),
    necessary_spending=_necessary,
    true_discretionary_income=_true_disc,
    optional_spending=_opt_spend,
    opt_subtotal=round(opt_total, 2),
    oth_subtotal=round(oth_total, 2),
    extra_debt_payments=_extra_debt,
    unspent_free_cash=_unspent,
)
```

Add `cash_flow_waterfall=waterfall` to the `return PeriodData(...)` call.

### `backend/engine.py` — `_empty_period_data()`

Add zero-fill for the new field:
```python
cash_flow_waterfall=CashFlowWaterfall(
    total_income=0.0,
    necessary_spending=0.0,
    true_discretionary_income=0.0,
    optional_spending=0.0,
    extra_debt_payments=0.0,
    unspent_free_cash=0.0,
),
```

Import `CashFlowWaterfall` at the top of `engine.py`.

---

## Frontend Changes

### `frontend/src/types.ts`

Add before `PeriodData`:
```typescript
export interface CashFlowWaterfall {
  total_income:              number;
  necessary_spending:        number;
  true_discretionary_income: number;
  optional_spending:         number;
  extra_debt_payments:       number;
  unspent_free_cash:         number;
}
```

Add to `PeriodData`:
```typescript
cash_flow_waterfall: CashFlowWaterfall;
```

`CashFlowWaterfall` interface (8 fields, matching Python model exactly):
```typescript
export interface CashFlowWaterfall {
  total_income:              number;
  necessary_spending:        number;
  true_discretionary_income: number;
  optional_spending:         number;
  opt_subtotal:              number;   // optional category alone (tooltip)
  oth_subtotal:              number;   // other category alone (tooltip)
  extra_debt_payments:       number;
  unspent_free_cash:         number;
}
```

### `frontend/src/components/charts/DiscretionaryBar.tsx`

- Props: `{ waterfall: CashFlowWaterfall }`
- Full-width `<div>` containing two top-level flex children: Necessary block + Free Cash zone
- Free Cash zone is itself a flex row: Optional | Extra Debt | Unspent sub-blocks
- **Width formula:** each block width = `(value / total_income) * 100%`
- **Zero-income guard:** if `total_income === 0`, render an empty/placeholder state — no division
- **Rounding guard:** `unspent` block uses `flex: 1` (fills all remaining space) rather than a computed percentage, guaranteeing the bar always fills 100% even with floating-point residuals
- Hover tooltip (`title` attribute): `"$X,XXX (Y% of income)"` on each block. Optional block tooltip adds sub-total breakdown: `"Optional $X + Other $Y"`
- Minimum block height: 48px. Labels inside blocks via `overflow: hidden` (hidden if too narrow)
- No Chart.js canvas — pure CSS/flexbox, no reflow risk

### `frontend/src/pages/OverviewTab.tsx`

Mount as the very first child inside the padding `<div>`, before the KPI grid:
```tsx
import { DiscretionaryBar } from '../components/charts';

<CollapsibleCard title="Discretionary Income Breakdown">
  <DiscretionaryBar waterfall={period.cash_flow_waterfall} />
</CollapsibleCard>
```

### `frontend/src/components/charts/index.ts` (barrel export)

Add `export { DiscretionaryBar } from './DiscretionaryBar';`

---

## Validation — `frontend/scripts/validate_payload.ts`

### 1. Add `'cash_flow_waterfall'` to `PERIOD_FIELDS` array
This array drives the presence-check loop; without this the validator silently ignores the new field.

### 2. Add 8 type checks (one per field) inside the per-period loop:
| Field | Check |
|---|---|
| `total_income` | `typeof === 'number'` |
| `necessary_spending` | `typeof === 'number'` |
| `true_discretionary_income` | `typeof === 'number'` |
| `optional_spending` | `typeof === 'number'` |
| `opt_subtotal` | `typeof === 'number'` |
| `oth_subtotal` | `typeof === 'number'` |
| `extra_debt_payments` | `typeof === 'number'` |
| `unspent_free_cash` | `typeof === 'number'` |

### 3. Update the `totalChecks` formula
The current formula is: `PERIOD_KEYS.length * (PERIOD_FIELDS.length + 8) + 25`

- Adding `cash_flow_waterfall` to `PERIOD_FIELDS` automatically increments the presence-check term (no formula change needed for that).
- The 8 new explicit `typeof` checks per period must be added inside the parentheses: change `+ 8` → `+ 16`.
- New formula: `PERIOD_KEYS.length * (PERIOD_FIELDS.length + 16) + 25` = `5 * (21 + 16) + 25` = **210**

---

## Out of Scope (Phase 4+)

- Making `MINIMUM_PAYMENTS` dynamic (DB-backed or user-configured)
- Animating the bar on period change (Framer Motion)
- RSU tracking and Debt Snowball forecasting (separate Phase 3 feature)
