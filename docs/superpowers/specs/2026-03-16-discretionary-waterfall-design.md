# Discretionary Waterfall — Design Spec
**Date:** 2026-03-16
**Phase:** 3 (first feature)
**Status:** Approved

---

## Problem

The user needs a single, prominent view that answers: *"Of all the money that came in this period, how much is truly free — and where did that free cash actually go?"*

The existing `kpi_disposable` field (Income − Necessities − Debt) is a single number. It doesn't reveal whether the "free" portion went to optional spending, extra debt payments, or true savings.

---

## Solution: Discretionary Cash-Flow Waterfall

A thick, horizontal multi-segment bar mounted at the very top of the **Overview Tab**, above all KPI cards. It is the first thing the user sees when opening the dashboard.

### Waterfall Zones

```
|<------- total_income ---------------------------------------->|
|  necessary_spending  |<------ Free Cash --------------------->|
                       |  optional  |  extra debt  |  unspent  |
```

- **Necessary** (left, solid): `necessary_spending` = necessities + pro-rated minimum debt payments
- **Free Cash** (right zone): explicitly labeled, width = `true_discretionary_income`
  - **Optional Spending** (leftmost in Free Cash): what was actually spent on discretionary items
  - **Extra Debt Payments** (middle in Free Cash): debt payments above the minimums
  - **Unspent / Savings** (rightmost): remainder = `unspent_free_cash`

---

## Backend Changes

### `backend/classify.py`
Add a `MINIMUM_PAYMENTS` dict (static/mocked for Phase 3):
```python
MINIMUM_PAYMENTS: dict[str, float] = {
    "Chase Sapphire": 150.0,
    "Amex": 75.0,
    # ... add real values before Phase 4
}
```
This dict is the single source of truth for minimum payment math.

### `backend/models.py`
New model:
```python
class CashFlowWaterfall(BaseModel):
    total_income:             float
    necessary_spending:       float   # necessities + minimum debt payments
    true_discretionary_income: float  # total_income - necessary_spending
    optional_spending:        float   # optional + other category spend
    extra_debt_payments:      float   # debt payments above minimums
    unspent_free_cash:        float   # true_discretionary - optional - extra_debt
```
`PeriodData` gains: `cash_flow_waterfall: CashFlowWaterfall`

### `backend/engine.py` — `build_period()`
Waterfall math (added at end of existing aggregations):
```
period_months_count  = len(period_months)
min_total            = sum(MINIMUM_PAYMENTS.values()) * period_months_count
extra_debt           = max(0.0, dbt_total - min_total)
necessary            = nec_total + min(dbt_total, min_total)
true_discretionary   = max(0.0, kpi_income - necessary)
unspent              = max(0.0, true_discretionary - opt_total - extra_debt)
```

---

## Frontend Changes

### `frontend/src/types.ts`
```typescript
export interface CashFlowWaterfall {
  total_income:              number;
  necessary_spending:        number;
  true_discretionary_income: number;
  optional_spending:         number;
  extra_debt_payments:       number;
  unspent_free_cash:         number;
}
// PeriodData gains: cash_flow_waterfall: CashFlowWaterfall
```

### `frontend/src/components/charts/DiscretionaryBar.tsx`
- Full-width `<div>` with two top-level flex segments: `necessary` block + `free_cash` zone
- Free Cash zone contains three sub-blocks: optional (amber), extra debt (rose), unspent (emerald)
- Each segment has `title` attribute tooltip: `"$X,XXX.XX (Y% of income)"`
- Labels rendered inside each block (hidden via `overflow:hidden` if too narrow)
- Responsive: minimum height 48px, no Chart.js canvas (pure CSS/div — no reflow)

### `frontend/src/pages/OverviewTab.tsx`
Mount at top, before KPI grid:
```tsx
<CollapsibleCard title="Discretionary Income Breakdown">
  <DiscretionaryBar waterfall={period.cash_flow_waterfall} totalIncome={period.kpi_income} />
</CollapsibleCard>
```

---

## Validation

`frontend/scripts/validate_payload.ts` will need 6 new checks for the `cash_flow_waterfall` fields in each period.

---

## Out of Scope (Phase 3+)

- Making `MINIMUM_PAYMENTS` dynamic (pulled from DB or user-configured UI)
- Animating the bar on period change
- RSU tracking and Debt Snowball forecasting (separate Phase 3 feature)
