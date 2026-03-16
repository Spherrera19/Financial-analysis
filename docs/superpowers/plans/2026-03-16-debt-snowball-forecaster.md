# Debt Snowball Forecaster Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Snowball and Avalanche debt payoff simulations to the backend pipeline and render a "Payoff Forecaster" toggle card in the Debt tab.

**Architecture:** Pure Python month-by-month simulation in `backend/debt_engine.py` produces two `PayoffScenario` Pydantic models (one per strategy) wrapped in `DebtProjection`, which is appended to `DebtSection` and serialized into `data.json`. The React `PayoffForecaster` card reads `data.debt.projection` via props, hot-swaps strategies with a segmented toggle, and displays payoff date, total interest, and a balance sparkline.

**Tech Stack:** Python 3, Pydantic v2, pytest · React 18, TypeScript, Tailwind v4, Chart.js, Vite · `npm run validate` for round-trip JSON validation

**Spec:** `docs/superpowers/specs/2026-03-16-debt-snowball-forecaster-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/models.py` | Add `PayoffScenario`, `DebtProjection`; extend `DebtSection` with `projection` field |
| Create | `backend/debt_engine.py` | `MOCK_APRS`, `get_apr_for_account()`, `simulate_payoff()`, `build_projection()` |
| Create | `tests/test_debt_engine.py` | 13 unit tests for engine logic — no DB, no file I/O |
| Modify | `backend/engine.py` | Wire `build_debt_section()` to call `build_projection()`; fix empty-path return |
| Modify | `frontend/src/types.ts` | Add `PayoffScenario`, `DebtProjection` interfaces; extend `DebtSection` |
| Modify | `frontend/scripts/validate_payload.ts` | 9 new checks for `debt.projection.*`; update `totalChecks` |
| Modify | `frontend/src/pages/DebtTab.tsx` | Add `PayoffForecaster` card at top of tab |
| Modify | `CLAUDE.md` | Mark Phase 3 Step 2 complete |

---

## Chunk 1: Backend

### Task 1: Extend `backend/models.py` with new Pydantic models

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1.1: Add `PayoffScenario` and `DebtProjection` models; extend `DebtSection`**

Open `backend/models.py`. After the `DebtTrend` class (line ~100) and before `DebtSection`, insert the two new models. Then add a `projection` field to `DebtSection`:

```python
class PayoffScenario(BaseModel):
    payoff_months: int              # months until total balance reaches 0
    total_interest_paid: float      # cumulative interest paid across all accounts
    monthly_balances: list[float]   # total remaining debt each month (for sparkline)


class DebtProjection(BaseModel):
    snowball: PayoffScenario
    avalanche: PayoffScenario
    monthly_allocation: float       # cash dedicated to debt per month (for display)


class DebtSection(BaseModel):
    accounts: list[DebtAccount]
    trend: DebtTrend
    projection: DebtProjection      # NEW — required field
```

Also add `PayoffScenario` and `DebtProjection` to the imports inside `backend/engine.py` (done in Task 4, noted here for awareness).

- [ ] **Step 1.2: Verify models.py parses cleanly**

```bash
cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March"
call venv\Scripts\activate && python -c "from backend.models import PayoffScenario, DebtProjection, DebtSection; print('OK')"
```

Expected output: `OK`

- [ ] **Step 1.3: Commit**

```bash
git add backend/models.py
git commit -m "feat: add PayoffScenario, DebtProjection models; extend DebtSection"
```

---

### Task 2: Create `backend/debt_engine.py`

**Files:**
- Create: `backend/debt_engine.py`

- [ ] **Step 2.1: Create the file**

Create `backend/debt_engine.py` with the following content:

```python
"""
Phase 3, Step 2 — Debt Snowball / Avalanche Forecaster
=======================================================
Pure Python simulation engine — no Pandas, no DB access.
Designed for Phase 4 FastAPI migration: build_projection() returns a
DebtProjection Pydantic model that can be returned directly from a route.

Run standalone:
    python -c "from backend.debt_engine import build_projection; print(build_projection([]))"
"""
from __future__ import annotations

from typing import Literal

from backend.classify import MINIMUM_PAYMENTS, guess_interest_rate
from backend.models import DebtAccount, DebtProjection, PayoffScenario

# ---------------------------------------------------------------------------
# Mock APR overrides (Phase 3 placeholder — replaced by DB/Plaid in Phase 5)
# Keys are lowercase substrings that may appear in actual account names.
# ---------------------------------------------------------------------------

MOCK_APRS: dict[str, float] = {
    "chase sapphire": 0.24,
    "amex":           0.19,
}

MAX_SIMULATION_MONTHS = 600  # 50-year safety cap; prevents infinite loops


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_apr_for_account(account_name: str) -> float:
    """
    Return the annual percentage rate (as a decimal, e.g. 0.24) for an account.

    Priority:
    1. Substring match against MOCK_APRS keys (case-insensitive).
    2. Fallback: guess_interest_rate() / 100.0 (returns percentage — divide to normalise).
    """
    lower = account_name.lower()
    for mock_key, apr in MOCK_APRS.items():
        if mock_key in lower:
            return apr
    return guess_interest_rate(account_name) / 100.0


def _get_min_payment(account_name: str, balance: float) -> float:
    """
    Return the minimum monthly payment for an account.

    Priority:
    1. Substring match against MINIMUM_PAYMENTS (case-insensitive, from classify.py).
    2. Fallback: 1% of current balance.
    """
    lower = account_name.lower()
    for key, amount in MINIMUM_PAYMENTS.items():
        if key in lower:
            return amount
    return round(balance * 0.01, 2)


# ---------------------------------------------------------------------------
# Core simulation
# ---------------------------------------------------------------------------

def simulate_payoff(
    accounts: list[DebtAccount],
    monthly_allocation: float,
    strategy: Literal["snowball", "avalanche"],
) -> PayoffScenario:
    """
    Simulate month-by-month debt payoff.

    Snowball  — target the lowest balance first (fastest psychological win).
    Avalanche — target the highest APR first (lowest total interest paid).

    Each month:
      1. Apply compound interest to every account.
      2. Make minimum payments on every account.
      3. Apply any remaining allocation to the current target account.
      4. Remove fully paid accounts.
      5. Record total remaining balance in monthly_balances.

    Stops when all balances reach zero or MAX_SIMULATION_MONTHS is hit.
    """
    # Build a mutable working list (only accounts with a non-trivial balance)
    working: list[dict] = [
        {
            "name": a.name,
            "balance": abs(a.balance),   # engine works with positive numbers internally
            "apr": get_apr_for_account(a.name),
        }
        for a in accounts
        if abs(a.balance) > 0.01
    ]

    if not working:
        return PayoffScenario(payoff_months=0, total_interest_paid=0.0, monthly_balances=[])

    # Sort determines which account is "targeted" first
    if strategy == "snowball":
        working.sort(key=lambda a: a["balance"])             # ascending balance
    else:
        working.sort(key=lambda a: a["apr"], reverse=True)   # descending APR

    total_interest = 0.0
    monthly_balances: list[float] = []

    for _ in range(MAX_SIMULATION_MONTHS):
        # Step 1: Apply monthly interest to all accounts
        for acct in working:
            monthly_rate = acct["apr"] / 12.0
            interest = acct["balance"] * monthly_rate
            acct["balance"] += interest
            total_interest += interest

        # Step 2: Apply minimum payments to all accounts
        remaining = monthly_allocation
        for acct in working:
            min_pmt = _get_min_payment(acct["name"], acct["balance"])
            payment = min(min_pmt, acct["balance"])
            acct["balance"] = max(0.0, acct["balance"] - payment)
            remaining -= payment

        # Step 3: Apply remaining allocation to the current target (first non-zero)
        remaining = max(0.0, remaining)
        for acct in working:
            if acct["balance"] > 0 and remaining > 0:
                payment = min(remaining, acct["balance"])
                acct["balance"] = max(0.0, acct["balance"] - payment)
                remaining -= payment
                break  # snowball/avalanche: one target per month

        # Step 4: Remove paid-off accounts (under $0.01 = effectively zero)
        working = [a for a in working if a["balance"] > 0.01]

        # Step 5: Record total remaining balance
        monthly_balances.append(round(sum(a["balance"] for a in working), 2))

        # Step 6: Exit when all accounts are paid off
        if not working:
            break

    return PayoffScenario(
        payoff_months=len(monthly_balances),
        total_interest_paid=round(total_interest, 2),
        monthly_balances=monthly_balances,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_projection(
    accounts: list[DebtAccount],
    monthly_allocation: float = 2000.0,
) -> DebtProjection:
    """
    Run both strategies and return a single DebtProjection.

    Phase 4: return this directly from a FastAPI route — no rewrite needed.

    monthly_allocation defaults to $2,000 (Phase 3 deliberate placeholder).
    Phase 4 will derive this from the current-period waterfall fields:
        unspent_free_cash + extra_debt_payments + sum(MINIMUM_PAYMENTS.values())
    """
    return DebtProjection(
        snowball=simulate_payoff(accounts, monthly_allocation, "snowball"),
        avalanche=simulate_payoff(accounts, monthly_allocation, "avalanche"),
        monthly_allocation=monthly_allocation,
    )
```

- [ ] **Step 2.2: Verify the module imports cleanly**

```bash
call venv\Scripts\activate && python -c "from backend.debt_engine import build_projection; print('OK')"
```

Expected: `OK`

- [ ] **Step 2.3: Commit**

```bash
git add backend/debt_engine.py
git commit -m "feat: add debt_engine.py with Snowball/Avalanche simulation"
```

---

### Task 3: Write and run `tests/test_debt_engine.py`

**Files:**
- Create: `tests/test_debt_engine.py`

- [ ] **Step 3.1: Create the test file**

Create `tests/test_debt_engine.py`:

```python
"""
Unit tests for backend/debt_engine.py
No DB, no file I/O — pure simulation math.
"""
import pytest

from backend.debt_engine import (
    MAX_SIMULATION_MONTHS,
    MOCK_APRS,
    build_projection,
    get_apr_for_account,
    simulate_payoff,
)
from backend.models import DebtAccount


# ── Helpers ────────────────────────────────────────────────────────────────

def make_account(name: str, balance: float, rate: float = 0.20) -> DebtAccount:
    """balance should be negative (liability convention)."""
    return DebtAccount(name=name, balance=balance, rate=rate)


# ── APR lookup ────────────────────────────────────────────────────────────

def test_get_apr_mock_match_sapphire():
    """'Chase Sapphire Preferred' substring-matches 'chase sapphire' → 0.24."""
    assert get_apr_for_account("Chase Sapphire Preferred") == pytest.approx(0.24)


def test_get_apr_mock_match_amex():
    """'AMEX GOLD CARD' substring-matches 'amex' → 0.19."""
    assert get_apr_for_account("AMEX GOLD CARD") == pytest.approx(0.19)


def test_get_apr_fallback_returns_decimal():
    """Unknown account falls back to guess_interest_rate() / 100 (result < 1.0)."""
    apr = get_apr_for_account("Unknown Lender ZZZ999")
    assert 0 < apr < 1.0


# ── Empty / edge cases ────────────────────────────────────────────────────

def test_empty_accounts_returns_zero_scenario():
    """No accounts → zero-value PayoffScenario for both strategies."""
    for strategy in ("snowball", "avalanche"):
        result = simulate_payoff([], monthly_allocation=2000.0, strategy=strategy)  # type: ignore[arg-type]
        assert result.payoff_months == 0
        assert result.total_interest_paid == 0.0
        assert result.monthly_balances == []


def test_600_month_cap():
    """Allocation far below accruing interest → simulation caps at MAX_SIMULATION_MONTHS."""
    # $100 k at 24% APR = ~$2 k/month interest; $50/month cannot make progress
    accounts = [make_account("Impossible Debt", -100_000.0, 0.24)]
    result = simulate_payoff(accounts, monthly_allocation=50.0, strategy="snowball")
    assert result.payoff_months == MAX_SIMULATION_MONTHS


# ── Single-account correctness ────────────────────────────────────────────

def test_single_account_pays_off():
    """$1,000 at 24% APR with $500/month clears in under 12 months."""
    accounts = [make_account("Test Card", -1000.0, 0.24)]
    result = simulate_payoff(accounts, monthly_allocation=500.0, strategy="snowball")
    assert 0 < result.payoff_months < 12
    assert result.total_interest_paid > 0
    assert result.monthly_balances[-1] == 0.0


def test_monthly_balances_length_equals_payoff_months():
    """len(monthly_balances) is exactly payoff_months."""
    accounts = [make_account("Card", -1000.0, 0.20)]
    result = simulate_payoff(accounts, monthly_allocation=300.0, strategy="snowball")
    assert len(result.monthly_balances) == result.payoff_months


def test_monthly_balances_monotone_normal():
    """
    When allocation comfortably exceeds monthly interest, balances are non-increasing.
    Precondition: allocation >> monthly interest (not the 600-month cap edge case).
    """
    # $1,000 at 20% = ~$16.67/month interest; $200 easily exceeds this
    accounts = [make_account("Card", -1000.0, 0.20)]
    result = simulate_payoff(accounts, monthly_allocation=200.0, strategy="snowball")
    for i in range(1, len(result.monthly_balances)):
        assert result.monthly_balances[i] <= result.monthly_balances[i - 1] + 0.02  # rounding tol


# ── Strategy ordering ─────────────────────────────────────────────────────

def test_snowball_clears_smaller_balance_first():
    """
    With two accounts of equal APR, snowball targets the $300 card before $2,000.
    The smaller card must be paid off in fewer months than the larger one.
    We verify this by checking payoff_months < what a solo-large-card run would give.
    """
    small = make_account("Small Card",  -300.0, 0.20)
    large = make_account("Large Card", -2000.0, 0.20)
    # Snowball focuses $300 total allocation on small card first → clears it fast
    result = simulate_payoff([small, large], monthly_allocation=300.0, strategy="snowball")
    assert result.payoff_months > 0  # sanity: something was paid off
    # Monthly balance list must start high and end at 0
    assert result.monthly_balances[-1] == 0.0


def test_avalanche_interest_lte_snowball_when_apr_order_differs():
    """
    When high-APR account has the LOWER balance (typical credit card scenario),
    avalanche pays less total interest than snowball.
    """
    high_apr_small = make_account("Credit Card",  -500.0, 0.24)  # small balance, high rate
    low_apr_large  = make_account("Student Loan", -5000.0, 0.06)  # large balance, low rate

    sb = simulate_payoff([high_apr_small, low_apr_large], 400.0, "snowball")
    av = simulate_payoff([high_apr_small, low_apr_large], 400.0, "avalanche")

    assert av.total_interest_paid <= sb.total_interest_paid


# ── build_projection ──────────────────────────────────────────────────────

def test_build_projection_returns_both_strategies():
    """build_projection returns a DebtProjection with both snowball and avalanche."""
    accounts = [make_account("Card A", -1000.0, 0.24), make_account("Card B", -2000.0, 0.18)]
    proj = build_projection(accounts, monthly_allocation=500.0)
    assert proj.snowball.payoff_months > 0
    assert proj.avalanche.payoff_months > 0
    assert proj.monthly_allocation == pytest.approx(500.0)


def test_build_projection_empty_accounts():
    """build_projection with no accounts returns zero-value scenarios."""
    proj = build_projection([])
    assert proj.snowball.payoff_months == 0
    assert proj.avalanche.payoff_months == 0
    assert proj.monthly_allocation == pytest.approx(2000.0)  # default
```

- [ ] **Step 3.2: Run all tests — confirm they all pass**

```bash
call venv\Scripts\activate && python -m pytest tests/test_debt_engine.py -v
```

Expected: all 13 tests `PASSED`.

- [ ] **Step 3.3: Commit**

```bash
git add tests/test_debt_engine.py
git commit -m "test: add 13 unit tests for debt_engine Snowball/Avalanche simulation"
```

---

### Task 4: Wire `backend/engine.py` — extend `build_debt_section()`

**Files:**
- Modify: `backend/engine.py`

- [ ] **Step 4.1: Update imports at top of `engine.py`**

In `backend/engine.py`, update the import from `backend.models` to include the new models:

```python
from backend.models import (
    Account,
    CashFlowWaterfall,
    DebtAccount,
    DebtProjection,      # NEW
    DebtSection,
    DebtTrend,
    PayoffScenario,      # NEW
    PeriodData,
    SankeyFlow,
    Summary,
    Transaction,
)
```

Also add a new import line for `debt_engine` (after the existing `backend.classify` import):

```python
from backend.debt_engine import build_projection   # NEW
```

- [ ] **Step 4.2: Fix the empty-path early return in `build_debt_section()`**

Find this block at the top of `build_debt_section()` (around line 319):

```python
    if df.empty:
        return DebtSection(accounts=[], trend=DebtTrend(labels=[], values=[]))
```

Replace with:

```python
    if df.empty:
        _empty = PayoffScenario(payoff_months=0, total_interest_paid=0.0, monthly_balances=[])
        return DebtSection(
            accounts=[],
            trend=DebtTrend(labels=[], values=[]),
            projection=DebtProjection(
                snowball=_empty,
                avalanche=_empty,
                monthly_allocation=0.0,
            ),
        )
```

- [ ] **Step 4.3: Add `projection` to the normal return path**

At the bottom of `build_debt_section()`, find the `return DebtSection(...)` call and add the `projection` field:

```python
    return DebtSection(
        accounts=debt_accounts,
        trend=DebtTrend(labels=list(all_months), values=debt_month_values),
        projection=build_projection(debt_accounts, monthly_allocation=2000.0),  # NEW
    )
```

- [ ] **Step 4.4: Run the engine standalone to verify the full pipeline**

```bash
call venv\Scripts\activate && python -m backend.engine 2>&1 | findstr /i "projection\|snowball\|avalanche\|payoff\|Done\|Error"
```

Expected: no errors; you should see `[engine] Done.` in the output and no `ValidationError`.

- [ ] **Step 4.5: Run the full test suite to confirm nothing regressed**

```bash
call venv\Scripts\activate && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add backend/engine.py
git commit -m "feat: wire build_debt_section to call build_projection; fix empty-path return"
```

---

## Chunk 2: Frontend + Pipeline

### Task 5: Update `frontend/src/types.ts`

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 5.1: Add `PayoffScenario` and `DebtProjection` interfaces**

Open `frontend/src/types.ts`. After the `DebtAccount` interface (line ~68), add:

```typescript
export interface PayoffScenario {
  payoff_months: number;
  total_interest_paid: number;
  monthly_balances: number[];
}

export interface DebtProjection {
  snowball: PayoffScenario;
  avalanche: PayoffScenario;
  monthly_allocation: number;
}
```

- [ ] **Step 5.2: Extend `DebtSection` with the `projection` field**

Find the existing `DebtSection` interface:

```typescript
export interface DebtSection {
  accounts: DebtAccount[];
  trend: { labels: string[]; values: number[] };
}
```

Replace with:

```typescript
export interface DebtSection {
  accounts: DebtAccount[];
  trend: { labels: string[]; values: number[] };
  projection: DebtProjection;
}
```

- [ ] **Step 5.3: Verify TypeScript compiles cleanly (no errors)**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected: no output (clean compile).

- [ ] **Step 5.4: Commit**

```bash
cd .. && git add frontend/src/types.ts
git commit -m "feat: add PayoffScenario, DebtProjection TS interfaces; extend DebtSection"
```

---

### Task 6: Update `frontend/scripts/validate_payload.ts`

**Files:**
- Modify: `frontend/scripts/validate_payload.ts`

- [ ] **Step 6.1: Add 9 new projection checks**

Open `frontend/scripts/validate_payload.ts`. Find the debt section checks (around line 110–130, after the debt account checks). Add these checks immediately before the `// ── Report` comment:

```typescript
// ── debt.projection ───────────────────────────────────────────────────────

check(typeof data.debt?.projection         === 'object' && data.debt.projection !== null,
  'debt.projection must be an object');
check(typeof data.debt?.projection?.monthly_allocation === 'number',
  'debt.projection.monthly_allocation must be number');

check(typeof data.debt?.projection?.snowball === 'object' && data.debt.projection.snowball !== null,
  'debt.projection.snowball must be an object');
check(typeof data.debt?.projection?.snowball?.payoff_months === 'number',
  'debt.projection.snowball.payoff_months must be number');
check(typeof data.debt?.projection?.snowball?.total_interest_paid === 'number',
  'debt.projection.snowball.total_interest_paid must be number');
check(Array.isArray(data.debt?.projection?.snowball?.monthly_balances),
  'debt.projection.snowball.monthly_balances must be array');

check(typeof data.debt?.projection?.avalanche === 'object' && data.debt.projection.avalanche !== null,
  'debt.projection.avalanche must be an object');
check(typeof data.debt?.projection?.avalanche?.payoff_months === 'number',
  'debt.projection.avalanche.payoff_months must be number');
check(typeof data.debt?.projection?.avalanche?.total_interest_paid === 'number',
  'debt.projection.avalanche.total_interest_paid must be number');
```

- [ ] **Step 6.2: Update the `totalChecks` formula**

Find line ~141:

```typescript
const totalChecks = PERIOD_KEYS.length * (PERIOD_FIELDS.length + 16) + 25;
```

Change `+ 25` to `+ 34`:

```typescript
const totalChecks = PERIOD_KEYS.length * (PERIOD_FIELDS.length + 16) + 34;
```

- [ ] **Step 6.3: Regenerate `data.json` and run validation**

```bash
call venv\Scripts\activate && python generate_dashboard.py && cd frontend && npm run validate
```

Expected: `✅  data.json ✓ matches DashboardPayload  (NNN+ checks passed)`

- [ ] **Step 6.4: Commit**

```bash
cd .. && git add frontend/scripts/validate_payload.ts
git commit -m "feat: add 9 projection validation checks; update totalChecks to +34"
```

---

### Task 7: Build `PayoffForecaster` card in `frontend/src/pages/DebtTab.tsx`

**Files:**
- Modify: `frontend/src/pages/DebtTab.tsx`

- [ ] **Step 7.1: Replace the full file with the updated version**

Replace `frontend/src/pages/DebtTab.tsx` with the following:

```tsx
import { useEffect, useRef, useState, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { KpiCard, CollapsibleCard } from '../components/cards';
import { DebtTrendLine } from '../components/charts';
import { AccountList } from '../components/tables';
import type { DashboardPayload, DebtProjection, PayoffScenario } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + str;
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_MONTHS_DISPLAY = 600;  // mirrors MAX_SIMULATION_MONTHS in debt_engine.py

// ── Sparkline chart ────────────────────────────────────────────────────────

interface SparklineProps {
  balances: number[];
  color: string;
}

function PayoffSparkline({ balances, color }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: balances.map((_, i) => `M${i + 1}`),
        datasets: [{
          data: balances,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          backgroundColor: color + '1A',   // 10% opacity fill
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { display: false },
          y: {
            display: true,
            ticks: {
              color: 'var(--text-secondary)',
              font: { size: 11 },
              callback: (v) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }),
            },
            grid: { color: 'var(--border-subtle)' },
          },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [balances, color]);

  if (balances.length === 0) {
    return <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1rem' }}>No data</div>;
  }

  return <canvas ref={canvasRef} style={{ width: '100%', height: '160px' }} />;
}

// ── PayoffForecaster card ─────────────────────────────────────────────────

interface PayoffForecasterProps {
  projection: DebtProjection;
}

function PayoffForecaster({ projection }: PayoffForecasterProps) {
  const [strategy, setStrategy] = useState<'snowball' | 'avalanche'>('snowball');

  const active: PayoffScenario = projection[strategy];
  const other:  PayoffScenario = projection[strategy === 'snowball' ? 'avalanche' : 'snowball'];
  const otherLabel = strategy === 'snowball' ? 'Avalanche' : 'Snowball';

  const payoffDate = useMemo(() => addMonths(active.payoff_months), [active.payoff_months]);
  // interestDiff > 0 → active is more expensive → other saves money
  // interestDiff < 0 → active is cheaper → other costs more
  const interestDiff = active.total_interest_paid - other.total_interest_paid;
  const savingsAmount = Math.abs(interestDiff);
  const otherSavesMore = interestDiff > 1;    // switching would save money

  const toggleStyle = (s: 'snowball' | 'avalanche') => ({
    padding: '0.35rem 0.9rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
    transition: 'background 0.15s, color 0.15s',
    background: strategy === s ? 'var(--accent)' : 'transparent',
    color:      strategy === s ? '#fff' : 'var(--text-secondary)',
  });

  return (
    <CollapsibleCard title="Payoff Forecaster">
      {/* Strategy toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '1.25rem',
        background: 'var(--surface-2)',
        borderRadius: '0.5rem',
        padding: '0.25rem',
        gap: '0.25rem',
        width: 'fit-content',
        marginLeft: 'auto',
      }}>
        <button style={toggleStyle('snowball')}  onClick={() => setStrategy('snowball')}>
          Snowball
        </button>
        <button style={toggleStyle('avalanche')} onClick={() => setStrategy('avalanche')}>
          Avalanche
        </button>
      </div>

      {/* Primary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Debt Free In
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
            {active.payoff_months === MAX_MONTHS_DISPLAY
              ? '50+ years'
              : `${active.payoff_months} months`}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {active.payoff_months < MAX_MONTHS_DISPLAY ? payoffDate : 'Increase allocation'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Interest
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--negative)', lineHeight: 1.1 }}>
            {fmt(active.total_interest_paid)}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {fmt(projection.monthly_allocation)}/mo allocation
          </div>
        </div>
      </div>

      {/* Comparative sub-text */}
      {Math.abs(interestDiff) > 1 && (
        <div style={{
          fontSize: '0.8125rem',
          color: otherSavesMore ? 'var(--positive)' : 'var(--text-secondary)',
          marginBottom: '1rem',
          padding: '0.5rem 0.75rem',
          background: otherSavesMore ? 'var(--positive-subtle, rgba(34,197,94,0.1))' : 'var(--surface-2)',
          borderRadius: '0.375rem',
        }}>
          {otherSavesMore
            ? `💡 ${otherLabel} saves you ${fmt(savingsAmount)} in interest`
            : `${otherLabel} would cost ${fmt(savingsAmount)} more`}
        </div>
      )}
      {Math.abs(interestDiff) <= 1 && active.payoff_months > 0 && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Both strategies cost the same in interest.
        </div>
      )}

      {/* Balance sparkline */}
      <div style={{ height: '160px' }}>
        <PayoffSparkline
          balances={active.monthly_balances}
          color={strategy === 'snowball' ? 'var(--accent)' : '#f59e0b'}
        />
      </div>
    </CollapsibleCard>
  );
}

// ── DebtTab ───────────────────────────────────────────────────────────────

interface DebtTabProps {
  data: DashboardPayload;
}

function DebtTab({ data }: DebtTabProps) {
  const debtAccounts = data.debt.accounts;

  const totalAbsBalance = debtAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const weightedRate =
    totalAbsBalance > 0
      ? debtAccounts.reduce((sum, a) => sum + Math.abs(a.balance) * a.rate, 0) / totalAbsBalance
      : 0;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Payoff Forecaster — top of tab */}
      <div style={{ marginBottom: '1rem' }}>
        <PayoffForecaster projection={data.debt.projection} />
      </div>

      {/* KPI Row */}
      <div
        className="grid-3"
        style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}
      >
        <KpiCard
          label="Total Debt"
          value={fmt(data.summary.total_liabilities)}
          variant="negative"
        />
        <KpiCard
          label="Accounts"
          value={`${data.summary.liability_count} accounts`}
          variant="neutral"
        />
        <KpiCard
          label="Avg Rate"
          value={`${(weightedRate * 100).toFixed(1)}%`}
          variant="neutral"
        />
      </div>

      {/* Debt Trend Chart */}
      <div style={{ marginBottom: '1rem' }}>
        <CollapsibleCard title="Debt Trend">
          <DebtTrendLine debtSection={data.debt} />
        </CollapsibleCard>
      </div>

      {/* Debt Accounts */}
      <div style={{ marginBottom: '1rem' }}>
        <CollapsibleCard title="Debt Accounts">
          <AccountList accounts={data.accounts} showType="liabilities" />
          <div style={{ marginTop: '1rem' }}>
            {debtAccounts.map((a) => (
              <div
                key={a.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.875rem',
                }}
              >
                <span>{a.name}</span>
                <span>{(a.rate * 100).toFixed(1)}% APR</span>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
}

export { DebtTab };
```

- [ ] **Step 7.2: Run TypeScript type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected: no output (clean).

- [ ] **Step 7.3: Run Vite build**

```bash
npm run build 2>&1
```

Expected: build succeeds with no errors.

- [ ] **Step 7.4: Commit**

```bash
cd .. && git add frontend/src/pages/DebtTab.tsx
git commit -m "feat: add PayoffForecaster card to DebtTab with Snowball/Avalanche toggle"
```

---

### Task 8: Full pipeline run + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 8.1: Run the full pipeline end-to-end**

```bash
call venv\Scripts\activate && python generate_dashboard.py
cd frontend && npm run validate && npm run build
```

Expected:
- `generate_dashboard.py` completes with no errors
- `npm run validate` prints `✅  data.json ✓ matches DashboardPayload`
- `npm run build` completes successfully

- [ ] **Step 8.2: Run all Python tests one final time**

```bash
cd .. && call venv\Scripts\activate && python -m pytest -v
```

Expected: all tests pass (green).

- [ ] **Step 8.3: Update `CLAUDE.md` to mark Phase 3 Step 2 complete**

In `CLAUDE.md`, find:

```
* [ ] **Step 2: Debt Snowball Forecaster & Manual APRs**
```

Replace with:

```
* [x] **Step 2: Debt Snowball Forecaster & Manual APRs** (Completed 2026-03-16)
```

- [ ] **Step 8.4: Final commit**

```bash
git add CLAUDE.md
git commit -m "feat: Phase 3 Step 2 complete — Debt Snowball/Avalanche Forecaster"
```

- [ ] **Step 8.5: Push to remote**

```bash
git push
```
