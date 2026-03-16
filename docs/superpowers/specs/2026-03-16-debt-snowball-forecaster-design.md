# Debt Snowball Forecaster — Phase 3, Step 2
**Date:** 2026-03-16
**Status:** Approved

---

## Overview

Add a month-by-month payoff simulation engine to the financial dashboard that computes Snowball (lowest balance first) and Avalanche (highest APR first) debt repayment scenarios. Both scenarios ship in `data.json` via the existing Python → Pydantic → JSON pipeline. The frontend renders a segmented toggle card that hot-swaps between strategies.

---

## Architecture Principles

- **Pydantic is our API.** All new models are pure `BaseModel` subclasses — no FastAPI-specific decorators, no coupled logic. Phase 4 can return `DebtProjection` directly from a FastAPI route without rewriting anything.
- **Dumb components.** The React `PayoffForecaster` component accepts a `DebtProjection` prop and has zero knowledge of data origin.
- **Forward-compatible mocks.** `MOCK_APRS` and `MINIMUM_PAYMENTS` live in `classify.py` (already established). Phase 5 replaces these with Plaid API values without touching engine logic.

---

## Layer 1 — Data Contract (`backend/models.py`)

### New models

```python
class PayoffScenario(BaseModel):
    payoff_months: int          # months until total balance reaches 0
    total_interest_paid: float  # cumulative interest paid across all accounts
    monthly_balances: list[float]  # total remaining debt each month (for chart)

class DebtProjection(BaseModel):
    snowball: PayoffScenario
    avalanche: PayoffScenario
    monthly_allocation: float   # total monthly cash dedicated to debt (for display)
```

### Extended model

```python
class DebtSection(BaseModel):
    accounts: list[DebtAccount]
    trend: DebtTrend
    projection: DebtProjection  # NEW field
```

**TypeScript mirrors** (`frontend/src/types.ts`):

```typescript
interface PayoffScenario {
  payoff_months: number;
  total_interest_paid: number;
  monthly_balances: number[];
}

interface DebtProjection {
  snowball: PayoffScenario;
  avalanche: PayoffScenario;
  monthly_allocation: number;
}

interface DebtSection {
  accounts: DebtAccount[];
  trend: { labels: string[]; values: number[] };
  projection: DebtProjection;  // NEW
}
```

---

## Layer 2 — Engine (`backend/debt_engine.py`)

New module. No pandas dependency — pure Python stdlib + dataclasses/dicts.

### Constants

```python
MOCK_APRS: dict[str, float] = {
    "chase sapphire": 0.24,
    "amex":           0.19,
}
```

### `get_apr_for_account(account_name: str) -> float`

1. Lowercase the input.
2. Loop `MOCK_APRS`; return value on substring match.
3. Fallback: `guess_interest_rate(account_name) / 100.0`.

This ensures graceful degradation — new accounts assume ~22% APR until explicitly overridden.

### `simulate_payoff(accounts, monthly_allocation, strategy) -> PayoffScenario`

**Inputs:**
- `accounts`: list of `DebtAccount` (name, balance as negative float, rate as decimal)
- `monthly_allocation`: float (default 2000.0)
- `strategy`: `Literal["snowball", "avalanche"]`

**Algorithm:**
1. Build a mutable working list of `{name, balance (positive), apr, min_payment}` dicts.
   - `min_payment` sourced from `MINIMUM_PAYMENTS` (substring match), fallback to 1% of balance.
2. Sort target order:
   - Snowball → ascending absolute balance
   - Avalanche → descending APR
3. Loop months (cap: 600):
   a. Apply monthly interest: `balance *= (1 + apr/12)` per account.
   b. Apply minimum payments to all accounts. Track total paid.
   c. Compute remaining allocation after minimums.
   d. Apply remainder to the current target account (first non-zero in sorted order).
   e. Clamp all balances at 0. Remove paid-off accounts.
   f. Record `sum(balances)` in `monthly_balances`.
   g. Break when all balances are 0.
4. Return `PayoffScenario(payoff_months, total_interest_paid, monthly_balances)`.

**Edge case handling:**
- 600-month cap prevents infinite loops when allocation < total interest accruing.
- Empty accounts list → returns `PayoffScenario(payoff_months=0, total_interest_paid=0.0, monthly_balances=[])`.
- Accounts with zero balance are skipped.

### `build_projection(accounts, monthly_allocation) -> DebtProjection`

Calls `simulate_payoff` twice (snowball, avalanche) and wraps in `DebtProjection`.

---

### Note on `monthly_allocation` default

For this phase, `monthly_allocation=2000.0` is a **deliberate fixed placeholder** (user-specified baseline for Phase 3). It is surfaced in the UI card so the user can see what assumption drives the projection. Phase 4 will replace this with a value computed from the current-period waterfall:

```python
# Future Phase 4 derivation (not implemented now):
monthly_allocation = (
    waterfall.unspent_free_cash
    + waterfall.extra_debt_payments
    + sum(MINIMUM_PAYMENTS.values())
)
```

The constant `2000.0` is documented — not magic.

---

## Layer 3 — Engine Wiring (`backend/engine.py`)

### Empty `DebtSection` return path (critical fix)

The existing early-return at line 319:
```python
return DebtSection(accounts=[], trend=DebtTrend(labels=[], values=[]))
```
will throw a Pydantic `ValidationError` once `DebtSection` gains the required `projection` field. This path must be updated to include a zero-value `DebtProjection`:
```python
_empty_scenario = PayoffScenario(payoff_months=0, total_interest_paid=0.0, monthly_balances=[])
return DebtSection(
    accounts=[],
    trend=DebtTrend(labels=[], values=[]),
    projection=DebtProjection(
        snowball=_empty_scenario,
        avalanche=_empty_scenario,
        monthly_allocation=0.0,
    ),
)
```

### Normal path

`build_debt_section()` is extended:

```python
from backend.debt_engine import build_projection, get_apr_for_account

# After building debt_accounts list:
# Enrich accounts with looked-up APRs (replaces guess_interest_rate call)
# Then:
projection = build_projection(debt_accounts, monthly_allocation=2000.0)

return DebtSection(
    accounts=debt_accounts,
    trend=DebtTrend(labels=..., values=...),
    projection=projection,
)
```

---

## Layer 4 — Frontend (`frontend/src/pages/DebtTab.tsx`)

### `PayoffForecaster` card

Position: top of `DebtTab`, above the existing KPI row.

**Structure:**
```
┌─────────────────────────────────────────────────────┐
│  Payoff Forecaster          [ Snowball | Avalanche ] │
│                                                      │
│  Debt Free in               Total Interest           │
│  Aug 2027 (17 months)       $4,210                   │
│                                                      │
│  Avalanche saves you $340 in interest                │
│                                                      │
│  [Monthly balances sparkline chart]                  │
└─────────────────────────────────────────────────────┘
```

**State:** `useState<'snowball' | 'avalanche'>('snowball')` — local to the card.

**Payoff date computation:** `today + payoff_months` months, formatted as `"MMM YYYY"`.

**Comparative sub-text logic:**
- If active = snowball: `"Avalanche saves you $X in interest"`
- If active = avalanche: `"Snowball would cost $X more in interest"` (or "strategies tie" if equal)
- Sub-text is hidden if difference < $1.

**Props interface:**
```typescript
interface PayoffForecasterProps {
  projection: DebtProjection;
}
```

---

## Layer 5 — Validation (`frontend/scripts/validate_payload.ts`)

Exactly 9 new runtime checks:

```
1. debt.projection must exist (object)
2. debt.projection.monthly_allocation must be number
3. debt.projection.snowball must exist (object)
4. debt.projection.snowball.payoff_months must be number
5. debt.projection.snowball.total_interest_paid must be number
6. debt.projection.snowball.monthly_balances must be array
7. debt.projection.avalanche must exist (object)
8. debt.projection.avalanche.payoff_months must be number
9. debt.projection.avalanche.total_interest_paid must be number
```

The existing `totalChecks` formula at line 141:
```typescript
const totalChecks = PERIOD_KEYS.length * (PERIOD_FIELDS.length + 16) + 25;
```
Update the trailing `+ 25` → `+ 34` (25 existing non-period checks + 9 new projection checks).

---

## Layer 6 — Tests (`tests/test_debt_engine.py`)

All tests are pure unit tests — no DB, no file I/O.

| Test | Assertion |
|------|-----------|
| `test_single_account_payoff` | One account, known APR/balance → payoff_months matches hand-computed result |
| `test_snowball_pays_lowest_first` | Two accounts; snowball clears small one first |
| `test_avalanche_targets_highest_apr` | Two accounts; avalanche clears high-APR one first |
| `test_snowball_vs_avalanche_interest` | Avalanche total_interest_paid ≤ snowball (always true mathematically) |
| `test_empty_accounts` | Returns PayoffScenario with 0 months, 0 interest, empty list |
| `test_600_month_cap` | Allocation below interest floor → caps at 600 months, no infinite loop |
| `test_monthly_balances_length` | len(monthly_balances) == payoff_months |
| `test_monthly_balances_monotone` | Balances are non-increasing each month (**precondition: allocation > total monthly interest**; does not apply to the 600-month cap case) |
| `test_get_apr_mock_match` | "Chase Sapphire Preferred" → 0.24 (substring match) |
| `test_get_apr_fallback` | "Unknown Card XYZ" → uses guess_interest_rate fallback |

---

## Implementation Order

1. `backend/models.py` — add `PayoffScenario`, `DebtProjection`, extend `DebtSection` (**must come first** — `debt_engine.py` imports these models)
2. `backend/debt_engine.py` — engine + constants
3. `tests/test_debt_engine.py` — all tests must pass before wiring
4. `backend/engine.py` — wire `build_debt_section()` to call `build_projection()`
5. `frontend/src/types.ts` — add TS interfaces
6. `frontend/scripts/validate_payload.ts` — add checks, update `totalChecks`
7. `frontend/src/pages/DebtTab.tsx` — build `PayoffForecaster` card
8. Run full pipeline: `python -m backend.engine` → `npm run validate` → `npm run build`

---

## Files Modified / Created

| File | Action |
|------|--------|
| `backend/debt_engine.py` | CREATE |
| `tests/test_debt_engine.py` | CREATE |
| `backend/models.py` | MODIFY — add 2 models, extend DebtSection |
| `backend/engine.py` | MODIFY — wire build_debt_section |
| `frontend/src/types.ts` | MODIFY — add 2 interfaces, extend DebtSection |
| `frontend/scripts/validate_payload.ts` | MODIFY — 9 new checks, totalChecks +25→+34 |
| `frontend/src/pages/DebtTab.tsx` | MODIFY — add PayoffForecaster card |
| `CLAUDE.md` | MODIFY — mark Phase 3 Step 2 complete |
