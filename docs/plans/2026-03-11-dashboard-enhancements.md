# Dashboard Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance `generate_dashboard.py` to add 6 new charts (income vs outflow, necessity vs optional, checking-specific flow, income by source, debt trend), always use the most recent CSV exports, and produce `USER_GUIDE.md`.

**Architecture:** Single enhanced Python script in the project folder. Always selects the newest `Transactions_*.csv` and newest `Balances_*.csv` per account (by filename timestamp). Embeds all chart data as JSON in the generated `dashboard.html` using Chart.js. No external dependencies beyond Python standard library.

**Tech Stack:** Python 3 (stdlib only: csv, os, json, glob, hashlib, datetime), Chart.js 4 via CDN in output HTML.

---

### Task 1: Most-Recent File Selection Logic

**Files:**
- Modify: `generate_dashboard.py` (top of file, replace current file-scanning loops)

**Step 1: Replace balance file scanning with newest-per-account logic**

Current code reads ALL balance files and keeps the latest row per account across all files.
New logic: pick the single most-recently-named `Balances_*.csv` for each account by sorting filenames descending and reading only the latest one per account name found.

Actually the simpler and correct approach: sort all `Balances_*.csv` files by filename descending, then for each account name only keep the first (newest) balance entry seen.

Replace the balance loading block with:

```python
# Collect all balance files, sorted newest-first by filename
bal_files = sorted(
    [f for f in os.listdir(DIR) if f.startswith("Balances_") and f.endswith(".csv")],
    reverse=True  # newest timestamp first
)

account_latest = {}  # account_name -> (date, balance)

for fname in bal_files:
    with open(os.path.join(DIR, fname), newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            acct = row["Account"].strip()
            date = row["Date"].strip()
            bal  = float(row["Balance"].replace(",", ""))
            # Only keep if not yet seen (newest file wins)
            if acct not in account_latest:
                account_latest[acct] = (date, bal)
            elif date > account_latest[acct][0]:
                account_latest[acct] = (date, bal)
```

**Step 2: Replace transaction file selection with single-newest-file logic**

Replace the transaction file loop with:

```python
# Use only the single most recent Transactions_*.csv
tx_files = sorted(
    [f for f in os.listdir(DIR) if f.startswith("Transactions_") and f.endswith(".csv")],
    reverse=True
)

transactions = []
if tx_files:
    with open(os.path.join(DIR, tx_files[0]), newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                amount = float(row["Amount"].replace(",", ""))
            except (ValueError, KeyError):
                continue
            transactions.append({
                "date":     row.get("Date", "").strip(),
                "merchant": row.get("Merchant", "").strip(),
                "category": row.get("Category", "").strip(),
                "account":  row.get("Account", "").strip(),
                "amount":   amount,
                "owner":    row.get("Owner", "").strip(),
            })

transactions.sort(key=lambda t: t["date"], reverse=True)
```

**Step 3: Verify**

Run: `python generate_dashboard.py`
Expected output: same summary numbers as before, no errors.

---

### Task 2: Necessity vs Optional Category Classification

**Files:**
- Modify: `generate_dashboard.py` (add config block near top, after imports)

**Step 1: Add category config block immediately after imports**

```python
# ── CATEGORY CLASSIFICATION (edit these to customize) ────────────────────────

NECESSITY_CATEGORIES = {
    "Rent",
    "Gas & Electric",
    "Internet & Cable",
    "Groceries",
    "Insurance",
    "Medical",
    "Public Transit",
    "Financial Fees",
    "Financial & Legal Services",
    "Pets",
}

OPTIONAL_CATEGORIES = {
    "Restaurants & Bars",
    "Coffee Shops",
    "Entertainment & Recreation",
    "Travel & Vacation",
    "Shopping",
    "Electronics",
    "Miscellaneous",
    "Uncategorized",
    "Taxi & Ride Shares",
    "Parking & Tolls",
    "Gas",            # fuel = optional per user preference
}

TRANSFER_CATEGORIES = {"Transfer", "Credit Card Payment"}

INCOME_CATEGORIES = {"Paychecks"}

CHECKING_KEYWORDS = ("CHECKING", "SAVINGS")  # used to filter bank accounts

def classify(category):
    """Returns 'necessity', 'optional', 'income', 'transfer', or 'other'."""
    if category in INCOME_CATEGORIES:
        return "income"
    if category in TRANSFER_CATEGORIES:
        return "transfer"
    if category in NECESSITY_CATEGORIES:
        return "necessity"
    if category in OPTIONAL_CATEGORIES:
        return "optional"
    return "other"

def is_checking(account_name):
    return any(k in account_name.upper() for k in CHECKING_KEYWORDS)
```

**Step 2: Verify**

Run: `python generate_dashboard.py`
Expected: No errors, output numbers unchanged (new code not yet wired to charts).

---

### Task 3: Compute All New Chart Data

**Files:**
- Modify: `generate_dashboard.py` (replace/expand the data computation section, after transactions are loaded)

**Step 1: Replace monthly cash-flow computation and add all new aggregations**

Replace everything from `# ── 3. Monthly cash-flow summary` through `# ── 4. Category spending` with:

```python
# ── 3. Aggregate all monthly data ────────────────────────────────────────────

monthly_income   = defaultdict(float)   # paychecks only
monthly_spending = defaultdict(float)   # all real outflows (excl. transfers)
monthly_necessity = defaultdict(float)  # necessity outflows
monthly_optional  = defaultdict(float)  # optional outflows
monthly_other     = defaultdict(float)  # unclassified outflows

# Checking-account only
chk_monthly_income   = defaultdict(float)
chk_monthly_outflow  = defaultdict(float)  # direct bills paid from checking

# Income by source (merchant name for paychecks)
income_by_source = defaultdict(float)

# Debt trend: total liabilities per date (from balance files)
# Build from account_latest — we'll use balance file history for trend
debt_by_month = defaultdict(float)  # YYYY-MM -> sum of negative balances on last day of that month

for t in transactions:
    cat   = t["category"]
    kind  = classify(cat)
    month = t["date"][:7] if len(t["date"]) >= 7 else None
    if not month:
        continue

    if kind == "income":
        monthly_income[month] += t["amount"]
        if is_checking(t["account"]):
            chk_monthly_income[month] += t["amount"]
        income_by_source[t["merchant"]] += t["amount"]

    elif kind in ("necessity", "optional", "other") and t["amount"] < 0:
        monthly_spending[month] += abs(t["amount"])
        if kind == "necessity":
            monthly_necessity[month] += abs(t["amount"])
        elif kind == "optional":
            monthly_optional[month] += abs(t["amount"])
        else:
            monthly_other[month] += abs(t["amount"])
        # Checking-specific direct expenses
        if is_checking(t["account"]) and t["amount"] < 0:
            chk_monthly_outflow[month] += abs(t["amount"])

# ── 4. Determine months axis (last 12) ───────────────────────────────────────

all_months = sorted(set(
    list(monthly_income.keys()) +
    list(monthly_spending.keys())
))
all_months = all_months[-12:]

flow_labels      = all_months
flow_income      = [round(monthly_income.get(m, 0), 2)    for m in all_months]
flow_spending    = [round(monthly_spending.get(m, 0), 2)  for m in all_months]
flow_necessity   = [round(monthly_necessity.get(m, 0), 2) for m in all_months]
flow_optional    = [round(monthly_optional.get(m, 0), 2)  for m in all_months]
flow_other       = [round(monthly_other.get(m, 0), 2)     for m in all_months]
chk_income_vals  = [round(chk_monthly_income.get(m, 0), 2)  for m in all_months]
chk_outflow_vals = [round(chk_monthly_outflow.get(m, 0), 2) for m in all_months]

# ── 5. Category spending (last 3 months, for top-categories bar) ─────────────

if all_months:
    recent_cutoff = all_months[-3] if len(all_months) >= 3 else all_months[0]
else:
    recent_cutoff = "2026-01"

cat_spend = defaultdict(float)
for t in transactions:
    if classify(t["category"]) in ("transfer", "income"):
        continue
    if t["amount"] >= 0:
        continue
    if len(t["date"]) < 7 or t["date"][:7] < recent_cutoff:
        continue
    cat_spend[t["category"]] += abs(t["amount"])

cat_spend = dict(sorted(cat_spend.items(), key=lambda x: x[1], reverse=True)[:15])
cat_labels = list(cat_spend.keys())
cat_values = [round(v, 2) for v in cat_spend.values()]

# ── 6. Income by source (top 8, last 3 months) ───────────────────────────────

src_spend = defaultdict(float)
for t in transactions:
    if classify(t["category"]) != "income":
        continue
    if len(t["date"]) < 7 or t["date"][:7] < recent_cutoff:
        continue
    src_spend[t["merchant"]] += t["amount"]

src_spend   = dict(sorted(src_spend.items(), key=lambda x: x[1], reverse=True)[:8])
src_labels  = list(src_spend.keys())
src_values  = [round(v, 2) for v in src_spend.values()]

# ── 7. Necessity vs optional totals (last 3 months, for donut) ───────────────

nec_total = sum(monthly_necessity.get(m, 0) for m in all_months[-3:])
opt_total = sum(monthly_optional.get(m, 0)  for m in all_months[-3:])
oth_total = sum(monthly_other.get(m, 0)     for m in all_months[-3:])

# ── 8. Debt trend by month (from balance history files) ──────────────────────

# Re-scan all balance files to build monthly end-of-month totals
debt_series = defaultdict(float)  # YYYY-MM -> total liabilities on latest date in that month

acct_month_latest = defaultdict(dict)  # acct -> {YYYY-MM -> (date, balance)}

for fname in sorted(bal_files):
    with open(os.path.join(DIR, fname), newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            acct  = row["Account"].strip()
            date  = row["Date"].strip()
            bal   = float(row["Balance"].replace(",", ""))
            month = date[:7]
            if month not in acct_month_latest[acct] or date > acct_month_latest[acct][month][0]:
                acct_month_latest[acct][month] = (date, bal)

# Sum all negative balances per month
all_bal_months = set()
for acct, months in acct_month_latest.items():
    all_bal_months.update(months.keys())

debt_months = sorted(all_bal_months)[-13:]
debt_month_labels = debt_months
debt_month_values = []
for m in debt_months:
    total = 0.0
    for acct, months in acct_month_latest.items():
        if m in months:
            bal = months[m][1]
            if bal < 0:
                total += abs(bal)
    debt_month_values.append(round(total, 2))

# ── 9. Current month summary ─────────────────────────────────────────────────

current_month = datetime.today().strftime("%Y-%m")
cur_inflow  = round(monthly_income.get(current_month, 0), 2)
cur_outflow = round(monthly_spending.get(current_month, 0), 2)
cur_net     = round(cur_inflow - cur_outflow, 2)
```

**Step 2: Verify**

Run: `python generate_dashboard.py`
Expected: No errors. Summary numbers print correctly.

---

### Task 4: Rebuild HTML with All 6 Charts

**Files:**
- Modify: `generate_dashboard.py` (replace the entire `html = f"""..."""` block)

**Step 1: Replace HTML generation with new layout**

The new layout has these sections:
1. KPI row (4 cards)
2. Row: Income vs Spending (12-month) | Checking Income vs Direct Expenses (12-month)
3. Row: Necessity vs Optional stacked bar (12-month, full width)
4. Row: Necessity/Optional/Other donut | Income by source bar
5. Row: Top categories | Debt trend line
6. Account balances (assets | liabilities side by side)
7. Recent transactions table

Replace the entire `html = f"""..."""` block through the closing `</html>` with the new template below. All chart canvas IDs: `flowChart`, `chkChart`, `necOptBar`, `necOptDonut`, `srcChart`, `catChart`, `debtChart`, `debtChart`.

```python
# Prepare JS data
flow_labels_js       = json.dumps(flow_labels)
flow_income_js       = json.dumps(flow_income)
flow_spending_js     = json.dumps(flow_spending)
flow_necessity_js    = json.dumps(flow_necessity)
flow_optional_js     = json.dumps(flow_optional)
flow_other_js        = json.dumps(flow_other)
chk_income_js        = json.dumps(chk_income_vals)
chk_outflow_js       = json.dumps(chk_outflow_vals)
cat_labels_js        = json.dumps(cat_labels)
cat_values_js        = json.dumps(cat_values)
src_labels_js        = json.dumps(src_labels)
src_values_js        = json.dumps(src_values)
liab_names_js        = json.dumps([a["name"][-28:] for a in liabilities])
liab_values_js       = json.dumps([round(abs(a["balance"]), 2) for a in liabilities])
debt_month_labels_js = json.dumps(debt_month_labels)
debt_month_values_js = json.dumps(debt_month_values)
nec_opt_js           = json.dumps([round(nec_total,2), round(opt_total,2), round(oth_total,2)])
```

Then build the HTML string. Key chart configurations:

**Chart 1 — `flowChart`: Income vs Spending (grouped bar)**
- Dataset 1: Income, color `rgba(34,197,94,.75)`
- Dataset 2: Spending, color `rgba(239,68,68,.75)`

**Chart 2 — `chkChart`: Checking Income vs Direct Expenses (grouped bar)**
- Dataset 1: Income, green
- Dataset 2: Direct Expenses (bills/groceries paid from bank), orange `rgba(251,146,60,.75)`

**Chart 3 — `necOptBar`: Necessity vs Optional stacked bar (12 months)**
- Dataset 1: Necessities, color `rgba(59,130,246,.8)`  (blue = unavoidable)
- Dataset 2: Optional, color `rgba(251,191,36,.8)` (yellow = discretionary)
- Dataset 3: Other/Uncategorized, color `rgba(100,116,139,.6)` (grey)
- `stacked: true` on both axes

**Chart 4 — `necOptDonut`: Donut (necessity / optional / other)**
- Labels: `["Necessities", "Optional", "Other"]`
- Colors: `["#3b82f6","#facc15","#475569"]`
- Data: `nec_opt_js`

**Chart 5 — `srcChart`: Income by source (horizontal bar)**
- Single dataset, color `rgba(34,197,94,.75)`
- `indexAxis: 'y'`

**Chart 6 — `catChart`: Top categories (horizontal bar)**
- Single dataset, color `rgba(96,165,250,.75)`
- `indexAxis: 'y'`

**Chart 7 — `debtChart`: Total debt trend (line chart)**
- Single dataset, color `#ef4444`, fill `rgba(239,68,68,.1)`, tension `0.3`

**Step 2: Verify output**

Run: `python generate_dashboard.py`
Expected:
```
Dashboard generated: .../dashboard.html
  Net Worth: ...
  Total Assets: ...
  Total Debt: ...
  This Month: ...
```
Open `dashboard.html` in browser. Verify all 7 chart canvases render without JS errors (check browser console).

---

### Task 5: Create USER_GUIDE.md

**Files:**
- Create: `USER_GUIDE.md` in project folder

**Step 1: Write the guide**

```markdown
# Finance Dashboard — User Guide

## What This Is

A personal finance dashboard that reads your CSV exports and produces a
single `dashboard.html` file you can open in any browser. No internet
connection required once the page is open (charts load from CDN on first
open only).

---

## Requirements

- **Python 3.8 or later** — check with `python --version` in a terminal.
  Download from https://www.python.org if needed.
- No extra packages required — only Python's built-in libraries are used.

---

## How to Run

1. Open **Terminal** (Windows: press `Win + R`, type `cmd`, press Enter —
   or search "Command Prompt" in the Start menu).
2. Navigate to this folder:
   ```
   cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March"
   ```
3. Run the script:
   ```
   python generate_dashboard.py
   ```
4. Open the generated file in your browser:
   ```
   start dashboard.html
   ```
   Or double-click `dashboard.html` in File Explorer.

---

## Adding New Monthly Data

Each month, export fresh CSVs from your finance app (Monarch Money or
similar) and drop them into **this same folder**.

The script always uses:
- The **most recent** `Transactions_*.csv` file (by filename timestamp)
- The **most recent** `Balances_*.csv` file per account

So just export, drop files in, re-run `python generate_dashboard.py`.
Old files are kept as a backup — they won't interfere.

**Tip:** Create a shortcut or batch file so you can double-click to
regenerate. Create a file called `refresh.bat` in this folder containing:
```
@echo off
python generate_dashboard.py
start dashboard.html
```
Then double-click `refresh.bat` each month after dropping in new exports.

---

## Customizing Category Classifications

Open `generate_dashboard.py` in any text editor (Notepad works fine).
Near the top you'll find two clearly labelled sets:

```python
NECESSITY_CATEGORIES = {
    "Rent",
    "Gas & Electric",
    ...
}

OPTIONAL_CATEGORIES = {
    "Restaurants & Bars",
    ...
}
```

Add or move category names between these sets to match how you think
about your spending. Category names must exactly match what appears in
your transaction exports.

---

## What the Dashboard Shows

| Section | Description |
|---|---|
| **KPI Cards** | Net worth, total assets, total debt, current month net |
| **Income vs Spending** | 12-month bar chart — all income vs all real spending |
| **Checking Flow** | 12-month — income deposited vs bills paid directly from bank |
| **Necessity vs Optional** | 12-month stacked bar showing how spending breaks down |
| **Spending Split Donut** | Last 3 months — % necessities / optional / other |
| **Income by Source** | Which employers/sources paid you (last 3 months) |
| **Top Categories** | Your 15 biggest spending categories (last 3 months) |
| **Debt Trend** | Total liabilities over time — is your debt going down? |
| **Account Balances** | All accounts: assets vs liabilities |
| **Recent Transactions** | Last 30 transactions |

---

## Troubleshooting

**"python is not recognized"** — Python is not installed or not on your
PATH. Download from https://www.python.org and check "Add to PATH" during
install.

**Charts don't appear** — You need an internet connection the first time
(Chart.js loads from a CDN). After that, try a different browser if issues
persist.

**Numbers look wrong** — Check that your new export actually contains more
recent dates than the previous one. The script uses the file with the
latest timestamp in its filename.
```

**Step 2: Verify**

Open `USER_GUIDE.md` in a text editor and confirm all sections render correctly.

---

### Task 6: Create `refresh.bat` convenience launcher

**Files:**
- Create: `refresh.bat` in project folder

**Step 1: Write the batch file**

```bat
@echo off
echo Generating dashboard...
python generate_dashboard.py
echo.
echo Opening dashboard...
start dashboard.html
```

**Step 2: Verify**

Double-click `refresh.bat` — terminal window should appear, print summary, then close, and `dashboard.html` should open in the browser.

---

## Summary of Files Changed / Created

| File | Action |
|---|---|
| `generate_dashboard.py` | Modified — file selection, classification, new data, new charts |
| `USER_GUIDE.md` | Created |
| `refresh.bat` | Created |
| `dashboard.html` | Regenerated (output) |
