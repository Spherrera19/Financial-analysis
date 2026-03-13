"""
Finance Dashboard Generator
Reads all CSV files in this directory and produces frontend/public/data.json
Run with: python generate_dashboard.py
"""

import csv
import os
import json
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

    # ── 10. Generate data.json ─────────────────────────────────────────────────────

    # Build accounts list with type field
    _accounts_out = []
    for _acct in accounts:
        _accounts_out.append({
            "name": _acct["name"],
            "balance": round(_acct["balance"], 2),
            "date": _acct["date"],
            "type": "asset" if _acct["balance"] >= 0 else "liability"
        })

    # Build debt accounts list
    _debt_accounts_out = []
    for i, _a in enumerate(liabilities):
        _debt_accounts_out.append({
            "name": _a["name"][-28:],
            "balance": round(-abs(_a["balance"]), 2),
            "rate": guess_interest_rate(_a["name"])
        })

    # Build the output payload
    _payload = {
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "as_of_date": datetime.today().strftime("%B %d, %Y")
        },
        "summary": {
            "net_worth": round(net_worth, 2),
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "asset_count": len([a for a in accounts if a["balance"] >= 0]),
            "liability_count": len([a for a in accounts if a["balance"] < 0])
        },
        "accounts": _accounts_out,
        "periods": periods_data,
        "debt": {
            "accounts": _debt_accounts_out,
            "trend": {
                "labels": debt_month_labels,
                "values": [round(v, 2) for v in debt_month_values]
            }
        },
        "transactions": all_tx_compact,
        "summaries": summaries_data
    }

    # Write to frontend/public/data.json
    _out_dir = os.path.join(DIR, "frontend", "public")
    os.makedirs(_out_dir, exist_ok=True)
    _out_path = os.path.join(_out_dir, "data.json")
    with open(_out_path, "w", encoding="utf-8") as _f:
        json.dump(_payload, _f, separators=(',', ':'), ensure_ascii=False)

    d = default_period
    print(f"data.json written to {_out_path}")
    print(f"\n  Net Worth:    {fmt(net_worth)}")
    print(f"  Total Assets: {fmt(total_assets)}")
    print(f"  Total Debt:   {fmt(total_liabilities)}")
    print(f"  Last Month:   In {fmt(d['kpi_income'])}  |  Out {fmt(d['kpi_spending'])}  |  Net {fmt(d['kpi_net'])}")
