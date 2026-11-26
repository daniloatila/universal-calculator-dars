/** Bounded offline OCR for high-contrast, single-line, printed arithmetic. */
const WIDTH=18, HEIGHT=24, SIZE=WIDTH*HEIGHT;
const ALPHABET='0123456789+-*/().';
type Shape={left:number;right:number;top:number;bottom:number};
type Token={glyph:string;mask:Uint8Array;aspect:number};
let templates:Token[]|undefined;
function raster(context:CanvasRenderingContext2D,w:number,h:number) {
  const data=context.getImageData(0,0,w,h).data;
  const gray=(i:number)=>{
    const alpha=data[i+3]!/255;
    return (data[i]!*0.299+data[i+1]!*0.587+data[i+2]!*0.114)*alpha+255*(1-alpha);
  };
  const light=[0,w-1,(h-1)*w,w*h-1].filter(i=>gray(i*4)>127).length>=2;
  const mask=new Uint8Array(w*h);
  for(let i=0;i<mask.length;i++) mask[i]=Number(light?gray(i*4)<145:gray(i*4)>155);
  return mask;
}
function segments(mask:Uint8Array,w:number,h:number):Shape[] {
  const output:Shape[]=[];
  let active:Shape|undefined;
  for(let x=0;x<w;x++){
    let top=h,bottom=-1;
    for(let y=0;y<h;y++)if(mask[y*w+x]){top=Math.min(y,top);bottom=y;}
    if(bottom<0){if(active){output.push(active);active=undefined;}continue;}
    if(!active)active={left:x,right:x,top,bottom};
    else {active.right=x;active.top=Math.min(active.top,top);active.bottom=Math.max(active.bottom,bottom);}
  }
  if(active)output.push(active);
  return output;
}
function token(mask:Uint8Array,w:number,box:Shape,glyph=''):Token {
  const width=box.right-box.left+1,height=box.bottom-box.top+1;
  const grid=new Uint8Array(SIZE);
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const sx=Math.min(box.right,box.left+Math.floor((x+.5)*width/WIDTH));
    const sy=Math.min(box.bottom,box.top+Math.floor((y+.5)*height/HEIGHT));
    grid[y*WIDTH+x]=mask[sy*w+sx]!;
  }
  return {glyph,mask:grid,aspect:width/height};
}
function alphabet() {
  if(templates)return templates;
  const canvas=document.createElement('canvas');canvas.width=90;canvas.height=80;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('unavailable');
  const built:Token[]=[];
  for(const family of ['monospace','Arial','serif'])for(const glyph of ALPHABET){
    ctx.clearRect(0,0,90,80);ctx.font='48px '+family;ctx.fillStyle='#000';ctx.fillText(glyph,12,55);
    const mask=raster(ctx,90,80),boxes=segments(mask,90,80);
    if(boxes.length===1)built.push(token(mask,90,boxes[0]!,glyph));
  }
  templates=built;return built;
}

export async function readPrintedExpression(file:File,signal:AbortSignal):Promise<string>{
  if(file.size<33||file.size>1024*1024)throw new Error('limit');
  const header=new DataView(await file.slice(0,33).arrayBuffer());
  if(header.getUint32(0)!==0x89504e47||header.getUint32(4)!==0x0d0a1a0a||
     header.getUint32(8)!==13||header.getUint32(12)!==0x49484452)throw new Error('invalid_input');
  const w=header.getUint32(16),h=header.getUint32(20);
  if(w<4||h<4||w>2048||h>512||w*h>524288)throw new Error('limit');
  signal.throwIfAborted();
  const bitmap=await createImageBitmap(file);
  try {
    signal.throwIfAborted();
    if(bitmap.width!==w||bitmap.height!==h)throw new Error('invalid_input');
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); if(!ctx)throw new Error('unavailable');
    ctx.drawImage(bitmap,0,0);
    const mask=raster(ctx,w,h),boxes=segments(mask,w,h);
    if(!boxes.length||boxes.length>128)throw new Error('invalid_input');
    const chars=alphabet();
    const result=boxes.map(box=>{
      const sample=token(mask,w,box);
      const scores=new Map<string,number>();
      for(const ref of chars){
        let mismatch=0;
        for(let i=0;i<SIZE;i++) mismatch+=Number(sample.mask[i]!==ref.mask[i]);
        const score=mismatch/SIZE+0.19*Math.min(3,Math.abs(Math.log(sample.aspect/ref.aspect)));
        scores.set(ref.glyph,Math.min(scores.get(ref.glyph)??Infinity,score));
      }
      const sorted=[...scores].sort((a,b)=>a[1]-b[1]);
      if(sorted[0]![1]>.34 || sorted[1]![1]-sorted[0]![1]<.012)throw new Error('invalid_input');
      return sorted[0]![0];
    }).join('');
    return result;
  } finally {bitmap.close();}
}

interface Recognition {
  processLocally:boolean;lang:string;continuous:boolean;interimResults:boolean;
  start():void; abort():void;
  onresult:((e:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;
  onerror:(()=>void)|null;onend:(()=>void)|null;
}
type SpeechAPI={new():Recognition;available?(options:{langs:string[];processLocally:true}):Promise<string>};
function api():SpeechAPI|undefined{
  const w=window as Window & {SpeechRecognition?:SpeechAPI;webkitSpeechRecognition?:SpeechAPI};
  return w.SpeechRecognition??w.webkitSpeechRecognition;
}
export async function hasLocalDictation(locale:string):Promise<boolean>{
  const type=api();
  if(!type?.available || !('processLocally' in type.prototype))return false;
  try {return await type.available({langs:[locale],processLocally:true})==='available';}catch{return false;}
}
export async function dictate(locale:string,signal:AbortSignal):Promise<string>{
  const type=api(); if(!type||!await hasLocalDictation(locale))throw new Error('unavailable');
  signal.throwIfAborted();
  const recognition=new type();recognition.lang=locale;recognition.processLocally=true;recognition.continuous=false;recognition.interimResults=false;
  return new Promise((resolve,reject)=>{
    let settled=false;
    function stop(result?:string){
      if(settled)return;settled=true;clearTimeout(timeout);
      recognition.onresult=null;recognition.onerror=null;recognition.onend=null;
      signal.removeEventListener('abort',cancel);
      try {recognition.abort();}catch{/* already ended */}
      if(result&&result.length<=512)resolve(result);else reject(new Error(signal.aborted?'cancelled':'unavailable'));
    }
    const cancel=()=>stop();
    const timeout=setTimeout(cancel,15000);
    recognition.onresult=e=>stop(e.results[0]?.[0]?.transcript.trim());
    recognition.onerror=cancel;recognition.onend=cancel;signal.addEventListener('abort',cancel,{once:true});
    try{recognition.start();}catch{cancel();}
  });
}
export function localVoice(locale:string){
  const lang=locale.toLowerCase().split('-')[0];
  return window.speechSynthesis?.getVoices().find(v=>v.localService && v.lang.toLowerCase().split('-')[0]===lang);
}
export function speakLocal(text:string,locale:string):void {
  const voice=localVoice(locale);if(!voice||!text||text.length>2048)throw new Error('unavailable');
  const speech=new SpeechSynthesisUtterance(text);speech.voice=voice;speech.lang=voice.lang;
  window.speechSynthesis.cancel();window.speechSynthesis.speak(speech);
}
