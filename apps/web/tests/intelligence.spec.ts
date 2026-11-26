import {expect,test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {investment} from '../src/intelligence-contract';
async function open(page:Page){
  await page.goto('./');await page.locator('.operations > summary').click();
  await page.getByTestId('open-intelligence').click();await expect(page.getByTestId('intelligence-panel')).toBeVisible();
}
async function load(page:Page,value:unknown){
  await page.getByTestId('intelligence-import').setInputFiles({name:'synthetic.darsai',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
}
async function calculate(page:Page){
  await page.getByTestId('intelligence-validate').click();
  await page.getByTestId('intelligence-run').click();await expect(page.getByTestId('intelligence-status')).toHaveText('Verified by Rust');
}
test('A well-formed proposal still needs Rust to validate its mathematical expression',async({page})=>{
  await open(page);
  await load(page,{schema:1,kind:'calculate',tool:'expression',expression:'2+'});
  await page.getByTestId('intelligence-validate').click();
  await expect(page.getByTestId('intelligence-status')).toContainText('Structure validated');
  await page.getByTestId('intelligence-run').click();
  await expect(page.getByTestId('intelligence-status')).toContainText('Failed');
  await expect(page.getByTestId('intelligence-result')).toHaveCount(0);
});
test('Intelligence is off by default; synthetic financial proposal replays with the real Rust engine and zero external calls',async({page,baseURL},info)=>{
  const requests:string[]=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==new URL(baseURL!).origin&&url.protocol!=='data:'){requests.push(url.origin);await route.abort();}
    else await route.continue();
  });
  await open(page);await expect(page.getByTestId('intelligence-mode')).toHaveValue('disabled');
  await page.getByTestId('intelligence-example').click();
  await expect(page.getByTestId('intelligence-run')).toBeDisabled();await calculate(page);
  const result=await page.getByTestId('intelligence-result').textContent();
  expect(result).toContain('11268.25');
  await info.attach('verified-investment',{body:await page.getByTestId('intelligence-panel').screenshot(),contentType:'image/png'});
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export replayable proof'}).click();
  const stream=await (await downloaded).createReadStream();const chunks:Buffer[]=[];
  for await(const piece of stream)chunks.push(Buffer.from(piece));
  const record=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(record.interpretation).toEqual(investment);expect(record.proof.result).toEqual(result);
  await load(page,{...record,proof:{result:'invented'}});await expect(page.getByTestId('intelligence-result')).toHaveCount(0);
  await calculate(page);await expect(page.getByTestId('intelligence-result')).toHaveText(result!);
  await page.getByTestId('intelligence-mode').selectOption('external');await expect(page.getByText(/communication requires the desktop/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Review transmission'})).toBeDisabled();expect(requests).toEqual([]);
});
test('Imported suggestion, clarification and model explanation stay unverified; unregistered effects get no controls',async({page})=>{
  await open(page);
  await load(page,{schema:1,kind:'question',text:'Which currency, time horizon and risk assumptions apply?'});
  await expect(page.getByTestId('intelligence-status')).toHaveText('Awaiting information');await expect(page.getByTestId('intelligence-run')).toHaveCount(0);
  await load(page,{schema:1,kind:'explanation',text:'42, an unverified synthetic model statement.'});
  await expect(page.getByTestId('intelligence-status')).toHaveText('Unverified');
  await load(page,{schema:1,kind:'calculate',tool:'unregistered_permission'});
  await expect(page.getByTestId('intelligence-status')).toContainText('Failed');await expect(page.getByTestId('intelligence-result')).toHaveCount(0);
  await load(page,{schema:1,kind:'draft',studio:'notebook',document:{text:'Synthetic instruction requesting unregistered access.'}});
  await expect(page.getByTestId('intelligence-status')).toHaveText('Unverified');await expect(page.getByTestId('intelligence-run')).toHaveCount(0);
  await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByTestId('intelligence-panel')).toHaveCount(0);
});
test('Local OCR on selected synthetic PNG requires human review before Rust computation',async({page},info)=>{
  await open(page);await page.getByTestId('intelligence-panel').getByText('Voice and image',{exact:true}).click();
  const image=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=180;c.height=80;const ctx=c.getContext('2d')!;
    ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='48px monospace';ctx.fillText('2+3',12,55);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByTestId('intelligence-image').setInputFiles({name:'printed.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
  await expect(page.getByTestId('intelligence-recognized')).toHaveValue('2+3');await expect(page.getByTestId('intelligence-result')).toHaveCount(0);
  await page.getByRole('button',{name:'Use reviewed expression'}).click();await calculate(page);await expect(page.getByTestId('intelligence-result')).toHaveText('5');
  await info.attach('reviewed-printed-expression',{body:await page.getByTestId('intelligence-panel').screenshot(),contentType:'image/png'});
});
test('A fresh Rust replay survives the 42 directed language transitions',async({page},info)=>{
  test.setTimeout(130000);
  await page.goto('./');
  const settings=page.locator('details.settings');
  await settings.locator('summary').click();
  const ops=page.locator('details.operations');await ops.locator('summary').click();
  const language=settings.locator('select').first();
  const locales=['en','pt-BR','es','fr','zh-CN','hi','ar'] as const;
  const baseline=new Set<string>();const pairs:string[]=[];
  for(const from of locales)for(const to of locales){
    if(from===to)continue;
    await language.selectOption(from);
    await expect(page.locator('html')).toHaveAttribute('lang',from);
    await language.selectOption(to);
    await expect(page.locator('html')).toHaveAttribute('lang',to);
    await page.getByTestId('open-intelligence').click();
    await load(page,investment);
    await page.getByTestId('intelligence-validate').click();await page.getByTestId('intelligence-run').click();
    const out=page.getByTestId('intelligence-result');await expect(out).toContainText('11268.25');
    baseline.add((await out.textContent())!);pairs.push(from+' → '+to);
    await page.getByTestId('intelligence-panel').locator('header button').click();
  }
  expect(baseline.size).toBe(1);expect(pairs.length).toBe(42);
  await info.attach('language-transitions',{body:JSON.stringify({pairs,results:[...baseline]},null,2),contentType:'application/json'});
});
test('Installed voice availability is observed without capturing or playing audio; invalid images cannot produce a calculation',async({page},info)=>{
  await open(page);const panel=page.getByTestId('intelligence-panel');
  await panel.getByText('Voice and image',{exact:true}).click();
  const availability=await page.evaluate(async()=>{
    type SpeechAPI={prototype:object;available?:(o:{langs:string[];processLocally:true})=>Promise<string>};
    const w=window as Window & {SpeechRecognition?:SpeechAPI;webkitSpeechRecognition?:SpeechAPI};
    const api=w.SpeechRecognition??w.webkitSpeechRecognition;
    const entries=[];
    for(const lang of ['en','pt-BR','es','fr','zh-CN','hi','ar']){
      let recognition='unavailable';
      if(api?.available&&'processLocally' in api.prototype){try{recognition=await api.available({langs:[lang],processLocally:true});}catch{recognition='unavailable';}}
      entries.push({lang,recognition,localVoices:window.speechSynthesis?.getVoices().filter(v=>v.localService&&v.lang.toLowerCase().split('-')[0]===lang.toLowerCase().split('-')[0]).length??0});
    }
    return entries;
  });
  await info.attach('local-voice-availability',{body:JSON.stringify({microphoneOpened:false,audioPlayed:false,entries:availability},null,2),contentType:'application/json'});
  await page.getByTestId('intelligence-image').setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('Synthetic malformed image')});
  await expect(page.getByTestId('intelligence-status')).toContainText('Failed');
  await expect(page.getByTestId('intelligence-recognized')).toHaveValue('');
  await expect(page.getByTestId('intelligence-run')).toHaveCount(0);
});
