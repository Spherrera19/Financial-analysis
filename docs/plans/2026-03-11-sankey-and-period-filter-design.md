# Sankey Diagram + Global Period Filter — Design

## Goal
Add a global time-period filter (5 options) that updates all charts simultaneously, plus a Sankey diagram showing income-source-to-spending-category flow.

## Architecture
Python pre-computes data for all 5 periods and embeds them as a single JSON object in `dashboard.html`. JavaScript reads the selected period and calls `chart.data = newData; chart.update()` on every Chart.js instance. The Sankey uses `chartjs-chart-sankey` (CDN), consistent with the existing Chart.js setup. Debt trend and account balances remain static.

## Period Definitions
- **Current Month** — YYYY-MM matching today
- **Last Month** — the calendar month before today
- **Past 2 Months** — last 2 complete calendar months
- **Last Quarter** — last 3 complete calendar months
- **Last Year** — last 12 complete calendar months

## UI
Button group below the page title, above KPI cards. Active period highlighted. Default: Last Month.

## Charts That Update
flowChart, chkChart, necOptBar, necOptDonut, srcChart, catChart, sankeyChart, KPI cards (cur_inflow, cur_outflow, cur_net).

## Charts That Stay Static
debtChart (historical timeline), account balance lists (point-in-time).

## Sankey Specification
- Full-width card, placed between the period filter and the KPI row
- Library: `chartjs-chart-sankey` via jsDelivr CDN
- Flow: income source nodes (left) → "Necessities", "Optional", "Other", and "Net / Savings" nodes (right)
- Net/Savings node only appears when total income > total spending for the period
- Colors: income nodes green, Necessities blue, Optional yellow, Other grey, Net/Savings teal
- Dark theme: background `#1e293b`, label color `#e2e8f0`
