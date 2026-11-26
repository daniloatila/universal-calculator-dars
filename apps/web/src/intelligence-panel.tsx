import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Locale } from './i18n';
import type { ToolRequest } from './tool-runtime';
import type { CalculationProof } from './calculation-proof';
import { command, investment, nativeGateway, nextGeneration, parseProposal, providers, readRecipe, resultRecord, toRequest } from './intelligence-contract';
import type { Calculation, Mode, Preview, Proposal, Provider, Purpose, Source } from './intelligence-contract';
import { routeLabels } from './intelligence-route-labels';
import { intelligenceLabels } from './intelligence-labels';
import { dictate, hasLocalDictation, localVoice, readPrintedExpression, speakLocal } from './voice-vision';
import './intelligence-panel.css';

type Props={locale:Locale;offline:boolean;onClose:()=>void;execute?:(r:ToolRequest,signal?:AbortSignal)=>Promise<CalculationProof>};
type Status='proposal'|'question'|'awaiting'|'validated'|'executing'|'verified'|'failed'|'cancelled'|'unverified';
type Note='denied'|'network'|'limit'|'removed'|'updated'|'unavailable'|'offline';
const names:Record<Provider,string>={ollama:'Ollama',lm_studio:'LM Studio',compatible:'OpenAI-compatible',openai:'OpenAI',anthropic:'Anthropic',gemini:'Google Gemini'};
function download(value:unknown,filename:string){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}
function errorNote(e:unknown):Note{
  const s=e instanceof Error?e.message:String(e);
  if(['limit','rate_limited','cost_limit'].includes(s))return 'limit';
  if(['network_error','timeout','provider_error','missing_credential','credential_denied','credential_error'].includes(s))return 'network';
  return s==='unavailable'?'unavailable':'denied';
}

export function IntelligencePanel({locale,offline,onClose,execute}:Props){
  const l=intelligenceLabels(locale), routes=routeLabels(locale), native=nativeGateway();
  const [host,setHost]=useState<"127.0.0.1"|"::1">("127.0.0.1"),[auth,setAuth]=useState(false);
  const [models,setModels]=useState<string[]>(),[transportNote,setTransportNote]=useState<keyof typeof routes>();
  const dialog=useRef<HTMLDialogElement>(null),key=useRef<HTMLInputElement>(null);
  const [mode,setMode]=useState<Mode>('disabled'),[provider,setProvider]=useState<Provider>('ollama');
  const [model,setModel]=useState(''),[port,setPort]=useState('11434'),[content,setContent]=useState('');
  const [purpose,setPurpose]=useState<Purpose>('propose'),[timeout,setTimeoutValue]=useState('15');
  const [maxTokens,setMaxTokens]=useState('256'),[context,setContext]=useState('4096'),[persist,setPersist]=useState(false);
  const [preview,setPreview]=useState<Preview>(),[proposal,setProposal]=useState<Proposal>(),[source,setSource]=useState<Source>(null);
  const [record,setRecord]=useState<ReturnType<typeof resultRecord>>(),[status,setStatus]=useState<Status>('proposal');
  const [note,setNote]=useState<Note>(),[busyState,setBusy]=useState(false),[recognized,setRecognized]=useState('');
  const [hasSpeech,setHasSpeech]=useState(false),[hasVoice,setHasVoice]=useState(false);
  const [inspectVoice,setInspectVoice]=useState(false);
  const spoken=useRef(false);
  const active=useRef<AbortController|undefined>(undefined),generation=useRef(0),nativeReady=useRef(Promise.resolve());
  const modeRef=useRef(mode),offlineRef=useRef(offline); modeRef.current=mode;offlineRef.current=offline;
  const closeRef=useRef(onClose);closeRef.current=onClose;
  function stop(){
    setTransportNote(undefined);active.current?.abort();active.current=undefined;setBusy(false);setPreview(undefined);setNote(undefined);
    if(native&&generation.current)void command({action:'cancel',generation:generation.current}).catch(()=>{});
  }
  function configure(value:Mode,block:boolean){
    stop();generation.current=nextGeneration();
    if(native){
      nativeReady.current=command<void>({action:'configure',mode:value,offline:block,generation:generation.current});
      void nativeReady.current.catch(()=>{});
    }
  }
  useLayoutEffect(()=>{
    dialog.current?.showModal();
    const element=dialog.current;
    const hidden=()=>{if(document.hidden)closeRef.current();};
    document.addEventListener('visibilitychange',hidden);
    return ()=>{
      document.removeEventListener('visibilitychange',hidden);
      active.current?.abort();
      if(native)void command({action:'configure',mode:'disabled',offline:true,generation:nextGeneration()}).catch(()=>{});
      if(spoken.current)window.speechSynthesis?.cancel();
      element?.close();
    };
  },[native]);
  useLayoutEffect(()=>{configure(modeRef.current,offline);},[offline]); // Invalidate the pending ticket before paint.
  useEffect(()=>{
    setHasSpeech(false);setHasVoice(false);
    if(!inspectVoice)return;
    let live=true;const check=()=>{if(live)setHasVoice(Boolean(localVoice(locale)));};
    check();void hasLocalDictation(locale).then(x=>{if(live)setHasSpeech(x);});
    window.speechSynthesis?.addEventListener('voiceschanged',check);
    return ()=>{live=false;window.speechSynthesis?.removeEventListener('voiceschanged',check);};
  },[locale,inspectVoice]);

  function edit(){
    stop();
    if(status==='awaiting'||status==='executing')setStatus(record?'verified':'proposal');
  }
  function chooseMode(value:Mode){
    configure(value,offline);setMode(value);setProvider(value==='external'?'openai':'ollama');setModel('');setPort('11434');setPersist(false);setAuth(false);setHost("127.0.0.1");setModels(undefined);
    if(key.current)key.current.value=''; setStatus(record?'verified':'proposal');
  }
  function chooseProvider(value:Provider){
    // A changed provider also invalidates native pending work.
    configure(mode,offline);setProvider(value);setPort(value==='ollama'?'11434':'1234');setModel('');setPersist(false);setAuth(false);setHost("127.0.0.1");setModels(undefined);
    if(key.current)key.current.value='';setStatus(record?'verified':'proposal');
  }
  async function guarded(work:(signal:AbortSignal)=>Promise<void>){
    if(active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setNote(undefined);setTransportNote(undefined);
    try{await work(controller.signal);}catch(error){
      if(!controller.signal.aborted){
        setStatus('failed');
        const code=error instanceof Error?error.message:String(error);
        if(Object.hasOwn(routes,code)){setTransportNote(code as keyof typeof routes);}else setNote(errorNote(error));
      }
    }finally{if(active.current===controller){active.current=undefined;setBusy(false);}}
  }
  function accept(value:Proposal,attribution:Source){
    setProposal(value);setSource(attribution);setRecord(undefined);setPreview(undefined);setNote(undefined);
    setStatus(value.kind==='question'?'question':value.kind==='calculate'?'proposal':'unverified');
  }
  function prepare(inspect=false){
    void guarded(async signal=>{
      await nativeReady.current;signal.throwIfAborted();
      if(offlineRef.current&&mode==='external')throw new Error('permission_denied');
      if(!inspect&&purpose==='explain'&&!record)throw new Error('invalid_input');
      const query={provider,model:inspect?'':model,host:mode==='local'?host:'127.0.0.1',port:mode==='local'?Number(port):0,purpose:inspect?'inventory':purpose,authenticate:inspect&&auth,
        content:inspect?'':purpose==='explain'?JSON.stringify({question:content,proof:record!.proof}):content,
        maxTokens:Number(maxTokens),contextTokens:Number(context),timeoutSeconds:Number(timeout)};
      const grant=await command<Preview>({action:'prepare',query,generation:generation.current});
      signal.throwIfAborted();setPreview(grant);setStatus('awaiting');
    });
  }
  function send(){
    if(!preview)return;
    const grant=preview;setPreview(undefined);setStatus('executing');
    if(grant.purpose==='propose'){setRecord(undefined);setProposal(undefined);setSource(null);}
    if(grant.purpose==='inventory')setModels(undefined);
    void guarded(async signal=>{
      const text=await command<string>({action:'send',ticket:grant.ticket,generation:generation.current});
      signal.throwIfAborted();
      if(grant.purpose==='inventory'){
        const found:unknown=JSON.parse(text);
        if(!Array.isArray(found)||found.length>256||!found.every(v=>typeof v==='string'&&v.length<=100))throw new Error('invalid_response');
        setModels(found);setStatus(record?'verified':'proposal');return;
      }
      const reply=parseProposal(text);
      if(grant.purpose==='explain'){
        const attribution={provider:grant.provider,model:grant.model};
        if(reply.kind!=='explanation')throw new Error('invalid_response');
        setRecord(old=>old&&({...old,explanation:{verified:false,text:reply.text,source:attribution}}));
        setProposal(reply);setStatus('unverified');setSource(attribution);
      }else accept(reply,{provider:grant.provider,model:grant.model});
    });
  }
  function credentials(remove:boolean){
    void guarded(async signal=>{
      const secret=key.current?.value??'';if(key.current)key.current.value='';
      await nativeReady.current;signal.throwIfAborted();setPreview(undefined);
      await command(remove?{action:'forget',provider,host:mode==='local'?host:'127.0.0.1',port:mode==='local'?Number(port):0,generation:generation.current}:{action:'credential',provider,host:mode==='local'?host:'127.0.0.1',port:mode==='local'?Number(port):0,persist,secret,generation:generation.current});
      signal.throwIfAborted();setNote(remove?'removed':'updated');
    });
  }
  function run(p:Calculation){
    if(!execute)return;setStatus('executing');
    void guarded(async signal=>{
      const proof=await execute(toRequest(p),signal);signal.throwIfAborted();
      setRecord(resultRecord(p,source,proof));setStatus('verified');
    });
  }
  function read(file?:File){
    if(!file)return;edit();setRecord(undefined);setProposal(undefined);setSource(null);
    void guarded(async signal=>{
      if(file.size>131072)throw new Error('limit');
      const parsed=readRecipe(await file.text());signal.throwIfAborted();accept(parsed,null);
    });
  }
  const disabled=busyState||!native||mode==='disabled'||(mode==='external'&&offline);
  return <dialog className="intelligence-dialog" ref={dialog} aria-labelledby="intelligence-title" onCancel={onClose} data-testid="intelligence-panel">
    <header><h2 id="intelligence-title">{l.title}</h2><button type="button" onClick={onClose}>{l.close}</button></header>
    <label>{l.mode}<select data-testid="intelligence-mode" value={mode} onChange={e=>chooseMode(e.target.value as Mode)}>
      {(['disabled','local','external'] as const).map(value=><option key={value} value={value}>{l[value]}</option>)}</select></label>
    {mode!=='disabled'&&<section aria-label={l.provider}>
      <p>{!native?l.native:offline&&mode==='external'?l.offline:l.privacy}</p>
      <div className="intelligence-fields">
        <label>{l.provider}<select data-testid="intelligence-provider" value={provider} onChange={e=>chooseProvider(e.target.value as Provider)}>
          {(mode==='local'?providers.slice(0,3):providers.slice(3)).map(v=><option key={v} value={v}>{names[v]}</option>)}</select></label>
        <label>{l.model}<input data-testid="intelligence-model" autoComplete="off" maxLength={100} value={model} onChange={e=>{edit();setModel(e.target.value);}}/></label>
        {mode==='local'&&<label>{routes.address}<select data-testid="intelligence-host" value={host} onChange={e=>{edit();setModels(undefined);setAuth(false);setHost(e.target.value as typeof host);}}>
          <option value="127.0.0.1">127.0.0.1</option><option value="::1">::1</option></select></label>}
        {mode==='local'&&<label>{l.port}<input data-testid="intelligence-port" type="number" min={1024} max={65535} value={port} onChange={e=>{edit();setModels(undefined);setAuth(false);setPort(e.target.value);}}/></label>}
        <label>{l.maxTokens}<input type="number" min={32} max={1024} value={maxTokens} onChange={e=>{edit();setMaxTokens(e.target.value);}}/></label>
        <label>{l.context}<input type="number" min={128} max={4096} value={context} onChange={e=>{edit();setContext(e.target.value);}}/></label>
        <label>{l.timeout}<input type="number" min={1} max={30} value={timeout} onChange={e=>{edit();setTimeoutValue(e.target.value);}}/></label>
      </div>
      {mode==='local'&&<div>
        <label><input type="checkbox" checked={auth} onChange={e=>{edit();setAuth(e.target.checked);}}/>{routes.auth}</label>
        <button data-testid="intelligence-discover" type="button" disabled={disabled} onClick={()=>prepare(true)}>{routes.inventory}</button>
        {models&&<div role="status">{models.length===0?routes.empty:<label>{routes.available}
          <select data-testid="intelligence-models" value={models.includes(model)?model:''} onChange={e=>{edit();setModel(e.target.value);}}>
            <option value="">—</option>{models.map(v=><option key={v}>{v}</option>)}</select></label>}</div>}
      </div>}
      {native&&<details><summary>{l.key}</summary>
        <label>{l.key}<input type="password" ref={key} autoComplete="new-password" maxLength={1024}/></label>
        {mode==='external'&&navigator.platform.startsWith('Win')&&<label><input type="checkbox" checked={persist} onChange={e=>setPersist(e.target.checked)}/>{l.persist}</label>}
        <button type="button" disabled={disabled} onClick={()=>credentials(false)}>{l.save}</button>
        <button type="button" disabled={busyState} onClick={()=>credentials(true)}>{l.forget}</button>
      </details>}
      <label>{l.purpose}<select value={purpose} onChange={e=>{edit();setPurpose(e.target.value as Purpose);}}>
        <option value="propose">{l.propose}</option><option value="explain" disabled={!record}>{l.explain}</option></select></label>
      <label>{l.request}<textarea data-testid="intelligence-request" maxLength={8192} value={content} onChange={e=>{edit();setContent(e.target.value);}}/></label>
      <button type="button" disabled={disabled||!model||!content.trim()} data-testid="intelligence-preview" onClick={()=>prepare()}>{l.preview}</button>
      {preview&&<section className="intelligence-consent">
        <h3>{l.awaiting}</h3>
        <dl><dt>{l.provider}</dt><dd>{names[preview.provider]}</dd><dt>{l.model}</dt><dd>{preview.model}</dd>
          <dt>{l.destination}</dt><dd dir="ltr">{preview.preflight&&<>GET {preview.preflight}<br/></>}{preview.purpose==='inventory'?'GET':'POST'} {preview.destination}</dd><dt>{l.purpose}</dt><dd>{preview.purpose==='inventory'?routes.inventory:l[preview.purpose]}</dd>
          <dt>{l.bytes}</dt><dd>{preview.bytes}</dd><dt>{l.maxTokens}</dt><dd>{preview.maxTokens}</dd></dl>
        <details open><summary>{l.body}</summary><pre dir="ltr">{preview.body}</pre></details><p>{l.irreversible}</p>
        <button type="button" disabled={disabled} data-testid="intelligence-send" onClick={send}>{l.authorize}</button>
      </section>}
    </section>}
    <section aria-label={l.proposal}>
      <button data-testid="intelligence-example" type="button" onClick={()=>{edit();accept(investment,null);}}>{l.example}</button>
      <label>{l.import}<input data-testid="intelligence-import" type="file" accept=".json,.darsai,application/json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';read(file);}}/></label>
      <p>{l.importNote}</p>
      <output data-testid="intelligence-status" aria-live="polite">{l[status]}{transportNote?' · '+routes[transportNote]:''}{note?' · '+l[note]:''}</output>
      {(busyState||preview)&&<button type="button" onClick={()=>{stop();setStatus('cancelled');}}>{l.cancel}</button>}
      {proposal&&<section><h3>{proposal.kind==='explanation'?l.explanation:l.inputs}</h3>
        {proposal.kind==='calculate'?<>
          <pre data-testid="intelligence-input" dir="ltr">{JSON.stringify(proposal,null,2)}</pre>
          <button data-testid="intelligence-validate" type="button" disabled={busyState} onClick={()=>{toRequest(proposal);setStatus('validated');}}>{l.review}</button>
          <button data-testid="intelligence-run" type="button" disabled={!execute||busyState||status!=='validated'} onClick={()=>run(proposal)}>{l.run}</button>
        </>:proposal.kind==='draft'?<><p>{l.draft}</p><pre dir="ltr">{JSON.stringify(proposal.document,null,2)}</pre>
          <button type="button" onClick={()=>download(proposal.document,'proposal-'+proposal.studio+'.json')}>{l.draft}</button></>:<p>{proposal.text}</p>}
      </section>}
      {record&&<section><h3>{l.result}</h3><pre data-testid="intelligence-result" dir="ltr">{record.proof.result}</pre>
        <button type="button" onClick={()=>download(record,'calculation.darsai')}>{l.export}</button></section>}
    </section>
    <details><summary>{l.media}</summary>
      <label>{l.image}<input data-testid="intelligence-image" type="file" accept="image/png" onChange={e=>{
        const file=e.target.files?.[0];e.target.value='';if(!file)return;edit();setRecognized('');
        void guarded(async signal=>{const text=await readPrintedExpression(file,signal);signal.throwIfAborted();setRecognized(text);});
      }}/></label>
      {!inspectVoice && <button type="button" data-testid="intelligence-inspect-voice" onClick={()=>setInspectVoice(true)}>{l.inspectVoice}</button>}
      <button type="button" disabled={!hasSpeech||busyState} title={!hasSpeech?l.unavailable:undefined} onClick={()=>{
        void guarded(async signal=>{const text=await dictate(locale,signal);signal.throwIfAborted();setRecognized(text);});
      }}>{l.dictate}</button>
      {inspectVoice&&!hasSpeech&&<small>{l.unavailable}</small>}
      <label>{l.recognized}<input data-testid="intelligence-recognized" value={recognized} maxLength={512} onChange={e=>setRecognized(e.target.value)}/></label>
      <button type="button" disabled={!recognized||busyState} onClick={()=>{try {accept(parseProposal(JSON.stringify({schema:1,kind:'calculate',tool:'expression',expression:recognized})),null);}catch{setStatus('failed');setNote('denied');}}}>{l.use}</button>
      <button type="button" disabled={!hasVoice||!record} onClick={()=>{try{speakLocal(record!.proof.result,locale);spoken.current=true;}catch{setNote('unavailable');}}}>{l.speak}</button>
      {hasVoice&&<button type="button" onClick={()=>window.speechSynthesis.cancel()}>{l.stop}</button>}
    </details>
  </dialog>;
}
export default IntelligencePanel;
