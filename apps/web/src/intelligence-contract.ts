import type { ToolRequest } from './tool-runtime.ts';
import type { CalculationProof } from './calculation-proof.ts';

export const providers = ['ollama','lm_studio','compatible','openai','anthropic','gemini'] as const;
export type Provider = typeof providers[number];
export type Mode = 'disabled'|'local'|'external';
export type Purpose = 'propose'|'explain';
export type Source = { provider: Provider; model: string } | null;
export type Calculation =
  | { schema: 1; kind:'calculate'; tool:'compound_interest'; principal:string; rate:string; periods:number; period:'month'|'year'; currency:string }
  | { schema: 1; kind:'calculate'; tool:'expression'; expression:string };
export type Proposal = Calculation | {schema:1;kind:'question'|'declined'|'explanation'; text:string}
  | {schema:1;kind:'draft'; studio:'notebook'|'formula'|'automation'; document:Record<string,unknown>};
export type Query = {provider:Provider;model:string;port:number;host:"127.0.0.1"|"::1";authenticate:boolean;content:string;purpose:Purpose|"inventory";maxTokens:number;contextTokens:number;timeoutSeconds:number};
export type Preview = {ticket:number;provider:Provider;model:string;destination:string;preflight?:string|null;body:string;bytes:number;maxTokens:number;contextTokens:number;purpose:Purpose|"inventory"};
export const investment: Calculation={schema:1,kind:'calculate',tool:'compound_interest',principal:'10000',rate:'0.01',periods:12,period:'month',currency:'BRL'};
const safeText = (text:unknown,max:number):text is string=>typeof text==='string' && text.length>0 && text.length<=max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(text);
const object = (v:unknown):v is Record<string,unknown>=>v!==null && typeof v==='object' && !Array.isArray(v);
const keys = (v:Record<string,unknown>,allowed:string[])=>Object.keys(v).length===allowed.length && allowed.every(k=>Object.hasOwn(v,k));
const fail=():never=>{throw new Error('invalid_response');};
function inert(v:unknown,depth=0):boolean {
  if(depth>8)return false;
  if(v===null||typeof v==='boolean')return true;
  if(typeof v==='number')return Number.isSafeInteger(v);
  if(typeof v==='string')return v===''||safeText(v,2048);
  if(Array.isArray(v))return v.length<=64&&v.every(item=>inert(item,depth+1));
  if(!object(v)||Object.keys(v).length>48)return false;
  return Object.entries(v).every(([k,value])=>/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(k)
    && !['constructor','prototype','__proto__'].includes(k) && inert(value,depth+1));
}

/** Closed schema. No member lets a model choose a URL, privilege, result or executable. */
export function parseProposal(text:string):Proposal {
  if(!safeText(text,8192)||new TextEncoder().encode(text).length>8192) return fail();
  let v:unknown;
  try {v=JSON.parse(text);}catch{return fail();}
  if(!object(v)||v.schema!==1)return fail();
  if(v.kind==='calculate'&&v.tool==='expression'&&keys(v,['schema','kind','tool','expression'])
    && safeText(v.expression,512)&&/^[0-9A-Za-z+*/^().,!%\s-]+$/.test(v.expression))
    return {schema:1,kind:v.kind,tool:v.tool,expression:v.expression};
  const decimal=(x:unknown):x is string=>typeof x==='string'&&/^-?(?:0|[1-9]\d{0,39})(?:\.\d{1,32})?$/.test(x);
  if(v.kind==='calculate'&&v.tool==='compound_interest'&&keys(v,['schema','kind','tool','principal','rate','periods','period','currency'])
    && decimal(v.principal)&&!v.principal.startsWith('-')&&decimal(v.rate)&&typeof v.periods==='number'
    &&Number.isInteger(v.periods)&&v.periods>0&&v.periods<=1200&&(v.period==='month'||v.period==='year')
    &&typeof v.currency==='string'&&['BRL','USD','EUR','GBP','JPY','CNY','INR','CHF','CAD','AUD'].includes(v.currency))
    return {schema:1,kind:v.kind,tool:v.tool,principal:v.principal,rate:v.rate,periods:v.periods,period:v.period,currency:v.currency};
  if((v.kind==='question'||v.kind==='declined'||v.kind==='explanation')&&keys(v,['schema','kind','text'])&&safeText(v.text,2048))
    return {schema:1,kind:v.kind,text:v.text};
  if(v.kind==='draft'&&keys(v,['schema','kind','studio','document'])&&(v.studio==='notebook'||v.studio==='formula'||v.studio==='automation')&&object(v.document)&&inert(v.document))
    return {schema:1,kind:v.kind,studio:v.studio,document:v.document};
  return fail();
}

export function toRequest(value:Calculation):ToolRequest {
  if(value.tool==='expression')return {schema:1,module:'scientific',operation:'evaluate',input:value.expression,options:{}};
  return {schema:1,module:'financial',operation:'compound_interest',
    input:JSON.stringify({principal:value.principal,rate:value.rate,periods:value.periods}),options:{currency:value.currency}};
}

export type ResultRecord={schema:1;contract:"dars-intelligence/1";interpretation:Calculation;source:Source;request:ToolRequest;proof:CalculationProof;explanation?:{verified:false;text:string;source:NonNullable<Source>}};
export function resultRecord(proposal:Calculation, source:Source, proof:CalculationProof):ResultRecord {
  const request=toRequest(proposal);
  if(proof.module!==request.module||proof.operation!==request.operation)throw new Error('invalid_response');
  return {schema:1,contract:'dars-intelligence/1',interpretation:proposal,source,request,proof};
}

/** Read only the interpretation for explicit fresh execution. Disregard attached historic results. */
export function readRecipe(text:string):Proposal {
  if(new TextEncoder().encode(text).length>131072)throw new Error('limit');
  const v:unknown=JSON.parse(text);
  return object(v)&&v.contract==='dars-intelligence/1'&&v.schema===1
    ? parseProposal(JSON.stringify(v.interpretation)) : parseProposal(text);
}

const internal = ()=> (window as Window & {__TAURI_INTERNALS__?:{invoke(command:string,args:unknown):Promise<unknown>}}).__TAURI_INTERNALS__;
export function nativeGateway():boolean {
  return (location.origin==='http://tauri.localhost'||location.origin==='https://tauri.localhost'
    || (location.protocol==='tauri:'&&location.hostname==='localhost'&&!location.port)) && typeof internal()?.invoke==='function';
}
export function command<T>(request:Record<string,unknown>):Promise<T> {
  if(!nativeGateway())return Promise.reject(new Error('native_required'));
  return internal()!.invoke('dars_intelligence',{request}) as Promise<T>;
}
let lastGeneration=0;
export function nextGeneration(){return lastGeneration=Math.max(Date.now()*1000,lastGeneration+1);}
