import type { CalculationProof } from './calculation-proof';

const statuses = ['direct', 'normalized', 'contextual', 'incompatible', 'undefined'] as const;
const units = ['money', 'rate', 'ratio', 'period', 'count'] as const;
const precisionWarnings = ['solver_resolution', 'within_solver_resolution'] as const;
const relativeReasons = ['zero_reference', 'reference_solver_resolution', 'within_solver_resolution'] as const;
const identifier = /^[a-z][a-z0-9_]{0,63}$/u;

export type ComparisonItem = {
  id: string;
  key: string;
  status: typeof statuses[number];
  reason: string;
  unit: typeof units[number];
};

export type Indicator = {
  operation: string;
  semantic_id: string;
  presentation: string | null;
  value: string | null;
  value_omitted: boolean;
  source: string;
  exactness: string;
  decimal_places: number | null;
  solver_tolerance?: string | null;
  context: Record<string, unknown>;
};

type NormalizedValue = {
  value: string | null;
  presentation: string;
  source: string;
  original_basis: Record<string, unknown>;
  formula: string;
};

export type ComparisonDetail = ComparisonItem & {
  reference: Indicator | null;
  alternative: Indicator | null;
  common_basis: Record<string, unknown> | null;
  formula: string | null;
  normalization: { formula: string; reference: NormalizedValue; alternative: NormalizedValue } | null;
  absolute_difference: string | null;
  exact_difference: string | null;
  exact_difference_omitted?: boolean;
  percentage_points: string | null;
  relative_difference: string | null;
  relative_percent: string | null;
  relative_reason?: typeof relativeReasons[number] | null;
  precision_source: string | null;
  precision_warning?: typeof precisionWarnings[number] | null;
  precision_used?: Record<string, unknown> | null;
  differences: string[];
};

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && identifier.test(value);
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function item(value: unknown): value is ComparisonItem {
  return object(value) && isIdentifier(value.id) && isIdentifier(value.key) && isIdentifier(value.reason) &&
    statuses.some((status) => status === value.status) && units.some((unit) => unit === value.unit);
}

function indicator(value: unknown): value is Indicator | null {
  return value === null || object(value) && isIdentifier(value.operation) &&
    isIdentifier(value.semantic_id) && isNullableText(value.presentation) && isNullableText(value.value) &&
    typeof value.value_omitted === 'boolean' && isIdentifier(value.source) &&
    isIdentifier(value.exactness) && (value.decimal_places === null || Number.isSafeInteger(value.decimal_places)) &&
    (value.solver_tolerance === undefined || isNullableText(value.solver_tolerance)) &&
    object(value.context);
}

function normalizedValue(value: unknown): value is NormalizedValue {
  return object(value) && isNullableText(value.value) && typeof value.presentation === 'string' &&
    isIdentifier(value.source) && object(value.original_basis) && typeof value.formula === 'string';
}

function comparisonDetail(value: unknown): value is ComparisonDetail {
  if (!object(value) || !item(value)) return false;
  const record = value as Record<string, unknown>;
  const normalization = record.normalization;
  return indicator(record.reference) && indicator(record.alternative) &&
    (record.common_basis === null || object(record.common_basis)) && isNullableText(record.formula) &&
    (normalization === null || object(normalization) && typeof normalization.formula === 'string' &&
      normalizedValue(normalization.reference) && normalizedValue(normalization.alternative)) &&
    ['absolute_difference', 'exact_difference', 'percentage_points', 'relative_difference', 'relative_percent', 'precision_source']
      .every((key) => isNullableText(record[key])) &&
    (record.relative_reason == null || relativeReasons.some((reason) => reason === record.relative_reason)) &&
    (record.precision_warning == null || precisionWarnings.some((warning) => warning === record.precision_warning)) &&
    (record.precision_used === undefined || record.precision_used === null || object(record.precision_used)) &&
    Array.isArray(record.differences) && record.differences.every(isIdentifier);
}

export function readComparison(proof: CalculationProof, metric?: string) {
  let value: unknown;
  try { value = JSON.parse(proof.result); }
  catch { throw new TypeError('engine_unavailable'); }
  if (!object(value) || value.schema !== 1 || !Array.isArray(value.items) || !value.items.every(item)) {
    throw new TypeError('engine_unavailable');
  }
  const ids = new Set(value.items.map(({ id }) => id));
  if (ids.size !== value.items.length || (metric === undefined
    ? value.selected !== null
    : !comparisonDetail(value.selected) || value.selected.id !== metric || !ids.has(metric))) {
    throw new TypeError('engine_unavailable');
  }
  return { items: value.items as ComparisonItem[], selected: value.selected as ComparisonDetail | null };
}
