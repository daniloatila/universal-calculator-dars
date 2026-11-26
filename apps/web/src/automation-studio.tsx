import { useEffect, useRef, useState } from 'react';
import type { ModuleActivation } from './module-manager';
import type { PrimaryModule, ModuleWorkspaceProps } from './module-registry';
import { createCapabilitySession } from './capability-session';
import { matchesHistoric, maxFlowFileBytes, openFlowFile, parseFlow, runFlow } from './automation-flow';
import type { FlowReceipt } from './automation-flow';
import { localizedDecimal } from './locale-format';
import finance from './automation-examples/finance.json';
import business from './automation-examples/business.json';
import statistics from './automation-examples/statistics.json';
import science from './automation-examples/science.json';
import './automation-studio.css';

const examples={finance,business,statistics,science};
const verification={
  en:['Flow completed','Includes approximate inputs or results'],
  'pt-BR':['Fluxo concluído','Inclui entradas ou resultados aproximados'],
  es:['Flujo completado','Incluye entradas o resultados aproximados'],
  fr:['Flux terminé','Contient des entrées ou des résultats approchés'],
  'zh-CN':['流程已完成','包含近似输入或结果'],
  hi:['प्रवाह पूरा हुआ','इनपुट या परिणामों में सन्निकट मान शामिल हैं'],
  ar:['اكتمل التدفق','يتضمن مدخلات أو نتائج تقريبية'],
};
type Demo=keyof typeof examples;
const format=(v:unknown)=>JSON.stringify(v,null,2);
const labels={
  en:['Flow','Finance','Business','Statistics','Science','Load example','Flow definition','Run','Cancel','Open flow','Save flow','Select local data','Results','Save proof','Ready','Running','Failed','Cancelled','Steps','Source file','Verified by the engine','Data distribution','The file is open for review. Run it when ready.'],
  'pt-BR':['Fluxo','Financeiro','Empresarial','Estatístico','Científico','Carregar exemplo','Definição do fluxo','Executar','Cancelar','Abrir fluxo','Salvar fluxo','Selecionar dados locais','Resultados','Salvar prova','Pronto','Executando','Falha','Cancelado','Etapas','Arquivo de origem','Verificado pelo motor','Distribuição dos dados','Arquivo aberto para revisão. Execute quando estiver pronto.'],
  es:['Flujo','Finanzas','Empresa','Estadística','Ciencia','Cargar ejemplo','Definición del flujo','Ejecutar','Cancelar','Abrir flujo','Guardar flujo','Seleccionar datos locales','Resultados','Guardar prueba','Listo','En curso','Error','Cancelado','Pasos','Archivo fuente','Verificado por el motor','Distribución de datos','Archivo abierto para revisión. Ejecútelo cuando esté listo.'],
  fr:['Flux','Finance','Entreprise','Statistiques','Science','Charger un exemple','Définition du flux','Exécuter','Annuler','Ouvrir un flux','Enregistrer le flux','Choisir des données locales','Résultats','Enregistrer la preuve','Prêt','En cours','Échec','Annulé','Étapes','Fichier source','Vérifié par le moteur','Distribution des données','Fichier ouvert pour révision. Lancez le calcul quand vous êtes prêt.'],
  'zh-CN':['流程','金融','商业','统计','科学','加载示例','流程定义','运行','取消','打开流程','保存流程','选择本地数据','结果','保存证明','就绪','运行中','失败','已取消','步骤','源文件','引擎已验证','数据分布','文件已打开供审阅。准备好后再运行。'],
  hi:['प्रवाह','वित्त','व्यवसाय','सांख्यिकी','विज्ञान','उदाहरण लोड करें','प्रवाह की परिभाषा','चलाएँ','रद्द करें','प्रवाह खोलें','प्रवाह सहेजें','स्थानीय डेटा चुनें','परिणाम','प्रमाण सहेजें','तैयार','चल रहा है','विफल','रद्द','चरण','स्रोत फ़ाइल','इंजन द्वारा सत्यापित','डेटा वितरण','फ़ाइल समीक्षा के लिए खुली है। तैयार होने पर चलाएँ।'],
  ar:['التدفق','المالية','الأعمال','الإحصاء','العلوم','تحميل مثال','تعريف التدفق','تشغيل','إلغاء','فتح التدفق','حفظ التدفق','اختيار بيانات محلية','النتائج','حفظ الإثبات','جاهز','قيد التشغيل','فشل','أُلغي','الخطوات','ملف المصدر','تحقق منه المحرك','توزيع البيانات','الملف مفتوح للمراجعة. شغله عندما تكون جاهزاً.'],
};
const samples:Partial<Record<Demo,string>>={business:'cost,price\n80,100\n75,125\n',statistics:'value\n1\n""\n4\n7\n'};
export interface AutomationState { text:string; demo:Demo }
function download(name:string,data:string) {
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function activate(scope:ModuleActivation<AutomationState>):PrimaryModule<AutomationState> {
  const session=createCapabilitySession(scope);
  let state=scope.previousState ?? {text:format(examples.finance),demo:'finance' as Demo};
  function Workspace({locale}:ModuleWorkspaceProps) {
    const t=labels[locale];
    const [draft,setDraft]=useState(state);
    const [file,setFile]=useState<File>();
    const [receipt,setReceipt]=useState<FlowReceipt>();
    const [historic,setHistoric]=useState<ReturnType<typeof openFlowFile>['historic']>();
    const [status,setStatus]=useState(14);
    const [error,setError]=useState('');
    const [progress,setProgress]=useState('');
    const serial=useRef(0), controller=useRef<AbortController|undefined>(undefined);
    function change(next:AutomationState,source=file) {
      ++serial.current;controller.current?.abort();state=next;setDraft(next);setFile(source);setReceipt(undefined);
      setProgress('');setError('');setStatus(14);setHistoric(undefined);
    }
    useEffect(()=>()=>{++serial.current;controller.current?.abort();},[]);
    function example() {
      const bytes=samples[draft.demo];const sample=bytes?new File([bytes],draft.demo+'.csv',{type:'text/csv'}):undefined;
      change({demo:draft.demo,text:format(examples[draft.demo])});setFile(sample);
    }
    async function start() {
      const current=++serial.current;controller.current?.abort();
      const c=new AbortController();controller.current=c;setStatus(15);setError('');setReceipt(undefined);setProgress('');
      try {
        const flow=parseFlow(draft.text);
        const result=await runFlow(flow,session,file,c.signal,(n,id)=>{if(serial.current===current)setProgress(n+' · '+id);});
        if(current!==serial.current || scope.signal.aborted)return;
        if(historic && result.status==='verified' && !matchesHistoric(result,historic)) {
          setStatus(16);setError('replay_mismatch');return;
        }
        setReceipt(result);setStatus(result.status==='verified'?20:result.status==='cancelled'?17:16);setError(result.error??'');
      }catch(e){if(current===serial.current){setStatus(16);setError(e instanceof Error?e.message:'invalid_input');}}
    }
    async function open(f?:File) {
      if(!f)return;const current=++serial.current;controller.current?.abort();
      setReceipt(undefined);setHistoric(undefined);
      try {if(f.size>maxFlowFileBytes)throw new Error('limit');const opened=openFlowFile(await f.text());
        if(current===serial.current){change({...draft,text:format(opened.flow)});setFile(undefined);setHistoric(opened.historic);setStatus(22);}
      }catch(e){if(current===serial.current){setStatus(16);setError(e instanceof Error?e.message:'invalid_input');}}
    }
    const series=receipt?.outputs.distribution;
    const bars=series && typeof series==='object' && !Array.isArray(series) && Array.isArray(series.series)
      ? series.series.map(v=>Number(v)) : [];
    let editable:Record<string,unknown>={};
    try {
      const parsed=JSON.parse(draft.text);
      if (parsed?.inputs && typeof parsed.inputs==='object' && !Array.isArray(parsed.inputs)) editable=parsed.inputs;
    } catch { /* The editable JSON can be incomplete while typing. */ }
    return <section className="flow-studio" data-testid="automation-studio">
      <div className="flow-toolbar"><label>{t[0]}<select data-testid="flow-demo" value={draft.demo} onChange={e=>{
        state={...draft,demo:e.target.value as Demo};setDraft(state);
      }}>{Object.keys(examples).map((k,i)=><option key={k} value={k}>{t[1+i]}</option>)}</select></label>
      <button data-testid="flow-example" onClick={example}>{t[5]}</button></div>
      <div className="flow-toolbar">{Object.entries(editable).slice(0,32).map(([key,v])=>{
        const field=v && typeof v==='object' && 'type' in v && v.type==='decimal' && 'text' in v && 'locale' in v?v:undefined;
        if(!field && !(typeof v==='string' && /^-?\d+(?:\.\d+)?$/.test(v)))return null;
        return <label key={key}><bdi>{key}</bdi><input dir="ltr" data-testid={'flow-input-'+key}
          value={field?String(field.text):String(v).replace('.',localizedDecimal(locale))} onChange={e=>{
            const next=JSON.parse(draft.text);
            next.inputs[key]={type:'decimal',text:e.target.value,locale:field?.text?field.locale:locale};
            change({...draft,text:format(next)});
          }}/></label>;
      })}</div>
      <label>{t[6]}<textarea dir="ltr" data-testid="flow-editor" value={draft.text} spellCheck={false}
        onChange={e=>change({...draft,text:e.target.value})} maxLength={131072}/></label>
      <div className="flow-toolbar"><label>{t[9]}<input type="file" accept=".darsflow,.json" onChange={e=>void open(e.target.files?.[0])}/></label>
        <label>{t[11]}<input type="file" accept=".csv,.tsv,.xlsx,.json" onChange={e=>{
          const original=historic;change(draft);setHistoric(original);setFile(e.target.files?.[0]);
        }}/></label></div>
      {file && <p>{t[19]} · <bdi>{file.name}</bdi></p>}
      <div className="flow-toolbar"><button data-testid="flow-run" disabled={status===15} onClick={()=>void start()}>{t[7]}</button>
        <button disabled={status!==15} onClick={()=>controller.current?.abort()}>{t[8]}</button>
        <button onClick={()=>{try{const flow=parseFlow(draft.text);download(flow.id+'.darsflow',format(flow));}
          catch{setError('invalid_input');setStatus(16);}}}>{t[10]}</button>
        {receipt && <button data-testid="flow-proof" onClick={()=>download(receipt.flow.id+'.proof.json',JSON.stringify(receipt))}>{t[13]}</button>}</div>
      <p role="status" data-testid="flow-status">{status===20?verification[locale][0]:t[status]} {error && <code>{error}</code>}{status===15 && <bdi>{progress}</bdi>}</p>
      {receipt?.includesApproximation && <p data-testid="flow-approximate">{verification[locale][1]}</p>}
      {receipt && <><h3>{t[12]}</h3><pre dir="ltr" data-testid="flow-results">{format(receipt.outputs)}</pre>
        {bars.length>0 && bars.every(Number.isFinite) && <figure><figcaption>{t[21]}</figcaption>
          {bars.map((n,i)=><div key={i}><meter min={0} max={Math.max(1,...bars)} value={n}/> {n}</div>)}</figure>}
        <details><summary>{t[18]} ({receipt.trace.length})</summary><ol>{receipt.trace.map((step,i)=><li key={i}><bdi>{step.step} · {step.op}</bdi>
          {step.proof && <span> · {t[20]} · <bdi>{step.proof.exactness}</bdi></span>}</li>)}</ol></details></>}
    </section>;
  }
  return {Workspace,snapshot:()=>state,setPolicy:session.setPolicy,getResources:session.getResources,dispose:session.dispose};
}
