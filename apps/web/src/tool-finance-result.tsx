import type { ReactNode } from 'react';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import type { Locale } from './i18n';
import { numberPresentation } from './locale-format';

type Result = Record<string, unknown>;
type Label = (key: string) => string;
const decimal = /^[+-]?[0-9]+(?:\.[0-9]+)?$/u;

function object(value: unknown): value is Result {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function readResult(proof: CalculationProof): Result {
  try {
    const parsed: unknown = JSON.parse(proof.result);
    return object(parsed) ? parsed : {};
  } catch { return {}; }
}

export function downloadJson(filename: string, contents: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  try {
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function scalar(value: unknown, label: Label, present: (value: string) => string): ReactNode {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return label(String(value));
  if (typeof value === 'number' || typeof value === 'string') {
    const text = String(value);
    return <bdi dir={decimal.test(text) ? 'ltr' : undefined}>{decimal.test(text) ? present(text) : text}</bdi>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    if (value.every(object)) {
      const columns = [...new Set(value.flatMap(Object.keys))];
      return <div className="finance-scroll" tabIndex={0} aria-label={label('table')}>
        <table><thead><tr>{columns.map((key) => <th scope="col" key={key}>{label(key)}</th>)}</tr></thead>
          <tbody>{value.map((row, index) => <tr key={index}>{columns.map((key) => <td key={key}>
            {scalar(row[key], label, present)}
          </td>)}</tr>)}</tbody>
        </table>
      </div>;
    }
    return <ul>{value.map((entry, index) => <li key={index}>{scalar(entry, label, present)}</li>)}</ul>;
  }
  if (object(value)) return <dl className="finance-readings">
    {Object.entries(value).map(([key, entry]) => <div key={key}><dt>{label(key)}</dt><dd>{scalar(entry, label, present)}</dd></div>)}
  </dl>;
  return '—';
}

export function FinanceResult({ result, label, locale }: { result: Result; label: Label; locale: Locale }) {
  const present = numberPresentation(LOCALES[locale].format).format;
  const summary: Result = object(result.summary) ? result.summary : {};
  const main = { ...summary };
  const complex: [string, unknown][] = [];
  for (const [key, value] of Object.entries(result)) {
    if (key === 'summary') continue;
    if (Array.isArray(value) || object(value)) complex.push([key, value]);
    else main[key] = value;
  }
  return <>
    {scalar(main, label, present)}
    <LedgerPreview rows={result.rows} label={label} present={present} />
    {complex.map(([key, detail]) => <details className="finance-detail" key={key} open={key === 'roots' || key === 'rows'}>
      <summary>{label(key)}</summary>
      {scalar(detail, label, present)}
    </details>)}
  </>;
}

function LedgerPreview({ rows, label, present }: { rows: unknown; label: Label; present: (value: string) => string }) {
  if (!Array.isArray(rows) || rows.length < 2 || !rows.every(object)) return null;
  const balanceKey = ['balance_end', 'balance', 'cash_close'].find((key) => typeof rows[0]?.[key] === 'string');
  if (!balanceKey) return null;
  const count = Math.min(rows.length, 6);
  const points = Array.from({ length: count }, (_, index) => rows[Math.round(index * (rows.length - 1) / (count - 1))]!);
  const entries = points.flatMap((row) => {
    const value = row[balanceKey];
    return typeof value === 'string' && decimal.test(value) && Number.isFinite(Number(value))
      ? [{ period: String(row.period), value, number: Number(value) }] : [];
  });
  if (entries.length < 2) return null;
  const low = Math.min(0, ...entries.map((entry) => entry.number));
  const high = Math.max(0, ...entries.map((entry) => entry.number));
  if (low === high) return null;
  return <details className="finance-detail">
    <summary>{label(balanceKey)} · {label('chart')}</summary>
    <div className="finance-chart">{entries.map(({ period, value, number }) => <div key={period}>
      <span>{label('period')} {present(period)}</span>
      <meter aria-label={`${label(balanceKey)} · ${label('period')} ${present(period)}`} min={low} max={high} value={number} />
      <bdi>{present(value)}</bdi>
    </div>)}</div>
  </details>;
}

type MetricUnit = 'money' | 'ratio' | 'count';
const units = {
  ratio: new Set(['rate', 'nominal_rate', 'effective_rate', 'mirr', 'profitability_index', 'effective_cost',
    'cumulative_inflation', 'simple_gross_return', 'simple_net_return', 'simple_real_net_return',
    'gross_margin', 'operating_margin', 'contribution_margin', 'ebitda_margin', 'net_margin', 'markup', 'margin',
    'roi', 'roe', 'roa', 'roic', 'current_ratio', 'quick_ratio', 'debt_ratio', 'income_tax_rate', 'icms_rate']),
  count: new Set(['periods', 'contract_periods', 'actual_periods', 'payback', 'accounting_units', 'cash_units',
    'operating_cycle', 'cash_cycle', 'inventory_days', 'receivable_days', 'payable_days']),
  money: new Set(['amount', 'interest', 'present', 'discount', 'payment', 'npv', 'principal', 'total_paid', 'total_cost',
    'amortization', 'fees', 'upfront_fee', 'extra', 'capitalized', 'balance_end', 'initial', 'contributions',
    'withdrawals', 'distributions', 'taxes', 'final_balance', 'gross_final_balance', 'real_final_balance',
    'gross_profit', 'net_profit', 'real_net_profit', 'price', 'contribution', 'revenue', 'expenses', 'cost',
    'ebit', 'ebitda', 'profit', 'cash_close', 'minimum_cash', 'net_present_value', 'cash_receipts', 'cash_payments',
    'gross', 'inss', 'irrf', 'irpf', 'net', 'net_pay', 'withheld', 'income_tax', 'net_redemption', 'net_gain',
    'delta', 'refund', 'tax_due', 'iof', 'icms', 'working_capital']),
} satisfies Record<MetricUnit, Set<string>>;

function extractMetrics(value: Result): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, metric] of Object.entries({ ...(object(value.summary) ? value.summary : {}), ...value })) {
    if (typeof metric === 'string' && decimal.test(metric) ||
      typeof metric === 'number' && Number.isSafeInteger(metric)) output[key] = String(metric);
  }
  return output;
}

export function scenarioMetrics(first: Result, second: Result) {
  const left = extractMetrics(first);
  const right = extractMetrics(second);
  return Object.keys(left).flatMap((key) => {
    if (key === 'payback' && first.unit !== second.unit) return [];
    const unit = (Object.keys(units) as MetricUnit[]).find((unit) => units[unit].has(key));
    return unit && Object.hasOwn(right, key) ? [{ key, reference: left[key]!, alternative: right[key]!, unit }] : [];
  });
}

export function ScenarioResults({ first, second, firstInputs, secondInputs, label, locale, compare, metric, delta, pending }: {
  first: Result; second: Result; firstInputs: string; secondInputs: string; label: Label; locale: Locale;
  compare: (key: string) => void;
  metric: string; delta?: Result; pending: boolean;
}) {
  const shared = scenarioMetrics(first, second);
  const present = numberPresentation(LOCALES[locale].format).format;
  if (!shared.length) return <p>{label('no_metrics')}</p>;
  const selected = shared.find(({ key }) => key === metric);
  const compared = selected ? [selected.reference, selected.alternative] : [];
  const magnitudes = compared.map((value) => Math.abs(Number(value)));
  const extent = Math.max(0, ...magnitudes);
  return <>
    <div className="finance-scroll" tabIndex={0} aria-label={label('scenario_comparator')}>
      <table><thead><tr><th scope="col">{label('metric')}</th><th scope="col">{label('reference')}</th>
        <th scope="col">{label('alternative')}</th><th scope="col">{label('absolute_difference')}</th></tr></thead>
        <tbody>{shared.map(({ key, reference, alternative }) => <tr key={key}>
          <th scope="row">{label(key)}</th><td><bdi>{present(reference)}</bdi></td>
          <td><bdi>{present(alternative)}</bdi></td><td><button type="button" disabled={pending}
            data-metric={key} aria-pressed={key === metric}
            onClick={() => compare(key)}>
            {label('difference')}
          </button></td></tr>)}</tbody>
      </table>
    </div>
    {delta && metric && <div className="finance-delta" aria-live="polite">
      <h3>{label(metric)}</h3>
      <dl className="finance-readings">
        <div><dt>{label('absolute_difference')}</dt><dd>{scalar(delta.absolute_difference, label, present)}</dd></div>
        <div><dt>{label('relative_difference')}</dt><dd>
          {typeof delta.relative_percent === 'string' ? <bdi>{present(delta.relative_percent)}%</bdi> : '—'}
        </dd></div>
      </dl>
      {Number.isFinite(extent) && extent > 0 && <div className="finance-chart" aria-hidden="true">
        {magnitudes.map((value, index) => <div key={index}>
          <span>{label(index === 0 ? 'reference' : 'alternative')}</span>
          <meter min={0} max={extent} value={value} />
          <bdi>{present(compared[index]!)}</bdi>
        </div>)}
      </div>}
    </div>}
    <details className="finance-detail"><summary>{label('assumptions')}</summary>
      <div className="finance-layout">
        <div><h3>{label('reference')}</h3>{scalar(JSON.parse(firstInputs), label, present)}</div>
        <div><h3>{label('alternative')}</h3>{scalar(JSON.parse(secondInputs), label, present)}</div>
      </div>
    </details>
  </>;
}
