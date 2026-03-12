# Sankey + Global Period Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global 5-period time filter (Current Month, Last Month, Past 2 Months, Last Quarter, Last Year) that controls all charts simultaneously, plus a Sankey diagram showing income sources flowing into spending categories.

**Architecture:** Python pre-computes data for all 5 periods and embeds it as a single `PERIODS_DATA` JSON object in `dashboard.html`. A JS button group calls `switchPeriod(key)` which updates every Chart.js instance via `.data = ...; .update()`. The Sankey uses `chartjs-chart-sankey` (CDN, same Chart.js ecosystem). Debt trend and account balance lists stay static.

**Tech Stack:** Python 3 stdlib, Chart.js 4.4.0 (existing), chartjs-chart-sankey 0.12.0 (new CDN), no new Python dependencies.

---

### Task 1: Python — Period Helpers and Per-Period Data

**Files:**
- Modify: `C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\generate_dashboard.py`

**Context:** The file currently aggregates monthly data into `defaultdict(float)` objects (`monthly_income`, `monthly_spending`, etc.) inside the `if __name__ == "__main__":` block. We need to add two module-level helper functions and then call them inside `__main__` to produce `periods_data` — a dict of 5 periods, each containing all chart data for that period.

**Step 1: Add `get_period_months()` after the existing `color()` function (still at module level, before the `__main__` guard)**

```python
def get_period_months(period_key):
    """Returns a sorted list of YYYY-MM strings for the given period key.

    Periods are always complete calendar months (not partial).
    'current' is the only period that may be a partial month.
    All others go back from the month BEFORE today.
    """
    today = datetime.today()
    y, m = today.year, today.month

    def prev(n):
        mm, yy = m - n, y
        while mm <= 0:
            mm += 12
            yy -= 1
        return f"{yy:04d}-{mm:02d}"

    if period_key == "current":
        return [f"{y:04d}-{m:02d}"]
    if period_key == "last":
        return [prev(1)]
    if period_key == "past2":
        return sorted([prev(2), prev(1)])
    if period_key == "quarter":
        return sorted([prev(3), prev(2), prev(1)])
    if period_key == "year":
        return sorted([prev(i) for i in range(1, 13)])
    return []
```

**Step 2: Add `compute_period_data()` immediately after `get_period_months()`**

```python
def compute_period_data(period_months, transactions,
                        monthly_income, monthly_spending,
                        monthly_necessity, monthly_optional, monthly_other,
                        chk_monthly_income, chk_monthly_outflow):
    """Compute all chart data for a given list of YYYY-MM month strings."""
    ms = set(period_months)

    # Per-month arrays (for bar charts)
    labels      = period_months
    income      = [round(monthly_income.get(m, 0), 2)    for m in period_months]
    spending    = [round(monthly_spending.get(m, 0), 2)  for m in period_months]
    necessity   = [round(monthly_necessity.get(m, 0), 2) for m in period_months]
    optional_v  = [round(monthly_optional.get(m, 0), 2)  for m in period_months]
    other       = [round(monthly_other.get(m, 0), 2)     for m in period_months]
    chk_inc     = [round(chk_monthly_income.get(m, 0), 2)  for m in period_months]
    chk_out     = [round(chk_monthly_outflow.get(m, 0), 2) for m in period_months]

    # Totals
    nec_total = sum(monthly_necessity.get(m, 0) for m in period_months)
    opt_total = sum(monthly_optional.get(m, 0)  for m in period_months)
    oth_total = sum(monthly_other.get(m, 0)     for m in period_months)
    kpi_income   = round(sum(monthly_income.get(m, 0)   for m in period_months), 2)
    kpi_spending = round(sum(monthly_spending.get(m, 0) for m in period_months), 2)
    kpi_net      = round(kpi_income - kpi_spending, 2)

    # Category spend (top 15)
    cat_acc = defaultdict(float)
    for t in transactions:
        if classify(t["category"]) in ("transfer", "income"):
            continue
        if t["amount"] >= 0 or t["date"][:7] not in ms:
            continue
        cat_acc[t["category"]] += abs(t["amount"])
    cat_sorted = sorted(cat_acc.items(), key=lambda x: -x[1])[:15]
    cat_labels = [x[0] for x in cat_sorted]
    cat_values = [round(x[1], 2) for x in cat_sorted]

    # Income by source (top 8)
    src_acc = defaultdict(float)
    for t in transactions:
        if classify(t["category"]) != "income" or t["date"][:7] not in ms:
            continue
        src_acc[t["merchant"]] += t["amount"]
    src_sorted = sorted(src_acc.items(), key=lambda x: -x[1])[:8]
    src_labels = [x[0] for x in src_sorted]
    src_values = [round(x[1], 2) for x in src_sorted]

    # Sankey: income sources → Necessities / Optional / Other / Net Savings
    total_income   = kpi_income
    total_spending = nec_total + opt_total + oth_total
    net_savings    = total_income - total_spending

    sankey_rows = []
    if total_income > 0:
        # Use top-6 income sources so the diagram isn't cluttered
        for src_name, src_amount in sorted(src_acc.items(), key=lambda x: -x[1])[:6]:
            ratio = src_amount / total_income
            if nec_total > 0:
                sankey_rows.append({"from": src_name, "to": "Necessities",
                                    "flow": round(ratio * nec_total, 2)})
            if opt_total > 0:
                sankey_rows.append({"from": src_name, "to": "Optional",
                                    "flow": round(ratio * opt_total, 2)})
            if oth_total > 0:
                sankey_rows.append({"from": src_name, "to": "Other",
                                    "flow": round(ratio * oth_total, 2)})
            if net_savings > 0:
                sankey_rows.append({"from": src_name, "to": "Net / Savings",
                                    "flow": round(ratio * net_savings, 2)})

    return {
        "labels":       labels,
        "income":       income,
        "spending":     spending,
        "necessity":    necessity,
        "optional":     optional_v,
        "other":        other,
        "chk_income":   chk_inc,
        "chk_outflow":  chk_out,
        "nec_opt_donut":[round(nec_total,2), round(opt_total,2), round(oth_total,2)],
        "cat_labels":   cat_labels,
        "cat_values":   cat_values,
        "src_labels":   src_labels,
        "src_values":   src_values,
        "kpi_income":   kpi_income,
        "kpi_spending": kpi_spending,
        "kpi_net":      kpi_net,
        "sankey":       sankey_rows,
    }
```

**Step 3: Inside the `__main__` block, replace section `# ── 9. Current month summary` through `# ── 10. Recent transactions` with the period computation block**

Remove these lines:
```python
# ── 9. Current month summary
current_month = datetime.today().strftime("%Y-%m")
cur_inflow  = round(monthly_income.get(current_month, 0), 2)
cur_outflow = round(monthly_spending.get(current_month, 0), 2)
cur_net     = round(cur_inflow - cur_outflow, 2)

# ── 10. Recent transactions
recent_tx = transactions[:30]
```

Replace with:
```python
    # ── 9. Per-period data for all 5 filter periods ───────────────────────────

    PERIOD_KEYS = ["current", "last", "past2", "quarter", "year"]
    periods_data = {}
    for pk in PERIOD_KEYS:
        months = get_period_months(pk)
        periods_data[pk] = compute_period_data(
            months, transactions,
            monthly_income, monthly_spending,
            monthly_necessity, monthly_optional, monthly_other,
            chk_monthly_income, chk_monthly_outflow,
        )

    # Default display period: last month
    default_period = periods_data["last"]

    # ── 10. Recent transactions ────────────────────────────────────────────────

    recent_tx = transactions[:30]
```

**Step 4: Inside `__main__`, replace the `# ── 11. Generate HTML` JS data prep block**

Remove all the old individual `*_js` variable assignments (lines starting with `flow_labels_js = ...` through `nec_opt_js = ...`) and replace with:

```python
    # ── 11. Generate HTML ─────────────────────────────────────────────────────

    periods_data_js      = json.dumps(periods_data)
    # Static data (not period-dependent)
    liab_names_js        = json.dumps([a["name"][-28:] for a in liabilities])
    liab_values_js       = json.dumps([round(abs(a["balance"]), 2) for a in liabilities])
    debt_month_labels_js = json.dumps(debt_month_labels)
    debt_month_values_js = json.dumps(debt_month_values)
    # Default period initialisation values (used to seed chart constructors)
    init_labels_js       = json.dumps(default_period["labels"])
    init_income_js       = json.dumps(default_period["income"])
    init_spending_js     = json.dumps(default_period["spending"])
    init_necessity_js    = json.dumps(default_period["necessity"])
    init_optional_js     = json.dumps(default_period["optional"])
    init_other_js        = json.dumps(default_period["other"])
    init_chk_income_js   = json.dumps(default_period["chk_income"])
    init_chk_outflow_js  = json.dumps(default_period["chk_outflow"])
    init_nec_opt_js      = json.dumps(default_period["nec_opt_donut"])
    init_cat_labels_js   = json.dumps(default_period["cat_labels"])
    init_cat_values_js   = json.dumps(default_period["cat_values"])
    init_src_labels_js   = json.dumps(default_period["src_labels"])
    init_src_values_js   = json.dumps(default_period["src_values"])
    init_sankey_js       = json.dumps(default_period["sankey"])
    init_kpi_income_js   = json.dumps(default_period["kpi_income"])
    init_kpi_spending_js = json.dumps(default_period["kpi_spending"])
    init_kpi_net_js      = json.dumps(default_period["kpi_net"])
```

**Step 5: Update the print summary at the bottom of `__main__`**

Replace the old `cur_inflow`/`cur_outflow`/`cur_net` references with default period values:

```python
    d = default_period
    print(f"Dashboard generated: {out_path}")
    print(f"\n  Net Worth:    {fmt(net_worth)}")
    print(f"  Total Assets: {fmt(total_assets)}")
    print(f"  Total Debt:   {fmt(total_liabilities)}")
    print(f"  Last Month:   In {fmt(d['kpi_income'])}  |  Out {fmt(d['kpi_spending'])}  |  Net {fmt(d['kpi_net'])}")
    print(f"\nOpen dashboard.html in any browser.")
```

**Step 6: Verify**

Run: `cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March" && python generate_dashboard.py`

Expected output (no errors):
```
Dashboard generated: ...\dashboard.html

  Net Worth:    -$50,608.96
  Total Assets: $4,129.41
  Total Debt:   -$54,738.37
  Last Month:   In $...  |  Out $...  |  Net $...

Open dashboard.html in any browser.
```

The numbers for "Last Month" should be non-zero (real paycheck income visible for February 2026).

---

### Task 2: HTML — Period Filter UI, Sankey Canvas, JS-Driven KPIs

**Files:**
- Modify: `C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\generate_dashboard.py` (the `out_html` string)

**Context:** This task rewrites the HTML template string inside `generate_dashboard.py`. The chart JavaScript currently uses the old static `*_js` variables. We need to:
1. Add the `chartjs-chart-sankey` CDN script tag
2. Add period filter CSS
3. Add the period filter button group above the KPI row
4. Add a full-width Sankey card between the filter and the KPI row
5. Give KPI income/spending/net elements IDs so JS can update them
6. Update ALL chart `new Chart(...)` constructors to use `init_*_js` variables instead of old ones
7. Register all chart instances in `activeCharts`
8. Add `switchPeriod()` function
9. Call `switchPeriod('last')` at end of script to initialise

**Step 1: Add `chartjs-chart-sankey` CDN after the Chart.js script tag**

In the `<head>` section, after:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```
Add:
```html
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-sankey@0.12.0/dist/chartjs-chart-sankey.min.js"></script>
```

**Step 2: Add period filter CSS to the `<style>` block**

Add these rules inside the existing `<style>` block:
```css
.period-filter{{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}}
.period-btn{{padding:.45rem 1rem;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#94a3b8;cursor:pointer;font-size:.82rem;font-weight:500;transition:all .15s}}
.period-btn:hover{{border-color:#60a5fa;color:#e2e8f0}}
.period-btn.active{{background:#3b82f6;border-color:#3b82f6;color:#fff}}
```

Note: use `{{` and `}}` to escape braces inside the Python f-string.

**Step 3: Add period filter buttons and Sankey card to the HTML body**

After the `<h1>` title line and before the KPI row `<div class="grid grid-4"`, insert:

```html
<!-- Period filter -->
<div class="period-filter">
  <button class="period-btn" data-period="current" onclick="switchPeriod('current')">Current Month</button>
  <button class="period-btn active" data-period="last" onclick="switchPeriod('last')">Last Month</button>
  <button class="period-btn" data-period="past2" onclick="switchPeriod('past2')">Past 2 Months</button>
  <button class="period-btn" data-period="quarter" onclick="switchPeriod('quarter')">Last Quarter</button>
  <button class="period-btn" data-period="year" onclick="switchPeriod('year')">Last Year</button>
</div>

<!-- Sankey -->
<div class="card" style="margin-bottom:1rem">
  <h2>Money Flow — Income Sources to Spending</h2>
  <canvas id="sankeyChart" style="max-height:320px"></canvas>
</div>
```

**Step 4: Update KPI card HTML — add IDs to dynamic values**

Replace the "This Month Net" KPI card with a "Net Cash Flow" card that has JS-updatable spans:

```html
  <div class="card">
    <div class="kpi-label">Income (Period)</div>
    <div class="kpi-value green" id="kpi-income-val">${{init_kpi_income_js}}</div>
    <div class="kpi-sub">Total income</div>
  </div>
  <div class="card">
    <div class="kpi-label">Spending (Period)</div>
    <div class="kpi-value red" id="kpi-spending-val">${{init_kpi_spending_js}}</div>
    <div class="kpi-sub">Excl. transfers</div>
  </div>
  <div class="card">
    <div class="kpi-label">Net Cash Flow</div>
    <div class="kpi-value {'green' if default_period['kpi_net']>=0 else 'red'}" id="kpi-net-val">{fmt(default_period['kpi_net'])}</div>
    <div class="kpi-sub" id="kpi-net-sub">Income minus spending</div>
  </div>
```

Keep the Net Worth and Total Debt cards as static Python-rendered values (they don't change with period).

So the KPI row becomes: Net Worth (static) | Total Debt (static) | Income (JS) | Net Cash Flow (JS).

**Step 5: Update ALL `new Chart(...)` constructors to use `init_*` variables and store in `activeCharts`**

At the top of the `<script>` block, before any chart construction, add:

```javascript
const PERIODS_DATA = {periods_data_js};
const activeCharts = {{}};

function fmtUSD(v) {{
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString('en-US', {{minimumFractionDigits:2, maximumFractionDigits:2}});
}}
```

Then change every `new Chart(...)` to:
1. Use the `init_*` variables instead of old static variables
2. Store the result: `activeCharts['flowChart'] = new Chart(...)`

**flowChart** — update datasets to use `{init_income_js}` and `{init_spending_js}` with labels `{init_labels_js}`. Store: `activeCharts['flowChart'] = new Chart(flowCtx, ...)`.

**chkChart** — use `{init_chk_income_js}` and `{init_chk_outflow_js}` with labels `{init_labels_js}`. Store as `activeCharts['chkChart']`.

**necOptBar** — use `{init_necessity_js}`, `{init_optional_js}`, `{init_other_js}` with labels `{init_labels_js}`. Store as `activeCharts['necOptBar']`.

**necOptDonut** — use `{init_nec_opt_js}`. Store as `activeCharts['necOptDonut']`.

**srcChart** — use `{init_src_labels_js}` and `{init_src_values_js}`. Store as `activeCharts['srcChart']`.

**catChart** — use `{init_cat_labels_js}` and `{init_cat_values_js}`. Store as `activeCharts['catChart']`.

**debtChart** — unchanged (static). Store as `activeCharts['debtChart']` (optional, since it doesn't update).

**Step 6: Add Sankey chart construction**

After all other `new Chart(...)` calls, add:

```javascript
const sankeyCtx = document.getElementById('sankeyChart').getContext('2d');
activeCharts['sankeyChart'] = new Chart(sankeyCtx, {{
  type: 'sankey',
  data: {{
    datasets: [{{
      data: {init_sankey_js},
      colorFrom: (c) => {{
        const nodeColors = {{'Necessities':'#3b82f6','Optional':'#facc15','Other':'#64748b','Net / Savings':'#14b8a6'}};
        const from = c.dataset.data[c.dataIndex]?.from || '';
        return nodeColors[from] || '#22c55e';
      }},
      colorTo: (c) => {{
        const nodeColors = {{'Necessities':'#3b82f6','Optional':'#facc15','Other':'#64748b','Net / Savings':'#14b8a6'}};
        const to = c.dataset.data[c.dataIndex]?.to || '';
        return nodeColors[to] || '#22c55e';
      }},
      colorMode: 'gradient',
      color: '#e2e8f0',
      size: 'min',
    }}]
  }},
  options: {{
    responsive: true,
    plugins: {{
      legend: {{ display: false }},
      tooltip: {{
        callbacks: {{
          label: (ctx) => {{
            const d = ctx.dataset.data[ctx.dataIndex];
            if (!d) return '';
            return ` ${{d.from}} → ${{d.to}}: $${{d.flow.toLocaleString('en-US', {{minimumFractionDigits:2}})}}`;
          }}
        }}
      }}
    }}
  }}
}});
```

**Step 7: Add `switchPeriod()` function**

After all chart construction, add:

```javascript
function switchPeriod(key) {{
  document.querySelectorAll('.period-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === key)
  );
  const d = PERIODS_DATA[key];
  if (!d) return;

  // Bar charts with per-month labels
  const barUpdates = {{
    flowChart:  [d.income, d.spending],
    chkChart:   [d.chk_income, d.chk_outflow],
    necOptBar:  [d.necessity, d.optional, d.other],
  }};
  for (const [id, datasets] of Object.entries(barUpdates)) {{
    const c = activeCharts[id];
    if (!c) continue;
    c.data.labels = d.labels;
    datasets.forEach((vals, i) => {{ c.data.datasets[i].data = vals; }});
    c.update();
  }}

  // Donut
  const donut = activeCharts['necOptDonut'];
  if (donut) {{ donut.data.datasets[0].data = d.nec_opt_donut; donut.update(); }}

  // Horizontal bars (labels + values both change)
  const srcC = activeCharts['srcChart'];
  if (srcC) {{ srcC.data.labels = d.src_labels; srcC.data.datasets[0].data = d.src_values; srcC.update(); }}

  const catC = activeCharts['catChart'];
  if (catC) {{ catC.data.labels = d.cat_labels; catC.data.datasets[0].data = d.cat_values; catC.update(); }}

  // Sankey
  const sk = activeCharts['sankeyChart'];
  if (sk) {{ sk.data.datasets[0].data = d.sankey; sk.update(); }}

  // KPI cards
  const inEl  = document.getElementById('kpi-income-val');
  const outEl = document.getElementById('kpi-spending-val');
  const netEl = document.getElementById('kpi-net-val');
  const subEl = document.getElementById('kpi-net-sub');
  if (inEl)  inEl.textContent  = fmtUSD(d.kpi_income);
  if (outEl) outEl.textContent = fmtUSD(d.kpi_spending);
  if (netEl) {{
    netEl.textContent = fmtUSD(d.kpi_net);
    netEl.className   = 'kpi-value ' + (d.kpi_net >= 0 ? 'green' : 'red');
  }}
  if (subEl) subEl.textContent = 'In ' + fmtUSD(d.kpi_income) + ' · Out ' + fmtUSD(d.kpi_spending);
}}
```

**Step 8: Call `switchPeriod` at the very end of `<script>` to initialise**

```javascript
switchPeriod('last');
```

**Step 9: Verify**

Run: `cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March" && python generate_dashboard.py`

Then open `dashboard.html` in a browser. Check:
- [ ] Period buttons appear below the title
- [ ] Sankey diagram renders with income sources flowing to Necessities/Optional/Other
- [ ] Clicking each button updates all charts (no JS console errors)
- [ ] "Last Month" is active by default
- [ ] KPI income and net cash flow update with each period change
- [ ] Debt trend chart remains unchanged across period switches
- [ ] Account balance lists remain unchanged across period switches

---

## Summary of Changes

| What | Where |
|------|-------|
| `get_period_months()` + `compute_period_data()` | Module level in `generate_dashboard.py` |
| 5-period data computation + `periods_data_js` | Inside `__main__` block |
| Period filter button group CSS + HTML | `out_html` template |
| Sankey canvas + Chart construction | `out_html` template |
| All charts stored in `activeCharts` | `<script>` in `out_html` |
| `switchPeriod()` function | `<script>` in `out_html` |
| `switchPeriod('last')` call at end | `<script>` in `out_html` |
