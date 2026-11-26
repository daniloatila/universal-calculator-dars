import { hasUniqueKeys } from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import { capabilities } from './capability-catalog';
import type { CapabilitySession } from './capability-session';
import type { ToolRequest } from './tool-runtime';
import { executeFormula } from './formula-library';
import { compileFormula, compatibleUnits } from './formula-expression';
import { isLocale } from './i18n';
import { localizedDecimal, normalizeSignedDigits } from './locale-format';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type ObjectValue = { [key: string]: Json };
type Statement = { id: string; op: string; [key: string]: Json };
export interface AutomationFlow {
  format: 'dars-flow'; version: 1; id: string;
  inputs: ObjectValue; steps: Statement[]; outputs: string[];
}
const maxDocument = 128 * 1024;
const identifier = /^[a-z][a-z0-9_]{0,31}$/;
const blocked = new Set(['constructor','prototype','__proto__']);
const isName = (k: unknown): k is string => typeof k === 'string' && identifier.test(k) && !blocked.has(k);
function obj(v: unknown): v is ObjectValue { return !!v && typeof v === 'object' && !Array.isArray(v); }
function invalid(reason = 'invalid_input'): never { throw new Error(reason); }
function keys(v: ObjectValue, allowed: readonly string[]) {
  if (Object.keys(v).some(k => !allowed.includes(k) || blocked.has(k))) invalid();
}
const fields: Record<string,string[]> = {
  let:['value'], call:['module','operation','input','options'], arithmetic:['left','operator','right','unit'],
  formula:['formula','version','arguments'], dataset:['config'], each:['items','body','result'],
  choose:['left','compare','right','then','else','result'],
  collect:['items','field'], export:['value'], chart:['values'], comparison:['reference','alternative','metric'],
};
const numeric = /^-?(?:\d{1,1300}(?:\.\d{1,256})?|\d{1,1300}\/[1-9]\d{0,1299})(?:[eE][+-]?\d{1,3})?$/;
const safeValue = (value: unknown): string => typeof value === 'number' && Number.isSafeInteger(value)
  ? String(value) : typeof value === 'string' && numeric.test(value) ? value : invalid('domain');
function structuredResult(text: string): Json {
  // Preserve non-integer number tokens exactly as printed by Rust. Counts that fit the JS integer range remain counts.
  return JSON.parse(text.replace(/"(?:[^"\\]|\\[\s\S])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token =>
    token.startsWith('"') || /^-?\d+$/.test(token) && Number.isSafeInteger(Number(token)) ? token : JSON.stringify(token))) as Json;
}
const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
function inputValue(value: Json): Json {
  if (!obj(value) || value.type!=='decimal') return value;
  keys(value,['type','text','locale']);
  if(typeof value.text!=='string' || value.text.length>256 || typeof value.locale!=='string' || !isLocale(value.locale)) invalid('invalid_input');
  const sep=localizedDecimal(value.locale);
  const digits=normalizeSignedDigits(value.text.trim());
  if(sep!=='.' && digits.includes('.')) invalid('invalid_input');
  const normalized=digits.replace(sep,'.');
  if(!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$/.test(normalized)) invalid('invalid_input');
  return normalized.startsWith('+')?normalized.slice(1):normalized;
}
function referenceParts(ref: string) {
  const path = ref.split('.');
  if (path.length > 12 || path.some(s => (!isName(s) && !/^\d{1,3}$/.test(s)))) invalid('invalid_reference');
  return path;
}
function visit(value: Json, fn: (s: string) => void, depth = 0) {
  if (depth > 20) invalid('limit');
  if (Array.isArray(value)) { for (const item of value) visit(item,fn,depth+1); }
  else if (obj(value)) {
    if (Object.hasOwn(value,'ref')) {
      keys(value,['ref']);
      if (typeof value.ref !== 'string') invalid();
      fn(referenceParts(value.ref)[0]!);
    } else for (const [k,item] of Object.entries(value)) { if (blocked.has(k)) invalid(); visit(item,fn,depth+1); }
  }
}
export function parseFlow(text: string): AutomationFlow {
  if (text.length > maxDocument || new TextEncoder().encode(text).length > maxDocument) invalid('limit');
  // Exact decimal quantities are strings. JSON integers are limited to safe structural counts.
  for (const match of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)) {
    if (!match[0].startsWith('"') && (!/^-?\d{1,16}$/.test(match[0]) || !Number.isSafeInteger(Number(match[0])))) invalid('domain');
  }
  const doc: unknown = JSON.parse(text);
  if (!hasUniqueKeys(text,24) || !obj(doc)) invalid();
  keys(doc,['format','version','id','inputs','steps','outputs']);
  if (doc.format !== 'dars-flow' || doc.version !== 1 || !isName(doc.id) || !obj(doc.inputs) ||
    !Array.isArray(doc.steps) || !doc.steps.length || !Array.isArray(doc.outputs) || !doc.outputs.length || doc.outputs.length > 16) invalid();
  const available = new Set(Object.keys(doc.inputs));
  if (available.size>32 || [...available].some(k=>!isName(k))) invalid();
  visit(doc.inputs,()=>invalid());
  Object.values(doc.inputs).forEach(inputValue);
  let total = 0;
  const scan = (steps: Json, env: Set<string>, depth: number) => {
    if (!Array.isArray(steps) || depth>4) invalid('limit');
    for (const s of steps) {
      if (++total>96 || !obj(s) || !isName(s.id) || env.has(s.id) || !isName(s.op) || !Object.hasOwn(fields,s.op)) invalid();
      keys(s,['id','op',...fields[s.op]!]);
      for (const field of fields[s.op]!) {
        if (field==='options') { if (s.options!==undefined && !obj(s.options)) invalid(); }
        else if (field==='unit') { if (s.unit!==undefined && typeof s.unit!=='string') invalid('unit'); }
        else if (!Object.hasOwn(s,field)) invalid();
        if (!['body','then','else','result'].includes(field) && s[field]!==undefined)
          visit(s[field]!,k=>{if(!env.has(k)) invalid('invalid_reference');});
      }
      if (s.op==='call' && !capabilities.some(c=>c.input!=='file' && c.module===s.module && c.operation===s.operation)) invalid('unsupported');
      if (s.op==='arithmetic' && !['+','-','*','/','^'].includes(String(s.operator))) invalid();
      if (s.op==='choose' && !['eq','lt','gt'].includes(String(s.compare))) invalid();
      for (const branch of ['body','then','else']) if (s[branch]!==undefined) {
        const child = new Set(env);
        if (branch==='body') child.add('item');
        scan(s[branch]!,child,depth+1);
        if (!isName(s.result) || !child.has(s.result)) invalid('invalid_reference');
      }
      env.add(s.id);
    }
  };
  scan(doc.steps,available,0);
  if (doc.outputs.some(k=>!isName(k) || !available.has(k))) invalid('invalid_reference');
  return doc as unknown as AutomationFlow;
}
function resolve(v: Json, env: Map<string,Json>): Json {
  if (Array.isArray(v)) return v.map(item=>resolve(item,env));
  if (!obj(v)) return v;
  if (typeof v.ref === 'string') {
    const [first,...rest]=referenceParts(v.ref);
    let value=env.get(first!);
    for (const key of rest) {
      if (!value || typeof value!=='object' || !Object.hasOwn(value,key)) invalid('invalid_reference');
      value=(value as ObjectValue)[key];
    }
    return value===undefined ? invalid('invalid_reference') : value;
  }
  return Object.fromEntries(Object.entries(v).map(([k,t])=>[k,resolve(t,env)]));
}
type Trace = { step: string; op: string; branch?: string; iteration?: number; proof?: CalculationProof; formula?: unknown };
function quantity(value: Json) {
  if (!obj(value)) return {value:safeValue(value),unit:'1'};
  keys(value,['value','unit']);
  if (typeof value.unit!=='string') invalid('unit');
  return {value:safeValue(value.value),unit:value.unit};
}
export const maxFlowFileBytes = 4 * 1024 * 1024;
type Historic = Pick<FlowReceipt,'trace'|'outputs'|'sourceHashes'>;
// Keep the original number tokens for validation before JSON can round them.
function flowSource(text:string):string {
  let depth=0,start=-1,pending=false;
  for(const token of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]/gu)) {
    const part=token[0];
    if(part.startsWith('"')) { if(depth===1) pending=JSON.parse(part)==='flow'; continue; }
    if(part==='{' || part==='[') {
      if(depth===1 && pending && part==='{')start=token.index!;
      depth++;pending=false;
    } else if(--depth===1 && start>=0)return text.slice(start,token.index!+1);
  }
  return invalid();
}
export function openFlowFile(text: string): {flow:AutomationFlow; historic?:Historic} {
  if (text.length>maxFlowFileBytes || new TextEncoder().encode(text).length>maxFlowFileBytes || !hasUniqueKeys(text,48)) invalid('limit');
  const v: unknown=JSON.parse(text);
  if (!obj(v) || v.format!=='dars-flow-proof') return {flow:parseFlow(text)};
  keys(v,['format','version','flow','status','trace','outputs','sourceHashes','elapsedMs','includesApproximation','limits','used','error']);
  if(v.version!==1 || !obj(v.flow) || !Array.isArray(v.trace) || v.trace.length>241 || !obj(v.outputs) || !Array.isArray(v.sourceHashes) ||
    v.sourceHashes.length>240 || v.sourceHashes.some(h=>typeof h!=='string' || !/^[0-9a-f]{64}$/.test(h))) invalid();
  return {flow:parseFlow(flowSource(text)), historic:{trace:v.trace as unknown as Trace[], outputs:v.outputs, sourceHashes:v.sourceHashes as string[]}};
}
export function matchesHistoric(current: FlowReceipt, historic: Historic) {
  return current.status==='verified' && JSON.stringify([current.trace,current.outputs,current.sourceHashes])===
    JSON.stringify([historic.trace,historic.outputs,historic.sourceHashes]);
}
export interface FlowReceipt {
  format: 'dars-flow-proof'; version: 1; flow: AutomationFlow;
  status:'verified'|'failed'|'cancelled'; trace:Trace[]; outputs:ObjectValue; error?:string;
  sourceHashes:string[]; elapsedMs:number;
  includesApproximation:boolean;
  limits:{iterations:number;operations:number;bytes:number;rows:number;deadlineMs:number}; used:{operations:number;chargedBytes:number;rows:number};
}
export async function runFlow(flow:AutomationFlow,session:CapabilitySession,file:Blob | undefined,signal:AbortSignal,
  onProgress:(steps:number,id:string)=>void = ()=>{}):Promise<FlowReceipt> {
  const doc=parseFlow(JSON.stringify(flow));
  const start=performance.now();
  const limits={iterations:64,operations:240,bytes:session.getBudget(),rows:200000,deadlineMs:60000};
  const receipt:FlowReceipt={format:'dars-flow-proof',version:1,flow:doc,status:'failed',trace:[],outputs:{},sourceHashes:[],elapsedMs:0,
    includesApproximation:false,limits,used:{operations:0,chargedBytes:0,rows:0}};
  const deadline=new AbortController();
  const cancel=()=>deadline.abort();
  signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,limits.deadlineMs);
  const sources=new WeakMap<object,CalculationProof>();
  function check() {
    if(signal.aborted) invalid('cancelled');
    if(deadline.signal.aborted || performance.now()-start>=limits.deadlineMs) invalid('timed_out');
  }
  function charge(bytes:number) {
    if (bytes+receipt.used.chargedBytes>Math.min(limits.bytes,session.getBudget())) invalid('resource_budget');
    receipt.used.chargedBytes+=bytes;
  }
  async function execute(steps:Statement[],env:Map<string,Json>,prefix:string):Promise<void> {
    for(const step of steps) {
      check();
      if(++receipt.used.operations>limits.operations) invalid('limit');
      const trace:Trace={step:prefix+step.id,op:step.op};
      receipt.trace.push(trace); onProgress(receipt.used.operations,trace.step);
      const arg=(k:string)=>resolve(step[k]!,env);
      const run=async(module:ToolRequest['module'],operation:string,input:string,options:ToolRequest['options']={})=>{
        const proof=await session.run({schema:1,module,operation,input,options},deadline.signal);
        charge(4*size(proof)); trace.proof=proof;
        if(proof.exactness==='approximate')receipt.includesApproximation=true;
        return proof.result;
      };
      let result:Json;
      switch(step.op) {
        case 'call': {
          const input=arg('input');
          const raw=await run(step.module as ToolRequest['module'],String(step.operation),typeof input==='string'?input:JSON.stringify(input),
            step.options ? arg('options') as ToolRequest['options'] : {});
          result=raw.startsWith('{') || raw.startsWith('[') ? structuredResult(raw) : raw;
          if(obj(result) && trace.proof)sources.set(result,trace.proof);
          break;
        }
        case 'comparison': {
          const reference=arg('reference'),alternative=arg('alternative');
          const a=obj(reference)?sources.get(reference):undefined,b=obj(alternative)?sources.get(alternative):undefined;
          if (!a || !b || a.module!==b.module || typeof step.metric!=='string') invalid('domain');
          const recipe=(p:CalculationProof)=>({operation:p.operation,input:p.normalized,options:p.options});
          const input=JSON.stringify({reference:recipe(a),alternative:recipe(b),metric:step.metric});
          result=structuredResult(await run(a.module,'scenario_compare',input));
          break;
        }
        case 'arithmetic': {
          const left=arg('left'),right=arg('right');
          if (obj(left) || obj(right) || step.unit!==undefined) {
            if (typeof step.unit!=='string') invalid('unit');
            const operands=new Map([['left',quantity(left)],['right',quantity(right)]]);
            const expression=compileFormula('left'+step.operator+'right',operands,step.unit);
            result={value:await run('standard','evaluate',expression),unit:step.unit};
          } else result=await run('standard','evaluate','('+safeValue(left)+')'+step.operator+'('+safeValue(right)+')');
          break;
        }
        case 'formula': {
          const inputs=arg('arguments');
          if (!obj(inputs)) invalid();
          const args=Object.fromEntries(Object.entries(inputs).map(([k,v])=>{
            if(!obj(v)||typeof v.value!=='string'||typeof v.unit!=='string') invalid();
            return [k,{value:v.value,unit:v.unit}];
          }));
          const value=await executeFormula(String(step.formula),String(step.version),args,async(expression,s)=>{
            check();
            if(++receipt.used.operations>limits.operations) invalid('limit');
            const p=await session.run({schema:1,module:'standard',operation:'evaluate',input:expression,options:{}},s);
            charge(4*size(p));return p;
          },deadline.signal);
          trace.proof=value.proof;trace.formula=value.receipt;charge(4*size(value));
          if(value.proof.exactness==='approximate')receipt.includesApproximation=true;
          result={value:value.value,unit:value.unit};break;
        }
        case 'dataset': {
          if(!file) invalid('file_required');
          const config=arg('config');
          if(!obj(config)) invalid();
          const bytesLeft=Math.min(limits.bytes,session.getBudget())-receipt.used.chargedBytes;
          if(bytesLeft<65536) invalid('resource_budget');
          const out=await session.dataset(file,config,bytesLeft,deadline.signal);
          if (!Number.isSafeInteger(out.profile.source_rows) || out.profile.source_rows<0) invalid('invalid_response');
          receipt.used.rows+=out.profile.source_rows;
          if(receipt.used.rows>limits.rows) invalid('row_limit');
          trace.proof=out.proof; receipt.sourceHashes.push(out.profile.sha256);
          charge(out.estimatedPeak);
          // An aggregate can cover the entire table. A row loop receives rows only when complete.
          const rows=out.page.total===out.page.rows.length ? out.page.rows.map(row=>Object.fromEntries(row.map((cell,i)=>[out.page.columns[i]!.name,cell.canonical]))) : null;
          result={rows,total:out.profile.rows,profile:out.profile as unknown as Json,
            cellPage:out.page as unknown as Json,sourceHash:out.profile.sha256};
          break;
        }
        case 'choose': {
          const left=quantity(arg('left')),right=quantity(arg('right'));
          if(!compatibleUnits(left.unit,right.unit)) invalid('unit');
          const delta=await run('standard','evaluate','('+left.value+')-('+right.value+')');
          const yes=step.compare==='eq'?delta==='0':step.compare==='lt'?delta.startsWith('-'):delta!=='0'&&!delta.startsWith('-');
          const branch=yes?'then':'else';trace.branch=branch;
          const child=new Map(env);await execute(step[branch] as Statement[],child,trace.step+'.'+branch+'.');
          result=child.get(String(step.result))!; break;
        }
        case 'each': {
          const items=arg('items'); if(!Array.isArray(items)||items.length>limits.iterations) invalid('limit');
          const values:Json[]=[]; trace.iteration=items.length;
          for(let i=0;i<items.length;i++) { const child=new Map(env); child.set('item',items[i]!);
            await execute(step.body as Statement[],child,trace.step+'.'+i+'.');values.push(child.get(String(step.result))!); }
          result=values;break;
        }
        case 'collect': {
          const items=arg('items'), field=step.field;
          if(!Array.isArray(items)||!isName(field)||items.length>limits.iterations) invalid();
          result=items.map(v=>obj(v)&&Object.hasOwn(v,field)?v[field]!:invalid('invalid_reference'));break;
        }
        case 'chart': { const values=arg('values');if(!Array.isArray(values)||values.length>256) invalid('limit');result={series:values.map(safeValue)};break; }
        case 'export': case 'let': result=arg('value');break;
        default: invalid('unsupported');
      }
      check(); charge(4*size(result));env.set(step.id,result);
    }
  }
  try {
    charge(4*size(doc)); const env=new Map(Object.entries(doc.inputs).map(([k,v])=>[k,inputValue(v)]));
    await execute(doc.steps,env,'');
    receipt.outputs=Object.fromEntries(doc.outputs.map(k=>[k,env.get(k)!]));
    if(size(receipt)>maxFlowFileBytes-1024) invalid('resource_budget');
    receipt.status='verified';
  } catch(e) {receipt.outputs={};receipt.error=signal.aborted?'cancelled':deadline.signal.aborted?'timed_out':e instanceof Error?e.message:'failed';
    receipt.status=receipt.error==='cancelled'?'cancelled':'failed';
  } finally {clearTimeout(timer);signal.removeEventListener('abort',cancel);receipt.elapsedMs=performance.now()-start;}
  return receipt;
}
