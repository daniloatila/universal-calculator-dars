import { hasUniqueKeys, parseCalculationProof } from './calculation-proof.ts';
import type { CalculationProof } from './calculation-proof.ts';
import { isLocale, type Locale } from './i18n.ts';
import { localizedDecimal } from './locale-format.ts';

export const notebookKinds = ['heading', 'text', 'variable', 'expression', 'formula', 'scientific', 'financial', 'table', 'chart', 'result', 'proof'] as const;
export type NotebookKind = typeof notebookKinds[number];
export interface NotebookCell {
  id: string;
  kind: NotebookKind;
  title: string;
  source: string;
  origin: Locale;
  unit: string;
  symbol?: string;
}
export interface NotebookDocument {
  format: 'dars-notebook';
  version: 1;
  title: string;
  cells: NotebookCell[];
  formulaDefinitions?: unknown[];
}
export interface NotebookOutput {
  value: string;
  unit: string;
  display?: string;
  exactness?: CalculationProof['exactness'];
  fields?: Record<string, string>;
  table?: string[][];
  series?: string[][];
  proofs?: CalculationProof[];
  formula?: { id: string; version: string; receipt: unknown };
}
export interface NotebookRecord {
  cell: string;
  dependencies: string[];
  changed: string[];
  operation: NotebookKind;
  source: string;
  origin: Locale;
  inputs: Record<string, { value: string; unit: string }>;
  output: NotebookOutput;
}
export type Records = Record<string, NotebookRecord>;
export const notebookLimits = { fileBytes: 2 * 1024 * 1024, cells: 128, source: 4096, edges: 512, calls: 256, depth: 32, tableRows: 128, tableColumns: 12, historyBytes: 1024 * 1024 };
const encoder = new TextEncoder();
export function sizeOf(value: unknown) { return encoder.encode(JSON.stringify(value)).byteLength; }
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function id(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/u.test(value) && !['constructor','prototype','__proto__'].includes(value);
}
export function text(value: unknown, cap: number): value is string {
  return typeof value === 'string' && value.length <= cap && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}
export function hasKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every(k => keys.includes(k));
}
export function fail(code: string): never { throw new Error(code); }

/** Bound structural depth and reject ambiguous duplicate names before interpreting any document. */
export function readJson(source: string, maximum: number): unknown {
  if (source.length > maximum || encoder.encode(source).length > maximum) fail('limit');
  try {
    if (!hasUniqueKeys(source,notebookLimits.depth)) fail('invalid_input');
    return JSON.parse(source,(key,value:unknown)=>{
      if(['__proto__','constructor','prototype'].includes(key)) fail('invalid_input');
      return value;
    }) as unknown;
  } catch { return fail('invalid_input'); }
}

function checkedCell(v: unknown, draft: boolean): NotebookCell {
  if (!object(v) || !hasKeys(v, draft ? ['id','kind','title','source','unit','symbol'] : ['id','kind','title','source','unit','symbol','origin']) ||
      !id(v.id) || !notebookKinds.some(k => k === v.kind) || !text(v.title, 120) || !text(v.source, notebookLimits.source) ||
      !text(v.unit, 40) || !/^[A-Za-z0-9%/^*_.-]{0,40}$/u.test(v.unit) ||
      (v.kind === 'variable' ? !id(v.symbol) : v.symbol !== undefined) ||
      (!draft && (typeof v.origin !== 'string' || !isLocale(v.origin)))) fail('invalid_input');
  return { id: v.id, kind: v.kind as NotebookKind, title: v.title, source: v.source, unit: v.unit,
    origin: draft ? 'en' : v.origin as Locale, ...(v.kind === 'variable' ? {symbol:v.symbol as string} : {}) };
}
export function validTable(value: unknown): value is string[][] {
  return Array.isArray(value) && value.length <= notebookLimits.tableRows && value.every(row =>
    Array.isArray(row) && row.length <= notebookLimits.tableColumns && row.every(field => text(field, 4096)));
}
function validRecord(v: unknown, cellId: string): v is NotebookRecord {
  if (!object(v) || !hasKeys(v,['cell','dependencies','changed','operation','source','origin','inputs','output']) ||
      v.cell !== cellId || !notebookKinds.some(k => k === v.operation) || !text(v.source, notebookLimits.source) ||
      typeof v.origin !== 'string' || !isLocale(v.origin) || !object(v.inputs) || !object(v.output)) return false;
  if (![v.dependencies,v.changed].every(list => Array.isArray(list) && list.length <= notebookLimits.cells && list.every(id)) ||
      Object.entries(v.inputs).some(([k,s])=> !id(k) || !object(s) || !hasKeys(s,['value','unit']) || !text(s.value,8192) || !text(s.unit,40))) return false;
  const o=v.output;
  return hasKeys(o,['value','unit','display','exactness','fields','table','series','proofs','formula']) && text(o.value,32768) && text(o.unit,40) &&
    (o.display===undefined || text(o.display,4096)) && (o.exactness===undefined || ['exact','approximate','symbolic'].includes(String(o.exactness))) &&
    (!Object.hasOwn(o,'fields') || (object(o.fields) && Object.entries(o.fields).every(([k,a]) => id(k) && text(a,4096)))) &&
    (!Object.hasOwn(o,'table') || validTable(o.table)) && (!Object.hasOwn(o,'series') || validTable(o.series)) &&
    (!Object.hasOwn(o,'proofs') || (Array.isArray(o.proofs) && o.proofs.length <= notebookLimits.tableRows && o.proofs.every(p => !!parseCalculationProof(p)))) &&
    (!Object.hasOwn(o,'formula') || (object(o.formula) && hasKeys(o.formula,['id','version','receipt']) &&
      text(o.formula.id,80) && text(o.formula.version,32) && object(o.formula.receipt)));
}
export function openNotebook(source: string): { document: NotebookDocument; historical: Records; migrated: boolean } {
  const value=readJson(source,notebookLimits.fileBytes);
  if (!object(value) || value.format !== 'dars-notebook') fail('invalid_input');
  if (value.version !== 1 && value.version !== 0) fail('unsupported');
  const draft=value.version===0;
  if (!hasKeys(value, draft ? ['format','version','title','cells','notation'] : ['format','version','title','cells','history','formulaDefinitions']) ||
      !text(value.title,120) || !Array.isArray(value.cells) || value.cells.length > notebookLimits.cells ||
      (draft && value.notation !== 'ascii-point')) fail('invalid_input');
  const cells=value.cells.map(c=>checkedCell(c,draft));
  if (new Set(cells.map(c=>c.id)).size!==cells.length) fail('duplicate_id');
  const historical: Records=Object.create(null);
  if (value.history!==undefined) {
    if (!object(value.history) || Object.keys(value.history).length>cells.length) fail('invalid_input');
    for(const [key,entry] of Object.entries(value.history)) {
      if (!cells.some(c=>c.id===key) || !validRecord(entry,key)) fail('invalid_input');
      historical[key]=entry;
    }
  }
  const defs=value.formulaDefinitions;
  if(defs!==undefined && (!Array.isArray(defs) || defs.length>16 || !defs.every(object) || sizeOf(defs)>128*1024)) fail('invalid_input');
  return {document:{format:'dars-notebook',version:1,title:value.title,cells,...(defs?{formulaDefinitions:defs as unknown[]}:{})},historical,migrated:draft};
}
/** Bundle pinned definitions from locally executed receipts only, in dependency order. */
export function saveNotebook(document:NotebookDocument, records:Records, verified:Records={}) {
  const definitions=new Map<string,unknown>();
  function add(definition:unknown) {
    if(!object(definition)||typeof definition.id!=='string'||typeof definition.version!=='string') fail('invalid_input');
    const key=definition.id+'@'+definition.version;
    if(definitions.has(key)&&JSON.stringify(definitions.get(key))!==JSON.stringify(definition)) fail('invalid_input');
    definitions.set(key,definition);
    if(definitions.size>16) fail('limit');
  }
  for(const def of document.formulaDefinitions??[]) add(def);
  function fromReceipt(value:unknown,depth:number) {
    if(depth>16||!object(value)||!Array.isArray(value.dependencies)) fail('invalid_input');
    for(const dep of value.dependencies) fromReceipt(dep,depth+1);
    add(value.definition);
  }
  for(const record of Object.values(verified)) if(record.output.formula) fromReceipt(record.output.formula.receipt,0);
  const payload={...document,...(definitions.size?{formulaDefinitions:[...definitions.values()]}:{}),history:records};
  if(sizeOf(payload)>notebookLimits.fileBytes) fail('limit');
  const content=JSON.stringify(payload)+'\n';
  openNotebook(content);
  return content;
}

export function refs(cell:NotebookCell):string[] {
  if (['text','heading','variable'].includes(cell.kind)) return [];
  if (['table','formula','financial'].includes(cell.kind)) {
    let parameters:unknown[]=[];
    try {
      const data=readJson(cell.source,notebookLimits.source);
      if(cell.kind==='table' && validTable(data)) parameters=data.flat();
      if(cell.kind==='formula' && object(data) && object(data.inputs)) parameters=Object.values(data.inputs);
      if(cell.kind==='financial' && object(data)) parameters=[data.principal,data.rate,data.periods];
    } catch { return []; } // The evaluator reports a malformed cell without blocking document editing.
    return [...new Set(parameters.flatMap(v=>typeof v==='string'?(/^@([a-z][a-z0-9_]*)(?:\.[a-z][a-z0-9_]*)?$/u.exec(v)?.[1]??[]):[]))];
  }
  return [...new Set(Array.from(cell.source.matchAll(/@([a-z][a-z0-9_]*)/gu),m=>m[1]!))];
}
/** Plan every component independently so a cycle cannot block an unrelated valid cell. */
export function planNotebook(cells:NotebookCell[]) {
  const errors=new Map<string,string>(), order:string[]=[], dependencies=new Map<string,string[]>();
  const byId=new Map(cells.map(c=>[c.id,c]));
  if (byId.size!==cells.length || cells.length>notebookLimits.cells) fail('limit');
  const symbols=new Map<string,string>(), active=new Set<string>(), finished=new Set<string>();
  let edges=0;
  for(const cell of cells) {
    const keys=refs(cell); edges+=keys.length;
    if (edges>notebookLimits.edges) fail('limit');
    dependencies.set(cell.id,keys);
    if(cell.kind==='variable') {
      if(!id(cell.symbol)) errors.set(cell.id,'invalid_input');
      else if(symbols.has(cell.symbol)) { errors.set(cell.id,'duplicate_variable'); errors.set(symbols.get(cell.symbol)!,'duplicate_variable'); }
      else symbols.set(cell.symbol,cell.id);
    }
  }
  function visit(key:string,path:string[]) {
    if(finished.has(key)) return;
    if(active.has(key)) { for(const k of path.slice(path.indexOf(key))) errors.set(k,'cycle'); return; }
    if(path.length>=notebookLimits.depth) fail('limit');
    active.add(key);
    for(const other of dependencies.get(key)??[]) {
      if(!byId.has(other)) errors.set(key,'missing');
      else visit(other,[...path,key]);
    }
    active.delete(key); finished.add(key); order.push(key);
  }
  for(const c of cells) visit(c.id,[]);
  return {order,dependencies,errors,byId};
}
export function dirtyCells(before:NotebookDocument,after:NotebookDocument) {
  const old=new Map(before.cells.map(c=>[c.id,c]));
  const dirty=new Set<string>(before.cells.filter(c=>!after.cells.some(v=>v.id===c.id)).map(c=>c.id));
  const changedLibrary=JSON.stringify(before.formulaDefinitions)!==JSON.stringify(after.formulaDefinitions);
  const a=planNotebook(before.cells), b=planNotebook(after.cells);
  for(const c of after.cells) {
    if(JSON.stringify(c)!==JSON.stringify(old.get(c.id)) || a.errors.get(c.id)!==b.errors.get(c.id) || (c.kind==='formula' && changedLibrary)) dirty.add(c.id);
  }
  for(const key of b.order) if(b.dependencies.get(key)?.some(k=>dirty.has(k))) dirty.add(key);
  return dirty;
}

export function newCell(kind:NotebookKind, cells:NotebookCell[], locale:Locale):NotebookCell {
  const existing=new Set(cells.map(c=>c.id));
  let n=1; while(existing.has('cell_'+n)) n++;
  const key='cell_'+n;
  const defaults:Record<NotebookKind,string>={
    heading:'',text:'',variable:'0',expression:'2+2',scientific:'sqrt(9)',formula:'{"id":"arithmetic-mean","version":"1.0.0","inputs":{"a":"@a","b":"@b"}}',
    financial:'{"principal":"@capital","rate":"@rate","periods":"@months","currency":"BRL","timeline":false}',
    table:'[["x","y"],["0","0"],["1","1"]]',chart:'@table',result:'@growth.interest_exact',proof:'@growth',
  };
  return {id:key,kind,title:'',source:defaults[kind],origin:locale,unit:'1',...(kind==='variable'?{symbol:key}:{})};
}
export function financialNotebook(locale:Locale,titles:readonly string[]):NotebookDocument {
  const cell=(id:string,kind:NotebookKind,title:string,source:string,unit='1'):NotebookCell=>
    ({id,kind,title,source,origin:'en',unit,...(kind==='variable'?{symbol:id}:{})});
  return {format:'dars-notebook',version:1,title:titles[0]!,cells:[
    cell('capital','variable',titles[1]!,'10000','BRL'),cell('rate','variable',titles[2]!,'0.01','rate/month'),
    cell('months','variable',titles[3]!,'12','month'),
    cell('growth','financial',titles[4]!,'{"principal":"@capital","rate":"@rate","periods":"@months","currency":"BRL","timeline":true}'),
    cell('gain','result',titles[5]!,'@growth.interest_exact'),cell('trajectory','chart',titles[6]!,'@growth'),cell('verification','proof',titles[7]!,'@growth'),
  ].map(c => ({...c, origin:locale, source:c.kind==='variable'?c.source.replace('.',localizedDecimal(locale)):c.source}))};
}
