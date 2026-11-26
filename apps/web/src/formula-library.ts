import { parseCalculationProof } from './calculation-proof.ts';
import type { CalculationProof } from './calculation-proof.ts';
import { compileFormula, compatibleUnits, fail, FormulaError } from './formula-expression.ts';
import { formulaBytes, validateFormula, validateFormulaInputs } from './formula-definition.ts';
import type { FormulaDefinition, FormulaInputs, FormulaParameter } from './formula-definition.ts';
import type { LocalizedDraft } from './locale-format.ts';
import rectangle from '../../../community/formulas/rectangle-area.json' with {type:'json'};
import interest from '../../../community/formulas/simple-interest.json' with {type:'json'};
import mean from '../../../community/formulas/arithmetic-mean.json' with {type:'json'};
import speed from '../../../community/formulas/constant-speed.json' with {type:'json'};

export { decodeFormula, validateFormula } from './formula-definition.ts';
export type { FormulaDefinition, FormulaInputs } from './formula-definition.ts';
export type FormulaEvaluate = (expression: string, signal?: AbortSignal) => Promise<CalculationProof>;
export type FormulaTestResult = { name: string; observed: string; unit?: string; exactness?: string };
export type FormulaReceipt = {
  schema: 1; kind: 'dars-formula-run'; definition: FormulaDefinition; inputs: FormulaInputs;
  tests: FormulaTestResult[]; proof: CalculationProof; dependencies: FormulaReceipt[];
  source_notation?: { expression:LocalizedDraft; inputs:Record<string,LocalizedDraft> };
};
export type FormulaResult = { value: string; unit: string; proof: CalculationProof; receipt: FormulaReceipt };
type Entry = { definition: FormulaDefinition; tests?: FormulaTestResult[]; bytes: number };
type Operation = { signal?: AbortSignal; nodes: number; deadline: number; evaluate: FormulaEvaluate };
const pin = (id: string,version: string)=>id+'@'+version;
export const communityFormulas = [rectangle,interest,mean,speed].map(validateFormula);

/** Compare bounded canonical scalar encodings for type/domain/test predicates only. */
function rational(text: string): [bigint,bigint] {
  if (text.length>4096) fail('complexity');
  const ratio=/^(-?\d+)\/([1-9]\d*)$/u.exec(text);
  if (ratio) return [BigInt(ratio[1]!),BigInt(ratio[2]!)];
  const decimal=/^(-?\d+)(?:\.(\d+))?(?:e([+-]?\d{1,4}))?$/iu.exec(text);
  if (!decimal) fail('input');
  const digits=decimal[2]??'';
  const exponent=Number(decimal[3]??0)-digits.length;
  if (Math.abs(exponent)>4096) fail('complexity');
  return [BigInt(decimal[1]+digits)*10n**BigInt(Math.max(0,exponent)),10n**BigInt(Math.max(0,-exponent))];
}
function compare(left: string,right: string) {
  const [a,b]=rational(left),[c,d]=rational(right);
  return a*d-b*c;
}
function checkDomain(parameter:FormulaParameter,value:string) {
  const [numerator,denominator]=rational(value);
  if ((parameter.type==='integer'&&numerator%denominator!==0n) ||
      (parameter.min!==undefined&&compare(value,parameter.min)<0n) ||
      (parameter.max!==undefined&&compare(value,parameter.max)>0n)) fail('constraint');
}
function within(actual:string,expected:string,tolerance:string,uncertainty:string) {
  const [a,b]=rational(actual),[e,f]=rational(expected),[t,u]=rational(tolerance),[s,v]=rational(uncertainty);
  const delta=a*f-e*b;
  return (delta<0n?-delta:delta)*u*v+s*b*f*u<=t*b*f*v;
}
function guard(op:Operation) {
  if (op.signal?.aborted) fail('cancelled');
  if (performance.now()>op.deadline) fail('timeout');
  if (++op.nodes>256) fail('complexity');
}
function begin(evaluate:FormulaEvaluate,signal?:AbortSignal):Operation {
  return {evaluate,signal,nodes:0,deadline:performance.now()+45000};
}
function errorCode(error:unknown) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'failure';
}
export class FormulaLibrary {
  private readonly entries = new Map<string,Entry>();
  private generation=0;
  constructor() { this.clear(); }
  clear() {
    this.generation++;
    this.entries.clear();
    for (const f of communityFormulas) {
      const definition=validateFormula(f);
      this.entries.set(pin(f.id,f.version),{definition,bytes:formulaBytes(JSON.stringify(definition))});
    }
  }
  list() { return Array.from(this.entries.values(),e=>({id:e.definition.id,version:e.definition.version,name:e.definition.name,category:e.definition.category,verified:!!e.tests})); }
  resolve(id:string,version:string) {
    const entry=this.entries.get(pin(id,version));
    return entry?structuredClone(entry.definition):undefined;
  }
  private graph(f:FormulaDefinition,overrides:Map<string,Entry>,path=new Set<string>(),done=new Set<string>()) {
    const key=pin(f.id,f.version);
    if (path.has(key)) fail('cycle');
    if (done.has(key)) return;
    if (path.size>=8 || done.size>=32) fail('complexity');
    path.add(key);
    for (const p of f.parameters) {
      if (p.min!==undefined && p.max!==undefined && compare(p.min,p.max)>0n) fail('constraint');
      if (p.default!==undefined) checkDomain(p,p.default);
    }
    const types=new Map(f.parameters.map(p=>[p.name,{value:'1',unit:p.unit}]));
    for (const d of f.dependencies) {
      const target=(overrides.get(pin(d.id,d.version))??this.entries.get(pin(d.id,d.version)))?.definition;
      if (!target) fail('reference');
      this.graph(target,overrides,path,done);
      for (const [name,source] of Object.entries(d.arguments)) {
        const param=target.parameters.find(p=>p.name===name), origin=types.get(source);
        if (!param || !origin) fail('reference');
        if (!compatibleUnits(param.unit,origin.unit)) fail('unit');
      }
      if (target.parameters.some(p=>!p.default&&!Object.hasOwn(d.arguments,p.name))) fail('reference');
      types.set(d.name,{value:'1',unit:target.unit});
    }
    compileFormula(f.expression,types,f.unit);
    path.delete(key); done.add(key);
  }
  private async checked(entry:Entry,op:Operation):Promise<FormulaTestResult[]> {
    if (entry.tests) return entry.tests;
    const tests:FormulaTestResult[]=[];
    for (const test of entry.definition.tests) {
      let actual: Awaited<ReturnType<FormulaLibrary['run']>>;
      try { actual=await this.run(entry.definition,test.inputs,op,false); }
      catch(error) {
        const code=errorCode(error);
        if (['cancelled','engine_cancelled','timeout','engine_timeout','engine_unavailable','resource_budget','complexity'].includes(code)) throw error;
        if ('error' in test && test.error===code) { tests.push({name:test.name,observed:code}); continue; }
        throw new FormulaError('test_failed');
      }
      if ('error' in test || !compatibleUnits(test.unit,actual.unit)) fail('test_failed');
      const proof=actual.proof;
      const bound=proof.exactness==='exact'?'0':proof.error_bound;
      if (bound===null || (proof.exactness!=='exact' && !test.tolerance) ||
        !within(proof.result,test.expected,test.tolerance??'0',bound)) fail('test_failed');
      tests.push({name:test.name,observed:proof.result,unit:actual.unit,exactness:proof.exactness});
    }
    return tests;
  }
  async verifyAndAdd(raw:unknown,evaluate:FormulaEvaluate,signal?:AbortSignal):Promise<FormulaTestResult[]> {
    const epoch=this.generation;
    const definition=validateFormula(raw), key=pin(definition.id,definition.version);
    const content=JSON.stringify(definition), bytes=formulaBytes(content);
    const previous=this.entries.get(key);
    if (previous && JSON.stringify(previous.definition)!==content) fail('version_conflict');
    const entry:Entry=previous??{definition,bytes};
    this.graph(definition,new Map([[key,entry]]));
    const op=begin(evaluate,signal);
    const tests=await this.checked(entry,op);
    guard(op);
    if (epoch!==this.generation) fail('cancelled');
    const concurrent=this.entries.get(key);
    if (concurrent && JSON.stringify(concurrent.definition)!==content) fail('version_conflict');
    if (!concurrent && (this.entries.size>=64 || Array.from(this.entries.values()).reduce((sum,e)=>sum+e.bytes,bytes)>512*1024)) fail('complexity');
    this.entries.set(key,{definition,bytes,tests});
    return structuredClone(tests);
  }
  private async run(f:FormulaDefinition,raw:FormulaInputs,op:Operation,retain:boolean):Promise<FormulaResult> {
    guard(op);
    const given=validateFormulaInputs(raw);
    const inputs:FormulaInputs={};
    const bindings=new Map<string,{value:string;unit:string}>();
    if (Object.keys(given).some(name=>!f.parameters.some(p=>p.name===name))) fail('input');
    for (const p of f.parameters) {
      const supplied=given[p.name]??(p.default!==undefined?{value:p.default,unit:p.unit}:undefined);
      if (!supplied) fail('input');
      if (!compatibleUnits(supplied.unit,p.unit)) fail('unit');
      checkDomain(p,supplied.value);
      inputs[p.name]=supplied; bindings.set(p.name,supplied);
    }
    const dependencies:FormulaReceipt[]=[];
    for (const link of f.dependencies) {
      const entry=this.entries.get(pin(link.id,link.version));
      if (!entry) fail('reference');
      if (!entry.tests) entry.tests=await this.checked(entry,op);
      const mapped=Object.fromEntries(Object.entries(link.arguments).map(([key,ref])=>[key,bindings.get(ref)??fail('reference')]));
      const result=await this.run(entry.definition,mapped,op,retain);
      if (result.proof.exactness!=='exact') fail('inexact_dependency');
      bindings.set(link.name,{value:result.value,unit:result.unit});
      if (retain) dependencies.push(result.receipt);
    }
    const compiled=compileFormula(f.expression,bindings,f.unit);
    const proof=parseCalculationProof(await op.evaluate(compiled,op.signal));
    guard(op);
    if (!proof || proof.module!=='standard'||proof.operation!=='evaluate'||proof.expression!==compiled) fail('unverified');
    const receipt:FormulaReceipt={schema:1,kind:'dars-formula-run',definition:f,inputs,tests:this.entries.get(pin(f.id,f.version))?.tests??[],proof,dependencies};
    if (retain && formulaBytes(JSON.stringify(receipt))>256*1024) fail('complexity');
    return {value:proof.result,unit:f.unit,proof,receipt};
  }
  async execute(id:string,version:string,inputs:FormulaInputs,evaluate:FormulaEvaluate,signal?:AbortSignal) {
    const epoch=this.generation;
    const entry=this.entries.get(pin(id,version));
    if (!entry) fail('reference');
    this.graph(entry.definition,new Map());
    const op=begin(evaluate,signal);
    if (!entry.tests) entry.tests=await this.checked(entry,op);
    const result=await this.run(entry.definition,inputs,op,true);
    if (epoch!==this.generation) fail('cancelled');
    return structuredClone(result);
  }
}
export const formulaLibrary=new FormulaLibrary();
if (typeof window!=='undefined') window.addEventListener('dars-clear-session',()=>formulaLibrary.clear());
export const resolveFormula=formulaLibrary.resolve.bind(formulaLibrary);
export const executeFormula=formulaLibrary.execute.bind(formulaLibrary);
export const verifyFormula=formulaLibrary.verifyAndAdd.bind(formulaLibrary);
