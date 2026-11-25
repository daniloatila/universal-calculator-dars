import { isLocale } from './i18n';
import type { Locale } from './i18n';
import type { FinanceModule } from './finance-modules';
import { localizedDecimal, normalizeSignedDigits } from './locale-format';

export type Cell = { text: string; locale: Locale };
export type Draft = Record<string, Cell | Cell[][]>;
export type Field = {
  key: string;
  kind: 'decimal' | 'integer' | 'date' | 'choice' | 'text' | 'rows';
  example: string;
  choices?: readonly string[];
  columns?: readonly Field[];
  optional?: boolean;
};
export type Operation = { id: string; fields: readonly Field[] };

const dec = (key: string, example = '0', optional = false): Field => ({ key, kind: 'decimal', example, optional });
const int = (key: string, example = '1', optional = false): Field => ({ key, kind: 'integer', example, optional });
const iso = (key: string, example = '2026-11-25', optional = false): Field => ({ key, kind: 'date', example, optional });
const choice = (key: string, choices: readonly string[], optional = false): Field =>
  ({ key, kind: 'choice', choices, optional, example: choices[0] ?? '' });
const plain = (key: string, example = '', optional = false): Field => ({ key, kind: 'text', example, optional });
const rows = (key: string, columns: readonly Field[], optional = true): Field =>
  ({ key, kind: 'rows', columns, optional, example: '' });
const op = (id: string, ...fields: Field[]): Operation => ({ id, fields });
const rate = dec('rate', '0.02');
const periods = int('periods', '3');
const amount = dec('amount', '1000');
const principal = dec('principal', '1000');
const income = [iso('date'), dec('gross', '6000')];
const timing = choice('timing', ['end', 'begin']);
const datedFlows = [
  rows('flows', [dec('amount'), iso('date', '', true)], false),
  choice('day_count', ['act_365f', 'act_360', '30e_360'], true),
];
const loanFields = [
  principal, rate, periods, iso('start_date', '2026-01-31'), iso('first_date', '', true),
  int('grace_periods', '0', true), choice('grace', ['capitalize', 'interest_only'], true),
  rows('extra', [int('period', '2'), dec('amount', '100')]),
  rows('rates', [int('period', '2'), rate]), rows('fees', [int('period'), dec('amount', '25')]),
  dec('upfront_fee', '0', true), choice('extra_policy', ['reduce_term', 'reduce_payment'], true),
  choice('rounding_scope', ['final', 'per_row'], true), int('page', '1', true), int('page_size', '40', true),
];
const products = ['generic', 'cdb', 'rdb', 'lci', 'lca', 'treasury_fixed', 'treasury_selic', 'treasury_ipca', 'savings'];
const taxProduct = (ids: readonly string[]) => [
  choice('product', ids), iso('purchase_date', '2026-01-01'), iso('redemption_date'), principal, dec('redemption', '1100'),
];

export const operations: Record<FinanceModule, readonly Operation[]> = {
  financial: [
    op('simple_interest', principal, rate, periods),
    op('compound_interest', principal, rate, periods),
    op('nominal_effective', dec('rate', '0.12'), int('compounds', '12'),
      choice('direction', ['nominal_to_effective', 'effective_to_nominal'])),
    op('equivalent_rate', rate, int('from_periods_per_year', '12'), int('to_periods_per_year')),
    op('present_value', amount, rate, periods),
    op('future_value', amount, rate, periods),
    op('annuity_present_value', dec('payment', '100'), rate, periods, timing),
    op('annuity_future_value', dec('payment', '100'), rate, periods, timing),
    op('annuity_payment', principal, rate, periods, timing),
    op('periods', dec('present', '1000'), dec('future', '1100'), rate),
    op('rate', dec('present', '1000'), dec('future', '1100'), periods),
    op('discount', amount, rate, periods, choice('convention', ['commercial_simple', 'rational_simple', 'rational_compound'])),
    op('npv', ...datedFlows, rate), op('irr', ...datedFlows),
    op('mirr', ...datedFlows, dec('finance_rate', '0.08'), dec('reinvest_rate', '0.06')),
    op('payback', ...datedFlows), op('discounted_payback', ...datedFlows, rate),
    op('profitability_index', ...datedFlows, rate),
  ],
  investment: [
    op('project', choice('product', products), dec('initial', '1000'), periods, rate,
      dec('contribution', '100'), dec('withdrawal', '0', true), dec('inflation', '0', true),
      dec('fee_rate', '0', true), dec('fixed_fee', '0', true), dec('tax_rate', '0', true),
      choice('reinvest', ['true', 'false'], true), choice('timing', ['end', 'start'], true),
      choice('rate_basis', ['effective', 'fixed', 'daily_di', 'selic_spread', 'ipca_spread', 'savings_anniversary', 'savings_selic_tr'], true),
      dec('index_rate', '', true), plain('source', '', true), iso('reference_date', '', true),
      choice('period_kind', ['period', 'day', 'business_day', 'month', 'quarter', 'year'], true),
      iso('start_date', '', true), iso('end_date', '', true), rows('holidays', [iso('date')]),
      int('page_start', '1', true), int('page_size', '40', true),
      rows('overrides', [int('period', '2'), dec('rate', '0.03', true), dec('contribution', '100', true),
        dec('withdrawal', '0', true), dec('inflation', '0', true), dec('index_rate', '0', true),
        dec('fee_rate', '0', true), dec('fixed_fee', '0', true), dec('tax_rate', '0', true)])),
  ],
  loans: [
    op('price', ...loanFields), op('sac', ...loanFields),
    op('uniform', ...loanFields, dec('payment', '400')), op('bullet', ...loanFields),
    op('single_payment', ...loanFields),
    op('payoff', choice('method', ['price', 'sac', 'uniform', 'bullet', 'single_payment']), ...loanFields, int('payoff_at', '2'),
      dec('payment', '', true)),
    op('effective_cost', choice('method', ['price', 'sac', 'uniform', 'bullet', 'single_payment']), ...loanFields, dec('payment', '', true)),
  ],
  tax: [
    op('br_inss', ...income),
    op('br_irrf', ...income, dec('legal_deductions', '649.60', true), int('dependents', '0', true)),
    op('br_irpf', iso('date', '2026-12-31'), dec('gross', '72000'), dec('legal_deductions', '0', true),
      int('dependents', '0', true), dec('education_expenses', '0', true), dec('withheld_tax', '0', true)),
    op('br_payroll', ...income, int('dependents', '0', true), dec('other_deductible', '0', true)),
    op('br_investment_tax', ...taxProduct(['cdb', 'rdb', 'tesouro', 'lci', 'lca', 'savings'])),
    op('br_iof', ...taxProduct(['cdb', 'rdb', 'tesouro'])),
    op('br_icms', iso('date'), dec('gross', '1000')),
    op('br_ibs_cbs', iso('date'), dec('base', '1000'), choice('ancillary_obligations_met', ['false', 'true'])),
  ],
  business: [
    op('price', dec('unit_cost', '100'), dec('markup', '0.25', true), dec('margin', '', true),
      dec('selling_price', '', true), dec('sales_cost_rate', '0', true), choice('quote_to_minor', ['false', 'true'], true)),
    op('margins', dec('revenue', '200'), dec('cogs', '100'), dec('variable_cogs', '80'), dec('variable_expenses', '20'),
      dec('fixed_expenses', '10'), dec('depreciation', '5'), dec('net_finance_cost', '3'), dec('income_tax', '7')),
    op('break_even', dec('unit_price', '125'), dec('variable_unit_cost', '100'), dec('fixed_accounting', '300'),
      dec('non_cash_fixed', '50'), dec('fixed_cash_extra', '0', true)),
    op('ratios', ...Object.entries({
      net_profit: '20', initial_assets: '100', final_assets: '120', initial_equity: '50', final_equity: '60',
      nopat: '25', average_invested_capital: '90', current_assets: '48', current_liabilities: '20', inventory: '10',
      prepaid: '3', total_liabilities: '60', total_assets: '120', investment_cost: '100', investment_proceeds: '125',
    }).map(([key, example]) => dec(key, example, true))),
    op('ebitda', dec('net_income', '12'), dec('income_tax', '4'), dec('net_finance_cost', '3'), dec('depreciation', '2')),
    op('cycle', int('days', '365'), dec('average_inventory', '20'), dec('cogs', '100'), dec('average_receivables', '30'),
      dec('credit_sales', '150'), dec('average_payables', '20'), dec('credit_purchases', '110')),
    op('plan', periods, dec('revenue', '100'), dec('revenue_growth', '0.10', true),
      dec('cost', '40'), dec('cost_growth', '0', true), dec('expenses', '20'), dec('expense_growth', '0', true),
      dec('initial_cash', '25'), dec('cash_receipts', '90'), dec('cash_payments', '65'),
      dec('receipt_growth', '0', true), dec('payment_growth', '0', true),
      dec('discount_rate', '0.01', true), dec('initial_investment', '10', true),
      dec('sensitivity_step', '', true), int('page_start', '1', true), int('page_size', '24', true),
      rows('overrides', [int('period'), dec('revenue', '', true), dec('cost', '', true), dec('expenses', '', true),
        dec('cash_receipts', '', true), dec('cash_payments', '', true),
        dec('realized_revenue', '95', true), dec('realized_cost', '39', true), dec('realized_expenses', '22', true),
        dec('realized_cash_receipts', '', true), dec('realized_cash_payments', '', true)])),
  ],
};

function localizeExample(field: Field, locale: Locale): Cell {
  return { text: field.kind === 'decimal' ? field.example.replace('.', localizedDecimal(locale)) : field.example, locale };
}

export function exampleDraft(operation: Operation, locale: Locale): Draft {
  const draft: Draft = {};
  for (const field of operation.fields) {
    if (field.kind === 'rows') {
      if (field.key === 'flows') {
        const values = ['-100', '230', '-132'];
        draft[field.key] = values.map((text) => [{ text, locale }, { text: '', locale }]);
      }
    } else if (field.example && (!field.optional || field.key !== 'day_count')) {
      draft[field.key] = localizeExample(field, locale);
    }
  }
  return draft;
}

function canonical(cell: Cell, field: Field): string | number | boolean {
  let text = cell.text.trim();
  if (field.kind !== 'text') text = normalizeSignedDigits(text);
  switch (field.kind) {
    case 'decimal': {
      const separator = localizedDecimal(cell.locale);
      if (separator !== '.' && text.includes('.')) throw new TypeError('invalid_input');
      text = text.replaceAll(separator, '.');
      if (!/^[+-]?(?:[0-9]{1,18}(?:\.[0-9]{1,12})?|\.[0-9]{1,12})$/u.test(text)) throw new TypeError('invalid_input');
      return text;
    }
    case 'integer':
      if (!/^[0-9]{1,6}$/u.test(text)) throw new TypeError('invalid_input');
      return Number(text);
    case 'date':
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(text)) throw new TypeError('invalid_input');
      return text;
    case 'choice':
      if (!field.choices?.includes(text)) throw new TypeError('invalid_input');
      return text === 'true' ? true : text === 'false' ? false : text;
    default: return text;
  }
}

function isCell(value: unknown): value is Cell {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cell = value as Record<string, unknown>;
  return typeof cell.text === 'string' && typeof cell.locale === 'string' && isLocale(cell.locale);
}

/** Compare the original field notation to the verified canonical payload, ignoring object key order. */
export function replayDraft(operation: Operation, expression: string, normalized: string): Draft {
  const value: unknown = JSON.parse(expression);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid_input');
  const draft: Draft = {};
  for (const field of operation.fields) {
    const member = (value as Record<string, unknown>)[field.key];
    if (member === undefined) continue;
    if (field.kind === 'rows') {
      if (!Array.isArray(member) || member.length > 60 || !member.every((row) =>
        Array.isArray(row) && row.length === field.columns?.length && row.every(isCell))) {
        throw new TypeError('invalid_input');
      }
      draft[field.key] = member;
    } else {
      if (!isCell(member)) throw new TypeError('invalid_input');
      draft[field.key] = member;
    }
  }
  function sorted(entry: unknown): unknown {
    if (Array.isArray(entry)) return entry.map(sorted);
    if (entry && typeof entry === 'object') {
      const object = entry as Record<string, unknown>;
      return Object.fromEntries(Object.keys(object).sort().map((key) => [key, sorted(object[key])]));
    }
    return entry;
  }
  if (JSON.stringify(sorted(JSON.parse(canonicalDraft(operation, draft).input))) !== JSON.stringify(sorted(JSON.parse(normalized)))) {
    throw new TypeError('invalid_input');
  }
  return draft;
}

export function canonicalDraft(operation: Operation, draft: Draft) {
  const input: Record<string, unknown> = {};
  const original: Record<string, unknown> = {};
  for (const field of operation.fields) {
    const current = draft[field.key];
    if (field.kind === 'rows') {
      if (!Array.isArray(current) || current.length === 0) {
        if (!field.optional) throw new TypeError('invalid_input');
        continue;
      }
      const columns = field.columns ?? [];
      const entries = current.map((row) => Object.fromEntries(columns.flatMap((column, index) => {
        const cell = row[index];
        if (cell?.text.trim()) return [[column.key, canonical(cell, column)]];
        if (!column.optional) throw new TypeError('invalid_input');
        return [];
      })));
      if (field.key === 'flows') {
        input.flows = entries.map((entry) => entry.amount);
        const dates = entries.map((entry) => entry.date);
        if (dates.some(Boolean)) {
          if (dates.some((value) => !value)) throw new TypeError('invalid_input');
          input.dates = dates;
        }
      } else {
        input[field.key] = field.key === 'holidays' ? entries.map((entry) => entry.date) : entries;
      }
      original[field.key] = current;
      continue;
    }
    if (current && !Array.isArray(current) && current.text.trim()) {
      input[field.key] = canonical(current, field);
      original[field.key] = current;
    } else if (field.kind === 'choice' && !field.optional && field.choices?.[0]) {
      const initial: Cell = { text: field.choices[0], locale: 'en' };
      input[field.key] = canonical(initial, field);
      original[field.key] = initial;
    } else if (!field.optional) {
      throw new TypeError('invalid_input');
    }
  }
  return { input: JSON.stringify(input), original_input: JSON.stringify(original) };
}
