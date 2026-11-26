import { useEffect, useRef, useState } from 'react';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { createCapabilitySession } from './capability-session';
import { CalculationProofPanel } from './calculation-proof-panel';
import InputNotation from './input-notation';
import { LOCALES } from './i18n';
import { numberPresentation } from './locale-format';
import { proofLabels } from './calculation-proof-labels';
import { notebookLabels } from './notebook-labels';
import {
  dirtyCells, financialNotebook, id, newCell, notebookKinds, notebookLimits, openNotebook, saveNotebook, sizeOf,
  type NotebookCell, type NotebookDocument, type NotebookKind, type NotebookOutput, type NotebookRecord, type Records,
} from './notebook-document';
import { notebookError, runNotebook, type NotebookLedger, type FormulaRunner } from './notebook-engine';
import './math-notebook.css';

export type NotebookState={document:NotebookDocument; historical:Records; selected:string};
const blank=():NotebookDocument=>({format:'dars-notebook',version:1,title:'',cells:[]});
const empty=():NotebookLedger=>({records:Object.create(null),errors:Object.create(null),executed:[],calls:0});
const allowedUnits=/^[A-Za-z0-9%/^*_.-]{0,40}$/u;
function download(content:string) {
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download='notebook.darsnb';
  try {document.body.append(a); a.click();} finally {a.remove(); setTimeout(()=>URL.revokeObjectURL(url),0);}
}
function chartNumber(raw:string) {
  const [n,d]=raw.split('/');
  return Number(n)/(d===undefined?1:Number(d));
}
function DataTable({rows,header=false}:{rows:string[][];header?:boolean}) {
  return <div className="notebook-table-scroll"><table><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=>header&&i===0?
    <th key={j} scope="col"><bdi>{v}</bdi></th>:<td key={j}><bdi>{v}</bdi></td>)}</tr>)}</tbody></table></div>;
}
function Plot({rows,label}:{rows:string[][];label:string}) {
  // Numeric projection is display-only. The adjacent table uses the original exact Rust strings.
  const points=rows.map(r=>({x:chartNumber(r[0]!), y:chartNumber(r[1]!)}));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),lx=Math.min(...xs),hx=Math.max(...xs),ly=Math.min(...ys),hy=Math.max(...ys);
  const visual=points.length>0 && points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)) && Number.isFinite(hx-lx) && Number.isFinite(hy-ly);
  return <>{visual&&<svg viewBox="0 0 440 118" role="img" aria-label={label} className="notebook-chart">
    {[14,54,94].map(y=><line key={y} x1="12" y1={y} x2="428" y2={y}/>)}
    <polyline points={points.map(p=>`${12+416*(p.x-lx)/(hx-lx||1)},${100-86*(p.y-ly)/(hy-ly||1)}`).join(' ')}/>
  </svg>}
    <details><summary>{label}</summary><DataTable rows={rows}/></details></>;
}
function Formatted({source}:{source:string}) {
  return <>{source.split('\n').map((p,i)=><p key={i}>{p.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/gu).map((v,j)=>
    v.startsWith('**')&&v.endsWith('**')?<strong key={j}>{v.slice(2,-2)}</strong>:
    v.startsWith('`')&&v.endsWith('`')?<code key={j}>{v.slice(1,-1)}</code>:
    v.startsWith('*')&&v.endsWith('*')?<em key={j}>{v.slice(1,-1)}</em>:v)}</p>)}</>;
}
function CellValue({cell,out,locale,labels}:{cell:NotebookCell;out:NotebookOutput;locale:ModuleWorkspaceProps['locale'];labels:typeof notebookLabels.en}) {
  if(cell.kind==='heading') return <h3>{cell.source}</h3>;
  if(cell.kind==='text') return <Formatted source={cell.source}/>;
  if(cell.kind==='table' && out.table) return <DataTable rows={out.table} header/>;
  if(cell.kind==='chart' && out.series) return <Plot rows={out.series} label={cell.title||labels.kinds.chart}/>;
  if(cell.kind==='proof' && out.proofs?.length) return <CalculationProofPanel proof={out.proofs.at(-1)} locale={locale}/>;
  const format=numberPresentation(LOCALES[locale].format).format;
  return <div className="notebook-answer"><output data-canonical={out.value} data-testid={'notebook-result-'+cell.id}><bdi>{format(out.display??out.value)}</bdi></output>
    {out.unit!=='1'&&<small><bdi>{out.unit}</bdi></small>}
    {out.exactness==='approximate'&&<small>{proofLabels[locale].exactness.approximate}</small>}</div>;
}
function RecordDetails({record,labels:l}:{record:NotebookRecord;labels:typeof notebookLabels.en}) {
  const [open,setOpen]=useState(false);
  return <details data-notebook-details onToggle={e=>setOpen(e.currentTarget.open)}><summary>{l.details}</summary>{open&&<>
    <dl><dt>{l.dependencies}</dt><dd><bdi>{record.dependencies.join(', ')||'—'}</bdi></dd>
      <dt>{l.sourceLocale}</dt><dd>{LOCALES[record.origin].name}</dd>{record.output.formula&&<><dt>{l.pinned}</dt>
        <dd><bdi>{record.output.formula.id}@{record.output.formula.version}</bdi></dd></>}</dl>
    <pre dir="ltr">{JSON.stringify(record,null,2)}</pre></>}</details>;
}
export function activate(scope:ModuleActivation<NotebookState>):PrimaryModule<NotebookState> {
  const session=createCapabilitySession(scope);
  let retained=scope.previousState, limit=32*1024*1024;
  let active:AbortController|undefined;
  function Workspace({locale,messages,recordInteraction}:ModuleWorkspaceProps) {
    const l=notebookLabels[locale];
    const [doc,setDoc]=useState<NotebookDocument>(()=>retained?.document??financialNotebook(locale,l.sampleNames));
    const [history,setHistory]=useState<Records>(()=>retained?.historical??Object.create(null));
    const [selected,select]=useState(retained?.selected??doc.cells[0]?.id??'');
    const [editor,setEditor]=useState<NotebookCell|undefined>();
    const [adding,setAdding]=useState<NotebookKind>('expression');
    const [ledger,setLedger]=useState<NotebookLedger>(empty);
    const [changed,setChanged]=useState<string[]>(()=>doc.cells.map(c=>c.id));
    const [stale,setStale]=useState<Set<string>>(new Set());
    const [consent,setConsent]=useState(false);
    const [needsConsent,setNeedsConsent]=useState(!!retained);
    const [message,setMessage]=useState('');
    const [migrated,setMigrated]=useState(false);
    const [progress,setProgress]=useState<[number,number]|undefined>();
    const undo=useRef<NotebookDocument[]>([]), redo=useRef<NotebookDocument[]>([]);
    const revision=useRef(0),fileRevision=useRef(0), file=useRef<HTMLInputElement>(null), formulaFile=useRef<HTMLInputElement>(null);
    const selectedCell=doc.cells.find(c=>c.id===selected);
    retained={document:doc,historical:{...history,...ledger.records},selected};
    function cancel() {
      revision.current++; active?.abort(); active=undefined; setProgress(undefined);
    }
    useEffect(()=>()=>{fileRevision.current++;revision.current++;active?.abort();},[]);
    function boundedPush(stack:NotebookDocument[],value:NotebookDocument) {
      stack.push(value); let total=stack.reduce((n,d)=>n+sizeOf(d),0);
      while(stack.length>24 || total>notebookLimits.historyBytes) {const removed=stack.shift(); if(!removed) break; total-=sizeOf(removed);}
    }
    function errorText(code:string) {return l.errors[code as keyof typeof l.errors]??l.errors.invalid_input;}
    async function calculate(document:NotebookDocument,prior:Records,edited:string[]) {
      cancel(); setMessage(''); setNeedsConsent(false); setConsent(true);
      const token=revision.current;const controller=new AbortController();active=controller;
      setProgress([0,document.cells.length]);const started=performance.now();
      let expired=false;
      const timer=setTimeout(()=>{expired=true;controller.abort();},45_000);
      try {
        let library:import('./formula-library').FormulaLibrary|undefined;
        const formula:FormulaRunner=async(name,version,values,evaluate,signal)=>{
          const api=await import('./formula-library');
          if(!document.formulaDefinitions?.length) return api.executeFormula(name,version,values,evaluate,signal);
          if(!library) {
            library=new api.FormulaLibrary();
            for(const definition of document.formulaDefinitions) {
              if(controller.signal.aborted) throw new Error('cancelled');
              await library.verifyAndAdd(definition,evaluate,controller.signal);
            }
          }
          return library.execute(name,version,values,evaluate,signal);
        };
        const fresh=await runNotebook(document,prior,edited,{run:session.run,formula},controller.signal,limit,
          (n,total)=>{if(token===revision.current) setProgress([n,total]);});
        if(token!==revision.current) return;
        setLedger(fresh);setChanged([]);setStale(new Set());setHistory(Object.create(null));recordInteraction(performance.now()-started);
      } catch(e) {if(token===revision.current) setMessage(expired?'timed_out':notebookError(e));}
      finally {clearTimeout(timer);if(token===revision.current){active=undefined;setProgress(undefined);}}
    }
    function update(next:NotebookDocument,remember=true,auto=true) {
      if(sizeOf(next)>notebookLimits.historyBytes) {setMessage('resource_budget');return;}
      let dirty:Set<string>;
      try {dirty=dirtyCells(doc,next);} catch(e) {setMessage(notebookError(e));return;}
      fileRevision.current++; cancel();setMessage('');setMigrated(false);
      if(remember){boundedPush(undo.current,doc);redo.current=[];}
      const saved=Object.fromEntries(Object.entries(ledger.records).filter(([key])=>!dirty.has(key)));
      const historical=Object.fromEntries(Object.entries(history).filter(([key])=>next.cells.some(c=>c.id===key)));
      const edited=[...new Set([...changed,...dirty])].filter(key=>next.cells.some(c=>c.id===key));
      setDoc(next);setHistory(historical);setChanged(edited);setEditor(undefined);
      setStale(previous=>new Set([...previous,...[...dirty].filter(k=>ledger.records[k]||history[k])]));
      setLedger({records:saved,errors:Object.create(null),executed:[],calls:0});
      if(!next.cells.some(c=>c.id===selected)) select(next.cells[0]?.id??'');
      if(auto && consent && edited.length) void calculate(next,saved,edited);
    }
    function replace(next:NotebookDocument,historical:Records,requires:boolean) {
      cancel(); fileRevision.current++; undo.current=[];redo.current=[];
      setDoc(next);setLedger(empty());setStale(new Set());setHistory(historical);setConsent(false);setNeedsConsent(requires);
      setChanged(next.cells.map(c=>c.id));setMessage('');setEditor(undefined);select(next.cells[0]?.id??'');
    }
    function travel(back:boolean) {
      const from=back?undo.current:redo.current,to=back?redo.current:undo.current;
      const next=from.at(-1);if(!next)return;
      boundedPush(to,doc);from.pop();update(next,false);
    }
    function add(duplicate=false) {
      if(doc.cells.length>=notebookLimits.cells){setMessage('limit');return;}
      const base=newCell(duplicate&&selectedCell?selectedCell.kind:adding,doc.cells,locale);
      const c=duplicate&&selectedCell?{...selectedCell,id:base.id,...(base.kind==='variable'?{symbol:base.id}:{})}:base;
      const at=selectedCell?doc.cells.indexOf(selectedCell)+1:doc.cells.length;
      const cells=doc.cells.slice();cells.splice(at,0,c);update({...doc,cells});select(c.id);setEditor(c);
    }
    function move(direction:number) {
      if(!selectedCell)return;const i=doc.cells.indexOf(selectedCell),j=i+direction;
      if(j<0||j>=doc.cells.length)return;const cells=doc.cells.slice();cells.splice(i,1);cells.splice(j,0,selectedCell);update({...doc,cells});
    }
    function apply() {
      if(!editor)return;
      if(!allowedUnits.test(editor.unit)||(editor.kind==='variable'&&!id(editor.symbol))){setMessage('invalid_input');return;}
      update({...doc,cells:doc.cells.map(c=>c.id===editor.id?editor:c)});
    }
    async function opened(blob:File|undefined,formula:boolean) {
      if(!blob)return;
      const ticket=++fileRevision.current;
      try {
        if(blob.size>(formula?128*1024:notebookLimits.fileBytes)) throw new Error('limit');
        const raw=await blob.text();
        if(ticket!==fileRevision.current)return;
        if(formula){
          const api=await import('./formula-library');
          if(ticket!==fileRevision.current)return;
          if((doc.formulaDefinitions?.length??0)>=16)throw new Error('limit');
          const definition=api.decodeFormula(raw);
          update({...doc,formulaDefinitions:[...(doc.formulaDefinitions??[]),definition]},true,false);
          setConsent(false);setNeedsConsent(true);
        } else {
          const loaded=openNotebook(raw);
          if(loaded.document.formulaDefinitions?.length){
            const api=await import('./formula-library');
            if(ticket!==fileRevision.current)return;
            for(const def of loaded.document.formulaDefinitions) api.validateFormula(def);
          }
          replace(loaded.document,loaded.historical,true);setMigrated(loaded.migrated);
        }
      } catch(e){if(ticket===fileRevision.current)setMessage(notebookError(e));}
    }
    return <section className="math-notebook" aria-label={l.title} data-testid="notebook-workspace"
      onKeyDown={event=>{
        if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();if(editor)apply();else void calculate(doc,ledger.records,changed);return;}
        if(event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();move(event.key==='ArrowUp'?-1:1);return;}
        if((event.target as HTMLElement).closest('input,textarea,[contenteditable]'))return;
        if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travel(!event.shiftKey);}
      }}>
      <header className="notebook-top"><label>{l.document}<input data-testid="notebook-title" maxLength={120} value={doc.title} onChange={e=>update({...doc,title:e.target.value},true,false)}/></label>
        <div className="notebook-actions">
          <button onClick={()=>{replace(financialNotebook(locale,l.sampleNames),{},false);setMigrated(false);}} data-testid="notebook-example">{l.sample}</button>
          <button onClick={()=>{replace(blank(),{},false);setMigrated(false);}}>{l.blank}</button>
          <button onClick={()=>file.current?.click()}>{l.open}</button>
          <button onClick={()=>{try{download(saveNotebook(doc,{...history,...ledger.records},ledger.records));setMessage('');}catch(e){setMessage(notebookError(e));}}} data-testid="notebook-export">{l.save}</button>
        </div>
        <input type="file" ref={file} hidden accept=".darsnb,.json" data-testid="notebook-import" onChange={e=>{void opened(e.target.files?.[0],false);e.target.value='';}}/>
      </header>
      <div className="notebook-runbar"><button className="notebook-run" data-testid="notebook-run" onClick={()=>void calculate(doc,ledger.records,changed)} disabled={!doc.cells.length||!!progress}>{needsConsent?l.rerun:l.run}</button>
        {progress&&<><button onClick={()=>{cancel();setMessage('cancelled');}}>{l.cancel}</button><progress aria-label={l.progress} max={progress[1]||1} value={progress[0]}/></>}
        <button disabled={!undo.current.length} onClick={()=>travel(true)}>{l.undo}</button><button disabled={!redo.current.length} onClick={()=>travel(false)}>{l.redo}</button>
        {!!ledger.executed.length&&<small data-testid="notebook-executed" aria-live="polite">{l.changed} · {ledger.executed.join(', ')}</small>}
      </div>
      {message&&<p role="alert">{errorText(message)}</p>}
      {needsConsent&&<p role="status">{l.openHint}</p>}{migrated&&<p role="status">{l.migrated}</p>}
      <div className="notebook-layout">
        <aside className="notebook-outline" aria-label={l.cells}>
          <div className="notebook-add"><select aria-label={l.kind} data-testid="notebook-new-kind" value={adding} onChange={e=>setAdding(e.target.value as NotebookKind)}>
            {notebookKinds.map(k=><option key={k} value={k}>{l.kinds[k]}</option>)}</select><button onClick={()=>add()} data-testid="notebook-add">{l.add}</button></div>
          <ol onKeyDown={event=>{
            if(event.altKey || !['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
            const buttons=Array.from(event.currentTarget.querySelectorAll('button'));const i=buttons.indexOf(event.target as HTMLButtonElement);
            if(i<0)return;event.preventDefault();
            const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(event.key==='ArrowDown'?1:-1)));
            buttons[next]?.focus();buttons[next]?.click();
          }}>{doc.cells.map(c=><li key={c.id}><button data-testid={'notebook-select-'+c.id} aria-current={selected===c.id?'true':undefined} onClick={()=>{select(c.id);setEditor(undefined);}}>
            <span>{c.title||l.kinds[c.kind]}</span><small><bdi>@{c.id}</bdi></small></button></li>)}</ol>
        </aside>
        <div className="notebook-pages">
          {doc.cells.length===0&&<p>{l.empty}</p>}
          {selectedCell&&<div className="notebook-tools"><button data-testid="notebook-edit" onClick={()=>setEditor({...selectedCell})}>{l.edit}</button>
            <button onClick={()=>add(true)}>{l.duplicate}</button><button disabled={doc.cells[0]===selectedCell} onClick={()=>move(-1)}>{l.up}</button>
            <button disabled={doc.cells.at(-1)===selectedCell} onClick={()=>move(1)}>{l.down}</button>
            <button onClick={()=>update({...doc,cells:doc.cells.filter(c=>c.id!==selected)})}>{l.remove}</button></div>}
          {editor&&<fieldset className="notebook-edit"><legend>{l.editor} · <bdi>@{editor.id}</bdi></legend>
            <label>{l.name}<input maxLength={120} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></label>
            {editor.kind==='variable'&&<div className="notebook-fields"><label>{l.symbol}<input maxLength={40} value={editor.symbol??''} onChange={e=>setEditor({...editor,symbol:e.target.value})}/></label>
              <label>{l.unit}<input maxLength={40} value={editor.unit} onChange={e=>setEditor({...editor,unit:e.target.value})}/></label></div>}
            <label>{l.source}<textarea data-testid="notebook-source" dir="auto" maxLength={notebookLimits.source} rows={editor.kind==='variable'?2:4} value={editor.source}
              onChange={e=>setEditor({...editor,source:e.target.value,origin:editor.source.trim()?editor.origin:locale})}/></label>
            <InputNotation origin={editor.origin} locale={locale} messages={messages} id="notebook-notation"/>
            <div className="notebook-actions"><button onClick={apply} data-testid="notebook-apply">{l.apply}</button><button onClick={()=>setEditor(undefined)}>{l.close}</button></div>
          </fieldset>}
          {doc.cells.map(c=>{
            const record=ledger.records[c.id]??history[c.id];const historical=!ledger.records[c.id]&&!!history[c.id];
            const status=ledger.errors[c.id]?l.failed:stale.has(c.id)?l.stale:historical?l.historical:ledger.records[c.id]?l.current:l.notRun;
            return <article key={c.id} data-testid={'notebook-cell-'+c.id} className={selected===c.id?'notebook-cell selected':'notebook-cell'}>
              <header><button onClick={()=>{select(c.id);setEditor(undefined);}} aria-label={l.select+' · '+(c.title||c.id)}>
                <strong>{c.title||l.kinds[c.kind]}</strong><small><bdi>@{c.id}</bdi> · {l.kinds[c.kind]}</small></button>
                <span className="notebook-status" data-state={ledger.errors[c.id]?'error':stale.has(c.id)?'stale':historical?'historical':ledger.records[c.id]?'current':'pending'}>{status}</span></header>
              {ledger.errors[c.id]?<p role="alert">{errorText(ledger.errors[c.id]!)}</p>:record?
                <CellValue cell={c} out={record.output} locale={locale} labels={l}/>:c.kind==='text'?<Formatted source={c.source}/>:
                c.kind==='heading'?<h3>{c.source}</h3>:<code dir="auto">{c.source}</code>}
              {record&&<RecordDetails record={record} labels={l}/>}
            </article>;
          })}
          <button onClick={()=>formulaFile.current?.click()}>{l.formulaFile}</button><input hidden type="file" accept=".json,.darsformula" ref={formulaFile} onChange={e=>{void opened(e.target.files?.[0],true);e.target.value='';}}/>
        </div>
      </div>
    </section>;
  }
  return {Workspace,setPolicy(policy){if(limit>policy.dataLabResourceBudgetBytes)active?.abort();limit=policy.dataLabResourceBudgetBytes;session.setPolicy(policy);},
    snapshot:()=>retained??{document:blank(),historical:{},selected:''},getResources:()=>session.getResources(),dispose(){active?.abort();session.dispose();}};
}
