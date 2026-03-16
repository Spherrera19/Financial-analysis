/**
 * Round-trip validation — Phase 2, Milestone 4
 *
 * Imports data.json and asserts it structurally matches the DashboardPayload
 * TypeScript interface.  Run via:  npm run validate
 *
 * Two layers of protection:
 *   1. Compile-time  — tsc -p tsconfig.scripts.json --noEmit catches type mismatches
 *      in the script itself (e.g. wrong field access).
 *   2. Runtime       — explicit assertions below catch contract violations that
 *      TypeScript's JSON-inference cannot express (tuple length, literal unions).
 */

import type { DashboardPayload, PeriodData } from '../src/types';
import rawData from '../public/data.json';

// TS sees rawData as the literal JSON type; we cast to DashboardPayload so
// every field access in this file is type-checked against the interface.
const data = rawData as unknown as DashboardPayload;

// ── Constants ──────────────────────────────────────────────────────────────

const PERIOD_KEYS = ['current', 'last', 'past2', 'quarter', 'year'] as const;

const PERIOD_FIELDS: (keyof PeriodData)[] = [
  'labels', 'income', 'spending', 'necessity', 'optional', 'other', 'debt',
  'chk_income', 'chk_outflow', 'nec_opt_donut',
  'cat_labels', 'cat_values', 'src_labels', 'src_values',
  'kpi_income', 'kpi_spending', 'kpi_net', 'kpi_debt', 'kpi_disposable', 'sankey',
  'cash_flow_waterfall',
];

// ── Assertion helper ───────────────────────────────────────────────────────

const failures: string[] = [];

function check(cond: boolean, msg: string): void {
  if (!cond) failures.push(msg);
}

// ── meta ──────────────────────────────────────────────────────────────────

check(typeof data.meta?.generated_at === 'string', 'meta.generated_at must be string');
check(typeof data.meta?.as_of_date   === 'string', 'meta.as_of_date must be string');

// ── summary ───────────────────────────────────────────────────────────────

check(typeof data.summary?.net_worth        === 'number', 'summary.net_worth must be number');
check(typeof data.summary?.total_assets     === 'number', 'summary.total_assets must be number');
check(typeof data.summary?.total_liabilities === 'number', 'summary.total_liabilities must be number');
check(typeof data.summary?.asset_count      === 'number', 'summary.asset_count must be number');
check(typeof data.summary?.liability_count  === 'number', 'summary.liability_count must be number');

// ── accounts ──────────────────────────────────────────────────────────────

check(Array.isArray(data.accounts), 'accounts must be array');
if (data.accounts.length > 0) {
  const a = data.accounts[0];
  check(typeof a.name    === 'string', 'account[0].name must be string');
  check(typeof a.balance === 'number', 'account[0].balance must be number');
  check(typeof a.date    === 'string', 'account[0].date must be string');
  check(a.type === 'asset' || a.type === 'liability', 'account[0].type must be "asset"|"liability"');
}

// ── periods + summaries ───────────────────────────────────────────────────

for (const pk of PERIOD_KEYS) {
  const p = data.periods?.[pk];
  check(p !== undefined, `periods.${pk} must exist`);

  if (p) {
    for (const field of PERIOD_FIELDS) {
      check(field in p, `periods.${pk}.${field} must be present`);
    }
    check(
      Array.isArray(p.nec_opt_donut) && p.nec_opt_donut.length === 4,
      `periods.${pk}.nec_opt_donut must be a 4-element array`,
    );
    check(typeof p.kpi_income   === 'number', `periods.${pk}.kpi_income must be number`);
    check(typeof p.kpi_spending === 'number', `periods.${pk}.kpi_spending must be number`);
    check(typeof p.kpi_net      === 'number', `periods.${pk}.kpi_net must be number`);
    check(Array.isArray(p.sankey),            `periods.${pk}.sankey must be array`);
    if (p.sankey.length > 0) {
      const s = p.sankey[0];
      check(typeof s.from  === 'string', `periods.${pk}.sankey[0].from must be string`);
      check(typeof s.to    === 'string', `periods.${pk}.sankey[0].to must be string`);
      check(typeof s.flow  === 'number', `periods.${pk}.sankey[0].flow must be number`);
    }

    // cash_flow_waterfall field type checks
    const wf = p.cash_flow_waterfall;
    check(typeof wf?.total_income              === 'number', `periods.${pk}.cash_flow_waterfall.total_income must be number`);
    check(typeof wf?.necessary_spending        === 'number', `periods.${pk}.cash_flow_waterfall.necessary_spending must be number`);
    check(typeof wf?.true_discretionary_income === 'number', `periods.${pk}.cash_flow_waterfall.true_discretionary_income must be number`);
    check(typeof wf?.optional_spending         === 'number', `periods.${pk}.cash_flow_waterfall.optional_spending must be number`);
    check(typeof wf?.opt_subtotal              === 'number', `periods.${pk}.cash_flow_waterfall.opt_subtotal must be number`);
    check(typeof wf?.oth_subtotal              === 'number', `periods.${pk}.cash_flow_waterfall.oth_subtotal must be number`);
    check(typeof wf?.extra_debt_payments       === 'number', `periods.${pk}.cash_flow_waterfall.extra_debt_payments must be number`);
    check(typeof wf?.unspent_free_cash         === 'number', `periods.${pk}.cash_flow_waterfall.unspent_free_cash must be number`);
  }

  check(typeof data.summaries?.[pk] === 'string', `summaries.${pk} must be string`);
}

// ── debt ──────────────────────────────────────────────────────────────────

check(Array.isArray(data.debt?.accounts),      'debt.accounts must be array');
check(Array.isArray(data.debt?.trend?.labels), 'debt.trend.labels must be array');
check(Array.isArray(data.debt?.trend?.values), 'debt.trend.values must be array');
if (data.debt?.accounts.length > 0) {
  const da = data.debt.accounts[0];
  check(typeof da.name    === 'string', 'debt.accounts[0].name must be string');
  check(typeof da.balance === 'number', 'debt.accounts[0].balance must be number');
  check(typeof da.rate    === 'number', 'debt.accounts[0].rate must be number');
}

// ── transactions ──────────────────────────────────────────────────────────

check(Array.isArray(data.transactions), 'transactions must be array');
if (data.transactions.length > 0) {
  const tx = data.transactions[0];
  check(typeof tx.d === 'string', 'transaction[0].d must be string');
  check(typeof tx.m === 'string', 'transaction[0].m must be string');
  check(typeof tx.c === 'string', 'transaction[0].c must be string');
  check(typeof tx.a === 'string', 'transaction[0].a must be string');
  check(typeof tx.v === 'number', 'transaction[0].v must be number');
  check(typeof tx.o === 'string', 'transaction[0].o must be string');
  check(['I', 'N', 'O', 'D', 'X', 'T'].includes(tx.t), 'transaction[0].t must be I|N|O|D|X|T');
  check(tx.k === 0 || tx.k === 1, 'transaction[0].k must be 0 or 1');
}

// ── Report ────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  process.stderr.write('\n\u274C  data.json FAILED DashboardPayload validation:\n');
  for (const f of failures) process.stderr.write(`   - ${f}\n`);
  process.stderr.write('\n');
  process.exit(1);
}

const totalChecks = PERIOD_KEYS.length * (PERIOD_FIELDS.length + 16) + 25;
process.stdout.write(`\u2705  data.json \u2713 matches DashboardPayload  (${totalChecks}+ checks passed)\n`);
process.stdout.write(
  `    ${data.accounts.length} accounts | ` +
  `${data.transactions.length} transactions | ` +
  `${PERIOD_KEYS.length} periods | ` +
  `${data.debt.accounts.length} debt accounts\n`,
);
