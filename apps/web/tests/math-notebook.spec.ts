import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LOCALES, type Locale } from '../src/i18n';
import { financialNotebook, newCell, type NotebookDocument, type NotebookRecord } from '../src/notebook-document';
import { notebookLabels } from '../src/notebook-labels';
import { localizedDecimal } from '../src/locale-format';

const languages=Object.keys(LOCALES) as Locale[];
const exact='1126825030131969720661201/100000000000000000000';
const nextExact='309629344375621415601/24414062500000000';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const file=(d:unknown)=>({name:'example.darsnb',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});
async function open(page:Page) {
  await page.goto('/'); await page.locator('.module-navigation-picker select').selectOption('math-notebook');
  await expect(page.getByTestId('notebook-workspace')).toBeVisible();
}
async function language(page:Page,locale:Locale) {
  const settings=page.locator('details.settings');
  if(await settings.getAttribute('open')===null) await settings.locator('summary').click();
  await settings.locator('select').first().selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await settings.locator('summary').click();
}
async function record(page:Page,key:string):Promise<NotebookRecord> {
  const details=page.getByTestId('notebook-cell-'+key).locator('[data-notebook-details]');
  const initiallyOpen=await details.getAttribute('open')!==null;
  if(!initiallyOpen) await details.locator('summary').click();
  const record=JSON.parse(await details.locator('pre').innerText()) as NotebookRecord;
  if(!initiallyOpen) await details.locator('summary').click();
  return record;
}
test('financial notebook replays the exact Rust plan and selectively recalculates the changed rate',async({page},info)=>{
  await open(page);await page.getByTestId('notebook-example').click();await page.getByTestId('notebook-run').click();
  await expect(page.getByTestId('notebook-result-growth')).toHaveAttribute('data-canonical',exact);
  await expect(page.getByTestId('notebook-result-growth')).toContainText('11,268.25');
  await expect(page.getByTestId('notebook-result-gain')).toHaveAttribute('data-canonical','126825030131969720661201/100000000000000000000');
  const growth=await record(page,'growth'), capital=await record(page,'capital');
  expect(growth.output.series).toHaveLength(13);
  expect(growth.output.proofs).toHaveLength(13);
  expect(growth.output.proofs?.every((p,i)=>p.module==='financial'&&p.operation==='compound_interest'&&JSON.parse(p.expression).periods===i)).toBe(true);
  await expect(page.getByTestId('notebook-cell-trajectory').getByRole('img')).toBeVisible();
  await info.attach('math-notebook-financial.png',{body:await page.getByTestId('notebook-workspace').screenshot(),contentType:'image/png'});
  await page.getByTestId('notebook-select-rate').click();
  await page.getByTestId('notebook-edit').click();await page.getByTestId('notebook-source').fill('0.02');
  await page.getByTestId('notebook-apply').click();await expect(page.getByTestId('notebook-result-growth')).toHaveAttribute('data-canonical',nextExact);
  expect((await page.getByTestId('notebook-executed').innerText()).split(' · ')[1]).toBe('rate, growth, gain, trajectory, verification');
  expect(await record(page,'capital')).toEqual(capital);
  const modified=await record(page,'growth');
  expect(modified.inputs.rate?.value).toBe('1/50');
  const exporting=page.waitForEvent('download');await page.getByTestId('notebook-export').click();
  const exported=JSON.parse(await readFile((await (await exporting).path())!,'utf8'));
  await page.getByTestId('notebook-import').setInputFiles(file(exported));
  await expect(page.getByTestId('notebook-cell-growth').locator('.notebook-status')).toHaveAttribute('data-state','historical');
  await page.getByTestId('notebook-run').click();
  await expect(page.getByTestId('notebook-cell-growth').locator('.notebook-status')).toHaveAttribute('data-state','current');
  expect((await record(page,'growth')).output).toEqual(modified.output);
  await info.attach('math-notebook-financial.json',{body:JSON.stringify({first:exact,second:nextExact,series_count:13,changed:['rate','growth','gain','trajectory','verification'],unchanged:['capital','months'],proof_sha256:hash(modified.output.proofs),replayed:true}),contentType:'application/json'});
});
test('notebook cell editing, reorder, keyboard undo/redo, type errors and cycles remain local',async({page})=>{
  await open(page);await page.getByRole('button',{name:'New document',exact:true}).click();
  await page.getByTestId('notebook-new-kind').selectOption('expression');await page.getByTestId('notebook-add').click();
  await page.getByTestId('notebook-source').fill('2*3');await page.getByTestId('notebook-apply').click();
  await page.getByTestId('notebook-run').click();await expect(page.getByTestId('notebook-result-cell_1')).toHaveAttribute('data-canonical','6');
  await page.getByRole('button',{name:'Duplicate',exact:true}).click();
  await page.getByTestId('notebook-source').fill('@cell_1+1');await page.getByTestId('notebook-apply').click();
  await expect(page.getByTestId('notebook-result-cell_2')).toHaveAttribute('data-canonical','7');
  await page.getByRole('button',{name:'Move up',exact:true}).click();
  expect(await page.locator('.notebook-outline li button').first().getAttribute('data-testid')).toBe('notebook-select-cell_2');
  await page.getByRole('button',{name:'Remove',exact:true}).click();
  await expect(page.getByTestId('notebook-cell-cell_2')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByTestId('notebook-cell-cell_2')).toBeVisible();
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await expect(page.getByTestId('notebook-cell-cell_2')).toHaveCount(0);
  const d=financialNotebook('en',notebookLabels.en.sampleNames);
  d.cells=d.cells.map(c=>c.id==='capital'?{...c,unit:'m'}:c);
  await page.getByTestId('notebook-import').setInputFiles(file(d));await page.getByTestId('notebook-run').click();
  await expect(page.getByTestId('notebook-cell-growth').getByRole('alert')).toHaveText('Incompatible units');
  await expect(page.getByTestId('notebook-cell-gain').getByRole('alert')).toHaveText('A dependency failed');
  const ref=newCell('expression',[],'en');
  d.cells=[{...ref,id:'a',source:'@b+1'},{...ref,id:'b',source:'@a-1'},{...ref,id:'free',source:'1+2'}];
  await page.getByTestId('notebook-import').setInputFiles(file(d));await page.getByTestId('notebook-run').click();
  await expect(page.getByTestId('notebook-cell-a').getByRole('alert')).toHaveText('Circular reference');
  await expect(page.getByTestId('notebook-result-free')).toHaveAttribute('data-canonical','3');
});
test('portable notebook keeps stored data inert and rejects invalid documents without disturbing the current one',async({page})=>{
  const outside:string[]=[];page.on('request',r=>{if(/^https?:/.test(r.url()) && !['localhost','127.0.0.1'].includes(new URL(r.url()).hostname)) outside.push(r.url());});
  await open(page);
  const d=financialNotebook('en',notebookLabels.en.sampleNames);
  d.cells=[{...newCell('text',[],'en'),id:'note',source:'**Local note**\n<em>untrusted instructions</em>'}];
  await page.getByTestId('notebook-import').setInputFiles(file(d));
  await expect(page.getByTestId('notebook-cell-note')).toContainText('<em>untrusted instructions</em>');
  await expect(page.getByTestId('notebook-run')).toHaveText('Authorize recalculation');
  await page.getByTestId('notebook-import').setInputFiles(file({...d,execute:true}));
  await expect(page.getByRole('alert')).toHaveText('Invalid input');
  await expect(page.getByTestId('notebook-cell-note')).toBeVisible();
  expect(outside).toEqual([]);
});
test('notebook computes pinned community formulas, scientific expressions, tables and charts offline',async({page,context})=>{
  await open(page);
  const base=newCell('variable',[],'en');
  const numeric={...base,id:'a',symbol:'a',source:'2'};
  const d:NotebookDocument={format:'dars-notebook',version:1,title:'Cells',cells:[
    numeric,{...numeric,id:'b',symbol:'b',source:'4'},
    {...newCell('formula',[],'en'),id:'mean',source:'{"id":"arithmetic-mean","version":"1.0.0","inputs":{"a":"@a","b":"@b"}}'},
    {...newCell('scientific',[],'en'),id:'calc',source:'sqrt(9)'},
    {...newCell('table',[],'en'),id:'table',source:'[["x","y"],["0","@a"],["1","@mean"]]'},
    {...newCell('chart',[],'en'),id:'graph',source:'@table'},
  ]};
  await page.getByTestId('notebook-import').setInputFiles(file(d));await page.getByTestId('notebook-run').click();
  await expect(page.getByTestId('notebook-result-mean')).toHaveAttribute('data-canonical','3');
  await expect(page.getByTestId('notebook-result-calc')).toHaveAttribute('data-canonical','3');
  expect((await record(page,'mean')).output.formula?.version).toBe('1.0.0');
  const proof=await record(page,'mean');
  await expect(page.getByTestId('notebook-cell-graph').getByRole('img')).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByTestId('notebook-export').click();
  const bundled=JSON.parse(await readFile((await (await download).path())!,'utf8'));
  expect(bundled.formulaDefinitions.map((f:{id:string;version:string})=>f.id+'@'+f.version)).toContain('arithmetic-mean@1.0.0');
  await context.setOffline(true);
  await page.getByTestId('notebook-import').setInputFiles(file(bundled));await page.getByTestId('notebook-run').click();
  await expect(page.getByTestId('notebook-result-mean')).toHaveAttribute('data-canonical','3');
  expect((await record(page,'mean')).output).toEqual(proof.output);
  await context.setOffline(false);
});
test('a notebook can cancel a live financial projection, release its worker and recover with new data',async({page},info)=>{
  await page.addInitScript(()=>{
    const original=window.Worker;
    const counts={opened:0,closed:0,financial:0};
    Object.assign(window,{notebookWorkerCounts:counts});
    window.Worker=class extends original{
      private done=false;
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);counts.opened++;}
      postMessage(input:unknown,options?:StructuredSerializeOptions|Transferable[]){
        if(typeof input==='object'&&input!==null&&'module' in input&&input.module==='financial')counts.financial++;
        if(Array.isArray(options))super.postMessage(input,options);else super.postMessage(input,options);
      }
      terminate(){if(!this.done){counts.closed++;this.done=true;}super.terminate();}
    };
  });
  const count=()=>page.evaluate(()=>(window as unknown as {notebookWorkerCounts:{opened:number;closed:number;financial:number}}).notebookWorkerCounts);
  await open(page);
  const baseline=await count();
  const d=financialNotebook('en',notebookLabels.en.sampleNames);
  d.cells=d.cells.map(c=>c.id==='months'?{...c,source:'120'}:c);
  await page.getByTestId('notebook-import').setInputFiles(file(d));await page.getByTestId('notebook-run').click();
  await expect.poll(async()=>(await count()).financial).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Cancelled');
  await expect(page.getByTestId('notebook-result-growth')).toHaveCount(0);
  const candidate=newCell('expression',[],'en');candidate.source='4+5';
  await page.getByTestId('notebook-import').setInputFiles(file({...d,cells:[candidate]}));
  await page.getByTestId('notebook-run').click();
  await expect(page.getByTestId('notebook-result-'+candidate.id)).toHaveAttribute('data-canonical','9');
  const runtime=await count();
  expect(runtime.financial).toBeLessThan(121);
  expect(runtime.opened-runtime.closed).toBe(baseline.opened-baseline.closed);
  await info.attach('math-notebook-cancellation.json',{body:JSON.stringify({partial_finance_requests:runtime.financial,workers:runtime,recovered:'9',stale_output:false}),contentType:'application/json'});
});
test('42 Math Notebook source-to-presentation transitions preserve exact operands and proof',async({page},info)=>{
  test.setTimeout(120_000);
  await open(page);
  const comparisons=[];const result='36028797018963973/4';
  for(const source of languages) {
    const dec=localizedDecimal(source);
    const digits=(s:string)=>s.replace('.',dec);
    const variable={...newCell('variable',[],source),id:'raw',symbol:'raw',source:digits('9007199254740993.125')};
    const expression={...newCell('expression',[],source),id:'sum',source:'@raw+'+digits('0.125')};
    const d:NotebookDocument={format:'dars-notebook',version:1,title:'Exact',cells:[variable,expression]};
    for(const target of languages.filter(t=>t!==source)) {
      await language(page,source);await page.getByTestId('notebook-import').setInputFiles(file(d));
      await expect(page.getByTestId('notebook-cell-raw')).toBeVisible();
      await language(page,target);await page.getByTestId('notebook-run').click();
      await expect(page.getByTestId('notebook-result-sum')).toHaveAttribute('data-canonical',result);
      const sum=await record(page,'sum');
      expect(sum.origin).toBe(source);expect(sum.output.proofs?.[0]?.result).toBe(result);
      comparisons.push({source,target,canonical:sum.output.proofs![0]!.normalized,result,proof_sha256:hash(sum.output.proofs![0])});
    }
  }
  expect(comparisons).toHaveLength(42);
  expect(new Set(comparisons.map(c=>c.proof_sha256)).size).toBe(1);
  await info.attach('math-notebook-locales.json',{body:JSON.stringify({module:'math-notebook',total:42,comparisons}),contentType:'application/json'});
});
