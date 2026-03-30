"""Period data models (one per period key: current / last / past2 / quarter / year)."""
from __future__ import annotations

from pydantic import BaseModel

from .shared import SankeyFlow


class CashFlowWaterfall(BaseModel):
    total_income:               float
    necessary_spending:         float   # necessities + min(dbt_total, sum_minimums)
    true_discretionary_income:  float   # max(0, total_income - necessary_spending)
    optional_spending:          float   # opt_total + oth_total (merged for bar width)
    opt_subtotal:               float   # opt_total alone (for tooltip sub-breakdown)
    oth_subtotal:               float   # oth_total alone (for tooltip sub-breakdown)
    extra_debt_payments:        float   # max(0, dbt_total - sum_minimums)
    unspent_free_cash:          float   # max(0, true_discretionary - optional - extra_debt)


class PeriodData(BaseModel):
    labels: list[str]
    income: list[float]
    spending: list[float]
    necessity: list[float]
    optional: list[float]
    other: list[float]
    debt: list[float]
    chk_income: list[float]
    chk_outflow: list[float]
    # [necessity, optional, debt, other]
    nec_opt_donut: tuple[float, float, float, float]
    cat_labels: list[str]
    cat_values: list[float]
    src_labels: list[str]
    src_values: list[float]
    kpi_income: float
    kpi_spending: float
    kpi_net: float
    kpi_debt: float
    kpi_disposable: float
    sankey: list[SankeyFlow]
    macro_sankey: list[SankeyFlow]
    cash_flow_waterfall: CashFlowWaterfall
