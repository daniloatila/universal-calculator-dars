import { hasUniqueKeys } from './calculation-proof.ts';
import { compatibleUnits, fail, formulaName, scalar } from './formula-expression.ts';

export type FormulaParameter = { name: string; type: 'decimal' | 'integer' | 'rational'; unit: string; default?: string; min?: string; max?: string };
export type FormulaInputs = Record<string, { value: string; unit: string }>;
export type FormulaCase = { name: string; inputs: FormulaInputs; expected: string; unit: string; tolerance?: string } |
  { name: string; inputs: FormulaInputs; error: string };
export type FormulaLink = { name: string; id: string; version: string; arguments: Record<string, string> };
export type FormulaDefinition = {
  schema: 1; kind: 'dars-formula'; id: string; version: string; name: string; description: string;
  category: string; expression: string; domain: string; unit: string; parameters: FormulaParameter[];
  dependencies: FormulaLink[]; references: string[]; author: string; license: string; tests: FormulaCase[];
};
export const FORMULA_FILE_BYTES = 64 * 1024;
export const formulaBytes = (s: string) => new TextEncoder().encode(s).byteLength;
const text = (v: unknown, max: number): v is string => typeof v === 'string' &&
  v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(v);
const id = (s: unknown): s is string => typeof s === 'string' && /^[a-z][a-z0-9-]{0,47}$/u.test(s);
const version = (s: unknown): s is string => typeof s === 'string' && /^(?:0|[1-9]\d{0,5})(?:\.(?:0|[1-9]\d{0,5})){2}$/u.test(s);
const unit = (s: unknown): s is string => typeof s === 'string' && compatibleUnits(s,s);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('schema');
  return value as Record<string, unknown>;
}
function fields(value: unknown, required: string[], optional: string[] = []) {
  const v = object(value);
  if (required.some(key => !Object.hasOwn(v,key)) || Object.keys(v).some(key => !required.includes(key) && !optional.includes(key))) fail('schema');
  return v;
}
function array<T>(value: unknown, min: number, max: number, read: (entry: unknown)=>T): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail('schema');
  return value.map(read);
}
export function validateFormulaInputs(value: unknown): FormulaInputs {
  const entries = Object.entries(object(value));
  if (entries.length > 16) fail('input');
  return Object.fromEntries(entries.map(([key,entry])=>{
    const v = fields(entry,['value','unit']);
    if (!formulaName(key) || !scalar(v.value) || !unit(v.unit)) fail('input');
    return [key,{value:v.value,unit:v.unit}];
  }));
}
function parameter(raw: unknown): FormulaParameter {
  const p = fields(raw,['name','type','unit'],['default','min','max']);
  if (!formulaName(p.name) || !['integer','rational','decimal'].includes(String(p.type)) || !unit(p.unit)) fail('schema');
  const v: FormulaParameter = {name:p.name,type:p.type as FormulaParameter['type'],unit:p.unit};
  for (const k of ['default','min','max'] as const) if (Object.hasOwn(p,k)) {
    const number = p[k];
    if (!scalar(number)) fail('input');
    v[k] = number;
  }
  return v;
}
function testCase(raw: unknown): FormulaCase {
  const isError = Object.hasOwn(object(raw),'error');
  const t = isError ? fields(raw,['name','inputs','error']) : fields(raw,['name','inputs','expected','unit'],['tolerance']);
  if (!text(t.name,100)) fail('schema');
  const inputs = validateFormulaInputs(t.inputs);
  if (isError) {
    if (typeof t.error !== 'string' || !['input','unit','constraint','division_by_zero','domain_error',
      'magnitude_limit','precision_limit','unsupported_exponent','inexact_dependency'].includes(t.error)) fail('schema');
    return {name:t.name,inputs,error:t.error};
  }
  if (!scalar(t.expected) || !unit(t.unit)) fail('schema');
  if (Object.hasOwn(t,'tolerance') && (!scalar(t.tolerance) || t.tolerance.startsWith('-'))) fail('schema');
  return {name:t.name,inputs,expected:t.expected,unit:t.unit,...(typeof t.tolerance === 'string' ? {tolerance:t.tolerance} : {})};
}
function dependency(raw: unknown): FormulaLink {
  const d = fields(raw,['name','id','version','arguments']);
  if (!formulaName(d.name) || !id(d.id) || !version(d.version)) fail('schema');
  const entries=Object.entries(object(d.arguments));
  if (entries.length>16 || entries.some(([k,v])=>!formulaName(k) || !formulaName(v))) fail('schema');
  return {name:d.name,id:d.id,version:d.version,arguments:Object.fromEntries(entries) as Record<string,string>};
}
export function validateFormula(raw: unknown): FormulaDefinition {
  const f=fields(raw,['schema','kind','id','version','name','description','category','expression','domain','unit',
    'parameters','dependencies','references','author','license','tests']);
  if (f.schema!==1 || f.kind!=='dars-formula' || !id(f.id) || !version(f.version) || !text(f.name,120) ||
    !text(f.description,1200) || !text(f.expression,768) || !text(f.domain,600) || !text(f.category,60) ||
    !unit(f.unit) || !text(f.author,128) || !text(f.license,80)) fail('schema');
  const parameters=array(f.parameters,0,16,parameter);
  const dependencies=array(f.dependencies,0,8,dependency);
  const names=[...parameters,...dependencies].map(x=>x.name);
  if (new Set(names).size!==names.length) fail('duplicate');
  const references=array(f.references,0,8,r=>text(r,350)?r:fail('schema'));
  const tests=array(f.tests,1,16,testCase);
  if (!tests.some(t=>'expected' in t) || new Set(tests.map(t=>t.name)).size!==tests.length) fail('schema');
  const result: FormulaDefinition={schema:1,kind:'dars-formula',id:f.id,version:f.version,name:f.name,
    description:f.description,category:f.category,expression:f.expression,domain:f.domain,unit:f.unit,author:f.author,
    license:f.license,parameters,dependencies,references,tests};
  if (formulaBytes(JSON.stringify(result))>FORMULA_FILE_BYTES) fail('complexity');
  return result;
}
export function decodeFormula(text: string): FormulaDefinition {
  if (formulaBytes(text)>FORMULA_FILE_BYTES) fail('complexity');
  let value: unknown;
  try { value=JSON.parse(text); } catch { fail('schema'); }
  if (!hasUniqueKeys(text,24)) fail('schema');
  return validateFormula(value);
}
