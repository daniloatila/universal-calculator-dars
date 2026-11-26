import { useEffect, useMemo, useRef, useState } from 'react';
import { createCapabilitySession } from './capability-session';
import { proofLabels } from './calculation-proof-labels';
import { formulaLabels } from './formula-labels';
import { FORMULA_FILE_BYTES, formulaBytes } from './formula-definition';
import { communityFormulas, decodeFormula, formulaLibrary } from './formula-library';
import type { FormulaDefinition, FormulaInputs, FormulaResult, FormulaTestResult } from './formula-library';
import { editLocalizedDraft, localizedDecimal, localizeExpression, normalizeExpression } from './locale-format';
import type { LocalizedDraft } from './locale-format';
import type { Locale } from './i18n';
import InputNotation from './input-notation';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import './formula-studio.css';

export type FormulaState = { source: string; expression: LocalizedDraft; inputs: Record<string,LocalizedDraft> };
const format=(value:unknown)=>JSON.stringify(value,null,2);
function openDefinition(def:FormulaDefinition,locale:Locale):FormulaState {
  const notation=localizedDecimal(locale);
  return {source:format(def),expression:{text:localizeExpression(def.expression,notation),locale},
    inputs:Object.fromEntries(def.parameters.map(p=>[p.name,{text:localizeExpression(p.default??'',notation),locale}]))};
}
function save(name:string,content:string) {
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const link=document.createElement('a');
  link.download=name; link.href=url; document.body.append(link);
  try {link.click();} finally {link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);}
}
const labelsForBuiltins:Record<string,'rectangle'|'interest'|'mean'|'speed'>={
  'rectangle-area':'rectangle','simple-interest':'interest','arithmetic-mean':'mean','constant-speed':'speed',
};
export function activate(scope:ModuleActivation<FormulaState>):PrimaryModule<FormulaState> {
  const session=createCapabilitySession(scope);
  const evaluate=(input:string,signal?:AbortSignal)=>session.run({schema:1,module:'standard',operation:'evaluate',input,options:{}},signal);
  let retained=scope.previousState;
  function Workspace({locale,messages,recordInteraction}:ModuleWorkspaceProps) {
    const t=formulaLabels[locale];
    const [draft,setDraft]=useState<FormulaState>(()=>retained??openDefinition(communityFormulas[0]!,locale));
    const [query,setQuery]=useState('');
    const [checks,setChecks]=useState<FormulaTestResult[]>();
    const [result,setResult]=useState<FormulaResult>();
    const [error,setError]=useState('');
    const [busy,setBusy]=useState(false);
    const [listVersion,refresh]=useState(0);
    const active=useRef<AbortController|undefined>(undefined);
    const picker=useRef<HTMLInputElement>(null);
    const tick=useRef(0);
    retained=draft;
    useEffect(()=>()=>{tick.current++;active.current?.abort();},[]);
    const definition=useMemo(()=>{try{return decodeFormula(draft.source);}catch{return undefined;}},[draft.source]);
    const wire=useMemo(()=>{
      try {const v=JSON.parse(draft.source); return v&&typeof v==='object'&&!Array.isArray(v)?v:undefined;} catch{return undefined;}
    },[draft.source]);
    const pins=useMemo(()=>formulaLibrary.list(),[listVersion]);
    function change(next:FormulaState) {
      tick.current++; active.current?.abort(); active.current=undefined;
      setBusy(false);setChecks(undefined);setResult(undefined);setError('');retained=next;setDraft(next);
    }
    function patch(key:string,value:string) {
      if (wire) change({...draft,source:format({...wire,[key]:value})});
    }
    function select(def:FormulaDefinition) { change(openDefinition(def,locale)); }
    function unusedId(base:string) {
      const ids=new Set(formulaLibrary.list().map(f=>f.id));
      if (!ids.has(base)) return base;
      for(let i=2;i<=66;i++) if (!ids.has(base+'-'+i)) return base+'-'+i;
      throw new Error('complexity');
    }
    function create() {
      select({schema:1,kind:'dars-formula',id:unusedId('custom'),version:'1.0.0',name:t.newName,description:t.newDescription,
        category:'custom',expression:'x * 2',domain:'real',unit:'1',parameters:[{name:'x',type:'rational',unit:'1',default:'1'}],
        dependencies:[],references:[],author:'Local',license:'All rights reserved',
        tests:[{name:'x = 1',inputs:{},expected:'2',unit:'1'}]});
    }
    async function upload(file?:File) {
      if (!file) return;
      const revision=++tick.current;active.current?.abort();active.current=undefined;setBusy(false);
      try {
        if (file.size>FORMULA_FILE_BYTES) throw new Error('complexity');
        const decoded=decodeFormula(await file.text());
        if(revision===tick.current) select(decoded);
      } catch (err) { if(revision===tick.current) setError(err instanceof Error?err.message:'schema'); }
    }
    async function perform(verify:boolean) {
      const revision=++tick.current;
      active.current?.abort(); const controller=new AbortController();active.current=controller;
      setError('');setChecks(undefined);setResult(undefined);setBusy(true);
      const start=performance.now();
      try {
        const f=decodeFormula(draft.source);
        const validations=await formulaLibrary.verifyAndAdd(f,evaluate,controller.signal);
        if (tick.current!==revision) return;
        setChecks(validations);refresh(n=>n+1);
        if (!verify) {
          const inputs:FormulaInputs={};
          for (const p of f.parameters) {
            const d=draft.inputs[p.name];
            if (d?.text.trim()) inputs[p.name]={value:normalizeExpression(d.text.trim(),localizedDecimal(d.locale)),unit:p.unit};
          }
          const calculated=await formulaLibrary.execute(f.id,f.version,inputs,evaluate,controller.signal);
          calculated.receipt.source_notation={expression:{...draft.expression},inputs:Object.fromEntries(
            f.parameters.filter(p=>draft.inputs[p.name]?.text.trim()).map(p=>[p.name,{...draft.inputs[p.name]!}]))};
          if (tick.current===revision) setResult(calculated);
        }
        if (tick.current===revision) recordInteraction(performance.now()-start);
      } catch(err) { if (tick.current===revision) setError(err instanceof Error?err.message:'failure'); }
      finally {if (tick.current===revision) {active.current=undefined;setBusy(false);}}
    }
    const displayName=(f:{id:string;name:string;version:string})=>f.version==='1.0.0'&&Object.hasOwn(labelsForBuiltins,f.id)?t[labelsForBuiltins[f.id]!]:f.name;
    const filtered=pins.filter(f=>[f.id,f.name,f.category,displayName(f)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
    return <section className="formula-studio" aria-label={t.title}>
      <aside className="formula-library-panel" aria-label={t.libraryTitle}>
        <div className="formula-heading"><h2>{t.library}</h2><button type="button" onClick={create}>{t.create}</button></div>
        <label>{t.search}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} maxLength={100}/></label>
        <div className="formula-cards">{filtered.map(f=><button key={f.id+'@'+f.version} type="button"
          data-testid={'formula-pick-'+f.id+'-'+f.version} aria-pressed={wire?.id===f.id&&wire?.version===f.version}
          onClick={()=>{const entry=formulaLibrary.resolve(f.id,f.version);if(entry) select(entry);}}>
          <strong>{displayName(f)}</strong><small><bdi>{f.id} · {f.version}</bdi></small>
        </button>)}{!filtered.length&&<p>{t.empty}</p>}</div>
        <button type="button" onClick={()=>picker.current?.click()}>{t.importFile}</button>
        <input ref={picker} type="file" hidden data-testid="formula-file" accept=".darsformula,.json" onChange={e=>{
          void upload(e.target.files?.[0]);e.target.value='';
        }}/>
      </aside>
      <div className="formula-editor-panel">
        <div className="formula-heading"><h2>{definition?displayName(definition):t.details}</h2>
          <span className="formula-status" data-testid="formula-state">{busy?t.busy:checks?t.verified:t.draft}</span></div>
        {wire&&<>
          <div className="formula-meta">
            {(['name','id','version','category'] as const).map(field=><label key={field}>{t[field]}<input
              value={typeof wire[field]==='string'?wire[field]:''} onChange={e=>patch(field,e.target.value)} maxLength={120}/></label>)}
          </div>
          <label>{t.expression}<input dir="ltr" autoComplete="off" spellCheck={false} data-testid="formula-expression"
            value={draft.expression.text} maxLength={768} onChange={e=>{
              const expression=editLocalizedDraft(draft.expression,e.target.value,locale);
              change({...draft,expression,source:format({...wire,expression:normalizeExpression(expression.text,localizedDecimal(expression.locale))})});
            }}/></label>
          <InputNotation origin={draft.expression.locale} locale={locale} messages={messages} id="formula-notation"/>
        </>}
        <details><summary>{t.definition}</summary>
          <textarea dir="ltr" data-testid="formula-definition" aria-label={t.definition} spellCheck={false}
            maxLength={FORMULA_FILE_BYTES} value={draft.source} onChange={e=>{
              const source=e.target.value;if(formulaBytes(source)>FORMULA_FILE_BYTES)return;
              let expression=draft.expression;
              try {const s=JSON.parse(source);if(typeof s?.expression==='string')expression={text:localizeExpression(s.expression,localizedDecimal(locale)),locale};} catch { /* keep the last expression while JSON is incomplete */ }
              change({...draft,source,expression});
            }}/>
        </details>
        {definition&&<div className="formula-tools">
          <button type="button" onClick={()=>select({...definition,id:unusedId(definition.id.slice(0,35)+'-copy'),version:'1.0.0'})}>{t.duplicate}</button>
          <button type="button" onClick={()=>{
            const parts=definition.version.split('.');let patch=Number(parts[2])+1;
            while (formulaLibrary.resolve(definition.id,[parts[0],parts[1],patch].join('.'))) patch++;
            if(patch>999999){setError('complexity');return;} select({...definition,version:[parts[0],parts[1],patch].join('.')});
          }}>{t.bump}</button>
          <button type="button" onClick={()=>save(definition.id+'-'+definition.version+'.darsformula',format(definition))}>{t.exportFile}</button></div>}
        {definition&&<fieldset><legend>{t.inputs}</legend><div className="formula-meta">{definition.parameters.map(p=>{
          const d=draft.inputs[p.name];
          return <label key={p.name}><bdi>{p.name} · {p.unit}</bdi><input dir="ltr" inputMode="text" data-testid={'formula-input-'+p.name}
            value={d?.text??''} placeholder={localizeExpression(p.default??'',localizedDecimal(locale))} maxLength={160}
            onChange={e=>change({...draft,inputs:{...draft.inputs,[p.name]:editLocalizedDraft(d,e.target.value,locale)}})}/>
            <InputNotation origin={d?.locale} locale={locale} messages={messages} id={'formula-notation-'+p.name}/></label>;
        })}</div></fieldset>}
        <div className="formula-tools">
          <button type="button" onClick={()=>void perform(true)} disabled={busy||!definition} data-testid="formula-verify">{t.verify}</button>
          <button type="button" className="formula-run" onClick={()=>void perform(false)} disabled={busy||!definition} data-testid="formula-run">{t.run}</button>
          {busy&&<button type="button" onClick={()=>{tick.current++;active.current?.abort();setBusy(false);setError('cancelled');}}>{t.cancel}</button>}
        </div>
        {(!definition||error)&&<p role="alert">{t.failure}. {t.hint} <bdi>{error||'schema'}</bdi></p>}
        {checks&&<details><summary>{t.tests} ({checks.length})</summary><ul>{checks.map(row=><li key={row.name}>{row.name} · <bdi>{row.observed} {row.unit}</bdi></li>)}</ul></details>}
        {result&&<section className="formula-output" aria-label={t.result}>
          <strong data-testid="formula-result" data-value={result.value} data-unit={result.unit}><bdi>{result.value} {result.unit==='1'?'':result.unit}</bdi></strong>
          <button type="button" onClick={()=>save(result.receipt.definition.id+'.formula-run.json',format(result.receipt))}>{t.exportRun}</button>
          <details className="formula-proof"><summary>{proofLabels[locale].title}</summary>
            <p><bdi>{result.receipt.definition.id} · {result.receipt.definition.version}</bdi></p>
            <pre dir="ltr" data-testid="formula-proof-record">{format(result.receipt)}</pre>
          </details>
        </section>}
      </div>
    </section>;
  }
  return {Workspace,snapshot:()=>retained??openDefinition(communityFormulas[0]!,'en'),setPolicy:session.setPolicy,getResources:session.getResources,dispose:session.dispose};
}
