import { isLocale } from './i18n.ts';
import type { Locale } from './i18n.ts';

export const MAX_CALCULATION_PROOF_BYTES = 128 * 1024;

const modules = [
  'standard', 'scientific', 'algebra', 'calculus', 'linear-algebra', 'linear_algebra', 'geometry',
  'discrete-mathematics', 'programmer', 'converter', 'date-time',
] as const;
const exactness = ['exact', 'symbolic', 'approximate'] as const;

export interface CalculationProof {
  schema: 1;
  module: (typeof modules)[number];
  operation: string;
  expression: string;
  expression_locale?: Locale;
  normalized: string;
  variables: Readonly<Record<string, string>>;
  standard_bindings?: Readonly<Record<string, string>>;
  units: Readonly<Record<string, string>>;
  options: Readonly<Record<string, string | boolean | number>>;
  domain: string;
  method: string;
  formula: string | null;
  result: string;
  exactness: (typeof exactness)[number];
  precision: number | null;
  tolerance: string | null;
  rounding: string | null;
  error_bound: string | null;
  assumptions: readonly string[];
  constraints: readonly string[];
  references: readonly string[];
  engine_version: string;
  algorithm_version: string;
}

const fields = [
  'schema', 'module', 'operation', 'expression', 'normalized', 'variables', 'units', 'options',
  'domain', 'method', 'formula', 'result', 'exactness', 'precision', 'tolerance', 'rounding',
  'error_bound', 'assumptions', 'constraints', 'references', 'engine_version', 'algorithm_version',
] as const satisfies readonly (keyof CalculationProof)[];

const utf8 = new TextEncoder();
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const unsupportedText = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\p{Cs}]/u;

function isIdentifier(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit &&
    /^[a-z]/u.test(value) && !/[^a-z0-9_-]/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit &&
    !unsupportedText.test(value) && utf8.encode(value).byteLength <= limit;
}

function isOptionalText(value: unknown, limit: number): boolean {
  return value === null || isText(value, limit);
}

function isNamedFields(value: unknown, validValue: (entry: unknown) => boolean, validKey: (key: string) => boolean): boolean {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 16 && entries.every(([key, entry]) =>
    validKey(key) && !forbiddenKeys.has(key) && validValue(entry));
}

function isMapKey(value: string): boolean {
  return value.length > 0 && isText(value, 32);
}

function isTextList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 32) return false;
  for (const entry of value) if (!isText(entry, 2048)) return false;
  return true;
}

function isStandardBindings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.length <= 256 &&
    entries.every(([id, entry]) => /^[1-9][0-9]{0,9}$/u.test(id) && Number(id) <= 4_294_967_295 &&
      typeof entry === 'string' && entry.length <= 10_000 && /^[\x20-\x7e]+$/u.test(entry)) &&
    utf8.encode(JSON.stringify(value)).byteLength <= 96 * 1024;
}

/** Validate a local file record or the structured result received from a dedicated worker. */
export function parseCalculationProof(value: unknown): CalculationProof | null {
  if (!isRecord(value)) return null;
  const hasBindings = Object.hasOwn(value, 'standard_bindings');
  const hasLocale = Object.hasOwn(value, 'expression_locale');
  if (Object.keys(value).length !== fields.length + Number(hasBindings) + Number(hasLocale) ||
    !fields.every((field) => Object.hasOwn(value, field))) return null;
  if (hasLocale && (typeof value.expression_locale !== 'string' || !isLocale(value.expression_locale))) return null;
  if (value.schema !== 1 || !modules.some((module) => module === value.module) ||
    !exactness.some((kind) => kind === value.exactness)) return null;
  if (!isIdentifier(value.operation, 64)) return null;
  if (hasBindings && (value.module !== 'standard' || value.operation !== 'evaluate' || !isStandardBindings(value.standard_bindings))) return null;
  if (!isText(value.expression, 4096) || !isText(value.normalized, 8192) ||
    !isText(value.result, 32768) || value.result.length === 0 ||
    !isText(value.domain, 2048) || !isText(value.method, 2048) ||
    !isText(value.engine_version, 128) || !isText(value.algorithm_version, 128)) return null;
  if (!isOptionalText(value.formula, 8192) || !isOptionalText(value.tolerance, 512) ||
    !isOptionalText(value.rounding, 512) || !isOptionalText(value.error_bound, 512)) return null;
  if (value.precision !== null && (!Number.isSafeInteger(value.precision) || (value.precision as number) < 1)) return null;
  if (!isNamedFields(value.variables, (entry) => isText(entry, 256), isMapKey) ||
    !isNamedFields(value.units, (entry) => isText(entry, 256), isMapKey) ||
    !isNamedFields(value.options, (entry) =>
      typeof entry === 'boolean' || Number.isSafeInteger(entry) || isText(entry, 256),
    (key) => isIdentifier(key, 32))) return null;
  if (!isTextList(value.assumptions) || !isTextList(value.constraints) || !isTextList(value.references)) return null;
  return utf8.encode(JSON.stringify(value)).byteLength <= MAX_CALCULATION_PROOF_BYTES
    ? value as unknown as CalculationProof : null;
}

/** Record input provenance without modifying any evaluator fields or exceeding the portable bound. */
export function withExpressionLocale(proof: CalculationProof, locale: Locale): CalculationProof {
  const annotated = { ...proof, expression_locale: locale };
  return utf8.encode(JSON.stringify(annotated)).byteLength <= MAX_CALCULATION_PROOF_BYTES ? annotated : proof;
}

// JSON.parse defines the JSON grammar. This pass rules out ambiguous duplicate fields,
// including names that become equal after decoding their escapes.
function hasUniqueKeys(text: string): boolean {
  const stack: (Set<string> | null)[] = [];
  let lastString = '';
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:]/gu)) {
    if (!token) return false;
    if (token === '{' || token === '[') {
      if (stack.length === 2) return false;
      stack.push(token === '{' ? new Set<string>() : null);
    } else if (token === '}' || token === ']') {
      stack.pop();
    } else if (token === ':') {
      const key = JSON.parse(lastString) as string;
      const keys = stack.at(-1);
      if (!keys || keys.has(key)) return false;
      keys.add(key);
    } else {
      lastString = token;
    }
  }
  return true;
}

export function parseCalculationProofFile(text: string): CalculationProof | null {
  if (text.length > MAX_CALCULATION_PROOF_BYTES || utf8.encode(text).byteLength > MAX_CALCULATION_PROOF_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    return hasUniqueKeys(text) ? parseCalculationProof(value) : null;
  } catch {
    return null;
  }
}

export function serializeCalculationProof(proof: CalculationProof): string {
  const readable = JSON.stringify(proof, null, 2) + '\n';
  return utf8.encode(readable).byteLength <= MAX_CALCULATION_PROOF_BYTES ? readable : JSON.stringify(proof);
}
