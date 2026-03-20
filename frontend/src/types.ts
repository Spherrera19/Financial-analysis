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

// ── Equity (Phase 5) ─────────────────────────────────────────────────────

export interface EquityVestSummary {
  date:                  string;   // YYYY-MM-DD
  ticker:                string;
  gross_shares:          number;
  net_shares:            number;   // gross × 0.70 after 30% tax withholding
  current_value:         number;   // net_shares × current spot price
  projected_avg:         number;   // net_shares × GBM median at vest date
  projected_best:        number;   // net_shares × GBM +1σ at vest date
  projected_worst:       number;   // net_shares × GBM -1σ at vest date
  annualized_volatility: number;   // historical σ used in projection
  days_until_vest:       number;
}

export interface EquitySection {
  total_unvested_value:   number;
  next_vest_date:         string | null;
  projected_net_cash_12m: number;
  upcoming_vests:         EquityVestSummary[];
}

export type TabKey = 'overview' | 'cashflow' | 'spending' | 'debt' | 'transactions' | 'settings' | 'equity' | 'budget' | 'tax';

// ── Drill-down drawer (Phase 5.5) ────────────────────────────────────────────
// Placed here (not in a local component file) so App.tsx, tab components, and
// chart components can all import it from the same source without a second import path.

export interface DrawerFilter {
  category?: string;    // e.g. "Groceries" — exact match on transactions.category
  period?:   PeriodKey; // e.g. "current" — maps to date range via backend get_period_months()
  type?:     string;    // e.g. "O" — transaction type code (N, O, D, I, T, X)
  label?:    string;    // display-only: shown in the drawer header, never sent to the API
}

// ── Retirement / Tax Shield (Phase 6) ────────────────────────────────────────

export interface RetirementAccount {
  id:                    number;
  account_name:          string;
  account_type:          string;   // '401k' | 'HSA' | 'Roth IRA' | etc.
  owner:                 string;   // 'Steven' | 'Wife'
  annual_limit:          number;
  ytd_contributions:     number;
  employer_match_amount: number | null;
  employer_match_target: number | null;
}

export type RetirementCreate = Omit<RetirementAccount, 'id'>;

export interface RetirementUpdate {
  account_name?:          string;
  account_type?:          string;
  owner?:                 string;
  annual_limit?:          number;
  ytd_contributions?:     number;
  employer_match_amount?: number | null;
  employer_match_target?: number | null;
}
