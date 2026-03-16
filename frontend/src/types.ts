export interface Meta {
  generated_at: string;
  as_of_date: string;
}

export interface Summary {
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  asset_count: number;
  liability_count: number;
}

export interface Account {
  name: string;
  balance: number;
  date: string;
  type: 'asset' | 'liability';
}

export interface SankeyFlow {
  from: string;
  to: string;
  flow: number;
}

export interface CashFlowWaterfall {
  total_income:               number;  // 1
  necessary_spending:         number;  // 2
  true_discretionary_income:  number;  // 3
  optional_spending:          number;  // 4 — opt_subtotal + oth_subtotal merged
  opt_subtotal:               number;  // 5 — optional category alone (tooltip)
  oth_subtotal:               number;  // 6 — other category alone (tooltip)
  extra_debt_payments:        number;  // 7
  unspent_free_cash:          number;  // 8
}

export interface PeriodData {
  labels: string[];
  income: number[];
  spending: number[];
  necessity: number[];
  optional: number[];
  other: number[];
  debt: number[];
  chk_income: number[];
  chk_outflow: number[];
  nec_opt_donut: [number, number, number, number]; // [nec, opt, debt, other]
  cat_labels: string[];
  cat_values: number[];
  src_labels: string[];
  src_values: number[];
  kpi_income: number;
  kpi_spending: number;
  kpi_net: number;
  kpi_debt: number;
  kpi_disposable: number;
  sankey: SankeyFlow[];
  cash_flow_waterfall: CashFlowWaterfall;
}

export type PeriodKey = 'current' | 'last' | 'past2' | 'quarter' | 'year';

export interface DebtAccount {
  name: string;
  balance: number;
  rate: number;
}

export interface PayoffScenario {
  payoff_months: number;
  total_interest_paid: number;
  monthly_balances: number[];
}

export interface DebtProjection {
  snowball: PayoffScenario;
  avalanche: PayoffScenario;
  monthly_allocation: number;
}

export interface DebtSection {
  accounts: DebtAccount[];
  trend: { labels: string[]; values: number[] };
  projection: DebtProjection;
}

export interface Transaction {
  d: string;   // date YYYY-MM-DD
  m: string;   // merchant
  c: string;   // category
  a: string;   // account (last 25 chars)
  v: number;   // amount (neg=expense, pos=income)
  o: string;   // owner
  t: 'I' | 'N' | 'O' | 'D' | 'X' | 'T'; // type code: Income, Necessity, Optional, Debt, transfer, other
  k: 0 | 1;   // 1 = checking account
}

export interface DashboardPayload {
  meta: Meta;
  summary: Summary;
  accounts: Account[];
  periods: Record<PeriodKey, PeriodData>;
  debt: DebtSection;
  transactions: Transaction[];
  summaries: Record<PeriodKey, string>;
}

export type TabKey = 'overview' | 'cashflow' | 'spending' | 'debt' | 'transactions' | 'settings';
