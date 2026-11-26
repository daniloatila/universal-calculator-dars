import type { CalculationProof } from './calculation-proof.ts';
import { normalizeExpression, localizedDecimal, normalizeSignedDigits } from './locale-format.ts';
import type { ToolRequest } from './tool-runtime.ts';
import {
  fail, hasKeys, id, notebookLimits, object, planNotebook, readJson, sizeOf, validTable,
  type NotebookCell, type NotebookDocument, type NotebookOutput, type NotebookRecord, type Records,
} from './notebook-document.ts';

type Run = (request:ToolRequest,signal?:AbortSignal)=>Promise<CalculationProof>;
export type FormulaRunner = (name:string,version:string,values:Record<string,{value:string;unit:string}>,evaluate:(expression:string,signal?:AbortSignal)=>Promise<CalculationProof>,signal?:AbortSignal)=>
  Promise<{value:string;unit:string;proof:CalculationProof;receipt:unknown}>;
export interface NotebookServices { run: Run; formula: FormulaRunner }
export interface NotebookLedger { records:Records; errors:Record<string,string>; executed:string[]; calls:number }
const scalar=/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$|^-?\d+\/[1-9]\d*$/u;
const reference=/^@([a-z][a-z0-9_]*)(?:\.([a-z][a-z0-9_]*))?$/u;

function refOutput(source:string, records:Records) {
  const ref=reference.exec(source);
  if(!ref || !id(ref[1]) || (ref[2]!==undefined && !id(ref[2]))) fail('invalid_input');
  const record=records[ref[1]];
  if(!record) fail('missing');
  const output=record.output;
  if(ref[2]) {
    if(ref[2]==='amount' || ref[2]==='interest') fail('type'); // Display-rounded money is never a scalar dependency.
    const field=output.fields?.[ref[2]];
    if(field===undefined) fail('type');
    return { ...output, value:field, display:ref[2].endsWith('_exact')?output.fields?.[ref[2].slice(0,-6)]:undefined };
  }
  return output;
}
function localNumber(source:string,cell:NotebookCell) {
  const separator=localizedDecimal(cell.origin);
  const digits=normalizeSignedDigits(source.trim());
  if (separator!=='.' && digits.includes('.')) fail('invalid_input');
  const value=digits.replace(separator,'.');
  if (!scalar.test(value) || value.length>1024) fail('invalid_input');
  return value;
}
function financeDecimal(value:string) {
  if(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value)) return value;
  if(!/^-?\d{1,1024}\/[1-9]\d{0,1023}$/u.test(value)) fail('domain');
  // Convert exact finite fractions for the financial decimal grammar, without rounding.
  const [top,bottom]=value.split('/'); const n=BigInt(top!),d=BigInt(bottom!);
  const a=n<0n?-n:n;
  let rem=a%d, places='';
  while(rem!==0n && places.length<12) {
    rem*=10n; places+=(rem/d).toString(); rem%=d;
  }
  if(rem!==0n) fail('domain');
  return (n<0n?'-':'')+(a/d).toString()+(places?'.'+places:'');
}
function unitScalar(source:unknown,expected:string,records:Records) {
  if(typeof source!=='string') fail('invalid_input');
  const v=refOutput(source,records);
  if(v.unit!==expected) fail('unit');
  if(!scalar.test(v.value)||v.exactness!=='exact') fail('type');
  return v.value;
}
function mathText(cell:NotebookCell,records:Records) {
  const source=normalizeExpression(cell.source,localizedDecimal(cell.origin));
  const math=source.replace(/@[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?/gu, token=> {
    const v=refOutput(token,records);
    if(v.unit!=='1') fail('unit');
    if(!scalar.test(v.value)||v.exactness!=='exact') fail('type');
    return '('+v.value+')';
  });
  if(math.length>4096) fail('limit');
  return math;
}
function validateSeries(rows:string[][]) {
  if(!rows.length || rows.length>notebookLimits.tableRows ||
      rows.some(row=>row.length!==2 || row.some(field=>!scalar.test(field)))) fail('type');
  return rows;
}
async function evaluate(cell:NotebookCell,records:Records,call:Run,formula:FormulaRunner,signal:AbortSignal):Promise<NotebookOutput> {
  const standard=(input:string,callSignal=signal)=>call({schema:1,module:'standard',operation:'evaluate',input,options:{}},callSignal);
  if(cell.kind==='heading' || cell.kind==='text') return {value:cell.source,unit:'text'};
  if(cell.kind==='variable' || cell.kind==='expression' || cell.kind==='scientific') {
    const source=cell.kind==='variable'?localNumber(cell.source,cell):mathText(cell,records);
    const proof=cell.kind==='scientific'
      ? await call({schema:1,module:'scientific',operation:'evaluate',input:source,options:{precision:40}},signal) : await standard(source);
    return {value:proof.result,unit:cell.kind==='variable'?(cell.unit||'1'):'1',exactness:proof.exactness,proofs:[proof]};
  }
  if(cell.kind==='formula') {
    const v=readJson(cell.source,notebookLimits.source);
    if(!object(v)||!hasKeys(v,['id','version','inputs'])||typeof v.id!=='string'||typeof v.version!=='string'||!object(v.inputs)) fail('invalid_input');
    const values:Record<string,{value:string;unit:string}>=Object.create(null);
    for(const [k,ref] of Object.entries(v.inputs)) {
      if(!id(k)||typeof ref!=='string') fail('invalid_input');
      const o=refOutput(ref,records); if(!scalar.test(o.value)||o.exactness!=='exact') fail('type');
      values[k]={value:o.value,unit:o.unit};
    }
    const result=await formula(v.id,v.version,values,standard,signal);
    return {value:result.value,unit:result.unit,exactness:result.proof.exactness,proofs:[result.proof],formula:{id:v.id,version:v.version,receipt:result.receipt}};
  }
  if(cell.kind==='financial') {
    const v=readJson(cell.source,notebookLimits.source);
    if(!object(v)||!hasKeys(v,['principal','rate','periods','currency','timeline'])||typeof v.currency!=='string'||
       !/^[A-Z]{3}$/u.test(v.currency)||typeof v.timeline!=='boolean') fail('invalid_input');
    const principal=financeDecimal(unitScalar(v.principal,v.currency,records));
    const rate=financeDecimal(unitScalar(v.rate,'rate/month',records));
    const period=unitScalar(v.periods,'month',records);
    if(!/^\d{1,3}$/u.test(period) || BigInt(period)>600n) fail('domain');
    const end=Number(period); // Bounded count required by the Rust financial contract.
    if(v.timeline && end>=notebookLimits.tableRows) fail('limit');
    const series:string[][]=[],proofs:CalculationProof[]=[];
    let fields:Record<string,string>={};
    for(let i=v.timeline?0:end;i<=end;i++) {
      const proof=await call({schema:1,module:'financial',operation:'compound_interest',
        input:JSON.stringify({principal,rate,periods:i}),options:{currency:v.currency,rounding:'half_even'}},signal);
      const out:unknown=JSON.parse(proof.result);
      if(!object(out)||typeof out.amount_exact!=='string'||!scalar.test(out.amount_exact)||
        typeof out.interest_exact!=='string'||!scalar.test(out.interest_exact)) fail('type');
      if(typeof out.amount!=='string'||typeof out.interest!=='string') fail('type');
      fields={amount_exact:out.amount_exact,interest_exact:out.interest_exact,amount:out.amount,interest:out.interest};
      proofs.push(proof);
      if(v.timeline) series.push([String(i),out.amount_exact]);
    }
    return {value:fields.amount_exact!,unit:v.currency,display:fields.amount,exactness:'exact',fields,proofs,...(v.timeline?{series}:{})};
  }
  if(cell.kind==='table') {
    const v=readJson(cell.source,notebookLimits.source);
    if(!validTable(v) || !v.length || !v[0]?.length || v.some(row=>row.length!==v[0]!.length)) fail('type');
    const table=v.map(row=>row.map(s=>s.startsWith('@')?refOutput(s,records).value:s));
    return {value:String(table.length),unit:'table',table};
  }
  const out=refOutput(cell.source.trim(),records);
  if(cell.kind==='result') return {value:out.value,unit:out.unit,display:out.display,exactness:out.exactness,
    ...(out.fields?{fields:out.fields}:{}), ...(out.proofs?.length?{proofs:out.proofs.slice(-1)}:{}), ...(out.formula?{formula:out.formula}:{})};
  if(cell.kind==='chart') return {value:out.value,unit:out.unit,series:validateSeries(out.series??out.table?.slice(1)??[])};
  if(!out.proofs?.length) fail('type');
  return {value:out.value,unit:out.unit,exactness:out.exactness,proofs:[out.proofs[out.proofs.length-1]!],...(out.formula?{formula:out.formula}:{})};
}

const errors=new Set(['invalid_input','duplicate_variable','missing','cycle','blocked','type','unit','domain',
  'limit','resource_budget','unsupported','cancelled','timed_out','failed','no_convergence','unknown_formula','unverified_formula']);
export function notebookError(value:unknown) {
  const code=value instanceof Error?value.message:String(value);
  return errors.has(code)?code:'invalid_input';
}
/** Recalculation is transactional. All engine calls go through the bounded per-activation dispatcher. */
export async function runNotebook(document:NotebookDocument,prior:Records,changed:readonly string[],services:NotebookServices,
  signal:AbortSignal,budget:number,progress?:(done:number,total:number)=>void):Promise<NotebookLedger> {
  const plan=planNotebook(document.cells);
  const cap=Math.min(notebookLimits.fileBytes,Math.floor(budget/8));
  let bytes=sizeOf(document)+sizeOf(prior), calls=0, temporaryProofBytes=0;
  const started=performance.now();
  const ensure=()=>{ if(signal.aborted) fail('cancelled'); if(performance.now()-started>45000) fail('timed_out'); if(bytes>cap) fail('resource_budget'); };
  const call:Run=async(request,callSignal)=>{
    ensure(); if(++calls>notebookLimits.calls) fail('limit');
    const proof=await services.run(request,callSignal??signal);
    temporaryProofBytes+=sizeOf(proof);
    if(bytes+temporaryProofBytes>cap) fail('resource_budget');
    ensure(); return proof;
  };
  const records:Records=Object.create(null),localErrors:Record<string,string>=Object.create(null),executed:string[]=[];
  const changedIds=changed.filter(id);
  for(const [index,key] of plan.order.entries()) {
    ensure();
    const cell=plan.byId.get(key)!,deps=plan.dependencies.get(key)!;
    const issue=plan.errors.get(key)??(deps.some(k=>!records[k])?'blocked':undefined);
    if(issue) localErrors[key]=issue;
    else if(prior[key]) records[key]=prior[key]!;
    else {
      try {
        const output=await evaluate(cell,records,call,services.formula,signal);
        const inputs=Object.fromEntries(deps.map(k=>[k,{value:records[k]!.output.value,unit:records[k]!.output.unit}]));
        const entry:NotebookRecord={cell:key,dependencies:deps,changed:changedIds,operation:cell.kind,source:cell.source,origin:cell.origin,inputs,output};
        records[key]=entry; executed.push(key);
      } catch(e) {
        const code=notebookError(e);
        if(signal.aborted || ['cancelled','resource_budget','timed_out'].includes(code)) throw e;
        localErrors[key]=code;
      }
    }
    if(records[key] && !prior[key]) bytes+=sizeOf(records[key]);
    temporaryProofBytes=0;
    ensure(); progress?.(index+1,plan.order.length);
  }
  return {records,errors:localErrors,executed,calls};
}
