"""
Phase 2 — Milestone 3: Data Engine
====================================
Queries the SQLite database and returns strict Pydantic models.
All math is intentionally identical to generate_dashboard.py.

Run standalone to verify:
    python -m backend.engine       # from project root
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

from backend.classify import classify, get_minimum_payment_total, guess_interest_rate
from backend.database import init_db
from backend.debt_engine import build_projection
from backend.equity_engine import calculate_price_scenarios_from_history, fetch_stock_history
from backend.models import (
    Account,
    CashFlowWaterfall,
    DebtAccount,
    DebtProjection,
    DebtSection,
    DebtTrend,
    EquitySection,
    EquityVestSummary,
    PayoffScenario,
    PeriodData,
    SankeyFlow,
    Summary,
    Transaction,
)

def _get_pd_conn(conn):
    """Extract the SQLAlchemy engine/connection if a SQLModel Session is passed."""
    return conn.get_bind() if hasattr(conn, 'get_bind') else conn


_TAX_WITHHOLDING = 0.30

_BACKEND_DIR = Path(__file__).parent
_PROJECT_ROOT = _BACKEND_DIR.parent

# ---------------------------------------------------------------------------
# Period helpers  (mirrors generate_dashboard.py exactly)
# ---------------------------------------------------------------------------

def get_period_months(period_key: str) -> list[str]:
    """Returns a sorted list of YYYY-MM strings for the given period key."""
    today = datetime.today()
    y, m = today.year, today.month

    def prev(n: int) -> str:
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


# ---------------------------------------------------------------------------
# Internal helper — latest balance snapshot per account
# ---------------------------------------------------------------------------

def _latest_account_balances(conn: sqlite3.Connection) -> list[dict]:
    """
    Returns one dict per account with its most recent balance snapshot.
    Mirrors the CSV-reading + dict-accumulation logic in generate_dashboard.py.
    """
    df = pd.read_sql_query(
        "SELECT name, balance, date FROM accounts_history ORDER BY name, date DESC",
        _get_pd_conn(conn),
    )
    if df.empty:
        return []
    # Keep the most-recent row per account, then sort by balance descending
    latest = df.groupby("name", as_index=False).first()
    latest = latest.sort_values("balance", ascending=False)
    return latest.to_dict("records")


# ---------------------------------------------------------------------------
# build_summary
# ---------------------------------------------------------------------------

def build_summary(conn: sqlite3.Connection) -> Summary:
    """Net worth, asset/liability totals and counts from latest account snapshots."""
    rows = _latest_account_balances(conn)
    assets      = [r for r in rows if r["balance"] >= 0]
    liabilities = [r for r in rows if r["balance"] <  0]
    total_assets      = sum(r["balance"] for r in assets)
    total_liabilities = sum(r["balance"] for r in liabilities)
    return Summary(
        net_worth=round(total_assets + total_liabilities, 2),
        total_assets=round(total_assets, 2),
        total_liabilities=round(total_liabilities, 2),
        asset_count=len(assets),
        liability_count=len(liabilities),
    )


# ---------------------------------------------------------------------------
# build_accounts
# ---------------------------------------------------------------------------

def build_accounts(conn: sqlite3.Connection) -> list[Account]:
    """All accounts as Pydantic Account models, sorted by balance descending."""
    return [
        Account(
            name=str(r["name"]),
            balance=round(float(r["balance"]), 2),
            date=str(r["date"]),
            type="asset" if r["balance"] >= 0 else "liability",
        )
        for r in _latest_account_balances(conn)
    ]


# ---------------------------------------------------------------------------
# build_period
# ---------------------------------------------------------------------------

def build_period(
    conn: sqlite3.Connection,
    period_key: str,
    ledger_id: int | None = None,
) -> PeriodData:
    """
    Compute all chart/KPI data for a given period key.
    Mirrors compute_period_data() in generate_dashboard.py exactly.
    Uses pd.read_sql_query() + Pandas aggregations to keep math identical.

    ledger_id: when provided, restricts the query to a single ledger workspace.
    The value is always passed as a bound parameter — never interpolated into
    the SQL string — to prevent SQL injection.
    """
    period_months = get_period_months(period_key)
    ms = set(period_months)

    placeholders = ",".join("?" * len(period_months))
    params: list = list(period_months)

    # Ledger filter: append clause + param only when a specific ledger is requested.
    # The ledger_id value travels as a bound ? parameter, not as an f-string substitution.
    ledger_clause = ""
    if ledger_id is not None:
        ledger_clause = " AND ledger_id = ?"
        params.append(ledger_id)

    df = pd.read_sql_query(
        f"SELECT date, merchant, category, amount, is_checking FROM transactions"
        f" WHERE substr(date, 1, 7) IN ({placeholders}){ledger_clause}",
        _get_pd_conn(conn),
        params=params,
    )

    if df.empty:
        return _empty_period_data(period_months)

    df["month"] = df["date"].str[:7]
    df["kind"]  = df["category"].apply(classify)

    income_df  = df[df["kind"] == "income"]
    expense_df = df[
        df["kind"].isin(["necessity", "optional", "other", "debt"]) & (df["amount"] < 0)
    ]

    # Monthly aggregates (mirrors the defaultdict accumulators in the monolith)
    def _grp_abs(sub: pd.DataFrame, kind_filter: str | None = None) -> pd.Series:
        g = sub if kind_filter is None else sub[sub["kind"] == kind_filter]
        return g.groupby("month")["amount"].apply(lambda x: abs(x).sum())

    monthly_income    = income_df.groupby("month")["amount"].sum()
    monthly_spending  = _grp_abs(expense_df)
    monthly_necessity = _grp_abs(expense_df, "necessity")
    monthly_optional  = _grp_abs(expense_df, "optional")
    monthly_debt      = _grp_abs(expense_df, "debt")
    monthly_other     = _grp_abs(expense_df, "other")

    chk_income_df   = income_df[income_df["is_checking"] == 1]
    chk_expense_df  = expense_df[expense_df["is_checking"] == 1]
    chk_monthly_income  = chk_income_df.groupby("month")["amount"].sum()
    chk_monthly_outflow = chk_expense_df.groupby("month")["amount"].apply(lambda x: abs(x).sum())

    def _m(series: pd.Series, month: str) -> float:
        return round(float(series.get(month, 0.0)), 2)

    income     = [_m(monthly_income,    mo) for mo in period_months]
    spending   = [_m(monthly_spending,  mo) for mo in period_months]
    necessity  = [_m(monthly_necessity, mo) for mo in period_months]
    optional_v = [_m(monthly_optional,  mo) for mo in period_months]
    other      = [_m(monthly_other,     mo) for mo in period_months]
    debt_v     = [_m(monthly_debt,      mo) for mo in period_months]
    chk_inc    = [_m(chk_monthly_income,   mo) for mo in period_months]
    chk_out    = [_m(chk_monthly_outflow,  mo) for mo in period_months]

    nec_total = sum(float(monthly_necessity.get(mo, 0)) for mo in period_months)
    opt_total = sum(float(monthly_optional.get(mo,  0)) for mo in period_months)
    dbt_total = sum(float(monthly_debt.get(mo,      0)) for mo in period_months)
    oth_total = sum(float(monthly_other.get(mo,     0)) for mo in period_months)
    kpi_income   = round(sum(float(monthly_income.get(mo,   0)) for mo in period_months), 2)
    kpi_spending = round(sum(float(monthly_spending.get(mo, 0)) for mo in period_months), 2)
    kpi_net      = round(kpi_income - kpi_spending, 2)

    # Category spend (top 15) — mirrors monolith
    period_expense = expense_df[expense_df["month"].isin(ms)]
    cat_series = (
        period_expense.groupby("category")["amount"]
        .apply(lambda x: abs(x).sum())
        .sort_values(ascending=False)
        .head(15)
    )
    cat_labels = list(cat_series.index)
    cat_values = [round(float(v), 2) for v in cat_series.values]

    # Income by source (top 8) — mirrors monolith
    period_income = income_df[income_df["month"].isin(ms) & (income_df["amount"] > 0)]
    src_series = (
        period_income.groupby("merchant")["amount"]
        .sum()
        .pipe(lambda s: s[s > 0])
        .sort_values(ascending=False)
        .head(8)
    )
    src_labels = [str(k)[:50] for k in src_series.index]
    src_values = [round(float(v), 2) for v in src_series.values]

    # Sankey — mirrors monolith exactly
    total_spending = nec_total + opt_total + dbt_total + oth_total
    net_savings    = kpi_income - total_spending
    src_acc        = dict(zip(src_labels, src_values))

    sankey_rows: list[SankeyFlow] = []
    if kpi_income > 0:
        for src_name, src_amount in sorted(src_acc.items(), key=lambda x: -x[1])[:6]:
            ratio = src_amount / kpi_income
            if nec_total > 0:
                sankey_rows.append(SankeyFlow(from_=src_name, to="Necessities",   flow=round(ratio * nec_total, 2)))
            if opt_total > 0:
                sankey_rows.append(SankeyFlow(from_=src_name, to="Optional",      flow=round(ratio * opt_total, 2)))
            if dbt_total > 0:
                sankey_rows.append(SankeyFlow(from_=src_name, to="Debt",          flow=round(ratio * dbt_total, 2)))
            if oth_total > 0:
                sankey_rows.append(SankeyFlow(from_=src_name, to="Other",         flow=round(ratio * oth_total, 2)))
            if net_savings > 0:
                sankey_rows.append(SankeyFlow(from_=src_name, to="Net / Savings", flow=round(ratio * net_savings, 2)))

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

    return PeriodData(
        labels=period_months,
        income=income,
        spending=spending,
        necessity=necessity,
        optional=optional_v,
        other=other,
        debt=debt_v,
        chk_income=chk_inc,
        chk_outflow=chk_out,
        nec_opt_donut=(round(nec_total, 2), round(opt_total, 2), round(dbt_total, 2), round(oth_total, 2)),
        cat_labels=cat_labels,
        cat_values=cat_values,
        src_labels=src_labels,
        src_values=src_values,
        kpi_income=kpi_income,
        kpi_spending=kpi_spending,
        kpi_net=kpi_net,
        kpi_debt=round(dbt_total, 2),
        kpi_disposable=round(kpi_income - nec_total - dbt_total, 2),
        sankey=sankey_rows,
        cash_flow_waterfall=waterfall,
    )


def _empty_period_data(period_months: list[str]) -> PeriodData:
    n = len(period_months)
    return PeriodData(
        labels=period_months,
        income=[0.0] * n, spending=[0.0] * n,
        necessity=[0.0] * n, optional=[0.0] * n,
        other=[0.0] * n, debt=[0.0] * n,
        chk_income=[0.0] * n, chk_outflow=[0.0] * n,
        nec_opt_donut=(0.0, 0.0, 0.0, 0.0),
        cat_labels=[], cat_values=[],
        src_labels=[], src_values=[],
        kpi_income=0.0, kpi_spending=0.0, kpi_net=0.0,
        kpi_debt=0.0, kpi_disposable=0.0,
        sankey=[],
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
    )


# ---------------------------------------------------------------------------
# build_debt_section
# ---------------------------------------------------------------------------

def build_debt_section(conn: sqlite3.Connection) -> DebtSection:
    """
    Debt accounts (latest liability balance per account) + 13-month trend.
    Mirrors the debt section of generate_dashboard.py exactly.
    """
    df = pd.read_sql_query(
        "SELECT name, balance, date FROM accounts_history WHERE type = 'liability'",
        _get_pd_conn(conn),
    )
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

    df["month"] = df["date"].str[:7]

    # Debt trend — per (account, month) keep the latest snapshot, mirrors monolith
    df_sorted = df.sort_values("date")
    acct_month_latest = (
        df_sorted.groupby(["name", "month"], as_index=False)
        .last()
    )
    all_months = sorted(acct_month_latest["month"].unique())[-13:]
    debt_month_values = []
    for mo in all_months:
        sub = acct_month_latest[acct_month_latest["month"] == mo]
        total = sub[sub["balance"] < 0]["balance"].apply(abs).sum()
        debt_month_values.append(round(float(total), 2))

    # Latest liability balance per account (most negative first)
    latest = df.sort_values("date").groupby("name", as_index=False).last()
    latest = latest.sort_values("balance")  # ascending = most negative first

    # Load user-configured terms keyed by the FULL original account name.
    cursor = conn.execute(
        "SELECT account_name, apr, min_payment, display_name FROM account_terms"
    )
    full_name_terms: dict[str, dict] = {
        row["account_name"]: {
            "apr":          row["apr"],
            "min_payment":  row["min_payment"],
            "display_name": row["display_name"],   # None if not set by user
        }
        for row in cursor.fetchall()
    }

    # Build DebtAccount list.
    # DebtAccount.name = user's display_name if set, otherwise the full name.
    # simulation_terms is keyed by DebtAccount.name so that simulate_payoff
    # can look up min_payment using acct["name"] without any re-translation.
    debt_accounts: list[DebtAccount] = []
    simulation_terms: dict[str, tuple[float, float]] = {}

    for _, row in latest.iterrows():
        full_name = str(row["name"])
        saved = full_name_terms.get(full_name)

        if saved:
            display = saved["display_name"] or full_name
            apr = saved["apr"]
            simulation_terms[display] = (saved["apr"], saved["min_payment"])
        else:
            display = full_name
            apr = guess_interest_rate(full_name) / 100.0

        debt_accounts.append(DebtAccount(
            name=display,
            balance=round(-abs(float(row["balance"])), 2),
            rate=apr,
        ))

    # ── Equity vest lump sums ─────────────────────────────────────────────
    # Convert upcoming vest projected_avg values into a {months_from_now: $}
    # dict so the payoff simulator can apply them as one-time debt payments.
    # Silently skipped if equity data is unavailable (e.g. yfinance offline).
    lump_sums: dict[int, float] = {}
    try:
        equity = build_equity_section(conn)
        today = date.today()
        for vest in equity.upcoming_vests:
            vest_dt = datetime.strptime(vest.date, "%Y-%m-%d").date()
            m = (vest_dt.year - today.year) * 12 + (vest_dt.month - today.month)
            if m > 0:
                lump_sums[m] = lump_sums.get(m, 0.0) + vest.projected_avg
    except Exception:
        pass  # degrade gracefully; projection still runs without lump sums

    return DebtSection(
        accounts=debt_accounts,
        trend=DebtTrend(labels=list(all_months), values=debt_month_values),
        projection=build_projection(
            debt_accounts,
            monthly_allocation=2000.0,
            db_terms=simulation_terms,
            lump_sums=lump_sums if lump_sums else None,
        ),
    )


# ---------------------------------------------------------------------------
# get_recent_transactions
# ---------------------------------------------------------------------------

def get_recent_transactions(
    conn: sqlite3.Connection,
    ledger_id: int | None = None,
) -> list[Transaction]:
    """
    Compact Transaction models for the 14-month window (year + current).
    Mirrors the all_tx_compact section of generate_dashboard.py.

    ledger_id: when provided, restricts results to that ledger workspace.
    """
    keep_months = set(get_period_months("year") + get_period_months("current"))

    if ledger_id is not None:
        df = pd.read_sql_query(
            "SELECT date, merchant, category, account, amount, owner, type, is_checking"
            " FROM transactions WHERE ledger_id = ? ORDER BY date DESC",
            _get_pd_conn(conn),
            params=[ledger_id],
        )
    else:
        df = pd.read_sql_query(
            "SELECT date, merchant, category, account, amount, owner, type, is_checking"
            " FROM transactions ORDER BY date DESC",
            _get_pd_conn(conn),
        )

    if df.empty:
        return []

    df = df[df["date"].str[:7].isin(keep_months)]

    return [
        Transaction(
            d=str(r["date"]),
            m=str(r["merchant"])[:50],
            c=str(r["category"]),
            a=str(r["account"])[-25:],
            v=float(r["amount"]),
            o=str(r["owner"]),
            t=str(r["type"]),       # type: ignore[arg-type]
            k=int(r["is_checking"]),  # type: ignore[arg-type]
        )
        for r in df.to_dict("records")
    ]


# ---------------------------------------------------------------------------
# build_equity_section
# ---------------------------------------------------------------------------

def build_equity_section(conn: sqlite3.Connection) -> EquitySection:
    """
    Load all equity grants, project prices for upcoming vest dates using GBM,
    apply 30% tax withholding to share counts, and return a structured
    EquitySection payload.

    Stock history is fetched once per unique ticker to avoid redundant yfinance
    network calls when a grant has multiple tranches.

    Any ticker whose yfinance download fails is silently skipped so a single
    bad ticker cannot break the whole response.
    """
    rows = conn.execute(
        "SELECT ticker, vesting_schedule FROM equity_grants"
    ).fetchall()

    if not rows:
        return EquitySection(
            total_unvested_value=0.0,
            next_vest_date=None,
            projected_net_cash_12m=0.0,
            upcoming_vests=[],
        )

    today = date.today()

    # ── Group future events by ticker ──────────────────────────────────────
    # Structure: { ticker: [ {date, shares, days_until}, ... ] }
    ticker_events: dict[str, list[dict]] = {}
    for row in rows:
        ticker = row["ticker"]
        for event in json.loads(row["vesting_schedule"]):
            vest_date = datetime.strptime(event["date"], "%Y-%m-%d").date()
            if vest_date <= today:
                continue
            ticker_events.setdefault(ticker, []).append({
                "date":       event["date"],
                "shares":     float(event["shares"]),
                "days_until": (vest_date - today).days,
            })

    # ── Fetch history once per ticker, project all its vest events ─────────
    upcoming_vests: list[EquityVestSummary] = []

    for ticker, events in ticker_events.items():
        try:
            history = fetch_stock_history(ticker)
        except Exception:
            continue  # skip entire ticker if yfinance unavailable

        for ev in events:
            try:
                scenarios = calculate_price_scenarios_from_history(history, ev["days_until"])
            except Exception:
                continue

            gross = ev["shares"]
            net   = round(gross * (1 - _TAX_WITHHOLDING), 4)

            upcoming_vests.append(EquityVestSummary(
                date=ev["date"],
                ticker=ticker,
                gross_shares=gross,
                net_shares=net,
                current_value=round(net * scenarios.current_price, 2),
                projected_avg=round(net * scenarios.average, 2),
                projected_best=round(net * scenarios.best, 2),
                projected_worst=round(net * scenarios.worst, 2),
                annualized_volatility=scenarios.annualized_volatility,
                days_until_vest=ev["days_until"],
            ))

    upcoming_vests.sort(key=lambda v: v.date)

    total_unvested  = round(sum(v.current_value for v in upcoming_vests), 2)
    next_vest_date  = upcoming_vests[0].date if upcoming_vests else None
    cutoff_12m      = (today + timedelta(days=365)).isoformat()
    projected_12m   = round(
        sum(v.projected_avg for v in upcoming_vests if v.date <= cutoff_12m), 2
    )

    return EquitySection(
        total_unvested_value=total_unvested,
        next_vest_date=next_vest_date,
        projected_net_cash_12m=projected_12m,
        upcoming_vests=upcoming_vests,
    )


# ---------------------------------------------------------------------------
# Standalone verification
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    import sys

    # Ensure UTF-8 output on Windows terminals
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    db_path = _PROJECT_ROOT / "finance.db"
    print(f"\n[engine] Connecting to: {db_path.resolve()}")
    conn = init_db(db_path)

    print("\n--- Summary ---")
    summary = build_summary(conn)
    print(summary.model_dump_json(indent=2))

    print("\n--- Accounts (first 5) ---")
    accounts = build_accounts(conn)
    print(json.dumps([a.model_dump() for a in accounts[:5]], indent=2))
    print(f"  ... ({len(accounts)} total)")

    print("\n--- Period: last ---")
    period_last = build_period(conn, "last")
    print(period_last.model_dump_json(indent=2, by_alias=True))

    print("\n--- Debt Section ---")
    debt = build_debt_section(conn)
    print(debt.model_dump_json(indent=2))

    print("\n--- Recent Transactions (first 5) ---")
    txs = get_recent_transactions(conn)
    print(json.dumps([t.model_dump() for t in txs[:5]], indent=2))
    print(f"  ... ({len(txs)} total in 14-month window)")

    conn.close()
    print("\n[engine] Done.")
