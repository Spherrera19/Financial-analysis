"""
Finance Dashboard Generator — Phase 2 Orchestrator
====================================================
Lightweight pipeline that delegates all heavy lifting to backend modules:
  1. backend.ingest  — wipe + reload SQLite from CSVs
  2. backend.engine  — query SQLite, return Pydantic models
  3. (local)         — generate Markdown AI summaries
  4. backend.models  — assemble DashboardPayload, serialise to data.json

Run with: python generate_dashboard.py
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from backend.engine import (
    build_accounts,
    build_debt_section,
    build_period,
    build_summary,
    get_period_months,
    get_recent_transactions,
)
from backend.ingest import build_database
from backend.models import DashboardPayload, Meta, PeriodKey

DIR     = Path(__file__).parent
DB_PATH = DIR / "finance.db"
OUT_PATH = DIR / "frontend" / "public" / "data.json"

PERIOD_KEYS: list[PeriodKey] = ["current", "last", "past2", "quarter", "year"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt(n: float) -> str:
    sign = "-" if n < 0 else ""
    return f"{sign}${abs(n):,.2f}"


# ---------------------------------------------------------------------------
# AI Summary  (logic retained verbatim from monolith)
# Accepts plain dicts so internal references (pd["kpi_income"] etc.) are
# unchanged.  Callers pass PeriodData.model_dump() and Account.model_dump().
# ---------------------------------------------------------------------------

def compute_ai_summary(
    period_key: str,
    period_months: list[str],
    pd: dict,
    assets: list[dict],
    liabilities: list[dict],
    total_assets: float,
    total_liabilities: float,
    net_worth: float,
    debt_month_labels: list[str],
    debt_month_values: list[float],
) -> str:
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
    num_months   = max(len(period_months), 1)

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
        trend_str = (f"GROWING by {_fmt(trend_delta)}" if trend_delta > 0
                     else f"SHRINKING by {_fmt(abs(trend_delta))}")
    else:
        trend_str = "insufficient data"

    lines = []

    # 1. Header
    lines.append(f"# Financial Summary — {period_label}")
    lines.append(f"*Generated: {today.strftime('%B %d, %Y')}*")
    lines.append("")

    # 2. Net Worth Snapshot
    lines.append("## Net Worth Snapshot")
    lines.append(f"**Net Worth:** {_fmt(net_worth)}")
    lines.append("")
    lines.append("**Assets:**")
    for a in assets:
        lines.append(f"- {a['name']}: {_fmt(a['balance'])}")
    lines.append(f"- **Total Assets: {_fmt(total_assets)}**")
    lines.append("")
    lines.append("**Liabilities (most negative first):**")
    for a in sorted(liabilities, key=lambda x: x["balance"]):
        lines.append(f"- {a['name']}: {_fmt(a['balance'])}")
    lines.append(f"- **Total Debt: {_fmt(total_liabilities)}**")
    lines.append("")
    lines.append(f"**3-Month Debt Trend:** {trend_str}")
    lines.append("")

    # 3. Income Analysis
    lines.append("## Income Analysis")
    lines.append(f"**Period Total:** {_fmt(kpi_income)}")
    lines.append(f"**Monthly Average:** {_fmt(monthly_avg_income)}")
    lines.append("")
    lines.append("**Sources:**")
    for label, val in zip(pd["src_labels"], pd["src_values"]):
        pct = (val / kpi_income * 100) if kpi_income > 0 else 0
        lines.append(f"- {label}: {_fmt(val)} ({pct:.1f}%)")
    lines.append("")

    # 4. Spending Analysis
    lines.append("## Spending Analysis")
    lines.append(f"**Period Total:** {_fmt(kpi_spending)}")
    lines.append(f"**Monthly Average:** {_fmt(monthly_avg_spending)}")
    lines.append("")
    if kpi_spending > 0:
        lines.append(
            f"**Mix:** Necessity {nec_total/kpi_spending*100:.1f}% / "
            f"Optional {opt_total/kpi_spending*100:.1f}% / "
            f"Debt {dbt_total/kpi_spending*100:.1f}% / "
            f"Other {oth_total/kpi_spending*100:.1f}%"
        )
    lines.append("")
    lines.append("**Top 10 Categories:**")
    for label, val in zip(pd["cat_labels"][:10], pd["cat_values"][:10]):
        pct = (val / kpi_spending * 100) if kpi_spending > 0 else 0
        lines.append(f"- {label}: {_fmt(val)} ({pct:.1f}%)")
    lines.append("")

    # 5. Cash Flow
    lines.append("## Cash Flow")
    flow_label = "SURPLUS" if kpi_net >= 0 else "DEFICIT"
    lines.append(f"**Period {flow_label}:** {_fmt(kpi_net)}")
    lines.append(f"**Monthly Average Net:** {_fmt(monthly_avg_net)}")
    lines.append(f"**Annualized Projection:** {_fmt(monthly_avg_net * 12)}")
    lines.append("")

    # 6. Lost Opportunity Cost
    lines.append("## Lost Opportunity Cost")
    lines.append(f"**Monthly Optional Spending:** {_fmt(opt_monthly)}")
    lines.append("")
    cc_monthly = opt_monthly * 0.22 / 12
    lines.append("**Credit Card Interest Avoided (22% APR):**")
    lines.append(f"- Monthly: {_fmt(cc_monthly)}")
    lines.append(f"- Annually: {_fmt(cc_monthly * 12)}")
    lines.append("")
    r_m = 0.07 / 12
    lines.append("**Investment Future Value (if invested at 7% annually):**")
    for n_years in [1, 5, 10]:
        n  = n_years * 12
        fv = opt_monthly * (((1 + r_m) ** n - 1) / r_m) if r_m > 0 else opt_monthly * n
        lines.append(f"- {n_years} year{'s' if n_years > 1 else ''}: {_fmt(fv)}")
    lines.append("")
    lines.append("**Debt Payoff Acceleration:**")
    if total_debt > 0 and monthly_surplus > 0:
        mo_normal = total_debt / monthly_surplus
        if opt_monthly > 0:
            mo_accel = total_debt / (monthly_surplus + opt_monthly)
            lines.append(f"- At current surplus ({_fmt(monthly_surplus)}/mo): {mo_normal:.1f} months")
            lines.append(f"- If optional redirected (+{_fmt(opt_monthly)}/mo): {mo_accel:.1f} months")
            lines.append(f"- Time saved: {mo_normal - mo_accel:.1f} months")
        else:
            lines.append(f"- At current surplus ({_fmt(monthly_surplus)}/mo): {mo_normal:.1f} months")
    elif total_debt == 0:
        lines.append("- No debt to pay off")
    else:
        lines.append("- No monthly surplus available for debt payoff")
    lines.append("")

    # 7. Debt Situation
    lines.append("## Debt Situation")
    for a in sorted(liabilities, key=lambda x: x["balance"]):
        lines.append(f"- {a['name']}: {_fmt(a['balance'])}")
    lines.append(f"**Total Debt: {_fmt(total_liabilities)}**")
    lines.append(f"**3-Month Trend:** {trend_str}")
    lines.append("")

    # 8. Key Observations
    lines.append("## Key Observations")
    observations = []

    if kpi_net < 0:
        observations.append(f"\u26a0\ufe0f DEFICIT: Spending exceeds income by {_fmt(abs(kpi_net))} this period")
    if 0 <= monthly_avg_net < 500:
        observations.append(f"\u26a0\ufe0f Tight surplus: Monthly net is only {_fmt(monthly_avg_net)}")
    if len(debt_month_values) >= 4:
        base = debt_month_values[-4]
        if base > 0:
            pct_chg = (debt_month_values[-1] - base) / base * 100
            if pct_chg > 2:
                observations.append(f"\u26a0\ufe0f Debt GROWING: Up {pct_chg:.1f}% over 3 months")
            elif pct_chg < -2:
                observations.append(f"\u2705 Debt SHRINKING: Down {abs(pct_chg):.1f}% over 3 months")
    if net_worth < 0:
        observations.append(f"\u26a0\ufe0f Negative net worth: {_fmt(net_worth)}")
    if kpi_spending > 0 and opt_total > nec_total:
        observations.append(f"\u26a0\ufe0f Optional spending ({_fmt(opt_total)}) exceeds necessity ({_fmt(nec_total)})")
    if kpi_spending > 0 and pd["cat_values"] and pd["cat_values"][0] / kpi_spending > 0.20:
        top_pct = pd["cat_values"][0] / kpi_spending * 100
        observations.append(f"\u2139\ufe0f Top category '{pd['cat_labels'][0]}' is {top_pct:.1f}% of total spending")
    if kpi_income > 0 and pd["src_values"] and pd["src_values"][0] / kpi_income > 0.85:
        top_pct = pd["src_values"][0] / kpi_income * 100
        observations.append(f"\u2139\ufe0f Income concentrated: '{pd['src_labels'][0]}' is {top_pct:.1f}% of income")
    if opt_monthly > 500:
        observations.append(f"\u2139\ufe0f High optional spending: {_fmt(opt_monthly)}/month average")
    if not observations:
        observations.append("\u2705 No major concerns detected for this period")

    for obs in observations:
        lines.append(f"- {obs}")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    # Step 1 — Ingest: wipe + reload SQLite from CSVs
    print("[orchestrator] Step 1/5  Ingesting CSVs into SQLite...")
    conn = build_database(DB_PATH, DIR)

    # Step 2 — Engine: fetch all Pydantic models
    print("[orchestrator] Step 2/5  Building Pydantic models from SQLite...")
    summary  = build_summary(conn)
    accounts = build_accounts(conn)
    debt     = build_debt_section(conn)
    txs      = get_recent_transactions(conn)
    periods: dict[PeriodKey, object] = {pk: build_period(conn, pk) for pk in PERIOD_KEYS}
    conn.close()

    # Step 3 — AI summaries (reads from PeriodData.model_dump() — Option A)
    print("[orchestrator] Step 3/5  Generating AI summaries...")
    assets_dicts      = [a.model_dump() for a in accounts if a.balance >= 0]
    liabilities_dicts = [a.model_dump() for a in accounts if a.balance <  0]
    summaries: dict[PeriodKey, str] = {
        pk: compute_ai_summary(
            pk,
            get_period_months(pk),
            periods[pk].model_dump(),
            assets_dicts,
            liabilities_dicts,
            summary.total_assets,
            summary.total_liabilities,
            summary.net_worth,
            debt.trend.labels,
            debt.trend.values,
        )
        for pk in PERIOD_KEYS
    }

    # Step 4 — Assemble DashboardPayload
    print("[orchestrator] Step 4/5  Assembling DashboardPayload...")
    payload = DashboardPayload(
        meta=Meta(
            generated_at=datetime.now().isoformat(),
            as_of_date=datetime.today().strftime("%B %d, %Y"),
        ),
        summary=summary,
        accounts=accounts,
        periods=periods,
        debt=debt,
        transactions=txs,
        summaries=summaries,
    )

    # Step 5 — Serialise
    print(f"[orchestrator] Step 5/5  Writing {OUT_PATH}...")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(payload.to_json(), encoding="utf-8")

    d = periods["last"]
    print(f"\n  data.json  ->  {OUT_PATH}")
    print(f"  Net Worth:    {_fmt(summary.net_worth)}")
    print(f"  Total Assets: {_fmt(summary.total_assets)}")
    print(f"  Total Debt:   {_fmt(summary.total_liabilities)}")
    print(f"  Last Month:   In {_fmt(d.kpi_income)}  |  Out {_fmt(d.kpi_spending)}  |  Net {_fmt(d.kpi_net)}")
    print("\n[orchestrator] Done.")
