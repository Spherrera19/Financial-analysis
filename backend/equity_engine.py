"""
backend/equity_engine.py — Phase 5: RSU & Equity Tracking

Statistical stock-price projection engine using Geometric Brownian Motion (GBM).

Public API
----------
fetch_stock_history(ticker)
    Download 2 years of daily adjusted close prices via yfinance.

calculate_price_scenarios(ticker, days_in_future)
    Return a StockScenarios with Best / Average / Worst price projections for a
    future date, derived from the GBM log-normal model calibrated to recent history.

Math notes
----------
Under GBM, the log-return over a horizon T (years) is normally distributed:

    log(S_T / S_0) ~ N( (μ - σ²/2)·T ,  σ²·T )

where μ and σ are the annualised drift and volatility estimated from daily returns.

This gives three scenario prices:

    average = S_0 · exp( (μ - σ²/2)·T )              ← median / most-likely path
    best    = S_0 · exp( (μ - σ²/2)·T + σ·√T )       ← +1 standard deviation
    worst   = S_0 · exp( (μ - σ²/2)·T − σ·√T )       ← −1 standard deviation

The median (not the mean) is used as the "average" scenario because it represents
the single most-likely outcome of the log-normal distribution and is unaffected by
the right-skew that inflates the arithmetic mean.
"""
from __future__ import annotations

import csv
import io
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

from backend.models import StockScenarios

# Trading days used to annualise daily statistics
_TRADING_DAYS_PER_YEAR = 252


def fetch_stock_history(ticker: str) -> pd.DataFrame:
    """
    Download the last 2 years of daily adjusted close prices for *ticker*.

    Returns a single-column DataFrame ('Close') with a DatetimeIndex.
    Raises ValueError if the ticker is unrecognised or the response is empty.
    """
    df = yf.download(
        ticker,
        period="2y",
        interval="1d",
        auto_adjust=True,
        progress=False,
    )
    if df.empty:
        raise ValueError(
            f"No price history returned for ticker '{ticker}'. "
            "Check that the symbol is valid and markets are reachable."
        )
    return df[["Close"]].dropna()


def calculate_price_scenarios_from_history(
    history: pd.DataFrame, days_in_future: int
) -> StockScenarios:
    """
    Same projection as calculate_price_scenarios but accepts pre-fetched history.

    Use this when projecting multiple vest dates for the same ticker — call
    fetch_stock_history() once and pass the result here for each horizon to
    avoid redundant yfinance downloads.

    Parameters
    ----------
    history : pd.DataFrame
        Output of fetch_stock_history() — must have a 'Close' column.
    days_in_future : int
        Number of calendar days until the target date.
    """
    if days_in_future <= 0:
        raise ValueError(f"days_in_future must be positive, got {days_in_future}")

    close: pd.Series = history["Close"].squeeze()
    current_price = float(close.iloc[-1])
    log_returns: pd.Series = np.log(close / close.shift(1)).dropna()

    mu_daily    = float(log_returns.mean())
    sigma_daily = float(log_returns.std(ddof=1))

    mu_annual    = mu_daily    * _TRADING_DAYS_PER_YEAR
    sigma_annual = sigma_daily * math.sqrt(_TRADING_DAYS_PER_YEAR)

    T = days_in_future / 365.0
    drift_term     = (mu_annual - 0.5 * sigma_annual ** 2) * T
    diffusion_term = sigma_annual * math.sqrt(T)

    return StockScenarios(
        current_price=round(current_price, 2),
        average=round(current_price * math.exp(drift_term), 2),
        best=round(current_price * math.exp(drift_term + diffusion_term), 2),
        worst=round(current_price * math.exp(drift_term - diffusion_term), 2),
        annualized_volatility=round(sigma_annual, 4),
    )


def calculate_price_scenarios(ticker: str, days_in_future: int) -> StockScenarios:
    """
    Project a stock's price *days_in_future* calendar days from today and return
    Best / Average / Worst scenarios calibrated to its historical volatility.

    Parameters
    ----------
    ticker : str
        Yahoo Finance ticker symbol, e.g. ``"AAPL"`` or ``"GOOG"``.
    days_in_future : int
        Number of calendar days until the vest date.  Converted to a fractional
        year internally (divides by 365 for calendar days → years).

    Returns
    -------
    StockScenarios
        current_price, average, best, worst (all rounded to 2 dp), and the
        annualized_volatility used in the projection.

    Raises
    ------
    ValueError
        If *ticker* is invalid or *days_in_future* is not positive.
    """
    if days_in_future <= 0:
        raise ValueError(f"days_in_future must be positive, got {days_in_future}")

    df = fetch_stock_history(ticker)
    return calculate_price_scenarios_from_history(df, days_in_future)


# ---------------------------------------------------------------------------
# Brokerage CSV parser
# ---------------------------------------------------------------------------

# Column aliases — matched case-insensitively after stripping whitespace.
_TICKER_ALIASES  = {"ticker", "symbol", "stock", "stock symbol"}
_DATE_ALIASES    = {"vest date", "vesting date", "date", "vest_date", "vesting_date",
                    "release date", "release_date"}
_SHARES_ALIASES  = {"quantity", "shares", "qty", "number of shares",
                    "shares vesting", "shares released", "units"}
_GRANTDT_ALIASES = {"grant date", "grant_date", "award date", "award_date",
                    "grant effective date"}


def _find_col(headers: list[str], aliases: set[str]) -> str | None:
    """Return the first header whose lowercased, stripped form is in *aliases*."""
    for h in headers:
        if h.strip().lower() in aliases:
            return h
    return None


def _parse_date(raw: str) -> str:
    """Parse a date string in several common formats and return YYYY-MM-DD."""
    val = raw.strip()
    for fmt in (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%d-%b-%Y",
        "%d/%m/%Y",
    ):
        try:
            return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise ValueError(f"Cannot parse date: {val!r}")


def parse_brokerage_csv(file_path: str | Path) -> list[dict]:
    """
    Parse a brokerage RSU/equity export CSV into a list of equity grant dicts.

    Required CSV columns (case-insensitive, flexible aliases supported):
      - Ticker  — Ticker | Symbol | Stock
      - Vest Date — Vest Date | Vesting Date | Date | Release Date
      - Shares — Quantity | Shares | Qty | Units | Number of Shares

    Optional:
      - Grant Date — Grant Date | Award Date  (used to split one ticker into
                     multiple grants; if absent, all tranches per ticker are
                     grouped under one grant whose grant_date is the earliest
                     vest date in the schedule)

    Each returned dict has keys:
        ticker, grant_date, total_shares, vesting_schedule, source

    where ``source = 'brokerage_csv'`` and ``vesting_schedule`` is a list of
    ``{"date": "YYYY-MM-DD", "shares": float}`` dicts sorted by date.

    Raises
    ------
    ValueError
        If the CSV is missing a required column or contains no parseable rows.
    """
    path = Path(file_path)
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        headers: list[str] = list(reader.fieldnames or [])

        ticker_col  = _find_col(headers, _TICKER_ALIASES)
        date_col    = _find_col(headers, _DATE_ALIASES)
        shares_col  = _find_col(headers, _SHARES_ALIASES)
        grantdt_col = _find_col(headers, _GRANTDT_ALIASES)

        if not ticker_col:
            raise ValueError(
                "CSV is missing a Ticker / Symbol column. "
                f"Found headers: {headers}"
            )
        if not date_col:
            raise ValueError(
                "CSV is missing a Vest Date / Vesting Date column. "
                f"Found headers: {headers}"
            )
        if not shares_col:
            raise ValueError(
                "CSV is missing a Quantity / Shares column. "
                f"Found headers: {headers}"
            )

        # Collect raw tranche rows
        # key = (ticker_upper, grant_date_str_or_None)
        groups: dict[tuple[str, str | None], list[dict]] = defaultdict(list)

        for row in reader:
            ticker = row[ticker_col].strip().upper()
            if not ticker:
                continue

            shares_raw = row[shares_col].strip().replace(",", "")
            try:
                shares = float(shares_raw)
            except ValueError:
                continue  # skip header repeats or non-numeric rows

            vest_date = _parse_date(row[date_col])

            grant_date: str | None = None
            if grantdt_col:
                raw_gd = row.get(grantdt_col, "").strip()
                if raw_gd:
                    grant_date = _parse_date(raw_gd)

            groups[(ticker, grant_date)].append({"date": vest_date, "shares": shares})

    if not groups:
        raise ValueError("No parseable rows found in the CSV.")

    # Build grant dicts
    grants: list[dict] = []
    for (ticker, grant_date), tranches in groups.items():
        tranches_sorted = sorted(tranches, key=lambda t: t["date"])
        # If no Grant Date column, fall back to earliest vest date
        effective_grant_date = grant_date or tranches_sorted[0]["date"]
        grants.append({
            "ticker":            ticker,
            "grant_date":        effective_grant_date,
            "total_shares":      sum(t["shares"] for t in tranches_sorted),
            "vesting_schedule":  tranches_sorted,
            "source":            "brokerage_csv",
        })

    return grants
