import { MAX_CALCULATION_PROOF_BYTES, parseCalculationProof, parseCalculationProofFile } from './calculation-proof.ts';
import type { CalculationProof } from './calculation-proof.ts';

export const MAX_DATA_LAB_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_DATA_LAB_SETTINGS_BYTES = 16 * 1024;
export const MIN_DATA_LAB_BUDGET = 64 * 1024;
export const MAX_DATA_LAB_BUDGET = 256 * 1024 * 1024;
export const BASIC_DATA_LAB_BUDGET = 32 * 1024 * 1024;
export const DATA_LAB_PAGE_SIZE = 25;
export const DATA_LAB_SEMANTICS = 2;
export const dataLabKinds = ['text', 'integer', 'decimal', 'boolean', 'date', 'time'] as const;
export const dataLabFormats = ['csv', 'tsv', 'json', 'xlsx'] as const;
const algorithm = 'data-lab/2';
const MAX_PREVIEW_JSON_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();

export type Kind = (typeof dataLabKinds)[number];
export type Format = (typeof dataLabFormats)[number];
export type FormatOptions = {
  format: Format;
  header: 'present' | 'absent' | 'detect';
  encoding: 'utf8' | 'latin1' | 'utf16le' | 'utf16be';
  decimal: 'point' | 'comma';
  delimiter?: string | null;
  sheet?: string | null;
  types: Record<string, Kind>;
  analysis?: { x: string; y?: string | null } | null;
  resource_budget_bytes?: number | null;
};
export type Configuration = FormatOptions & { steps: unknown[]; semantics_version: 2 };
export const defaultDataLabOptions: FormatOptions = {
  format: 'csv', header: 'present', encoding: 'utf8', decimal: 'point', types: {},
};

type Source = 'text' | 'number' | 'boolean' | 'date' | 'error' | 'empty' | 'null' | 'absent';
type Validity = 'valid' | 'invalid' | 'empty' | 'null' | 'absent' | 'uncached' | 'error';
type Notation = 'text_point' | 'text_comma' | 'json' | 'xlsx' | 'canonical';
type DateDetails = {
  representation: 'serial' | 'iso';
  epoch: '1900' | '1904';
  status: 'valid' | 'invalid' | 'unavailable' | 'fictitious_1900_leap_day';
  iso?: string | null;
  discarded_subnanosecond_precision?: boolean;
};
type WorkbookDetails = {
  cell_type: string;
  style_index?: number | null;
  number_format_id?: number | null;
  number_format_code?: string | null;
  raw_value?: string | null;
  cache?: { status: 'stored' | 'empty' | 'missing' | 'error'; value?: string | null } | null;
  date?: DateDetails | null;
};
export type Cell = {
  value: string;
  origin: string;
  formula?: string | null;
  source_type: Source;
  source_origin: string;
  requested_type: Kind;
  validity: Validity;
  canonical: string | null;
  notation: Notation;
  workbook?: WorkbookDetails | null;
  derivation?: { operation: string; from_missing?: 'empty' | 'null' | 'absent' | null } | null;
};
export type Column = { name: string; kind: Kind };
type Page = {
  rows: Cell[][];
  columns: Column[];
  source_columns: Column[];
  sheets: string[];
  sheet?: string | null;
  workbook_epoch?: '1900' | '1904' | null;
  total: number;
  offset: number;
};
type Analysis = {
  n: number;
  histogram: number[];
  range?: [string, string];
  q1?: string;
  median?: string;
  q3?: string;
  outliers?: number;
  pearson?: { sign: number; r_squared: string; n: number };
};
type Profile = {
  sha256: string;
  source_rows: number;
  rows: number;
  profile: {
    column: Column;
    statistics: { sum: string; mean: string; min: string; max: string; n: number } | null;
    origins: Record<string, number>;
    validity?: Record<string, number>;
  }[];
  analysis: Analysis | null;
};
export type Output = { page: Page; proof: CalculationProof; profile: Profile };
type WorkerOutput = { ok: true; page: string; proof: string; csv?: Uint8Array<ArrayBuffer>; estimatedPeak?: number };
type WorkerReply = WorkerOutput | { ok: false; code: string };
export type DataJob = {
  includeResourceReceipt?: boolean;
  file: Blob;
  settings: string;
  budget: number;
  offset: number;
  descriptor?: string;
  expectedSha256?: string;
  exportMode?: 'protected' | 'literal';
};
export type Recipe = {
  version: 1 | 2;
  configuration: Configuration;
  sha256?: string;
  proof?: CalculationProof;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

const isHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

function isKind(value: unknown): value is Kind {
  return dataLabKinds.some((kind) => value === kind);
}

export function validDataLabBudget(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= MIN_DATA_LAB_BUDGET && value <= MAX_DATA_LAB_BUDGET;
}

export function validateDataLabInput(fileBytes: number, settings: string, budget: number, descriptor = '') {
  if (fileBytes > MAX_DATA_LAB_FILE_BYTES || settings.length > MAX_DATA_LAB_SETTINGS_BYTES || descriptor.length > 4096)
    throw new Error('limit');
  const settingsBytes = encoder.encode(settings).byteLength;
  const descriptorBytes = encoder.encode(descriptor).byteLength;
  if (settingsBytes > MAX_DATA_LAB_SETTINGS_BYTES || descriptorBytes > 4096)
    throw new Error('limit');
  if (!validDataLabBudget(budget)) throw new Error('invalid_input');
  // Reserve originals, the worker ArrayBuffer, the wasm-bindgen copy, and settings decoding.
  if (3 * fileBytes + 8 * (settingsBytes + descriptorBytes) + 32 * 1024 > budget)
    throw new Error('resource_budget');
  if (descriptor) {
    const replay = record(JSON.parse(descriptor));
    const configuration = record(replay?.configuration);
    const policy = record(replay?.resource_policy);
    if (configuration?.resource_budget_bytes !== budget || policy?.limit_bytes !== budget)
      throw new Error('resource_budget');
  }
}

function normalizeRecipeConfig(raw: unknown, version: 1 | 2): Configuration | undefined {
  const input = record(raw);
  if (!input || (version === 2 && input.semantics_version !== DATA_LAB_SEMANTICS) ||
      (version === 1 && input.semantics_version !== undefined)) return;
  const allowed = new Set([
    'format', 'header', 'encoding', 'decimal', 'delimiter', 'sheet', 'steps', 'types', 'analysis',
    'semantics_version', 'resource_budget_bytes',
  ]);
  if (!Object.keys(input).every((key) => allowed.has(key))) return;
  const draft = { ...defaultDataLabOptions, ...input };
  if (!dataLabFormats.some((format) => draft.format === format) ||
      !['present', 'absent', 'detect'].includes(draft.header) ||
      !['utf8', 'latin1', 'utf16le', 'utf16be'].includes(draft.encoding) ||
      !['point', 'comma'].includes(draft.decimal) ||
      (draft.delimiter != null && (typeof draft.delimiter !== 'string' || [...draft.delimiter].length !== 1)) ||
      (draft.sheet != null && (typeof draft.sheet !== 'string' || draft.sheet.length > 128))) return;
  if (draft.resource_budget_bytes != null && !validDataLabBudget(draft.resource_budget_bytes)) return;
  const types = record(draft.types);
  if (!types || Object.keys(types).length > 64 || !Object.values(types).every(isKind)) return;
  if (!Array.isArray(input.steps) || input.steps.length > 32) return;
  if (draft.analysis != null) {
    const entry = record(draft.analysis);
    if (!entry || typeof entry.x !== 'string' || (entry.y != null && typeof entry.y !== 'string') ||
        !Object.keys(entry).every((key) => key === 'x' || key === 'y')) return;
  }
  return { ...draft, steps: input.steps, semantics_version: DATA_LAB_SEMANTICS };
}

export function decodeDataLabRecipe(text: string): Recipe | undefined {
  if (text.length > MAX_CALCULATION_PROOF_BYTES || encoder.encode(text).byteLength > MAX_CALCULATION_PROOF_BYTES) return;
  try {
    const document = record(JSON.parse(text));
    if (!document) return;
    const proof = document.module === 'data-lab' && document.operation === 'dataset'
      ? parseCalculationProofFile(text) : undefined;
    if (!proof && encoder.encode(text).byteLength > MAX_DATA_LAB_SETTINGS_BYTES) return;
    const versioned = proof?.algorithm_version ?? document.version;
    if (versioned !== 'data-lab/1' && versioned !== algorithm) return;
    const version = versioned === algorithm ? 2 : 1;
    const descriptor = proof ? record(JSON.parse(proof.expression)) : document;
    if (!descriptor || (proof && version === 2 && descriptor.semantics_version !== DATA_LAB_SEMANTICS)) return;
    const hash = descriptor.sha256;
    const configuration = normalizeRecipeConfig(descriptor.configuration, version);
    if (!configuration || (hash !== undefined && !isHash(hash))) return;
    if (proof && (!isHash(hash) || proof.variables.sha256 !== hash || record(JSON.parse(proof.result))?.sha256 !== hash)) return;
    if (proof && version === 2 && (!validDataLabBudget(configuration.resource_budget_bytes) ||
        record(descriptor.resource_policy)?.limit_bytes !== configuration.resource_budget_bytes)) return;
    return { version, configuration, sha256: hash, proof: proof ?? undefined };
  } catch {
    return;
  }
}

export function serializeDataLabRecipe(configuration: Configuration): string {
  const body = { version: algorithm, configuration };
  const readable = JSON.stringify(body, null, 2);
  if (encoder.encode(readable).byteLength <= MAX_DATA_LAB_SETTINGS_BYTES) return readable;
  const compact = JSON.stringify(body);
  if (encoder.encode(compact).byteLength > MAX_DATA_LAB_SETTINGS_BYTES) throw new Error('limit');
  return compact;
}

/** Accept the transport without materializing its JSON while the Worker is still alive. */
export function decodeDataLabReply(value: unknown): WorkerReply {
  const reply = record(value);
  if (reply?.ok === false && typeof reply.code === 'string') return { ok: false, code: reply.code };
  if (reply?.ok !== true || typeof reply.page !== 'string' || typeof reply.proof !== 'string' ||
      reply.page.length > MAX_PREVIEW_JSON_BYTES || reply.proof.length > MAX_CALCULATION_PROOF_BYTES)
    throw new Error('invalid transport');
  const csv = reply.csv instanceof Uint8Array && reply.csv.buffer instanceof ArrayBuffer
    ? reply.csv as Uint8Array<ArrayBuffer> : undefined;
  const estimatedPeak = reply.estimatedPeak;
  if (estimatedPeak !== undefined && (typeof estimatedPeak !== 'number' || !Number.isSafeInteger(estimatedPeak) ||
    estimatedPeak < 0 || estimatedPeak > MAX_DATA_LAB_BUDGET)) throw new Error('invalid transport');
  return { ok: true, page: reply.page, proof: reply.proof, csv, estimatedPeak: estimatedPeak as number | undefined };
}

export function decodeDataLabOutput(reply: WorkerOutput): Output {
  const envelope = record(JSON.parse(reply.proof));
  const proof = parseCalculationProof(envelope?.proof);
  if (!proof || proof.module !== 'data-lab' || proof.operation !== 'dataset' || proof.algorithm_version !== algorithm)
    throw new Error('invalid proof');
  const page = JSON.parse(reply.page) as Page;
  const profile = JSON.parse(proof.result) as Profile;
  const descriptor = record(JSON.parse(proof.expression));
  if (
    !Array.isArray(page?.rows) || page.rows.length > DATA_LAB_PAGE_SIZE ||
    !Array.isArray(page.columns) || page.columns.length > 64 ||
    !Array.isArray(page.source_columns) || !Array.isArray(page.sheets) ||
    !Array.isArray(profile?.profile) || !isHash(profile.sha256) ||
    page.rows.some(row => !Array.isArray(row) || row.length !== page.columns.length) ||
    page.total !== profile.rows || proof.variables.sha256 !== profile.sha256 || descriptor?.sha256 !== profile.sha256
  ) throw new Error('invalid manifest');
  return { page, profile, proof };
}
