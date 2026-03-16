# Discretionary Waterfall Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cash_flow_waterfall` data structure to the backend pipeline and render it as a prominent multi-segment horizontal bar at the top of the Overview Tab.

**Architecture:** Python backend computes the waterfall math in `build_period()` and serialises it via a new `CashFlowWaterfall` Pydantic model into `data.json`. The TypeScript `PeriodData` interface gains a matching `CashFlowWaterfall` type. A new pure-CSS React component (`DiscretionaryBar`) renders the bar; it is mounted first inside `OverviewTab`.

**Tech Stack:** Python 3, Pydantic v2, pytest · React 18, TypeScript, Tailwind v4, Vite · `npm run validate` for round-trip JSON validation

**Spec:** `docs/superpowers/specs/2026-03-16-discretionary-waterfall-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/classify.py` | Add `MINIMUM_PAYMENTS` dict + `get_minimum_payment_total()` helper |
| Modify | `backend/models.py` | Add `CashFlowWaterfall` Pydantic model; extend `PeriodData` |
| Modify | `backend/engine.py` | Import `CashFlowWaterfall` + `get_minimum_payment_total`; compute waterfall in `build_period()`; zero-fill in `_empty_period_data()` |
| Modify | `requirements.txt` | Add `pytest` (no test infra yet) |
| Create | `tests/test_waterfall.py` | Unit tests for waterfall math and `get_minimum_payment_total` |
| Modify | `frontend/src/types.ts` | Add `CashFlowWaterfall` interface; extend `PeriodData` |
| Create | `frontend/src/components/charts/DiscretionaryBar.tsx` | New horizontal multi-segment bar component |
| Modify | `frontend/src/components/charts/index.ts` | Barrel-export `DiscretionaryBar` |
| Modify | `frontend/src/pages/OverviewTab.tsx` | Mount `DiscretionaryBar` at top |
| Modify | `frontend/scripts/validate_payload.ts` | Add `cash_flow_waterfall` to `PERIOD_FIELDS`; add 8 type checks per period; update `totalChecks` formula |

---

## Chunk 1: Backend

### Task 1: Add pytest and write failing waterfall math tests

**Files:**
- Modify: `requirements.txt`
- Create: `tests/__init__.py` (empty, makes `tests/` a package)
- Create: `tests/test_waterfall.py`

- [ ] **Step 1.1: Add pytest to requirements.txt**

Open `requirements.txt` and add `pytest>=8.0` as the third line:

```
pydantic>=2.0
pandas>=2.0
pytest>=8.0
```

- [ ] **Step 1.2: Install pytest**

```bash
call venv\Scripts\activate && pip install pytest
```

Expected output includes: `Successfully installed pytest-...`

- [ ] **Step 1.3: Create the tests package**

Create `tests/__init__.py` — leave it empty.

- [ ] **Step 1.4: Write the failing tests**

Create `tests/test_waterfall.py`:

```python
"""
Tests for waterfall math in backend/classify.py and backend/engine.py.
"""
import pytest
from backend.classify import get_minimum_payment_total, MINIMUM_PAYMENTS


# ── classify.py helpers ────────────────────────────────────────────────────

def test_minimum_payment_total_one_month():
    """Total for 1 month == sum of all values in MINIMUM_PAYMENTS."""
    expected = sum(MINIMUM_PAYMENTS.values())
    assert get_minimum_payment_total(1) == expected


def test_minimum_payment_total_scales_by_months():
    """Total scales linearly with number of months."""
    base = sum(MINIMUM_PAYMENTS.values())
    assert get_minimum_payment_total(3) == pytest.approx(base * 3)


def test_minimum_payment_total_zero_months():
    """Zero months produces 0."""
    assert get_minimum_payment_total(0) == 0.0


# ── waterfall math (pure functions, no DB needed) ──────────────────────────

def _compute_waterfall(
    kpi_income: float,
    nec_total: float,
    opt_total: float,
    oth_total: float,
    dbt_total: float,
    n_months: int = 1,
) -> dict:
    """
    Mirrors the waterfall computation in engine.py build_period().
    Keep in sync with that function.
    """
    from backend.classify import get_minimum_payment_total
    _min_total  = get_minimum_payment_total(n_months)
    extra_debt  = round(max(0.0, dbt_total - _min_total), 2)
    necessary   = round(nec_total + min(dbt_total, _min_total), 2)
    true_disc   = round(max(0.0, kpi_income - necessary), 2)
    opt_spend   = round(opt_total + oth_total, 2)
    unspent     = round(max(0.0, true_disc - opt_spend - extra_debt), 2)
    return dict(
        total_income=round(kpi_income, 2),
        necessary_spending=necessary,
        true_discretionary_income=true_disc,
        optional_spending=opt_spend,
        opt_subtotal=round(opt_total, 2),
        oth_subtotal=round(oth_total, 2),
        extra_debt_payments=extra_debt,
        unspent_free_cash=unspent,
    )


def test_no_debt_transactions():
    """When dbt_total == 0, extra_debt is 0 and necessary == nec_total only."""
    result = _compute_waterfall(
        kpi_income=5000.0,
        nec_total=2000.0,
        opt_total=500.0,
        oth_total=100.0,
        dbt_total=0.0,
    )
    assert result["extra_debt_payments"] == 0.0
    assert result["necessary_spending"] == 2000.0  # no debt contribution
    assert result["true_discretionary_income"] == pytest.approx(3000.0)
    assert result["optional_spending"] == pytest.approx(600.0)
    assert result["unspent_free_cash"] == pytest.approx(2400.0)


def test_debt_below_minimum():
    """When actual debt < minimum, extra_debt is 0; minimum is clamped to actual."""
    min_total = sum(MINIMUM_PAYMENTS.values())
    dbt_total = min_total / 2  # only half of minimum paid
    result = _compute_waterfall(
        kpi_income=5000.0,
        nec_total=2000.0,
        opt_total=300.0,
        oth_total=0.0,
        dbt_total=dbt_total,
    )
    assert result["extra_debt_payments"] == 0.0
    assert result["necessary_spending"] == pytest.approx(2000.0 + dbt_total, abs=0.01)


def test_debt_above_minimum():
    """When actual debt > minimum, the excess is extra_debt."""
    min_total = sum(MINIMUM_PAYMENTS.values())
    dbt_total = min_total + 200.0
    result = _compute_waterfall(
        kpi_income=5000.0,
        nec_total=2000.0,
        opt_total=300.0,
        oth_total=0.0,
        dbt_total=dbt_total,
    )
    assert result["extra_debt_payments"] == pytest.approx(200.0, abs=0.01)
    assert result["necessary_spending"] == pytest.approx(2000.0 + min_total, abs=0.01)


def test_unspent_never_negative():
    """unspent_free_cash floors at 0 even when spending exceeds discretionary."""
    result = _compute_waterfall(
        kpi_income=1000.0,
        nec_total=800.0,
        opt_total=500.0,  # way over discretionary
        oth_total=100.0,
        dbt_total=0.0,
    )
    assert result["unspent_free_cash"] == 0.0


def test_subtotals_sum_to_optional_spending():
    """opt_subtotal + oth_subtotal == optional_spending."""
    result = _compute_waterfall(
        kpi_income=5000.0,
        nec_total=2000.0,
        opt_total=400.0,
        oth_total=150.0,
        dbt_total=0.0,
    )
    assert result["opt_subtotal"] + result["oth_subtotal"] == pytest.approx(
        result["optional_spending"], abs=0.01
    )


def test_deficit_income_true_disc_clamps_at_zero():
    """When income < necessary spending, true_discretionary_income is 0, not negative."""
    result = _compute_waterfall(
        kpi_income=0.0,
        nec_total=500.0,
        opt_total=0.0,
        oth_total=0.0,
        dbt_total=0.0,
    )
    assert result["true_discretionary_income"] == 0.0
    assert result["unspent_free_cash"] == 0.0
```

- [ ] **Step 1.5: Run tests — expect FAIL (functions not defined yet)**

```bash
call venv\Scripts\activate && python -m pytest tests/test_waterfall.py -v
```

Expected: `ERROR` or `ImportError` because `get_minimum_payment_total` does not exist yet.

- [ ] **Step 1.6: Commit**

```bash
git add requirements.txt tests/__init__.py tests/test_waterfall.py
git commit -m "test: add waterfall math unit tests (red)"
```

---

### Task 2: Update `backend/classify.py`

**Files:**
- Modify: `backend/classify.py`

- [ ] **Step 2.1: Add `MINIMUM_PAYMENTS` and `get_minimum_payment_total` to classify.py**

Open `backend/classify.py`. After the `INCOME_CATEGORIES` / `CHECKING_KEYWORDS` lines (currently around line 44–45), add:

```python
# ---------------------------------------------------------------------------
# Minimum debt payments (mocked for Phase 3; keys = lowercase account name substrings)
# Phase 4 will replace this with a DB-backed or user-configured source.
# ---------------------------------------------------------------------------

MINIMUM_PAYMENTS: dict[str, float] = {
    "chase sapphire": 150.0,
    "amex":           75.0,
}


def get_minimum_payment_total(n_months: int = 1) -> float:
    """Sum of all minimum payments, scaled by number of months in the period."""
    return sum(MINIMUM_PAYMENTS.values()) * n_months
```

- [ ] **Step 2.2: Run tests — expect PASS on classify tests, still FAIL on waterfall tests**

```bash
call venv\Scripts\activate && python -m pytest tests/test_waterfall.py -v
```

Expected: `test_minimum_payment_total_*` tests PASS; `test_no_debt_transactions` etc. may still fail (they call `_compute_waterfall` which is a local helper — they should actually pass now since the helper is self-contained).

All 9 tests should now **PASS**. The `_compute_waterfall` helper is defined **locally inside the test file** (not imported from engine.py) — it only needs `get_minimum_payment_total` and `MINIMUM_PAYMENTS` from `classify.py`, both of which are added in Step 2.1.

Expected output:
```
9 passed in 0.XXs
```

- [ ] **Step 2.3: Commit**

```bash
git add backend/classify.py
git commit -m "feat: add MINIMUM_PAYMENTS dict and get_minimum_payment_total() to classify.py"
```

---

### Task 3: Update `backend/models.py`

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 3.1: Add `CashFlowWaterfall` model**

Open `backend/models.py`. Immediately **before** the `PeriodData` class (currently at line 51), insert:

```python
class CashFlowWaterfall(BaseModel):
    total_income:               float
    necessary_spending:         float   # necessities + min(dbt_total, sum_minimums)
    true_discretionary_income:  float   # max(0, total_income - necessary_spending)
    optional_spending:          float   # opt_total + oth_total (merged for bar width)
    opt_subtotal:               float   # opt_total alone (for tooltip sub-breakdown)
    oth_subtotal:               float   # oth_total alone (for tooltip sub-breakdown)
    extra_debt_payments:        float   # max(0, dbt_total - sum_minimums)
    unspent_free_cash:          float   # max(0, true_discretionary - optional - extra_debt)
```

- [ ] **Step 3.2: Add `cash_flow_waterfall` field to `PeriodData`**

In the `PeriodData` class, append as the last field (after `sankey: list[SankeyFlow]`):

```python
    cash_flow_waterfall: CashFlowWaterfall
```

- [ ] **Step 3.3: Verify Pydantic model imports cleanly**

```bash
call venv\Scripts\activate && python -c "from backend.models import CashFlowWaterfall, PeriodData; print('OK')"
```

Expected: `OK`

- [ ] **Step 3.4: Commit**

```bash
git add backend/models.py
git commit -m "feat: add CashFlowWaterfall Pydantic model; extend PeriodData"
```

---

### Task 4: Update `backend/engine.py`

**Files:**
- Modify: `backend/engine.py`

- [ ] **Step 4.1: Update imports**

At the top of `engine.py`, find the two existing import lines:

```python
from backend.classify import classify, guess_interest_rate
```
and
```python
from backend.models import (
```

Change the classify import to:
```python
from backend.classify import classify, get_minimum_payment_total, guess_interest_rate
```

Add `CashFlowWaterfall` to the models import block (it currently imports `Account`, `DebtAccount`, `DebtSection`, `DebtTrend`, `PeriodData`, `SankeyFlow`, `Summary`, `Transaction`):
```python
from backend.models import (
    Account,
    CashFlowWaterfall,
    DebtAccount,
    DebtSection,
    DebtTrend,
    PeriodData,
    SankeyFlow,
    Summary,
    Transaction,
)
```

- [ ] **Step 4.2: Compute waterfall in `build_period()`**

In `build_period()`, find the line (currently ~line 252):
```python
        kpi_disposable=round(kpi_income - nec_total - dbt_total, 2),
```

Insert the waterfall block **immediately before** the `return PeriodData(...)` call:

```python
    # ── Discretionary waterfall ────────────────────────────────────────────
    _n_months   = len(period_months)
    _min_total  = get_minimum_payment_total(_n_months)
    _extra_debt = round(max(0.0, dbt_total - _min_total), 2)
    _necessary  = round(nec_total + min(dbt_total, _min_total), 2)
    _true_disc  = round(max(0.0, kpi_income - _necessary), 2)
    _opt_spend  = round(opt_total + oth_total, 2)
    _unspent    = round(max(0.0, _true_disc - _opt_spend - _extra_debt), 2)
    waterfall   = CashFlowWaterfall(
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

Then add `cash_flow_waterfall=waterfall,` as the last argument inside the `return PeriodData(...)` call.

- [ ] **Step 4.3: Zero-fill `_empty_period_data()`**

In `_empty_period_data()`, add `cash_flow_waterfall=` as the last argument inside the `return PeriodData(...)` call:

```python
        cash_flow_waterfall=CashFlowWaterfall(
            total_income=0.0,
            necessary_spending=0.0,
            true_discretionary_income=0.0,
            optional_spending=0.0,
            opt_subtotal=0.0,
            oth_subtotal=0.0,
            extra_debt_payments=0.0,
            unspent_free_cash=0.0,
        ),
```

- [ ] **Step 4.4: Run engine standalone to verify no errors**

```bash
call venv\Scripts\activate && python -m backend.engine
```

Expected: engine prints Summary, Accounts, Period data (now including `cash_flow_waterfall`), Debt section, Transactions. No `ValidationError`.

- [ ] **Step 4.5: Run all tests**

```bash
call venv\Scripts\activate && python -m pytest tests/test_waterfall.py -v
```

Expected: `9 passed`

- [ ] **Step 4.6: Commit**

```bash
git add backend/engine.py
git commit -m "feat: compute cash_flow_waterfall in build_period() and _empty_period_data()"
```

---

## Chunk 2: Frontend + Build

### Task 5: Update `frontend/src/types.ts`

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 5.1: Add `CashFlowWaterfall` interface**

Open `frontend/src/types.ts`. Immediately before the `export interface PeriodData {` line (currently line 27), insert:

```typescript
export interface CashFlowWaterfall {
  total_income:               number;  // 1
  necessary_spending:         number;  // 2
  true_discretionary_income:  number;  // 3
  optional_spending:          number;  // 4 — opt_subtotal + oth_subtotal merged
  opt_subtotal:               number;  // 5 — optional category alone (tooltip)
  oth_subtotal:               number;  // 6 — other category alone (tooltip)
  extra_debt_payments:        number;  // 7
  unspent_free_cash:          number;  // 8
}

```

> These **8 fields** must exactly match the 8 `typeof === 'number'` checks in Task 8 and the 8 fields on the Python `CashFlowWaterfall` Pydantic model in `backend/models.py`.

- [ ] **Step 5.2: Extend `PeriodData`**

At the end of `PeriodData` (after the `sankey: SankeyFlow[];` line), add:

```typescript
  cash_flow_waterfall: CashFlowWaterfall;
```

- [ ] **Step 5.3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (data.json not yet updated, but validate script handles that separately).

- [ ] **Step 5.4: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add CashFlowWaterfall interface and extend PeriodData in types.ts"
```

---

### Task 6: Create `DiscretionaryBar.tsx`

**Files:**
- Create: `frontend/src/components/charts/DiscretionaryBar.tsx`

- [ ] **Step 6.1: Create the component**

Create `frontend/src/components/charts/DiscretionaryBar.tsx`:

```tsx
import type { CashFlowWaterfall } from '../../types';

interface DiscretionaryBarProps {
  waterfall: CashFlowWaterfall;
}

function fmt(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return (n / total * 100).toFixed(1) + '%';
}

export function DiscretionaryBar({ waterfall }: DiscretionaryBarProps) {
  const {
    total_income,
    necessary_spending,
    true_discretionary_income,
    optional_spending,
    opt_subtotal,
    oth_subtotal,
    extra_debt_payments,
    unspent_free_cash,
  } = waterfall;

  // Guard against zero income (no data yet or empty period)
  if (total_income === 0) {
    return (
      <div className="w-full rounded-lg overflow-hidden" style={{ height: 52 }}>
        <div
          className="w-full h-full flex items-center justify-center text-sm"
          style={{ backgroundColor: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}
        >
          No income data for this period
        </div>
      </div>
    );
  }

  // Width as percentage of total_income
  const w = (value: number) => `${(value / total_income * 100).toFixed(4)}%`;

  return (
    <div style={{ padding: '0.25rem 0' }}>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'var(--color-text-muted)', display: 'inline-block', opacity: 0.5 }} />
          Necessary
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#f59e0b', display: 'inline-block' }} />
          Optional
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#f43f5e', display: 'inline-block' }} />
          Extra Debt
        </span>
        <span className="flex items-center gap-1">
          <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#10b981', display: 'inline-block' }} />
          Unspent / Savings
        </span>
      </div>

      {/* Bar */}
      <div
        className="w-full flex rounded-lg overflow-hidden"
        style={{ height: 52 }}
        role="img"
        aria-label={`Income breakdown: ${fmt(necessary_spending)} necessary, ${fmt(true_discretionary_income)} free cash`}
      >
        {/* Necessary block */}
        <div
          title={`Necessary: ${fmt(necessary_spending)} (${pct(necessary_spending, total_income)} of income)\nIncludes rent, utilities, groceries, insurance, and minimum debt payments.`}
          style={{
            width: w(necessary_spending),
            backgroundColor: 'var(--color-text-muted)',
            opacity: 0.45,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            cursor: 'help',
          }}
        >
          <span
            className="text-xs font-semibold px-1"
            style={{ color: 'var(--color-text-primary)', mixBlendMode: 'difference' }}
          >
            {necessary_spending > total_income * 0.08 ? `Necessary ${pct(necessary_spending, total_income)}` : ''}
          </span>
        </div>

        {/* Optional spending block */}
        {optional_spending > 0 && (
          <div
            title={`Optional: ${fmt(optional_spending)} (${pct(optional_spending, total_income)} of income)\nOptional ${fmt(opt_subtotal)} + Other ${fmt(oth_subtotal)}`}
            style={{
              width: w(optional_spending),
              backgroundColor: '#f59e0b',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'help',
            }}
          >
            <span className="text-xs font-semibold px-1 text-white">
              {optional_spending > total_income * 0.06 ? pct(optional_spending, total_income) : ''}
            </span>
          </div>
        )}

        {/* Extra debt block */}
        {extra_debt_payments > 0 && (
          <div
            title={`Extra Debt Payments: ${fmt(extra_debt_payments)} (${pct(extra_debt_payments, total_income)} of income)\nDebt paid above minimum payments — accelerating payoff.`}
            style={{
              width: w(extra_debt_payments),
              backgroundColor: '#f43f5e',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              cursor: 'help',
            }}
          >
            <span className="text-xs font-semibold px-1 text-white">
              {extra_debt_payments > total_income * 0.06 ? pct(extra_debt_payments, total_income) : ''}
            </span>
          </div>
        )}

        {/* Unspent / Savings — flex:1 absorbs floating-point residual */}
        <div
          title={`Unspent / Savings: ${fmt(unspent_free_cash)} (${pct(unspent_free_cash, total_income)} of income)\nFree cash not spent on optional items or extra debt.`}
          style={{
            flex: 1,
            backgroundColor: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            cursor: 'help',
            minWidth: 0,
          }}
        >
          <span className="text-xs font-semibold px-1 text-white">
            {unspent_free_cash > total_income * 0.06 ? `Savings ${pct(unspent_free_cash, total_income)}` : ''}
          </span>
        </div>
      </div>

      {/* Sub-labels row */}
      <div className="flex justify-between mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span>{fmt(necessary_spending)} necessary</span>
        <span
          className="font-semibold"
          style={{ color: '#10b981' }}
        >
          {fmt(true_discretionary_income)} free cash
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/components/charts/DiscretionaryBar.tsx
git commit -m "feat: create DiscretionaryBar component — horizontal discretionary waterfall bar"
```

---

### Task 7: Add barrel export and mount in OverviewTab

**Files:**
- Modify: `frontend/src/components/charts/index.ts`
- Modify: `frontend/src/pages/OverviewTab.tsx`

- [ ] **Step 7.1: Export from barrel**

Open `frontend/src/components/charts/index.ts`. Add as the last line:

```typescript
export { DiscretionaryBar } from './DiscretionaryBar';
```

- [ ] **Step 7.2: Mount in OverviewTab**

Open `frontend/src/pages/OverviewTab.tsx`.

Update the import line at line 3 to include `DiscretionaryBar`:
```tsx
import { SankeyChart, DiscretionaryBar } from '../components/charts';
```

Inside the `return (...)`, immediately after `<div style={{ padding: '1.5rem' }}>` and **before** the `{/* KPI Row */}` comment, insert:

```tsx
      {/* Discretionary Waterfall — most critical metric, shown first */}
      <div style={{ marginBottom: '1.25rem' }}>
        <CollapsibleCard title="Discretionary Income Breakdown">
          <DiscretionaryBar waterfall={period.cash_flow_waterfall} />
        </CollapsibleCard>
      </div>
```

- [ ] **Step 7.3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7.4: Commit**

```bash
git add frontend/src/components/charts/index.ts frontend/src/pages/OverviewTab.tsx
git commit -m "feat: mount DiscretionaryBar at top of OverviewTab"
```

---

### Task 8: Update `validate_payload.ts`

**Files:**
- Modify: `frontend/scripts/validate_payload.ts`

- [ ] **Step 8.1: Add `cash_flow_waterfall` to `PERIOD_FIELDS`**

In `validate_payload.ts`, find the `PERIOD_FIELDS` array (lines 25–30). It currently ends with `'sankey'`. Add `'cash_flow_waterfall'` as the last entry:

```typescript
const PERIOD_FIELDS: (keyof PeriodData)[] = [
  'labels', 'income', 'spending', 'necessity', 'optional', 'other', 'debt',
  'chk_income', 'chk_outflow', 'nec_opt_donut',
  'cat_labels', 'cat_values', 'src_labels', 'src_values',
  'kpi_income', 'kpi_spending', 'kpi_net', 'kpi_debt', 'kpi_disposable', 'sankey',
  'cash_flow_waterfall',
];
```

- [ ] **Step 8.2: Add 8 type checks for cash_flow_waterfall fields**

Inside the `for (const pk of PERIOD_KEYS)` loop, after the existing `p.sankey` check block (currently ending at line ~87), add:

```typescript
    // cash_flow_waterfall field type checks
    const wf = p.cash_flow_waterfall;
    check(typeof wf?.total_income              === 'number', `periods.${pk}.cash_flow_waterfall.total_income must be number`);
    check(typeof wf?.necessary_spending        === 'number', `periods.${pk}.cash_flow_waterfall.necessary_spending must be number`);
    check(typeof wf?.true_discretionary_income === 'number', `periods.${pk}.cash_flow_waterfall.true_discretionary_income must be number`);
    check(typeof wf?.optional_spending         === 'number', `periods.${pk}.cash_flow_waterfall.optional_spending must be number`);
    check(typeof wf?.opt_subtotal              === 'number', `periods.${pk}.cash_flow_waterfall.opt_subtotal must be number`);
    check(typeof wf?.oth_subtotal              === 'number', `periods.${pk}.cash_flow_waterfall.oth_subtotal must be number`);
    check(typeof wf?.extra_debt_payments       === 'number', `periods.${pk}.cash_flow_waterfall.extra_debt_payments must be number`);
    check(typeof wf?.unspent_free_cash         === 'number', `periods.${pk}.cash_flow_waterfall.unspent_free_cash must be number`);
```

- [ ] **Step 8.3: Update the `totalChecks` formula**

Find line 129:
```typescript
const totalChecks = PERIOD_KEYS.length * (PERIOD_FIELDS.length + 8) + 25;
```

Change `+ 8` to `+ 16` (8 new per-period typeof checks added above):
```typescript
const totalChecks = PERIOD_KEYS.length * (PERIOD_FIELDS.length + 16) + 25;
```

After this change, `totalChecks` = `5 * (21 + 16) + 25` = **210**.

- [ ] **Step 8.4: Commit**

```bash
git add frontend/scripts/validate_payload.ts
git commit -m "feat: add cash_flow_waterfall checks to validate_payload.ts (210 checks)"
```

---

### Task 9: Run full pipeline and verify

- [ ] **Step 9.1: Run Python pipeline to regenerate data.json**

```bash
call venv\Scripts\activate && python generate_dashboard.py
```

Expected: completes without errors. `frontend/public/data.json` is updated with `cash_flow_waterfall` in each period.

- [ ] **Step 9.2: Run validate**

```bash
cd frontend && npm run validate
```

Expected output:
```
✅  data.json ✓ matches DashboardPayload  (210+ checks passed)
    XX accounts | XXXX transactions | 5 periods | X debt accounts
```

If validation fails, read the error messages — they will point exactly to the failing field.

- [ ] **Step 9.3: Build the React app**

```bash
cd frontend && npm run build
```

Expected: no TypeScript or Vite errors. `dist/` folder created.

- [ ] **Step 9.4: Serve and visually verify**

```bash
cd frontend && npx serve dist -p 3000
```

Open `http://localhost:3000`. Verify:
1. Overview Tab is the landing tab
2. The `DiscretionaryBar` inside "Discretionary Income Breakdown" card appears **above** the KPI cards
3. The bar shows at least two colored segments (Necessary + at least one other)
4. Hovering any segment shows a tooltip with `$X,XXX (Y% of income)` text
5. The sub-label row below the bar shows "$ necessary" on the left and "$ free cash" in green on the right

- [ ] **Step 9.5: Run all backend tests one final time**

```bash
call venv\Scripts\activate && python -m pytest tests/ -v
```

Expected: `9 passed`

- [ ] **Step 9.6: Final commit and push**

```bash
git add frontend/public/data.json
git commit -m "feat: Phase 3 Milestone 1 — Discretionary Waterfall complete"
git push
```

---

## Rollback

If the pipeline breaks at any point:
- `data.json` is always regenerated by `python generate_dashboard.py` — it is safe to delete and regenerate
- The `cash_flow_waterfall` field is purely additive to `PeriodData` — no existing fields are removed or renamed
- Reverting `backend/models.py` and `backend/engine.py` to pre-task-3 state restores prior behavior
