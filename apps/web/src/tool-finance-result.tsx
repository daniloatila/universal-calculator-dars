import type { ReactNode } from 'react';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import type { Locale } from './i18n';
import { numberPresentation } from './locale-format';
import type { ComparisonDetail, Indicator, readComparison } from './tool-finance-comparison';

type Result = Record<string, unknown>;
type Label = (key: string) => string;
const decimal = /^[+-]?[0-9]+(?:\.[0-9]+)?$/u;
const labeledValues = new Set([
  'status', 'method', 'cost_kind', 'rounding_scope', 'unit', 'reason', 'rate_basis',
  'product', 'timing', 'period_kind', 'day_count', 'npv_sign', 'variance_convention',
  'deduction_method', 'tax_treatment', 'treatment', 'payment_status', 'classification',
  'data_mode', 'valuation', 'basis', 'convention', 'undefined', 'deduction', 'retention_status',
]);

function object(value: unknown): value is Result {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function readResult(proof: CalculationProof): Result {
  try {
    const parsed: unknown = JSON.parse(proof.result);
    return object(parsed) ? parsed : {};
  } catch { return {}; }
}

export function downloadJson(filename: string, contents: unknown, maximumBytes?: number) {
  const encoder = new TextEncoder();
  const readable = JSON.stringify(contents, null, 2);
  const text = maximumBytes && encoder.encode(readable).byteLength > maximumBytes ? JSON.stringify(contents) : readable;
  if (maximumBytes && encoder.encode(text).byteLength > maximumBytes) throw new TypeError('limit');
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  try {
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function scalar(value: unknown, label: Label, present: (value: string) => string, field?: string): ReactNode {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return label(String(value));
  if (typeof value === 'number' || typeof value === 'string') {
    const text = String(value);
    if (decimal.test(text)) return <bdi dir="ltr">{present(text)}</bdi>;
    return <bdi>{field && labeledValues.has(field) ? label(text) : text}</bdi>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    if (value.every(object)) {
      const columns = [...new Set(value.flatMap(Object.keys))];
      return <div className="finance-scroll" tabIndex={0} aria-label={label('table')}>
        <table><thead><tr>{columns.map((key) => <th scope="col" key={key}>{label(key)}</th>)}</tr></thead>
          <tbody>{value.map((row, index) => <tr key={index}>{columns.map((key) => <td key={key}>
            {scalar(row[key], label, present, key)}
          </td>)}</tr>)}</tbody>
        </table>
      </div>;
    }
    return <ul>{value.map((entry, index) => <li key={index}>{scalar(entry, label, present, field)}</li>)}</ul>;
  }
  if (object(value)) return <dl className="finance-readings">
    {Object.entries(value).map(([key, entry]) => <div key={key}><dt>{label(key)}</dt><dd>{scalar(entry, label, present, key)}</dd></div>)}
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

/** Shift a fractional rate for presentation only, without rounding or using Number for its value. */
function rateAsPercent(value: string) {
  const match = value.match(/^([+-]?)([0-9]+)(?:\.([0-9]+))?$/u);
  if (!match) return value;
  const fraction = match[3] ?? '';
  const whole = (match[2]! + fraction.slice(0, 2).padEnd(2, '0')).replace(/^0+(?=\d)/u, '');
  const rest = fraction.slice(2).replace(/0+$/u, '');
  return (match[1] === '-' ? '-' : '') + whole + (rest ? `.${rest}` : '');
}

function comparableStatus(status: ComparisonDetail['status']) {
  return status === 'direct' || status === 'normalized';
}

function compactDecimal(value: string) {
  return value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value;
}

function OriginalIndicator({ title, indicator, label, display, present }: {
  title: string; indicator: Indicator | null; label: Label;
  display: (value: string) => string; present: (value: string) => string;
}) {
  return <section>
    <h4>{title}</h4>
    {indicator ? <>
      <dl className="finance-readings">
        <div><dt>{label('operation')}</dt><dd>{label(indicator.operation)}</dd></div>
        {typeof indicator.context.currency === 'string' && <div>
          <dt>{label('currency')}</dt><dd><bdi>{indicator.context.currency}</bdi></dd>
        </div>}
        <div><dt>{label('comparison_original_value')}</dt>
          <dd data-original-value><bdi>{indicator.presentation === null ? '—' : display(indicator.presentation)}</bdi></dd></div>
        <div><dt>{label('comparison_canonical_value')}</dt>
          <dd><bdi>{indicator.value_omitted ? label('comparison_value_omitted')
            : indicator.value === null ? '—' : present(indicator.value)}</bdi></dd></div>
        <div><dt>{label('comparison_precision')}</dt><dd>{label('comparison_' + indicator.exactness)}
          {indicator.decimal_places !== null && ` · ${label('comparison_decimal_places')} ${present(String(indicator.decimal_places))}`}
        </dd></div>
        {indicator.solver_tolerance && <div><dt>{label('solver_tolerance')}</dt>
          <dd data-solver-tolerance>{scalar(indicator.solver_tolerance, label, present)}</dd></div>}
        <div><dt>{label('comparison_source')}</dt><dd>{label('comparison_source_' + indicator.source)}</dd></div>
      </dl>
      <details className="finance-detail"><summary>{label('comparison_original_basis')}</summary>
        {comparisonContext(indicator.context, label, present)}
      </details>
    </> : <p>{label('comparison_reason_metric_missing')}</p>}
  </section>;
}

function comparisonContext(context: Record<string, unknown>, label: Label, present: (value: string) => string) {
  return <dl className="finance-readings">
    {Object.entries(context).filter(([, value]) => value !== null).map(([key, value]) => <div key={key}>
      <dt>{label(key === 'periodicity' && typeof value === 'number' ? 'periods_per_year' : key)}</dt>
      <dd>{typeof value === 'string' && /^[a-z][a-z0-9_]*$/u.test(value)
        ? label(value) : scalar(value, label, present, key)}</dd>
    </div>)}
  </dl>;
}

function ComparisonDetails({ comparison, proof, label, locale, exportProof }: {
  comparison: ComparisonDetail; proof?: CalculationProof; label: Label; locale: Locale; exportProof(): void;
}) {
  const { status, reason, reference, alternative, normalization, common_basis: basis } = comparison;
  const format = LOCALES[locale].format;
  const present = numberPresentation(format).format;
  const showDifferences = comparableStatus(status) && comparison.precision_warning !== 'within_solver_resolution';
  const uncertainZero = comparison.exact_difference_omitted ||
    (comparison.exact_difference !== null && comparison.exact_difference !== '0') ||
    comparison.precision_source === 'canonical_approximate' || comparison.precision_source === 'presentation_rounded';
  function presentDelta(value: string, displayValue: (value: string) => string) {
    const compact = compactDecimal(value);
    return (uncertainZero && compact === '0' ? '≈' : '') + displayValue(compact);
  }
  const presentDifference = (value: string) => presentDelta(value, present);
  const percentTemplate = new Intl.NumberFormat(format, { style: 'percent' }).formatToParts(0);
  const percent = (value: string) => percentTemplate
    .map((part) => part.type === 'integer' ? present(value) : part.value).join('');
  const display = comparison.unit === 'rate' ? (value: string) => percent(rateAsPercent(value)) : present;
  return <div className="finance-delta" aria-live="polite" data-comparison-status={status}>
    <h3>{label(comparison.key)} · {label('comparison_status_' + status)}</h3>
    <p>{label('comparison_reason_' + reason)}</p>
    {comparison.differences.length > 0 && <p>
      {label('comparison_different_fields').replace('{fields}', comparison.differences.map((field) => label(field)).join(' · '))}
    </p>}
    <div className="finance-layout">
      <OriginalIndicator title={label('reference')} indicator={reference} label={label} present={present} display={display} />
      <OriginalIndicator title={label('alternative')} indicator={alternative} label={label} present={present} display={display} />
    </div>
    {basis && <section>
      <h4>{label('comparison_common_basis')}</h4>
      {comparisonContext(basis, label, present)}
      {normalization && <dl className="finance-readings">
        <div><dt>{label('comparison_formula')}</dt><dd><bdi dir="ltr">{normalization.formula}</bdi></dd></div>
        <div><dt>{label('reference')}</dt><dd data-normalized-value="reference">
          <bdi>{display(normalization.reference.presentation)}</bdi>
        </dd></div>
        <div><dt>{label('alternative')}</dt><dd data-normalized-value="alternative">
          <bdi>{display(normalization.alternative.presentation)}</bdi>
        </dd></div>
      </dl>}
    </section>}
    {comparison.precision_warning && <p data-comparison-precision-warning={comparison.precision_warning}>
      {label('comparison_warning_' + comparison.precision_warning)}
    </p>}
    {showDifferences && <>
      <dl className="finance-readings" data-testid="finance-comparison-differences">
        <div><dt>{label('absolute_difference')}</dt><dd data-comparison-field="absolute_difference">
          {scalar(comparison.absolute_difference, label, presentDifference)}
        </dd></div>
        {comparison.percentage_points !== null && <div><dt>{label('percentage_points')}</dt>
          <dd data-comparison-field="percentage_points">{scalar(comparison.percentage_points, label, presentDifference)}</dd>
        </div>}
        <div><dt>{label('relative_difference')}</dt><dd data-comparison-field="relative_percent">
          {comparison.relative_percent === null ? '—' : <bdi>{presentDelta(comparison.relative_percent, percent)}</bdi>}
        </dd></div>
      </dl>
      {comparison.relative_reason === 'zero_reference' && <p>{label('comparison_relative_zero')}</p>}
      {comparison.relative_reason === 'reference_solver_resolution' && <p>{label('comparison_relative_reference_resolution')}</p>}
      <p>{label('comparison_relative_basis')}</p>
    </>}
    {comparison.precision_source && <p>
      <strong>{label('comparison_precision_source')}</strong>{' · '}{label('comparison_source_' + comparison.precision_source)}
    </p>}
    {proof && <details className="finance-detail" data-testid="finance-comparison-proof">
      <summary>{label('comparison_proof')}</summary>
      <div className="finance-actions"><button type="button" onClick={exportProof}>{label('comparison_export_proof')}</button></div>
      <dl className="finance-readings">
        <div><dt>{label('comparison_algorithm')}</dt><dd><bdi>{proof.algorithm_version}</bdi></dd></div>
        <div><dt>{label('comparison_method')}</dt><dd>{label('comparison_semantic_matching')}</dd></div>
        {reference && <div><dt>{label('reference')} · {label('comparison_semantic_identity')}</dt>
          <dd><bdi>{reference.semantic_id}</bdi></dd></div>}
        {alternative && <div><dt>{label('alternative')} · {label('comparison_semantic_identity')}</dt>
          <dd><bdi>{alternative.semantic_id}</bdi></dd></div>}
        {normalization && <div><dt>{label('reference')} · {label('comparison_formula')}</dt>
          <dd><bdi dir="ltr">{normalization.reference.formula}</bdi></dd></div>}
        {normalization && <div><dt>{label('alternative')} · {label('comparison_formula')}</dt>
          <dd><bdi dir="ltr">{normalization.alternative.formula}</bdi></dd></div>}
        {(comparison.exact_difference !== null || comparison.exact_difference_omitted) && <div>
          <dt>{label('comparison_exact_difference')}</dt>
          <dd><bdi>{comparison.exact_difference === null ? label('comparison_value_omitted')
            : present(comparison.exact_difference)}</bdi></dd>
        </div>}
        {comparison.formula && <div><dt>{label('comparison_formula')}</dt><dd><bdi dir="ltr">{comparison.formula}</bdi></dd></div>}
      </dl>
      {comparison.precision_used && <>
        <h4>{label('comparison_precision_source')}</h4>
        {comparisonContext(comparison.precision_used, label, present)}
      </>}
      <h4>{label('comparison_limitations')}</h4>
      <p>{label(comparableStatus(status) ? 'comparison_limit_comparable' : 'comparison_limit_contextual')}</p>
    </details>}
  </div>;
}

export function ScenarioResults({ result, firstInputs, secondInputs, label, locale, compare, proof, exportProof, pending }: {
  result: ReturnType<typeof readComparison>; firstInputs: string; secondInputs: string; label: Label; locale: Locale;
  compare: (key: string) => void; proof?: CalculationProof; exportProof(): void; pending: boolean;
}) {
  const present = numberPresentation(LOCALES[locale].format).format;
  return <>
    {result.items.length > 0 ? <div className="finance-scroll" tabIndex={0} aria-label={label('scenario_comparator')}>
      <table><thead><tr><th scope="col">{label('metric')}</th><th scope="col">{label('comparison_status')}</th>
        <th scope="col">{label('comparison_details')}</th></tr></thead>
        <tbody>{result.items.map(({ id, key, status }) => <tr key={id} data-comparison-status={status}>
          <th scope="row">{label(key)}</th><td>{label('comparison_status_' + status)}</td>
          <td><button type="button" disabled={pending} data-metric={id} aria-pressed={id === result.selected?.id}
            onClick={() => compare(id)}>
            {label(comparableStatus(status) ? 'difference' : 'comparison_details')}
          </button></td>
        </tr>)}</tbody>
      </table>
    </div> : <p>{label('no_metrics')}</p>}
    {result.selected && <ComparisonDetails comparison={result.selected} proof={proof} label={label} locale={locale} exportProof={exportProof} />}
    <details className="finance-detail"><summary>{label('assumptions')}</summary>
      <div className="finance-layout">
        <div><h3>{label('reference')}</h3>{scalar(JSON.parse(firstInputs), label, present)}</div>
        <div><h3>{label('alternative')}</h3>{scalar(JSON.parse(secondInputs), label, present)}</div>
      </div>
    </details>
  </>;
}
