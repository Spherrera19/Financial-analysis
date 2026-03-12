# Finance Dashboard — User Guide

## What This Is

A personal finance dashboard that reads your CSV exports and produces a single `dashboard.html` file you can open in any browser. No internet connection required once the page is open (charts load from CDN on first open only).

---

## Requirements

- **Python 3.8 or later** — check with `python --version` in a terminal.
  Download from https://www.python.org if needed.
- No extra packages required — only Python's built-in libraries are used.

---

## How to Run

**Option A — Double-click (easiest):**
1. Double-click `refresh.bat` in this folder.
2. A terminal window will open, generate the dashboard, then close.
3. `dashboard.html` will open automatically in your browser.

**Option B — Command line:**
1. Open **Command Prompt** (press `Win + R`, type `cmd`, press Enter).
2. Navigate to this folder:
   ```
   cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March"
   ```
3. Run the script:
   ```
   python generate_dashboard.py
   ```
4. Open the result:
   ```
   start dashboard.html
   ```

---

## Adding New Monthly Data

Each month, export fresh CSVs from your finance app and drop them into **this same folder**.

The script always uses:
- The **most recent** `Transactions_*.csv` file (by filename timestamp)
- The **most recent** `Balances_*.csv` files (by filename timestamp)

Old exports are kept as backups and won't interfere — new files win automatically.

**Monthly workflow:**
1. Export new CSVs from your finance app
2. Drop them into this folder
3. Double-click `refresh.bat`
4. Done — dashboard updates with all history

---

## Customizing Category Classifications

Open `generate_dashboard.py` in any text editor (Notepad works fine). Near the top you will find two clearly labelled sets:

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

Move category names between the sets to match how you think about your spending. Names must exactly match what appears in your CSV exports.

**Current classification:**

| Necessity | Optional |
|-----------|----------|
| Rent | Restaurants & Bars |
| Gas & Electric | Coffee Shops |
| Internet & Cable | Entertainment & Recreation |
| Groceries | Travel & Vacation |
| Insurance | Shopping |
| Medical | Electronics |
| Public Transit | Miscellaneous |
| Financial Fees | Uncategorized |
| Financial & Legal Services | Taxi & Ride Shares |
| Pets | Parking & Tolls |
| | Gas (fuel) |

---

## What the Dashboard Shows

| Section | Description |
|---------|-------------|
| **KPI Cards** | Net worth, total assets, total debt, current month net cash flow |
| **Income vs Spending** | 12-month bar chart — all income vs all real spending (transfers excluded) |
| **Checking Flow** | 12-month — income deposited vs bills paid directly from bank accounts |
| **Necessity vs Optional** | 12-month stacked bar showing how spending breaks down |
| **Spending Split** | Last 3 months donut — % necessities / optional / unclassified |
| **Income by Source** | Which employers/sources paid you (last 3 months) |
| **Top Categories** | Your 15 biggest spending categories (last 3 months) |
| **Debt Trend** | Total liabilities over time — is your debt going down? |
| **Account Balances** | All accounts listed: assets vs liabilities |
| **Recent Transactions** | Last 30 transactions with merchant, category, and amount |

---

## Troubleshooting

**"python is not recognized"**
Python is not installed or not on your PATH. Download from https://www.python.org and check "Add Python to PATH" during installation.

**Charts don't appear**
You need an internet connection the first time you open the dashboard (Chart.js loads from a CDN). After that it will work offline. If issues persist, try a different browser (Chrome or Edge recommended).

**Numbers look wrong after adding new data**
Confirm your new export file has a later timestamp in its filename than the old one. The script uses the file with the most recent filename timestamp.

**"This Month" shows $0 income**
Paychecks may arrive at the end of the previous month. Income is counted by the date it appears in your transactions, not when you run the script.
