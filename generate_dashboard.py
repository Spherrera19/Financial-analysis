"""
Finance Dashboard Generator
Reads all CSV files in this directory and produces dashboard.html
Run with: python generate_dashboard.py
"""

import csv
import os
import json
import html
from collections import defaultdict
from datetime import datetime

# ── CATEGORY CLASSIFICATION (edit these to customize) ────────────────────────

NECESSITY_CATEGORIES = {
    "Rent",
    "Gas & Electric",
    "Internet & Cable",
    "Groceries",
    "Insurance",
    "Medical",
    "Financial & Legal Services",
    "Pets",
    # Transportation (basic necessity baseline)
    "Gas",
    "Public Transit",
    "Parking & Tolls",
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
    "Cash & ATM",
    "Fitness",
    "Clothing",
}

DEBT_CATEGORIES = {
    "Financial Fees",
    "Student Loans",
    "Loan Repayment",
    "Auto Payment",
}

TRANSFER_CATEGORIES = {"Transfer", "Credit Card Payment"}
INCOME_CATEGORIES   = {"Paychecks"}
CHECKING_KEYWORDS   = ("CHECKING", "SAVINGS")

def classify(category):
    """Returns 'necessity', 'optional', 'debt', 'income', 'transfer', or 'other'."""
    if category in INCOME_CATEGORIES:     return "income"
    if category in TRANSFER_CATEGORIES:  return "transfer"
    if category in DEBT_CATEGORIES:      return "debt"
    if category in NECESSITY_CATEGORIES: return "necessity"
    if category in OPTIONAL_CATEGORIES:  return "optional"
    return "other"

def is_checking(account_name):
    return any(k in account_name.upper() for k in CHECKING_KEYWORDS)

def fmt(n):
    sign = "-" if n < 0 else ""
    return f"{sign}${abs(n):,.2f}"

def color(n):
    return "#22c55e" if n >= 0 else "#ef4444"

def guess_interest_rate(account_name: str) -> float:
    n = account_name.lower()
    if any(k in n for k in ("credit","card")):  return 22.0
    if "student" in n:                           return 5.5
    if any(k in n for k in ("auto","car")):      return 6.0
    if "personal" in n:                          return 10.0
    if any(k in n for k in ("mortgage","home")): return 7.0
    return 15.0

def compute_ai_summary(period_key, period_months, pd, assets, liabilities,
                       total_assets, total_liabilities, net_worth,
                       debt_month_labels, debt_month_values) -> str:
    """Returns a Markdown AI summary string for the given period."""
    today = datetime.today()

    PERIOD_LABEL_MAP = {
        "current": "Current Month (partial)",
        "last":    "Last Month",
        "past2":   "Past 2 Months",
        "quarter": "Last Quarter (3 months)",
        "year":    "Last 12 Months",
    }
    period_label = PERIOD_LABEL_MAP.get(period_key, period_key)
    num_months = max(len(period_months), 1)

    kpi_income   = pd["kpi_income"]
    kpi_spending = pd["kpi_spending"]
    kpi_net      = pd["kpi_net"]

    nec_total = pd["nec_opt_donut"][0]
    opt_total = pd["nec_opt_donut"][1]
    dbt_total = pd["nec_opt_donut"][2]
    oth_total = pd["nec_opt_donut"][3]

    monthly_avg_income   = kpi_income   / num_months
    monthly_avg_spending = kpi_spending / num_months
    monthly_avg_net      = kpi_net      / num_months
    monthly_surplus      = monthly_avg_net
    opt_monthly          = opt_total    / num_months
    total_debt           = abs(total_liabilities)

    # 3-month debt trend
    if len(debt_month_values) >= 4:
        trend_delta = debt_month_values[-1] - debt_month_values[-4]
        trend_str = (f"GROWING by {fmt(trend_delta)}" if trend_delta > 0
                     else f"SHRINKING by {fmt(abs(trend_delta))}")
    else:
        trend_str = "insufficient data"

    lines = []

    # ── 1. Header ────────────────────────────────────────────────────────────
    lines.append(f"# Financial Summary — {period_label}")
    lines.append(f"*Generated: {today.strftime('%B %d, %Y')}*")
    lines.append("")

    # ── 2. Net Worth Snapshot ─────────────────────────────────────────────────
    lines.append("## Net Worth Snapshot")
    lines.append(f"**Net Worth:** {fmt(net_worth)}")
    lines.append("")
    lines.append("**Assets:**")
    for a in assets:
        lines.append(f"- {a['name']}: {fmt(a['balance'])}")
    lines.append(f"- **Total Assets: {fmt(total_assets)}**")
    lines.append("")
    lines.append("**Liabilities (most negative first):**")
    for a in sorted(liabilities, key=lambda x: x["balance"]):
        lines.append(f"- {a['name']}: {fmt(a['balance'])}")
    lines.append(f"- **Total Debt: {fmt(total_liabilities)}**")
    lines.append("")
    lines.append(f"**3-Month Debt Trend:** {trend_str}")
    lines.append("")

    # ── 3. Income Analysis ────────────────────────────────────────────────────
    lines.append("## Income Analysis")
    lines.append(f"**Period Total:** {fmt(kpi_income)}")
    lines.append(f"**Monthly Average:** {fmt(monthly_avg_income)}")
    lines.append("")
    lines.append("**Sources:**")
    for label, val in zip(pd["src_labels"], pd["src_values"]):
        pct = (val / kpi_income * 100) if kpi_income > 0 else 0
        lines.append(f"- {label}: {fmt(val)} ({pct:.1f}%)")
    lines.append("")

    # ── 4. Spending Analysis ──────────────────────────────────────────────────
    lines.append("## Spending Analysis")
    lines.append(f"**Period Total:** {fmt(kpi_spending)}")
    lines.append(f"**Monthly Average:** {fmt(monthly_avg_spending)}")
    lines.append("")
    if kpi_spending > 0:
        nec_pct = nec_total / kpi_spending * 100
        opt_pct = opt_total / kpi_spending * 100
        dbt_pct = dbt_total / kpi_spending * 100
        oth_pct = oth_total / kpi_spending * 100
        lines.append(f"**Mix:** Necessity {nec_pct:.1f}% / Optional {opt_pct:.1f}% / Debt {dbt_pct:.1f}% / Other {oth_pct:.1f}%")
    lines.append("")
    lines.append("**Top 10 Categories:**")
    for label, val in zip(pd["cat_labels"][:10], pd["cat_values"][:10]):
        pct = (val / kpi_spending * 100) if kpi_spending > 0 else 0
        lines.append(f"- {label}: {fmt(val)} ({pct:.1f}%)")
    lines.append("")

    # ── 5. Cash Flow ──────────────────────────────────────────────────────────
    lines.append("## Cash Flow")
    flow_label = "SURPLUS" if kpi_net >= 0 else "DEFICIT"
    lines.append(f"**Period {flow_label}:** {fmt(kpi_net)}")
    lines.append(f"**Monthly Average Net:** {fmt(monthly_avg_net)}")
    lines.append(f"**Annualized Projection:** {fmt(monthly_avg_net * 12)}")
    lines.append("")

    # ── 6. Lost Opportunity Cost ──────────────────────────────────────────────
    lines.append("## Lost Opportunity Cost")
    lines.append(f"**Monthly Optional Spending:** {fmt(opt_monthly)}")
    lines.append("")
    cc_monthly = opt_monthly * 0.22 / 12
    lines.append("**Credit Card Interest Avoided (22% APR):**")
    lines.append(f"- Monthly: {fmt(cc_monthly)}")
    lines.append(f"- Annually: {fmt(cc_monthly * 12)}")
    lines.append("")
    r_m = 0.07 / 12
    lines.append("**Investment Future Value (if invested at 7% annually):**")
    for n_years in [1, 5, 10]:
        n = n_years * 12
        fv = opt_monthly * (((1 + r_m) ** n - 1) / r_m) if r_m > 0 else opt_monthly * n
        lines.append(f"- {n_years} year{'s' if n_years > 1 else ''}: {fmt(fv)}")
    lines.append("")
    lines.append("**Debt Payoff Acceleration:**")
    if total_debt > 0 and monthly_surplus > 0:
        mo_normal = total_debt / monthly_surplus
        if opt_monthly > 0:
            mo_accel = total_debt / (monthly_surplus + opt_monthly)
            lines.append(f"- At current surplus ({fmt(monthly_surplus)}/mo): {mo_normal:.1f} months")
            lines.append(f"- If optional redirected (+{fmt(opt_monthly)}/mo): {mo_accel:.1f} months")
            lines.append(f"- Time saved: {mo_normal - mo_accel:.1f} months")
        else:
            lines.append(f"- At current surplus ({fmt(monthly_surplus)}/mo): {mo_normal:.1f} months")
    elif total_debt == 0:
        lines.append("- No debt to pay off")
    else:
        lines.append("- No monthly surplus available for debt payoff")
    lines.append("")

    # ── 7. Debt Situation ─────────────────────────────────────────────────────
    lines.append("## Debt Situation")
    for a in sorted(liabilities, key=lambda x: x["balance"]):
        lines.append(f"- {a['name']}: {fmt(a['balance'])}")
    lines.append(f"**Total Debt: {fmt(total_liabilities)}**")
    lines.append(f"**3-Month Trend:** {trend_str}")
    lines.append("")

    # ── 8. Key Observations ───────────────────────────────────────────────────
    lines.append("## Key Observations")
    observations = []

    if kpi_net < 0:
        observations.append(f"⚠️ DEFICIT: Spending exceeds income by {fmt(abs(kpi_net))} this period")
    if 0 <= monthly_avg_net < 500:
        observations.append(f"⚠️ Tight surplus: Monthly net is only {fmt(monthly_avg_net)}")
    if len(debt_month_values) >= 4:
        base = debt_month_values[-4]
        if base > 0:
            pct_chg = (debt_month_values[-1] - base) / base * 100
            if pct_chg > 2:
                observations.append(f"⚠️ Debt GROWING: Up {pct_chg:.1f}% over 3 months")
            elif pct_chg < -2:
                observations.append(f"✅ Debt SHRINKING: Down {abs(pct_chg):.1f}% over 3 months")
    if net_worth < 0:
        observations.append(f"⚠️ Negative net worth: {fmt(net_worth)}")
    if kpi_spending > 0 and opt_total > nec_total:
        observations.append(f"⚠️ Optional spending ({fmt(opt_total)}) exceeds necessity ({fmt(nec_total)})")
    if kpi_spending > 0 and pd["cat_values"] and pd["cat_values"][0] / kpi_spending > 0.20:
        top_pct = pd["cat_values"][0] / kpi_spending * 100
        observations.append(f"ℹ️ Top category '{pd['cat_labels'][0]}' is {top_pct:.1f}% of total spending")
    if kpi_income > 0 and pd["src_values"] and pd["src_values"][0] / kpi_income > 0.85:
        top_pct = pd["src_values"][0] / kpi_income * 100
        observations.append(f"ℹ️ Income concentrated: '{pd['src_labels'][0]}' is {top_pct:.1f}% of income")
    if opt_monthly > 500:
        observations.append(f"ℹ️ High optional spending: {fmt(opt_monthly)}/month average")
    if not observations:
        observations.append("✅ No major concerns detected for this period")

    for obs in observations:
        lines.append(f"- {obs}")
    lines.append("")

    return "\n".join(lines)


def get_period_months(period_key):
    """Returns a sorted list of YYYY-MM strings for the given period key.
    'current' is the only period that may be a partial month.
    All others use complete calendar months before the current one.
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

def compute_period_data(period_months, transactions,
                        monthly_income, monthly_spending,
                        monthly_necessity, monthly_optional, monthly_other,
                        monthly_debt,
                        chk_monthly_income, chk_monthly_outflow):
    """Compute all chart data for a given list of YYYY-MM month strings."""
    ms = set(period_months)

    # Per-month arrays (for bar charts)
    labels     = period_months
    income     = [round(monthly_income.get(m, 0), 2)    for m in period_months]
    spending   = [round(monthly_spending.get(m, 0), 2)  for m in period_months]
    necessity  = [round(monthly_necessity.get(m, 0), 2) for m in period_months]
    optional_v = [round(monthly_optional.get(m, 0), 2)  for m in period_months]
    other      = [round(monthly_other.get(m, 0), 2)     for m in period_months]
    debt_v     = [round(monthly_debt.get(m, 0), 2)      for m in period_months]
    chk_inc    = [round(chk_monthly_income.get(m, 0), 2)  for m in period_months]
    chk_out    = [round(chk_monthly_outflow.get(m, 0), 2) for m in period_months]

    # Totals
    nec_total    = sum(monthly_necessity.get(m, 0) for m in period_months)
    opt_total    = sum(monthly_optional.get(m, 0)  for m in period_months)
    dbt_total    = sum(monthly_debt.get(m, 0)      for m in period_months)
    oth_total    = sum(monthly_other.get(m, 0)     for m in period_months)
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
        if t["amount"] > 0:
            src_acc[t["merchant"]] += t["amount"]
    src_sorted = sorted(
        ((k, v) for k, v in src_acc.items() if v > 0),
        key=lambda x: -x[1]
    )[:8]
    src_labels = [x[0][:50] for x in src_sorted]  # truncate to 50 to match compact tx embedding
    src_values = [round(x[1], 2) for x in src_sorted]

    # Sankey: income sources → Necessities / Optional / Debt / Other / Net Savings
    total_spending = nec_total + opt_total + dbt_total + oth_total
    net_savings    = kpi_income - total_spending

    sankey_rows = []
    if kpi_income > 0:
        for src_name, src_amount in sorted(src_acc.items(), key=lambda x: -x[1])[:6]:
            ratio = src_amount / kpi_income
            if nec_total > 0:
                sankey_rows.append({"from": src_name, "to": "Necessities",
                                    "flow": round(ratio * nec_total, 2)})
            if opt_total > 0:
                sankey_rows.append({"from": src_name, "to": "Optional",
                                    "flow": round(ratio * opt_total, 2)})
            if dbt_total > 0:
                sankey_rows.append({"from": src_name, "to": "Debt",
                                    "flow": round(ratio * dbt_total, 2)})
            if oth_total > 0:
                sankey_rows.append({"from": src_name, "to": "Other",
                                    "flow": round(ratio * oth_total, 2)})
            if net_savings > 0:
                sankey_rows.append({"from": src_name, "to": "Net / Savings",
                                    "flow": round(ratio * net_savings, 2)})

    kpi_debt     = round(dbt_total, 2)
    kpi_disposable = round(kpi_income - nec_total - dbt_total, 2)

    return {
        "labels":          labels,
        "income":          income,
        "spending":        spending,
        "necessity":       necessity,
        "optional":        optional_v,
        "other":           other,
        "debt":            debt_v,
        "chk_income":      chk_inc,
        "chk_outflow":     chk_out,
        "nec_opt_donut":   [round(nec_total,2), round(opt_total,2), round(dbt_total,2), round(oth_total,2)],
        "cat_labels":      cat_labels,
        "cat_values":      cat_values,
        "src_labels":      src_labels,
        "src_values":      src_values,
        "kpi_income":      kpi_income,
        "kpi_spending":    kpi_spending,
        "kpi_net":         kpi_net,
        "kpi_debt":        kpi_debt,
        "kpi_disposable":  kpi_disposable,
        "sankey":          sankey_rows,
    }

if __name__ == "__main__":

    DIR = os.path.dirname(os.path.abspath(__file__))

    # ── 1. Load balances ─────────────────────────────────────────────────────────

    bal_files = sorted(
        [f for f in os.listdir(DIR) if f.startswith("Balances_") and f.endswith(".csv")],
        reverse=True,
    )

    account_latest = {}  # account_name -> (date, balance)

    for fname in bal_files:
        with open(os.path.join(DIR, fname), newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                acct = row["Account"].strip()
                date = row["Date"].strip()
                try:
                    bal = float(row["Balance"].replace(",", ""))
                except (ValueError, TypeError):
                    continue
                if acct not in account_latest or date > account_latest[acct][0]:
                    account_latest[acct] = (date, bal)

    accounts = [
        {"name": k, "date": v[0], "balance": v[1]}
        for k, v in sorted(account_latest.items(), key=lambda x: x[1][1], reverse=True)
    ]

    assets      = [a for a in accounts if a["balance"] >= 0]
    liabilities = [a for a in accounts if a["balance"] <  0]
    total_assets      = sum(a["balance"] for a in assets)
    total_liabilities = sum(a["balance"] for a in liabilities)
    net_worth         = total_assets + total_liabilities

    # ── 2. Load transactions (single most-recent file only) ───────────────────────

    tx_files = sorted(
        [f for f in os.listdir(DIR) if f.startswith("Transactions_") and f.endswith(".csv")],
        reverse=True,
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

    # ── 3. Aggregate monthly data ─────────────────────────────────────────────────

    monthly_income    = defaultdict(float)
    monthly_spending  = defaultdict(float)
    monthly_necessity = defaultdict(float)
    monthly_optional  = defaultdict(float)
    monthly_other     = defaultdict(float)
    monthly_debt      = defaultdict(float)
    chk_monthly_income  = defaultdict(float)
    chk_monthly_outflow = defaultdict(float)

    for t in transactions:
        cat  = t["category"]
        kind = classify(cat)
        month = t["date"][:7] if len(t["date"]) >= 7 else None
        if not month:
            continue

        if kind == "income":
            monthly_income[month] += t["amount"]
            if is_checking(t["account"]):
                chk_monthly_income[month] += t["amount"]

        elif kind in ("necessity", "optional", "other", "debt") and t["amount"] < 0:
            monthly_spending[month] += abs(t["amount"])
            if kind == "necessity":
                monthly_necessity[month] += abs(t["amount"])
            elif kind == "optional":
                monthly_optional[month] += abs(t["amount"])
            elif kind == "debt":
                monthly_debt[month] += abs(t["amount"])
            else:
                monthly_other[month] += abs(t["amount"])
            if is_checking(t["account"]):
                chk_monthly_outflow[month] += abs(t["amount"])

    # ── 4. Months axis (last 12) ──────────────────────────────────────────────────

    all_months = sorted(set(list(monthly_income.keys()) + list(monthly_spending.keys())))
    all_months = all_months[-12:]

    # ── 5. Category spending last 3 months ────────────────────────────────────────

    recent_months = set(all_months[-3:]) if all_months else set()

    # ── 6. Income by source (top 8, last 3 months) ────────────────────────────────

    # (used only for legacy reference; compute_period_data handles per-period)

    # ── 7. Necessity/optional totals for donut (last 3 months) ────────────────────

    # (used only for legacy reference; compute_period_data handles per-period)

    # ── 8. Debt trend by month from balance files ─────────────────────────────────

    acct_month_latest = defaultdict(dict)
    for fname in sorted(bal_files):
        with open(os.path.join(DIR, fname), newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                acct  = row["Account"].strip()
                date  = row["Date"].strip()
                try:
                    bal = float(row["Balance"].replace(",", ""))
                except (ValueError, TypeError):
                    continue
                month = date[:7]
                if month not in acct_month_latest[acct] or date > acct_month_latest[acct][month][0]:
                    acct_month_latest[acct][month] = (date, bal)

    all_bal_months = set()
    for months in acct_month_latest.values():
        all_bal_months.update(months.keys())

    debt_month_labels = sorted(all_bal_months)[-13:]
    debt_month_values = []
    for m in debt_month_labels:
        total = sum(
            abs(months[m][1])
            for months in acct_month_latest.values()
            if m in months and months[m][1] < 0
        )
        debt_month_values.append(round(total, 2))

    # ── 9. Per-period data for all 5 filter periods ───────────────────────────────

    PERIOD_KEYS = ["current", "last", "past2", "quarter", "year"]
    periods_data = {}
    for pk in PERIOD_KEYS:
        months = get_period_months(pk)
        periods_data[pk] = compute_period_data(
            months, transactions,
            monthly_income, monthly_spending,
            monthly_necessity, monthly_optional, monthly_other,
            monthly_debt,
            chk_monthly_income, chk_monthly_outflow,
        )

    # Default display period: last month
    default_period = periods_data["last"]

    # ── 9b. AI summaries ──────────────────────────────────────────────────────────

    summaries_data = {}
    for pk in PERIOD_KEYS:
        summaries_data[pk] = compute_ai_summary(
            pk, get_period_months(pk), periods_data[pk],
            assets, liabilities, total_assets, total_liabilities, net_worth,
            debt_month_labels, debt_month_values,
        )

    # ── 9c. Compact transaction embedding (14-month window) ───────────────────────

    _keep_months = set(get_period_months("year") + get_period_months("current"))
    _type_map = {"income": "I", "necessity": "N", "optional": "O", "debt": "D", "transfer": "X", "other": "T"}
    all_tx_compact = [
        {
            "d": t["date"],
            "m": t["merchant"][:50],
            "c": t["category"],
            "a": t["account"][-25:],
            "v": t["amount"],
            "o": t["owner"],
            "t": _type_map[classify(t["category"])],
            "k": 1 if is_checking(t["account"]) else 0,
        }
        for t in transactions
        if t["date"][:7] in _keep_months
    ]

    # ── 10. Recent transactions ───────────────────────────────────────────────────

    recent_tx = transactions[:30]

    # ── 11. Generate HTML ─────────────────────────────────────────────────────────

    periods_data_js      = json.dumps(periods_data)
    summaries_data_js    = json.dumps(summaries_data)
    all_tx_js            = json.dumps(all_tx_compact, separators=(",", ":"))
    # Static data (not period-dependent)
    liab_names_js        = json.dumps([a["name"][-28:] for a in liabilities])
    liab_values_js       = json.dumps([round(abs(a["balance"]), 2) for a in liabilities])
    liab_rates_js        = json.dumps([guess_interest_rate(a["name"]) for a in liabilities])
    debt_month_labels_js = json.dumps(debt_month_labels)
    debt_month_values_js = json.dumps(debt_month_values)
    # Default period init values (seed chart constructors before JS runs)
    init_labels_js       = json.dumps(default_period["labels"])
    init_income_js       = json.dumps(default_period["income"])
    init_spending_js     = json.dumps(default_period["spending"])
    init_necessity_js    = json.dumps(default_period["necessity"])
    init_optional_js     = json.dumps(default_period["optional"])
    init_other_js        = json.dumps(default_period["other"])
    init_debt_js         = json.dumps(default_period["debt"])
    init_chk_income_js   = json.dumps(default_period["chk_income"])
    init_chk_outflow_js  = json.dumps(default_period["chk_outflow"])
    init_nec_opt_js      = json.dumps(default_period["nec_opt_donut"])
    init_cat_labels_js   = json.dumps(default_period["cat_labels"])
    init_cat_values_js   = json.dumps(default_period["cat_values"])
    init_src_labels_js   = json.dumps(default_period["src_labels"])
    init_src_values_js   = json.dumps(default_period["src_values"])
    init_sankey_js       = json.dumps(default_period["sankey"])
    init_kpi_income      = default_period["kpi_income"]
    init_kpi_spending    = default_period["kpi_spending"]
    init_kpi_net         = default_period["kpi_net"]
    init_kpi_debt        = default_period["kpi_debt"]
    init_kpi_disposable  = default_period["kpi_disposable"]

    out_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Finance Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-sankey@0.12.0/dist/chartjs-chart-sankey.min.js"></script>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:1.5rem}}
h1{{font-size:1.6rem;font-weight:700;margin-bottom:1.5rem;color:#f8fafc}}
h2{{font-size:1rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.75rem}}
.grid{{display:grid;gap:1rem}}
.grid-4{{grid-template-columns:repeat(4,1fr)}}
.grid-2{{grid-template-columns:repeat(2,1fr)}}
.grid-3{{grid-template-columns:2fr 1fr}}
@media(max-width:900px){{.grid-4,.grid-2,.grid-3{{grid-template-columns:1fr}}}}
.card{{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:1.25rem}}
.kpi-label{{font-size:.75rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem}}
.kpi-value{{font-size:1.75rem;font-weight:700;line-height:1}}
.kpi-sub{{font-size:.75rem;color:#94a3b8;margin-top:.3rem}}
.green{{color:#22c55e}}.red{{color:#ef4444}}.blue{{color:#60a5fa}}.yellow{{color:#facc15}}
.acct-list{{display:flex;flex-direction:column;gap:.5rem;max-height:320px;overflow-y:auto}}
.acct-row{{display:flex;justify-content:space-between;align-items:center;padding:.5rem .6rem;border-radius:8px;background:#0f172a;font-size:.82rem}}
.acct-name{{color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65%}}
.acct-bal{{font-weight:600;white-space:nowrap}}
.tx-table{{width:100%;border-collapse:collapse;font-size:.8rem}}
.tx-table th{{text-align:left;color:#64748b;font-weight:500;padding:.4rem .6rem;border-bottom:1px solid #334155}}
.tx-table td{{padding:.45rem .6rem;border-bottom:1px solid #1e293b}}
.tx-table tr:hover td{{background:#334155}}
.badge{{display:inline-block;padding:.15rem .45rem;border-radius:4px;font-size:.7rem;font-weight:600;background:#334155;color:#94a3b8}}
canvas{{max-height:280px}}
.divider{{height:1px;background:#334155;margin:1rem 0}}
.section-gap{{margin-top:1rem}}
::-webkit-scrollbar{{width:4px}}::-webkit-scrollbar-track{{background:#0f172a}}::-webkit-scrollbar-thumb{{background:#475569;border-radius:2px}}
.period-filter{{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}}
.period-btn{{padding:.45rem 1rem;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#94a3b8;cursor:pointer;font-size:.82rem;font-weight:500;transition:all .15s}}
.period-btn:hover{{border-color:#60a5fa;color:#e2e8f0}}
.period-btn.active{{background:#3b82f6;border-color:#3b82f6;color:#fff}}
/* Export bar */
.export-bar{{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;padding:.75rem 1rem;background:#1e293b;border:1px solid #334155;border-radius:12px}}
.export-btn{{padding:.4rem .9rem;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#94a3b8;cursor:pointer;font-size:.8rem;font-weight:500;transition:background .2s ease,border-color .2s ease,color .15s ease,transform .1s ease}}
.export-btn:hover{{border-color:#60a5fa;color:#e2e8f0}}
.export-btn:active{{transform:scale(.97)}}
.export-btn.primary{{background:#1d4ed8;border-color:#3b82f6;color:#fff}}
.export-btn.primary:hover{{background:#2563eb}}
.copy-tick{{display:none;color:#22c55e;transition:opacity .2s ease}}
/* Modal */
#txModal{{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;align-items:center;justify-content:center;padding:1rem;opacity:0;transition:opacity .2s ease}}
#txModal:not(.open){{opacity:0;pointer-events:none}}
#txModal.open{{display:flex;opacity:1}}
.modal-card{{width:100%;max-width:960px;background:#1e293b;border:1px solid #334155;border-radius:16px;display:flex;flex-direction:column;max-height:90vh;transform:translateY(20px);transition:transform .25s cubic-bezier(.4,0,.2,1)}}
#txModal.open .modal-card{{transform:translateY(0)}}
.modal-header{{padding:1rem 1.25rem;border-bottom:1px solid #334155;flex-shrink:0}}
.modal-title{{font-size:1rem;font-weight:700;color:#f8fafc;margin-bottom:.2rem}}
.modal-meta{{font-size:.75rem;color:#64748b}}
.modal-stats{{display:flex;gap:1rem;flex-wrap:wrap;padding:.6rem 1.25rem;border-bottom:1px solid #334155;flex-shrink:0;font-size:.78rem}}
.modal-stat{{color:#94a3b8}}.modal-stat b{{color:#e2e8f0}}
.modal-search-row{{padding:.6rem 1.25rem;border-bottom:1px solid #334155;flex-shrink:0}}
.modal-search{{width:100%;padding:.4rem .7rem;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:.82rem;outline:none}}
.modal-search:focus{{border-color:#60a5fa}}
.modal-table-wrap{{overflow-y:auto;flex:1;max-height:480px}}
.modal-table{{width:100%;border-collapse:collapse;font-size:.8rem}}
.modal-table th{{position:sticky;top:0;background:#1e293b;text-align:left;color:#64748b;font-weight:500;padding:.4rem .6rem;border-bottom:1px solid #334155;cursor:pointer;user-select:none;white-space:nowrap}}
.modal-table th:hover{{color:#e2e8f0}}
.modal-table th.sort-asc::after{{content:' ↑'}}
.modal-table th.sort-desc::after{{content:' ↓'}}
.modal-table td{{padding:.4rem .6rem;border-bottom:1px solid #1e293b;transition:background .1s ease}}
.modal-table tr:hover td{{background:#334155}}
.modal-footer{{padding:.75rem 1.25rem;border-top:1px solid #334155;display:flex;justify-content:flex-end;flex-shrink:0}}
.modal-close-btn{{padding:.4rem 1rem;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#94a3b8;cursor:pointer;font-size:.82rem}}
.modal-close-btn:hover{{border-color:#60a5fa;color:#e2e8f0}}
canvas{{cursor:default}}
/* Collapsible cards */
.card-header{{display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;margin-bottom:.75rem}}
.card-header:hover h2{{color:#e2e8f0}}
.collapse-icon{{color:#475569;font-size:.75rem;transition:transform .3s ease}}
.collapsible-card.collapsed .collapse-icon{{transform:rotate(180deg)}}
.card-body{{overflow:hidden;transition:max-height .35s cubic-bezier(.4,0,.2,1),opacity .25s ease}}
.collapsible-card.collapsed .card-body{{max-height:0!important;opacity:0;pointer-events:none}}
/* Period button transitions */
.period-btn{{transition:background .2s ease,border-color .2s ease,color .2s ease,transform .1s ease}}
.period-btn:active{{transform:scale(.96)}}
/* KPI animation */
.kpi-value{{transition:color .3s ease}}
@keyframes kpi-update{{0%{{opacity:.4;transform:translateY(-4px)}}100%{{opacity:1;transform:translateY(0)}}}}
.kpi-value.updating{{animation:kpi-update .4s ease}}
/* Chart card hover lift */
.collapsible-card{{transition:box-shadow .2s ease}}
.collapsible-card:has(canvas:hover){{box-shadow:0 0 0 1px #3b82f6}}
/* Account/tx row transitions */
.acct-row{{transition:background .15s ease}}
.tx-table tr td{{transition:background .1s ease}}
/* Modal row entrance */
@keyframes fadeInRow{{from{{opacity:0;transform:translateY(4px)}}to{{opacity:1;transform:translateY(0)}}}}
/* Sticky top bar */
#top-bar{{position:sticky;top:0;z-index:100;background:#0f172a;padding-bottom:.5rem;margin-bottom:.5rem}}
/* Tab bar */
.tab-bar{{display:flex;gap:0;border-bottom:2px solid #334155;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;white-space:nowrap}}
.tab-bar::-webkit-scrollbar{{display:none}}
.tab-btn{{padding:.55rem 1.25rem;border:none;border-bottom:3px solid transparent;margin-bottom:-2px;background:transparent;color:#64748b;cursor:pointer;font-size:.85rem;font-weight:500;transition:color .15s ease,border-color .15s ease;white-space:nowrap;flex-shrink:0}}
.tab-btn:hover{{color:#e2e8f0}}
.tab-btn.active{{color:#60a5fa;border-bottom-color:#60a5fa}}
.tab-pane{{display:none}}
.tab-pane.active{{display:block}}
/* Opportunity cost */
.grid-3-eq{{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}}
@media(max-width:768px){{.grid-3-eq{{grid-template-columns:1fr}}}}
.opp-col{{background:#0f172a;border-radius:10px;padding:.75rem 1rem}}
.opp-col-title{{font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.5rem;font-weight:600}}
.opp-row{{display:flex;justify-content:space-between;align-items:center;padding:.2rem 0;border-bottom:1px solid #1e293b}}
.opp-row:last-child{{border-bottom:none}}
.opp-label{{font-size:.78rem;color:#94a3b8}}
.opp-val{{font-size:.82rem;font-weight:600;color:#e2e8f0}}
/* Debt simulator */
.sim-debt-rate-row{{display:flex;align-items:center;gap:.5rem;background:#0f172a;border-radius:8px;padding:.35rem .6rem;font-size:.78rem}}
.sim-debt-rate-row label{{color:#94a3b8}}
.sim-rate-input{{width:60px;background:#1e293b;border:1px solid #334155;border-radius:6px;color:#e2e8f0;padding:.2rem .35rem;font-size:.78rem}}
.sim-stat-card{{background:#0f172a;border-radius:10px;padding:.75rem 1rem}}
.sim-stat-card h3{{font-size:.75rem;text-transform:uppercase;margin-bottom:.5rem;color:#64748b;letter-spacing:.05em}}
.sim-stat-row{{display:flex;justify-content:space-between;font-size:.8rem;padding:.15rem 0}}
.sim-stat-row span:last-child{{font-weight:600}}
</style>
</head>
<body>
<h1>Finance Dashboard &nbsp;<span style="font-size:.85rem;color:#475569">as of {datetime.today().strftime("%B %d, %Y")}</span></h1>

<!-- Top bar: period filter + export + tabs (sticky) -->
<div id="top-bar">
<div class="period-filter">
  <button class="period-btn" data-period="current" onclick="switchPeriod('current')">Current Month</button>
  <button class="period-btn active" data-period="last" onclick="switchPeriod('last')">Last Month</button>
  <button class="period-btn" data-period="past2" onclick="switchPeriod('past2')">Past 2 Months</button>
  <button class="period-btn" data-period="quarter" onclick="switchPeriod('quarter')">Last Quarter</button>
  <button class="period-btn" data-period="year" onclick="switchPeriod('year')">Last Year</button>
</div>
<div class="export-bar">
  <span style="font-size:.8rem;color:#94a3b8;font-weight:500">Export:</span>
  <button class="export-btn primary" onclick="copyAISummary()">&#128203; Copy AI Summary <span class="copy-tick" id="copy-tick">&#10003;</span></button>
  <button class="export-btn" onclick="downloadAISummary()">&#8659; Download .md</button>
  <span id="summary-period-note" style="font-size:.75rem;color:#475569;margin-left:.5rem">Summary: Last Month</span>
</div>
<div class="tab-bar">
  <button class="tab-btn active" data-tab="overview"     onclick="switchTab('overview')">Overview</button>
  <button class="tab-btn"        data-tab="cashflow"     onclick="switchTab('cashflow')">Cash Flow</button>
  <button class="tab-btn"        data-tab="spending"     onclick="switchTab('spending')">Spending</button>
  <button class="tab-btn"        data-tab="debt"         onclick="switchTab('debt')">Debt</button>
  <button class="tab-btn"        data-tab="transactions" onclick="switchTab('transactions')">Transactions</button>
</div>
</div>

<!-- ── Overview Tab ───────────────────────────────────────────────────────── -->
<div class="tab-pane active" id="tab-overview">

<!-- KPI row -->
<div class="grid grid-4" style="margin-bottom:1rem">
  <div class="card">
    <div class="kpi-label">Net Worth</div>
    <div class="kpi-value {'green' if net_worth>=0 else 'red'}">{fmt(net_worth)}</div>
    <div class="kpi-sub">Assets \u2212 Liabilities</div>
  </div>
  <div class="card">
    <div class="kpi-label">Total Assets</div>
    <div class="kpi-value green">{fmt(total_assets)}</div>
    <div class="kpi-sub">{len(assets)} account{'s' if len(assets)!=1 else ''}</div>
  </div>
  <div class="card">
    <div class="kpi-label">Total Debt</div>
    <div class="kpi-value red">{fmt(total_liabilities)}</div>
    <div class="kpi-sub">{len(liabilities)} account{'s' if len(liabilities)!=1 else ''}</div>
  </div>
  <div class="card">
    <div class="kpi-label">Net Cash Flow</div>
    <div class="kpi-value {'green' if init_kpi_net>=0 else 'red'}" id="kpi-net-val">{fmt(init_kpi_net)}</div>
    <div class="kpi-sub" id="kpi-net-sub">In {fmt(init_kpi_income)} &nbsp;&middot;&nbsp; Out {fmt(init_kpi_spending)}</div>
  </div>
</div>

<!-- Sankey -->
<div class="card collapsible-card" id="card-sankeyChart" style="margin-bottom:1rem">
  <div class="card-header" onclick="toggleCard('sankeyChart')">
    <h2>Money Flow — Income Sources to Spending</h2>
    <span class="collapse-icon" id="icon-sankeyChart">&#9650;</span>
  </div>
  <div class="card-body" id="body-sankeyChart">
    <canvas id="sankeyChart" style="max-height:340px"></canvas>
  </div>
</div>

</div><!-- /tab-overview -->

<!-- ── Cash Flow Tab ──────────────────────────────────────────────────────── -->
<div class="tab-pane" id="tab-cashflow">

<!-- Income / Spending / Debt Payoff Power KPI row (period-aware) -->
<div class="grid-3-eq" style="margin-bottom:1rem">
  <div class="card">
    <div class="kpi-label">Period Income</div>
    <div class="kpi-value green" id="kpi-income-val">{fmt(init_kpi_income)}</div>
  </div>
  <div class="card">
    <div class="kpi-label">Period Spending</div>
    <div class="kpi-value red" id="kpi-spending-val">{fmt(init_kpi_spending)}</div>
  </div>
  <div class="card" style="border-color:#a855f7">
    <div class="kpi-label" style="color:#a855f7">Debt Payoff Power</div>
    <div class="kpi-value {'green' if init_kpi_disposable>=0 else 'red'}" id="kpi-disposable-val">{fmt(init_kpi_disposable)}</div>
    <div class="kpi-sub" id="kpi-disposable-sub">Income \u2212 Necessities \u2212 Debt ({fmt(init_kpi_debt)} debt)</div>
  </div>
</div>

<!-- Row: flow chart + checking chart -->
<div class="grid grid-2" style="margin-bottom:1rem">
  <div class="card collapsible-card" id="card-flowChart">
    <div class="card-header" onclick="toggleCard('flowChart')">
      <h2>Income vs Spending (Monthly)</h2>
      <span class="collapse-icon" id="icon-flowChart">&#9650;</span>
    </div>
    <div class="card-body" id="body-flowChart">
      <canvas id="flowChart"></canvas>
    </div>
  </div>
  <div class="card collapsible-card" id="card-chkChart">
    <div class="card-header" onclick="toggleCard('chkChart')">
      <h2>Checking: Income vs Direct Expenses</h2>
      <span class="collapse-icon" id="icon-chkChart">&#9650;</span>
    </div>
    <div class="card-body" id="body-chkChart">
      <canvas id="chkChart"></canvas>
    </div>
  </div>
</div>

</div><!-- /tab-cashflow -->

<!-- ── Spending Tab ───────────────────────────────────────────────────────── -->
<div class="tab-pane" id="tab-spending">

<!-- Full-width: necessity vs optional stacked bar -->
<div class="card collapsible-card" id="card-necOptBar" style="margin-bottom:1rem">
  <div class="card-header" onclick="toggleCard('necOptBar')">
    <h2>Necessity vs Optional Spending (12 months)</h2>
    <span class="collapse-icon" id="icon-necOptBar">&#9650;</span>
  </div>
  <div class="card-body" id="body-necOptBar">
    <canvas id="necOptBar"></canvas>
  </div>
</div>

<!-- Row: donut + income by source -->
<div class="grid grid-2" style="margin-bottom:1rem">
  <div class="card collapsible-card" id="card-necOptDonut">
    <div class="card-header" onclick="toggleCard('necOptDonut')">
      <h2>Spend Mix \u2014 Last 3 Months</h2>
      <span class="collapse-icon" id="icon-necOptDonut">&#9650;</span>
    </div>
    <div class="card-body" id="body-necOptDonut">
      <canvas id="necOptDonut"></canvas>
    </div>
  </div>
  <div class="card collapsible-card" id="card-srcChart">
    <div class="card-header" onclick="toggleCard('srcChart')">
      <h2>Income by Source</h2>
      <span class="collapse-icon" id="icon-srcChart">&#9650;</span>
    </div>
    <div class="card-body" id="body-srcChart">
      <canvas id="srcChart"></canvas>
    </div>
  </div>
</div>

<!-- catChart: full-width in spending tab -->
<div class="card collapsible-card" id="card-catChart" style="margin-bottom:1rem">
  <div class="card-header" onclick="toggleCard('catChart')">
    <h2>Top Spending Categories</h2>
    <span class="collapse-icon" id="icon-catChart">&#9650;</span>
  </div>
  <div class="card-body" id="body-catChart">
    <canvas id="catChart"></canvas>
  </div>
</div>

<!-- Opportunity Cost card -->
<div class="card" id="card-oppcost" style="margin-bottom:1rem">
  <h2 style="margin-bottom:.75rem">Opportunity Cost \u2014 Optional Spending</h2>
  <div style="margin-bottom:.5rem">
    <span class="kpi-label">Monthly Optional Average</span>&nbsp;
    <span class="kpi-value red" id="opp-monthly-val" style="font-size:1.25rem">$0.00</span>
  </div>
  <div class="grid-3-eq" style="gap:1rem;margin-top:.75rem">
    <div class="opp-col">
      <div class="opp-col-title">&#127793; If Invested at 7%</div>
      <div class="opp-row"><span class="opp-label">1 Year</span><span class="opp-val green" id="opp-fv1"></span></div>
      <div class="opp-row"><span class="opp-label">5 Years</span><span class="opp-val green" id="opp-fv5"></span></div>
      <div class="opp-row"><span class="opp-label">10 Years</span><span class="opp-val green" id="opp-fv10"></span></div>
    </div>
    <div class="opp-col">
      <div class="opp-col-title">&#128192; CC Interest Avoided (22%)</div>
      <div class="opp-row"><span class="opp-label">Monthly saved</span><span class="opp-val yellow" id="opp-cc-mo"></span></div>
      <div class="opp-row"><span class="opp-label">Annual saved</span><span class="opp-val yellow" id="opp-cc-yr"></span></div>
    </div>
    <div class="opp-col">
      <div class="opp-col-title">&#127987; Toward Debt Payoff</div>
      <div class="opp-row"><span class="opp-label">Normal payoff</span><span class="opp-val" id="opp-debt-normal"></span></div>
      <div class="opp-row"><span class="opp-label">Accelerated</span><span class="opp-val green" id="opp-debt-accel"></span></div>
      <div class="opp-row"><span class="opp-label">Months saved</span><span class="opp-val blue" id="opp-debt-saved"></span></div>
    </div>
  </div>
</div>

</div><!-- /tab-spending -->

<!-- ── Debt Tab ───────────────────────────────────────────────────────────── -->
<div class="tab-pane" id="tab-debt">

<!-- debtChart: full-width in debt tab -->
<div class="card collapsible-card" id="card-debtChart" style="margin-bottom:1rem">
  <div class="card-header" onclick="toggleCard('debtChart')">
    <h2>Debt Trend</h2>
    <span class="collapse-icon" id="icon-debtChart">&#9650;</span>
  </div>
  <div class="card-body" id="body-debtChart">
    <canvas id="debtChart"></canvas>
  </div>
</div>

<!-- Account balances in debt tab -->
<div class="card collapsible-card" id="card-accountBalances" style="margin-bottom:1rem">
  <div class="card-header" onclick="toggleCard('accountBalances')">
    <h2>Account Balances</h2>
    <span class="collapse-icon" id="icon-accountBalances">&#9650;</span>
  </div>
  <div class="card-body" id="body-accountBalances">
<div class="grid grid-2">
  <div class="card">
    <h2 style="color:#22c55e;margin-bottom:.6rem">Assets</h2>
    <div class="acct-list">
"""

    for a in assets:
        out_html += f'      <div class="acct-row"><span class="acct-name">{html.escape(a["name"])}</span><span class="acct-bal green">{fmt(a["balance"])}</span></div>\n'

    out_html += """    </div>
  </div>
  <div class="card">
    <h2 style="color:#ef4444;margin-bottom:.6rem">Liabilities</h2>
    <div class="acct-list">
"""

    for a in liabilities:
        out_html += f'      <div class="acct-row"><span class="acct-name">{html.escape(a["name"])}</span><span class="acct-bal red">{fmt(a["balance"])}</span></div>\n'

    out_html += """    </div>
  </div>
</div>
  </div>
</div>

<!-- Debt Simulator card -->
<div class="card collapsible-card" id="card-debtSim" style="margin-bottom:1rem">
  <div class="card-header" onclick="toggleCard('debtSim')">
    <h2>Debt Payoff Simulator</h2>
    <span class="collapse-icon" id="icon-debtSim">&#9650;</span>
  </div>
  <div class="card-body" id="body-debtSim">
    <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem">
      <span style="font-size:.82rem;color:#94a3b8">Extra Monthly Payment:</span>
      <input type="range" id="sim-extra-slider" min="0" max="2000" step="25" value="200"
             style="width:140px;vertical-align:middle"
             oninput="document.getElementById('sim-extra-input').value=this.value;runDebtSim()"/>
      $<input type="number" id="sim-extra-input" min="0" max="9999" value="200"
              style="width:70px;background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:6px;padding:.25rem .4rem;font-size:.82rem"
              oninput="document.getElementById('sim-extra-slider').value=this.value;runDebtSim()"/>
    </div>
    <div id="sim-debt-rates" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem"></div>
    <canvas id="debtSimChart" style="max-height:280px;margin-bottom:1rem"></canvas>
    <div class="grid-3-eq" id="sim-stats"></div>
  </div>
</div>

</div><!-- /tab-debt -->

<!-- ── Transactions Tab ───────────────────────────────────────────────────── -->
<div class="tab-pane" id="tab-transactions">

<!-- Recent transactions -->
<div class="card collapsible-card" id="card-recentTx">
  <div class="card-header" onclick="toggleCard('recentTx')">
    <h2>Recent Transactions (last 30)</h2>
    <span class="collapse-icon" id="icon-recentTx">&#9650;</span>
  </div>
  <div class="card-body" id="body-recentTx">
  <table class="tx-table">
    <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Account</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
"""

    for t in recent_tx:
        amt_color = "green" if t["amount"] >= 0 else "red"
        cat_short  = t["category"][:30] if t["category"] else "\u2014"
        acct_short = t["account"][-20:] if len(t["account"]) > 20 else t["account"]
        out_html += f"""      <tr>
        <td style="color:#64748b">{t["date"]}</td>
        <td>{html.escape(t["merchant"][:35])}</td>
        <td><span class="badge">{html.escape(cat_short)}</span></td>
        <td style="color:#64748b">{html.escape(acct_short)}</td>
        <td style="text-align:right" class="{amt_color}"><b>{fmt(t["amount"])}</b></td>
      </tr>\n"""

    out_html += f"""    </tbody>
  </table>
  </div>
</div>

</div><!-- /tab-transactions -->

<script>
const PERIODS_DATA = {periods_data_js};
const SUMMARIES_DATA = {summaries_data_js};
const ALL_TRANSACTIONS = {all_tx_js};
const LIAB_NAMES  = {liab_names_js};
const LIAB_VALUES = {liab_values_js};
const LIAB_RATES  = {liab_rates_js};
const PERIOD_LABELS = {{current:'Current Month (partial)',last:'Last Month',past2:'Past 2 Months',quarter:'Last Quarter (3 months)',year:'Last 12 Months'}};
let activePeriod = 'last';
const activeCharts = {{}};

// ── flowChart: Income vs Spending grouped bar ──────────────────────────────
activeCharts['flowChart'] = new Chart(document.getElementById('flowChart').getContext('2d'), {{
  type: 'bar',
  data: {{
    labels: {init_labels_js},
    datasets: [
      {{label:'Income',   data:{init_income_js},   backgroundColor:'rgba(34,197,94,.75)',  borderColor:'#22c55e', borderWidth:1}},
      {{label:'Spending', data:{init_spending_js},  backgroundColor:'rgba(239,68,68,.75)', borderColor:'#ef4444', borderWidth:1}}
    ]
  }},
  options: {{
    responsive: true,
    animation: {{ duration: 400, easing: 'easeInOutQuart' }},
    onClick: (event, elements) => {{
      if (!elements.length) return;
      drillDown('flowChart', elements[0].index, elements[0].datasetIndex ?? 0);
    }},
    onHover: (event, elements) => {{
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    }},
    plugins: {{legend: {{labels: {{color:'#94a3b8', font: {{size:11}}}}}}}},
    scales: {{
      x: {{ticks: {{color:'#64748b', font: {{size:10}}}}, grid: {{color:'#334155'}}}},
      y: {{ticks: {{color:'#64748b', font: {{size:10}}, callback: v => '$' + v.toLocaleString()}}, grid: {{color:'#1e293b'}}}}
    }}
  }}
}});

// ── chkChart: Checking income vs direct expenses grouped bar ───────────────
activeCharts['chkChart'] = new Chart(document.getElementById('chkChart').getContext('2d'), {{
  type: 'bar',
  data: {{
    labels: {init_labels_js},
    datasets: [
      {{label:'Income',           data:{init_chk_income_js},  backgroundColor:'rgba(34,197,94,.75)',  borderColor:'#22c55e', borderWidth:1}},
      {{label:'Direct Expenses',  data:{init_chk_outflow_js}, backgroundColor:'rgba(251,146,60,.75)', borderColor:'#fb923c', borderWidth:1}}
    ]
  }},
  options: {{
    responsive: true,
    animation: {{ duration: 400, easing: 'easeInOutQuart' }},
    onClick: (event, elements) => {{
      if (!elements.length) return;
      drillDown('chkChart', elements[0].index, elements[0].datasetIndex ?? 0);
    }},
    onHover: (event, elements) => {{
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    }},
    plugins: {{legend: {{labels: {{color:'#94a3b8', font: {{size:11}}}}}}}},
    scales: {{
      x: {{ticks: {{color:'#64748b', font: {{size:10}}}}, grid: {{color:'#334155'}}}},
      y: {{ticks: {{color:'#64748b', font: {{size:10}}, callback: v => '$' + v.toLocaleString()}}, grid: {{color:'#1e293b'}}}}
    }}
  }}
}});

// ── necOptBar: Necessity vs Optional stacked bar ───────────────────────────
activeCharts['necOptBar'] = new Chart(document.getElementById('necOptBar').getContext('2d'), {{
  type: 'bar',
  data: {{
    labels: {init_labels_js},
    datasets: [
      {{label:'Necessities', data:{init_necessity_js}, backgroundColor:'rgba(59,130,246,.8)',   borderColor:'#3b82f6', borderWidth:1}},
      {{label:'Optional',    data:{init_optional_js},  backgroundColor:'rgba(251,191,36,.8)',   borderColor:'#fbbf24', borderWidth:1}},
      {{label:'Debt',        data:{init_debt_js},      backgroundColor:'rgba(168,85,247,.8)',   borderColor:'#a855f7', borderWidth:1}},
      {{label:'Other',       data:{init_other_js},     backgroundColor:'rgba(100,116,139,.6)',  borderColor:'#64748b', borderWidth:1}}
    ]
  }},
  options: {{
    responsive: true,
    animation: {{ duration: 400, easing: 'easeInOutQuart' }},
    onClick: (event, elements) => {{
      if (!elements.length) return;
      drillDown('necOptBar', elements[0].index, elements[0].datasetIndex ?? 0);
    }},
    onHover: (event, elements) => {{
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    }},
    plugins: {{legend: {{labels: {{color:'#94a3b8', font: {{size:11}}}}}}}},
    scales: {{
      x: {{stacked: true, ticks: {{color:'#64748b', font: {{size:10}}}}, grid: {{color:'#334155'}}}},
      y: {{stacked: true, ticks: {{color:'#64748b', font: {{size:10}}, callback: v => '$' + v.toLocaleString()}}, grid: {{color:'#1e293b'}}}}
    }}
  }}
}});

// ── necOptDonut: Necessity/Optional/Other donut ────────────────────────────
activeCharts['necOptDonut'] = new Chart(document.getElementById('necOptDonut').getContext('2d'), {{
  type: 'doughnut',
  data: {{
    labels: ['Necessities', 'Optional', 'Debt', 'Other'],
    datasets: [{{
      data: {init_nec_opt_js},
      backgroundColor: ['#3b82f6', '#facc15', '#a855f7', '#475569'],
      borderColor: '#1e293b',
      borderWidth: 2
    }}]
  }},
  options: {{
    responsive: true,
    animation: {{ duration: 400, easing: 'easeInOutQuart' }},
    onClick: (event, elements) => {{
      if (!elements.length) return;
      drillDown('necOptDonut', elements[0].index, elements[0].datasetIndex ?? 0);
    }},
    onHover: (event, elements) => {{
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    }},
    cutout: '60%',
    plugins: {{
      legend: {{position: 'right', labels: {{color:'#94a3b8', font: {{size:11}}, boxWidth:12}}}},
      tooltip: {{callbacks: {{label: ctx => ' $' + ctx.parsed.toLocaleString('en-US', {{minimumFractionDigits:2}})}}}}
    }}
  }}
}});

// ── srcChart: Income by source horizontal bar ─────────────────────────────
activeCharts['srcChart'] = new Chart(document.getElementById('srcChart').getContext('2d'), {{
  type: 'bar',
  data: {{
    labels: {init_src_labels_js},
    datasets: [{{
      label: 'Income',
      data: {init_src_values_js},
      backgroundColor: 'rgba(34,197,94,.75)',
      borderColor: '#22c55e',
      borderWidth: 1
    }}]
  }},
  options: {{
    indexAxis: 'y',
    responsive: true,
    animation: {{ duration: 400, easing: 'easeInOutQuart' }},
    onClick: (event, elements) => {{
      if (!elements.length) return;
      drillDown('srcChart', elements[0].index, elements[0].datasetIndex ?? 0);
    }},
    onHover: (event, elements) => {{
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    }},
    plugins: {{legend: {{display: false}}}},
    scales: {{
      x: {{ticks: {{color:'#64748b', font: {{size:10}}, callback: v => '$' + v.toLocaleString()}}, grid: {{color:'#334155'}}}},
      y: {{ticks: {{color:'#64748b', font: {{size:10}}}}, grid: {{color:'#1e293b'}}}}
    }}
  }}
}});

// ── catChart: Top categories horizontal bar ───────────────────────────────
activeCharts['catChart'] = new Chart(document.getElementById('catChart').getContext('2d'), {{
  type: 'bar',
  data: {{
    labels: {init_cat_labels_js},
    datasets: [{{
      label: 'Spending',
      data: {init_cat_values_js},
      backgroundColor: 'rgba(96,165,250,.75)',
      borderColor: '#60a5fa',
      borderWidth: 1
    }}]
  }},
  options: {{
    indexAxis: 'y',
    responsive: true,
    animation: {{ duration: 400, easing: 'easeInOutQuart' }},
    onClick: (event, elements) => {{
      if (!elements.length) return;
      drillDown('catChart', elements[0].index, elements[0].datasetIndex ?? 0);
    }},
    onHover: (event, elements) => {{
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    }},
    plugins: {{legend: {{display: false}}}},
    scales: {{
      x: {{ticks: {{color:'#64748b', font: {{size:10}}, callback: v => '$' + v.toLocaleString()}}, grid: {{color:'#334155'}}}},
      y: {{ticks: {{color:'#64748b', font: {{size:10}}}}, grid: {{color:'#1e293b'}}}}
    }}
  }}
}});

// ── debtChart: Debt trend line ────────────────────────────────────────────
activeCharts['debtChart'] = new Chart(document.getElementById('debtChart').getContext('2d'), {{
  type: 'line',
  data: {{
    labels: {debt_month_labels_js},
    datasets: [{{
      label: 'Total Debt',
      data: {debt_month_values_js},
      borderColor: '#ef4444',
      borderWidth: 2,
      backgroundColor: 'rgba(239,68,68,.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
      pointBackgroundColor: '#ef4444'
    }}]
  }},
  options: {{
    responsive: true,
    plugins: {{legend: {{labels: {{color:'#94a3b8', font: {{size:11}}}}}}}},
    scales: {{
      x: {{ticks: {{color:'#64748b', font: {{size:10}}}}, grid: {{color:'#334155'}}}},
      y: {{ticks: {{color:'#64748b', font: {{size:10}}, callback: v => '$' + v.toLocaleString()}}, grid: {{color:'#1e293b'}}}}
    }}
  }}
}});

// ── sankeyChart: Money Flow Sankey ────────────────────────────────────────
const sankeyCtx = document.getElementById('sankeyChart').getContext('2d');
activeCharts['sankeyChart'] = new Chart(sankeyCtx, {{
  type: 'sankey',
  data: {{
    datasets: [{{
      data: {init_sankey_js},
      colorFrom: () => '#22c55e',
      colorTo: (c) => {{
        const nc = {{'Necessities':'#3b82f6','Optional':'#facc15','Other':'#64748b','Net / Savings':'#14b8a6'}};
        return nc[(c.dataset.data[c.dataIndex] || {{}}).to] || '#22c55e';
      }},
      colorMode: 'gradient',
      color: '#e2e8f0',
      size: 'min',
    }}]
  }},
  options: {{
    responsive: true,
    animation: {{ duration: 400, easing: 'easeInOutQuart' }},
    plugins: {{
      legend: {{ display: false }},
      tooltip: {{
        callbacks: {{
          label: (ctx) => {{
            const d = ctx.dataset.data[ctx.dataIndex];
            if (!d) return '';
            return ` ${{d.from}} \u2192 ${{d.to}}: $${{d.flow.toLocaleString('en-US',{{minimumFractionDigits:2}})}}`;
          }}
        }}
      }}
    }}
  }}
}});

// ── AI Summary functions ───────────────────────────────────────────────────
function getAISummary() {{ return SUMMARIES_DATA[activePeriod] || ''; }}

function copyAISummary() {{
  const text = getAISummary();
  if (!text) return;
  const tick = () => {{
    const el = document.getElementById('copy-tick');
    if (el) {{ el.style.display = 'inline'; setTimeout(() => el.style.display = 'none', 2000); }}
  }};
  if (navigator.clipboard) {{
    navigator.clipboard.writeText(text).then(tick).catch(() => {{
      const ta = Object.assign(document.createElement('textarea'), {{value: text, style: 'position:fixed;opacity:0'}});
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); tick();
    }});
  }} else {{
    const ta = Object.assign(document.createElement('textarea'), {{value: text, style: 'position:fixed;opacity:0'}});
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); tick();
  }}
}}

function downloadAISummary() {{
  const text = getAISummary();
  if (!text) return;
  const label = (PERIOD_LABELS[activePeriod] || activePeriod).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const a = Object.assign(document.createElement('a'), {{
    href: URL.createObjectURL(new Blob([text], {{type: 'text/markdown'}})),
    download: `financial-summary-${{label}}-{datetime.today().strftime('%Y-%m-%d')}.md`
  }});
  a.click(); URL.revokeObjectURL(a.href);
}}

// ── Modal state and functions ──────────────────────────────────────────────
let modalTxData = [], modalSortKey = 'd', modalSortDir = -1, modalSearchVal = '';
let _filterTimer = null;

function escHtml(s) {{
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}}

function fmtUSD(v) {{
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString('en-US', {{minimumFractionDigits:2,maximumFractionDigits:2}});
}}

function openModal(txArray, title, meta) {{
  modalTxData = txArray; modalSortKey = 'd'; modalSortDir = -1; modalSearchVal = '';
  document.getElementById('modalSearch').value = '';
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMeta').textContent = meta || '';
  renderModalTable();
  document.getElementById('txModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}}

function closeModal() {{
  document.getElementById('txModal').classList.remove('open');
  document.body.style.overflow = '';
}}

function handleModalBackdropClick(e) {{
  if (e.target === document.getElementById('txModal')) closeModal();
}}

document.addEventListener('keydown', e => {{ if (e.key === 'Escape') closeModal(); }});

function sortModal(key) {{
  if (modalSortKey === key) {{ modalSortDir = -modalSortDir; }}
  else {{ modalSortKey = key; modalSortDir = -1; }}
  renderModalTable();
}}

function filterModalTable() {{
  if (_filterTimer) clearTimeout(_filterTimer);
  _filterTimer = setTimeout(() => {{
    modalSearchVal = (document.getElementById('modalSearch').value || '').toLowerCase();
    renderModalTable();
  }}, 60);
}}

function renderModalTable() {{
  const search = modalSearchVal;
  let rows = search
    ? modalTxData.filter(t =>
        (t.d||'').includes(search) || (t.m||'').toLowerCase().includes(search) ||
        (t.c||'').toLowerCase().includes(search) || (t.a||'').toLowerCase().includes(search)
      )
    : modalTxData.slice();

  // Sort
  const sk = modalSortKey, sd = modalSortDir;
  rows.sort((a, b) => {{
    const av = a[sk] ?? '', bv = b[sk] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return sd * (av - bv);
    return sd * String(av).localeCompare(String(bv));
  }});

  // Stats
  let totalSpend = 0, totalIncome = 0;
  rows.forEach(t => {{
    if (t.v < 0) totalSpend += Math.abs(t.v);
    else if (t.t === 'I') totalIncome += t.v;
  }});
  const net = totalIncome - totalSpend;
  document.getElementById('modalCount').textContent = rows.length;
  document.getElementById('modalTotal').textContent = fmtUSD(totalSpend);
  document.getElementById('modalIncome').textContent = fmtUSD(totalIncome);
  const netEl2 = document.getElementById('modalNet');
  netEl2.textContent = fmtUSD(net);
  netEl2.style.color = net >= 0 ? '#22c55e' : '#ef4444';

  // Sort indicators
  document.querySelectorAll('.modal-table th').forEach(th => {{
    th.classList.remove('sort-asc', 'sort-desc');
  }});
  const thMap = {{'d':0,'m':1,'c':2,'a':3,'t':4,'v':5}};
  const thIdx = thMap[sk];
  if (thIdx !== undefined) {{
    const ths = document.querySelectorAll('.modal-table th');
    if (ths[thIdx]) ths[thIdx].classList.add(sd === 1 ? 'sort-asc' : 'sort-desc');
  }}

  // Build rows
  const frag = document.createDocumentFragment();
  const typeLabels = {{I:'Income',N:'Necessity',O:'Optional',D:'Debt',X:'Transfer',T:'Other'}};
  rows.forEach((t, i) => {{
    const tr = document.createElement('tr');
    const amtColor = t.v >= 0 ? '#22c55e' : '#ef4444';
    tr.innerHTML = `<td style="color:#64748b">${{escHtml(t.d)}}</td>` +
      `<td>${{escHtml(t.m)}}</td>` +
      `<td><span class="badge">${{escHtml(t.c)}}</span></td>` +
      `<td style="color:#64748b">${{escHtml(t.a)}}</td>` +
      `<td><span class="badge">${{escHtml(typeLabels[t.t]||t.t)}}</span></td>` +
      `<td style="text-align:right;color:${{amtColor}}"><b>${{fmtUSD(t.v)}}</b></td>`;
    if (i < 20) {{
      tr.style.opacity = '0';
      tr.style.animation = `fadeInRow .2s ease ${{i * 15}}ms forwards`;
    }}
    frag.appendChild(tr);
  }});
  const tbody = document.getElementById('modalTbody');
  tbody.innerHTML = '';
  tbody.appendChild(frag);
}}

// ── Drill-Down routing ────────────────────────────────────────────────────
function drillDown(chartId, idx, dsIdx) {{
  const d = PERIODS_DATA[activePeriod];
  if (!d) return;
  const periodMonths = new Set(d.labels);
  let txs = [], title = '', meta = '';

  if (chartId === 'catChart') {{
    const cat = d.cat_labels[idx];
    if (!cat) return;
    txs = ALL_TRANSACTIONS.filter(t => t.c === cat && periodMonths.has(t.d.slice(0,7)));
    title = 'Category: ' + cat;
    meta = PERIOD_LABELS[activePeriod] || activePeriod;

  }} else if (chartId === 'srcChart') {{
    const merchant = d.src_labels[idx];
    if (!merchant) return;
    txs = ALL_TRANSACTIONS.filter(t => t.m === merchant && t.t === 'I' && periodMonths.has(t.d.slice(0,7)));
    title = 'Income Source: ' + merchant;
    meta = PERIOD_LABELS[activePeriod] || activePeriod;

  }} else if (chartId === 'necOptDonut') {{
    const typeMap = {{0:'N', 1:'O', 2:'D', 3:'T'}};
    const typeCode = typeMap[idx];
    if (!typeCode) return;
    const typeNames = {{N:'Necessities', O:'Optional', D:'Debt', T:'Other'}};
    txs = ALL_TRANSACTIONS.filter(t => t.t === typeCode && t.v < 0 && periodMonths.has(t.d.slice(0,7)));
    title = typeNames[typeCode] + ' Transactions';
    meta = PERIOD_LABELS[activePeriod] || activePeriod;

  }} else if (chartId === 'necOptBar') {{
    const typeMap = {{0:'N', 1:'O', 2:'D', 3:'T'}};
    const typeCode = typeMap[dsIdx];
    if (!typeCode) return;
    const month = d.labels[idx];
    if (!month) return;
    const typeNames = {{N:'Necessities', O:'Optional', D:'Debt', T:'Other'}};
    txs = ALL_TRANSACTIONS.filter(t => t.t === typeCode && t.v < 0 && t.d.slice(0,7) === month);
    title = typeNames[typeCode] + ' — ' + month;
    meta = 'Exact month';

  }} else if (chartId === 'flowChart') {{
    const month = d.labels[idx];
    if (!month) return;
    if (dsIdx === 0) {{
      txs = ALL_TRANSACTIONS.filter(t => t.t === 'I' && t.d.slice(0,7) === month);
      title = 'Income — ' + month;
    }} else {{
      txs = ALL_TRANSACTIONS.filter(t => t.v < 0 && t.t !== 'X' && t.t !== 'I' && t.d.slice(0,7) === month);
      title = 'Spending — ' + month;
    }}
    meta = 'Exact month';

  }} else if (chartId === 'chkChart') {{
    const month = d.labels[idx];
    if (!month) return;
    if (dsIdx === 0) {{
      txs = ALL_TRANSACTIONS.filter(t => t.t === 'I' && t.k === 1 && t.d.slice(0,7) === month);
      title = 'Checking Income — ' + month;
    }} else {{
      txs = ALL_TRANSACTIONS.filter(t => t.v < 0 && t.k === 1 && t.t !== 'X' && t.d.slice(0,7) === month);
      title = 'Checking Expenses — ' + month;
    }}
    meta = 'Exact month';
  }}

  if (txs.length === 0) {{
    title = title || 'Transactions';
    meta = 'No transactions found';
  }}
  openModal(txs, title, meta);
}}

function switchPeriod(key) {{
  document.querySelectorAll('.period-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === key)
  );
  const d = PERIODS_DATA[key];
  if (!d) return;

  // Bar charts (labels + multiple datasets)
  const barMap = {{
    flowChart:  [d.income, d.spending],
    chkChart:   [d.chk_income, d.chk_outflow],
    necOptBar:  [d.necessity, d.optional, d.debt, d.other],
  }};
  for (const [id, datasets] of Object.entries(barMap)) {{
    const c = activeCharts[id];
    if (!c) continue;
    c.data.labels = d.labels;
    datasets.forEach((vals, i) => {{ c.data.datasets[i].data = vals; }});
    c.update('active');
  }}

  // Donut
  const donut = activeCharts['necOptDonut'];
  if (donut) {{ donut.data.datasets[0].data = d.nec_opt_donut; donut.update('active'); }}

  // Horizontal bars (labels change too)
  const srcC = activeCharts['srcChart'];
  if (srcC) {{ srcC.data.labels = d.src_labels; srcC.data.datasets[0].data = d.src_values; srcC.update('active'); }}

  const catC = activeCharts['catChart'];
  if (catC) {{ catC.data.labels = d.cat_labels; catC.data.datasets[0].data = d.cat_values; catC.update('active'); }}

  // Sankey
  const sk = activeCharts['sankeyChart'];
  if (sk) {{ sk.data.datasets[0].data = d.sankey; sk.update('active'); }}

  // KPI cards
  const inEl   = document.getElementById('kpi-income-val');
  const outEl  = document.getElementById('kpi-spending-val');
  const netEl  = document.getElementById('kpi-net-val');
  const subEl  = document.getElementById('kpi-net-sub');
  const dispEl = document.getElementById('kpi-disposable-val');
  const dispSub= document.getElementById('kpi-disposable-sub');
  if (inEl)  inEl.textContent  = fmtUSD(d.kpi_income);
  if (outEl) outEl.textContent = fmtUSD(d.kpi_spending);
  if (netEl) {{
    netEl.textContent = fmtUSD(d.kpi_net);
    netEl.className   = 'kpi-value ' + (d.kpi_net >= 0 ? 'green' : 'red');
  }}
  if (subEl) subEl.textContent = 'In ' + fmtUSD(d.kpi_income) + ' \u00b7 Out ' + fmtUSD(d.kpi_spending);
  if (dispEl) {{
    dispEl.textContent = fmtUSD(d.kpi_disposable);
    dispEl.className   = 'kpi-value ' + (d.kpi_disposable >= 0 ? 'green' : 'red');
  }}
  if (dispSub) dispSub.textContent = 'Income \u2212 Necessities \u2212 Debt (' + fmtUSD(d.kpi_debt) + ' debt)';

  // KPI animation
  [inEl, outEl, netEl, dispEl].forEach(el => {{
    if (!el) return;
    el.classList.remove('updating');
    void el.offsetWidth;
    el.classList.add('updating');
  }});

  // Update activePeriod + export note
  activePeriod = key;
  const noteEl = document.getElementById('summary-period-note');
  if (noteEl) noteEl.textContent = 'Summary: ' + (PERIOD_LABELS[key] || key);
  updateOpportunityCost(d);
}}

// ── Collapsible card functions ────────────────────────────────────────────
function expandedHeight(body) {{
  // scrollHeight returns 0 for elements inside hidden (display:none) parents.
  // Fall back to a large safe value so the CSS transition works correctly the
  // first time the card is revealed on an inactive tab.
  return (body.scrollHeight > 0 ? body.scrollHeight : 9999) + 'px';
}}

function toggleCard(id) {{
  const card = document.getElementById('card-' + id);
  if (!card) return;
  const isCollapsed = card.classList.toggle('collapsed');
  try {{ localStorage.setItem('card-' + id, isCollapsed ? '1' : '0'); }} catch(e) {{}}
  if (!isCollapsed) {{
    const body = document.getElementById('body-' + id);
    if (body) body.style.maxHeight = expandedHeight(body);
    const c = activeCharts[id];
    if (c) setTimeout(() => c.resize(), 350);
  }}
}}

function initCollapse() {{
  const ids = ['sankeyChart','flowChart','chkChart','necOptBar','necOptDonut',
               'srcChart','catChart','debtChart','accountBalances','recentTx','debtSim'];
  for (const id of ids) {{
    const card = document.getElementById('card-' + id);
    const body = document.getElementById('body-' + id);
    if (!body) continue;
    body.style.maxHeight = expandedHeight(body);
    try {{
      if (localStorage.getItem('card-' + id) === '1') {{
        card.classList.add('collapsed');
      }}
    }} catch(e) {{}}
  }}
}}

// ── Opportunity Cost ───────────────────────────────────────────────────────
function updateOpportunityCost(d) {{
  const numMonths = Math.max(d.labels.length, 1);
  const optMonthly = d.nec_opt_donut[1] / numMonths;
  const totalDebt = LIAB_VALUES.reduce((s,v) => s+v, 0);
  const surplus = d.kpi_net / numMonths;

  document.getElementById('opp-monthly-val').textContent = fmtUSD(optMonthly);

  const rM = 0.07/12;
  [1,5,10].forEach(yr => {{
    const fv = optMonthly > 0 ? optMonthly * (((1+rM)**(yr*12)-1)/rM) : 0;
    const el = document.getElementById('opp-fv'+yr);
    if (el) el.textContent = fmtUSD(fv);
  }});

  const ccMo = optMonthly*0.22/12;
  const cMoEl = document.getElementById('opp-cc-mo');
  const cYrEl = document.getElementById('opp-cc-yr');
  if (cMoEl) cMoEl.textContent = fmtUSD(ccMo);
  if (cYrEl) cYrEl.textContent = fmtUSD(ccMo*12);

  const nEl = document.getElementById('opp-debt-normal');
  const aEl = document.getElementById('opp-debt-accel');
  const sEl = document.getElementById('opp-debt-saved');
  if (nEl && aEl && sEl) {{
    if (totalDebt > 0 && surplus > 0) {{
      const moN = totalDebt/surplus;
      const moA = optMonthly > 0 ? totalDebt/(surplus+optMonthly) : moN;
      nEl.textContent = moN.toFixed(1)+' mo';
      aEl.textContent = moA.toFixed(1)+' mo';
      sEl.textContent = (moN-moA).toFixed(1)+' mo';
    }} else {{
      nEl.textContent = totalDebt===0 ? 'Debt-free' : 'No surplus';
      aEl.textContent = sEl.textContent = '\u2014';
    }}
  }}
}}

// ── Debt Simulator ─────────────────────────────────────────────────────────
function simulatePayoff(rates, extraPayment, strategy) {{
  let balances = LIAB_VALUES.slice();
  let totalInterest = 0;
  const monthlyTotals = [];
  const MAX_MONTHS = 600;

  for (let mo = 0; mo < MAX_MONTHS; mo++) {{
    const total = balances.reduce((s,b) => s+b, 0);
    monthlyTotals.push(Math.round(total*100)/100);
    if (total <= 0.01) break;

    // Accrue interest
    const monthlyInterest = balances.map((b,i) => b > 0 ? b*(rates[i]/100/12) : 0);
    monthlyInterest.forEach((int,i) => {{ balances[i] += int; totalInterest += int; }});

    // Calculate minimums
    const minimums = balances.map((b,i) => {{
      if (b <= 0) return 0;
      const minPay = Math.max(25, b*0.01 + monthlyInterest[i]);
      return Math.min(minPay, b);
    }});
    minimums.forEach((m,i) => {{ balances[i] -= m; }});
    balances = balances.map(b => b < 0.01 ? 0 : b);

    // Apply extra payment
    let extra = extraPayment;
    if (extra > 0) {{
      let priority;
      if (strategy === 'avalanche') {{
        priority = balances
          .map((b,i) => ({{i, b, r: rates[i]}}))
          .filter(x => x.b > 0)
          .sort((a,b2) => b2.r - a.r);
      }} else {{
        priority = balances
          .map((b,i) => ({{i, b, r: rates[i]}}))
          .filter(x => x.b > 0)
          .sort((a,b2) => a.b - b2.b);
      }}
      for (const item of priority) {{
        if (extra <= 0) break;
        const pay = Math.min(extra, balances[item.i]);
        balances[item.i] -= pay;
        extra -= pay;
      }}
    }}
    balances = balances.map(b => b < 0.01 ? 0 : b);
  }}

  return {{monthlyTotals, totalInterest: Math.round(totalInterest*100)/100, months: monthlyTotals.length}};
}}

function initDebtSim() {{
  const container = document.getElementById('sim-debt-rates');
  if (!container) return;
  container.innerHTML = '';
  LIAB_NAMES.forEach((name, i) => {{
    const row = document.createElement('div');
    row.className = 'sim-debt-rate-row';
    row.innerHTML = `<label>${{escHtml(name)}}</label><input type="number" class="sim-rate-input" id="sim-rate-${{i}}" min="0" max="100" step="0.5" value="${{LIAB_RATES[i] || 15}}" oninput="runDebtSim()"/>%`;
    container.appendChild(row);
  }});
  runDebtSim();
}}

function runDebtSim() {{
  const extra = parseFloat(document.getElementById('sim-extra-input')?.value || 0) || 0;
  const rates = LIAB_NAMES.map((_,i) => {{
    const el = document.getElementById('sim-rate-'+i);
    return el ? parseFloat(el.value)||0 : (LIAB_RATES[i]||15);
  }});

  const simMin  = simulatePayoff(rates, 0,     'avalanche');
  const simAval = simulatePayoff(rates, extra,  'avalanche');
  const simSnow = simulatePayoff(rates, extra,  'snowball');

  renderSimChart(simMin, simAval, simSnow);
  renderSimStats(simMin, simAval, simSnow);
}}

function renderSimChart(simMin, simAval, simSnow) {{
  const maxLen = Math.max(simMin.monthlyTotals.length, simAval.monthlyTotals.length, simSnow.monthlyTotals.length);
  const labels = Array.from({{length: maxLen}}, (_,i) => 'Mo '+(i+1));
  const pad = (arr) => arr.concat(Array(maxLen - arr.length).fill(0));

  if (activeCharts['debtSimChart']) {{
    const c = activeCharts['debtSimChart'];
    c.data.labels = labels;
    c.data.datasets[0].data = pad(simMin.monthlyTotals);
    c.data.datasets[1].data = pad(simAval.monthlyTotals);
    c.data.datasets[2].data = pad(simSnow.monthlyTotals);
    c.update();
    return;
  }}

  const canvas = document.getElementById('debtSimChart');
  if (!canvas) return;
  activeCharts['debtSimChart'] = new Chart(canvas.getContext('2d'), {{
    type: 'line',
    data: {{
      labels,
      datasets: [
        {{label:'Minimum Only', data:pad(simMin.monthlyTotals), borderColor:'#ef4444', borderDash:[5,3], borderWidth:2, pointRadius:0, fill:false}},
        {{label:'Avalanche',    data:pad(simAval.monthlyTotals), borderColor:'#22c55e', borderWidth:2, pointRadius:0, backgroundColor:'rgba(34,197,94,.08)', fill:true}},
        {{label:'Snowball',     data:pad(simSnow.monthlyTotals), borderColor:'#60a5fa', borderWidth:2, pointRadius:0, fill:false}}
      ]
    }},
    options: {{
      responsive: true,
      animation: {{duration:300}},
      plugins: {{legend: {{labels: {{color:'#94a3b8', font: {{size:11}}}}}}}},
      scales: {{
        x: {{ticks: {{color:'#64748b', font: {{size:10}}, maxTicksLimit:12}}, grid: {{color:'#334155'}}}},
        y: {{ticks: {{color:'#64748b', font: {{size:10}}, callback: v => '$'+v.toLocaleString()}}, grid: {{color:'#1e293b'}}}}
      }}
    }}
  }});
}}

function renderSimStats(simMin, simAval, simSnow) {{
  const container = document.getElementById('sim-stats');
  if (!container) return;
  const savedAval = simMin.totalInterest - simAval.totalInterest;
  const savedSnow = simMin.totalInterest - simSnow.totalInterest;
  container.innerHTML = `
    <div class="sim-stat-card">
      <h3>Months to Payoff</h3>
      <div class="sim-stat-row"><span>Minimum Only</span><span style="color:#ef4444">${{simMin.months}} mo</span></div>
      <div class="sim-stat-row"><span>Avalanche</span><span style="color:#22c55e">${{simAval.months}} mo</span></div>
      <div class="sim-stat-row"><span>Snowball</span><span style="color:#60a5fa">${{simSnow.months}} mo</span></div>
    </div>
    <div class="sim-stat-card">
      <h3>Total Interest Paid</h3>
      <div class="sim-stat-row"><span>Minimum Only</span><span style="color:#ef4444">${{fmtUSD(simMin.totalInterest)}}</span></div>
      <div class="sim-stat-row"><span>Avalanche</span><span style="color:#22c55e">${{fmtUSD(simAval.totalInterest)}}</span></div>
      <div class="sim-stat-row"><span>Snowball</span><span style="color:#60a5fa">${{fmtUSD(simSnow.totalInterest)}}</span></div>
    </div>
    <div class="sim-stat-card">
      <h3>Interest Saved vs Minimum</h3>
      <div class="sim-stat-row"><span>Avalanche saves</span><span style="color:#22c55e">${{fmtUSD(savedAval)}}</span></div>
      <div class="sim-stat-row"><span>Snowball saves</span><span style="color:#60a5fa">${{fmtUSD(savedSnow)}}</span></div>
      <div class="sim-stat-row"><span>Avalanche vs Snowball</span><span>${{fmtUSD(savedAval - savedSnow)}} better</span></div>
    </div>`;
}}

// ── Tab Navigation ─────────────────────────────────────────────────────────
let activeTab = 'overview';

function switchTab(key) {{
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === key)
  );
  document.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-' + key)
  );
  activeTab = key;
  try {{ localStorage.setItem('activeTab', key); }} catch(e) {{}}
  const tabChartMap = {{
    overview:     ['sankeyChart'],
    cashflow:     ['flowChart','chkChart'],
    spending:     ['necOptBar','necOptDonut','srcChart','catChart'],
    debt:         ['debtChart','debtSimChart'],
    transactions: []
  }};
  setTimeout(() => {{
    // Resize charts in the newly visible tab
    (tabChartMap[key] || []).forEach(id => {{
      const c = activeCharts[id]; if (c) c.resize();
    }});
    // Re-measure expanded card bodies now that the tab is visible (scrollHeight
    // was 0 when the cards were hidden, so they need a correct maxHeight now).
    const pane = document.getElementById('tab-' + key);
    if (pane) {{
      pane.querySelectorAll('.collapsible-card:not(.collapsed) .card-body').forEach(body => {{
        if (body.scrollHeight > 0) body.style.maxHeight = body.scrollHeight + 'px';
      }});
    }}
  }}, 50);
}}

function initTabs() {{
  let saved = 'overview';
  try {{ saved = localStorage.getItem('activeTab') || 'overview'; }} catch(e) {{}}
  switchTab(saved);
}}

switchPeriod('last');
initCollapse();
initDebtSim();
updateOpportunityCost(PERIODS_DATA['last']);
initTabs();
</script>

<!-- Transaction Drill-Down Modal -->
<div id="txModal" onclick="handleModalBackdropClick(event)">
  <div class="modal-card">
    <div class="modal-header">
      <div class="modal-title" id="modalTitle">Transactions</div>
      <div class="modal-meta" id="modalMeta"></div>
    </div>
    <div class="modal-stats">
      <span class="modal-stat">Count: <b id="modalCount">0</b></span>
      <span class="modal-stat">Spend: <b id="modalTotal">$0.00</b></span>
      <span class="modal-stat">Income: <b id="modalIncome" class="green">$0.00</b></span>
      <span class="modal-stat">Net: <b id="modalNet">$0.00</b></span>
    </div>
    <div class="modal-search-row">
      <input class="modal-search" id="modalSearch" type="text" placeholder="Filter transactions…" oninput="filterModalTable()"/>
    </div>
    <div class="modal-table-wrap">
      <table class="modal-table" id="modalTable">
        <thead>
          <tr>
            <th onclick="sortModal('d')">Date</th>
            <th onclick="sortModal('m')">Merchant</th>
            <th onclick="sortModal('c')">Category</th>
            <th onclick="sortModal('a')">Account</th>
            <th onclick="sortModal('t')">Type</th>
            <th onclick="sortModal('v')" style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody id="modalTbody"></tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="modal-close-btn" onclick="closeModal()">Close</button>
    </div>
  </div>
</div>
</body>
</html>
"""

    out_path = os.path.join(DIR, "dashboard.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(out_html)

    d = default_period
    print(f"Dashboard generated: {out_path}")
    print(f"\n  Net Worth:    {fmt(net_worth)}")
    print(f"  Total Assets: {fmt(total_assets)}")
    print(f"  Total Debt:   {fmt(total_liabilities)}")
    print(f"  Last Month:   In {fmt(d['kpi_income'])}  |  Out {fmt(d['kpi_spending'])}  |  Net {fmt(d['kpi_net'])}")
    print(f"\nOpen dashboard.html in any browser.")
