# Finance Dashboard — User Guide

## What This Is

A personal finance dashboard that reads your CSV exports and produces an interactive web dashboard. All data stays on your machine — no internet connection, no cloud services, no subscriptions.

---

## Requirements

- **Python 3.8 or later** — check with `python --version` in a terminal.
  Download from https://www.python.org if needed.
- **Node.js 18 or later** — check with `node --version` in a terminal.
  Download from https://nodejs.org if needed.

---

## How to Run

**Double-click `refresh.bat`** in this folder. It will:
1. Run the Python script to read your CSVs and write `data.json`
2. Build the React app into `frontend/dist/`
3. Start a local server and open the dashboard at `http://localhost:3000`

**Or from the command line:**
```
cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March"
refresh.bat
```

> **Note:** The dashboard is served via a local web server (not opened as a file directly) because browsers block data loading from `file://` URLs.

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

| Tab | Description |
|-----|-------------|
| **Overview** | Net worth, total assets, total debt, monthly cash flow, income vs spending trend |
| **Cash Flow** | 12-month income vs bills chart, Sankey money flow diagram |
| **Spending** | Necessity vs optional breakdown, donut chart, top categories |
| **Debt** | Total liability trend over time, account-level detail |
| **Transactions** | Searchable and filterable transaction list |
| **Settings** | Theme switcher (System, Light, Dark, Pastel, High Contrast) |

---

## Troubleshooting

**"python is not recognized"**
Python is not installed or not on your PATH. Download from https://www.python.org and check "Add Python to PATH" during installation.

**"node is not recognized"**
Node.js is not installed. Download from https://nodejs.org and reinstall.

**Dashboard shows "Failed to load data"**
The Python step may have failed. Run `refresh.bat` from the command line to see any error messages.

**"This Month" shows $0 income**
Paychecks may arrive at the end of the previous month. Income is counted by the date it appears in your transactions, not when you run the script.

**Numbers look wrong after adding new data**
Confirm your new export file has a later timestamp in its filename than the old one. The script uses the file with the most recent filename timestamp.
