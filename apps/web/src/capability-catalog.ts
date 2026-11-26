import { hasUniqueKeys, MAX_FINANCE_COMPARISON_INPUT_BYTES } from './calculation-proof';
import { groups } from './tool-discrete-input';
import { operations as dateTime } from './tool-date-time-input';
import { operations as geometry } from './tool-geometry-input';
import { operations as finance } from './tool-finance-input';
import { scienceOperations } from './science-forms';
import type { ToolRequest } from './tool-runtime';

type Module = ToolRequest['module'];
type Parameter = { key: string; kind: string; optional?: boolean };
export interface Capability {
  module: Module;
  operation: string;
  description: string;
  parameters: readonly Parameter[];
  input: 'expression' | 'engine-text' | 'object' | 'file';
  output: 'CalculationProof';
  exactness: 'recorded-by-engine';
  units: 'proof.units';
  algorithm: string;
  maximumInputBytes: number;
  maximumTimeMs: number;
  domain: string;
  dependencies: readonly string[];
  taskClass: 'interactive'|'scientific'|'import';
  cancellation: 'terminate-worker';
  permission: 'local-math' | 'selected-file';
}

const catalog: Capability[] = [];
const domains:Record<Module,string>={
  standard:'arithmetic and rational numbers', scientific:'real and complex scalar expressions',
  algebra:'symbolic expressions and polynomial equations',calculus:'differentiation, integration and limits',
  linear_algebra:'vectors and matrices','linear-algebra':'vectors and matrices',geometry:'Euclidean geometry','discrete-mathematics':'discrete structures',
  programmer:'bounded bit vectors',converter:'compatible physical dimensions or user-supplied exchange rate',
  'date-time':'calendar dates, civil times and durations',financial:'cash amounts, rates and periods',
  investment:'investment returns and cash flows',loans:'loan principal, payment schedules and rates',
  tax:'tax bases and supplied tax parameters',business:'costs, prices and business ratios',
  statistics:'observations and statistical samples',probability:'probability distributions',
  simulation:'seeded stochastic simulations',optimization:'bounded numerical optimization',
  'physics-engineering':'dimensioned physical quantities','graph-lab':'sampled mathematical functions',
  'data-lab':'typed local tabular data'
};
function register(module: Module, operations: readonly string[], input: Capability['input'], fields: readonly Parameter[] = []) {
  for (const operation of operations) {
    catalog.push({ module, operation, description: module + ' / ' + operation.replaceAll('_', ' '),
      parameters: fields.length?fields:[{key:'input',kind:input},{key:'options',kind:'bounded engine options',optional:true}],
      domain:domains[module],dependencies:[module==='standard'?'dars-wasm':'dars-tool-wasm/'+module],
      taskClass:module==='simulation'?'scientific':input==='file'?'import':'interactive',
      input, output: 'CalculationProof', exactness: 'recorded-by-engine', units: 'proof.units',
      algorithm: operation==='scenario_compare'?'finance-comparison/2':module + (module === 'data-lab' ? '/2' : '/1'),
      maximumInputBytes: input === 'file' ? 16 * 1024 * 1024 : operation==='scenario_compare'?MAX_FINANCE_COMPARISON_INPUT_BYTES:4096,
      maximumTimeMs: module === 'simulation' || input === 'file' ? 45000 : 15000,
      cancellation: 'terminate-worker', permission: input === 'file' ? 'selected-file' : 'local-math' });
  }
}
register('standard', ['evaluate'], 'expression');
register('scientific', ['evaluate'], 'expression');
register('algebra', ['simplify','expand','factor','polynomial','solve','inequality','system','substitute','verify'], 'engine-text');
register('calculus', ['derivative','antiderivative','integral','limit','series','numerical_integral'], 'expression');
register('linear_algebra', ['add','subtract','multiply','transpose','determinant','inverse','rank','dot','cross','solve','eigenvalues','eigenvectors','lu','qr'], 'engine-text');
register('geometry', geometry, 'engine-text');
register('discrete-mathematics', Object.values(groups).flat(), 'engine-text');
register('programmer', ['convert','and','or','xor','not','shift_left','shift_right_logical','shift_right_arithmetic','rotate_left','rotate_right','twos_complement'], 'engine-text');
register('converter', ['convert','currency'], 'engine-text');
register('date-time', dateTime, 'engine-text');
for (const [module, entries] of Object.entries(finance))
  for (const entry of entries) register(module as Module, [entry.id], 'object', entry.fields);
for (const module of Object.keys(finance)) register(module as Module,['scenario_compare'],'object',[
  {key:'reference',kind:'financial request'},{key:'alternative',kind:'financial request'},{key:'metric',kind:'identifier',optional:true}
]);
for (const [module, entries] of Object.entries(scienceOperations))
  for (const entry of entries) register(module as Module, [entry.id], 'object', entry.fields);
register('data-lab', ['dataset'], 'file');
export const capabilities: readonly Capability[] = catalog;
const index = new Map(catalog.map(c => [c.module + '/' + c.operation, c]));
const encoder = new TextEncoder();
export function validateCapability(request: ToolRequest): Capability {
  const c = request && index.get(request.module + '/' + request.operation);
  if (!c || c.input === 'file') throw new Error('unsupported');
  if (request.schema !== 1 || typeof request.input !== 'string' || !request.input ||
    Object.keys(request).some(k => !['schema','module','operation','input','options','original_input'].includes(k)) ||
    request.input.length > c.maximumInputBytes || encoder.encode(request.input).length > c.maximumInputBytes ||
    (request.original_input !== undefined && (typeof request.original_input !== 'string' || encoder.encode(request.original_input).length > 4096)))
    throw new Error('invalid_input');
  if (!request.options || typeof request.options !== 'object' || Array.isArray(request.options) ||
    Object.keys(request.options).length > 16 || Object.entries(request.options).some(([k,v]) =>
      !/^[a-z][a-z0-9_]{0,31}$/.test(k) || !(typeof v === 'string' && v.length <= 4096 ||
      typeof v === 'boolean' || typeof v === 'number' && Number.isSafeInteger(v)))) throw new Error('invalid_input');
  if (c.module === 'standard' && (Object.keys(request.options).length || !/^[\x20-\x7e]+$/.test(request.input))) throw new Error('invalid_input');
  if (c.input === 'object') {
    if (!request.input.trimStart().startsWith('{') || !hasUniqueKeys(request.input, 24)) throw new Error('invalid_input');
    try { JSON.parse(request.input); } catch { throw new Error('invalid_input'); }
  }
  return c;
}
