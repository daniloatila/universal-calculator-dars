import {expect,test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {LOCALES} from '../src/i18n';
import type {Locale} from '../src/i18n';
import {localizedDecimal} from '../src/locale-format';
import en from '../src/locales/en.json' with {type:'json'};
import type {FlowReceipt} from '../src/automation-flow';

const languages=Object.keys(LOCALES) as Locale[];
async function language(page:Page,locale:Locale) {
  const settings=page.locator('details.settings');
  await settings.locator('summary').click();
  await settings.locator('select').first().selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await settings.locator('summary').click();
}
async function open(page:Page) {
  await page.goto('/');
  await page.getByRole('combobox',{name:en.operations.modulePicker}).selectOption('automation-studio');
  await expect(page.getByTestId('flow-run')).toBeVisible();
}
async function execute(page:Page) {
  await page.getByTestId('flow-run').click();
  await expect(page.getByTestId('flow-results')).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByTestId('flow-proof').click();
  const saved=await download;
  return JSON.parse(await readFile((await saved.path())!,'utf8')) as FlowReceipt;
}
for(const source of languages) test('Automation preserves the '+source+' notation across remaining languages',async({page},info)=>{
  test.setTimeout(90000);
  await open(page);await language(page,source);
  const editor=page.getByTestId('flow-input-rate_a');
  const amount='0'+localizedDecimal(source)+'0125';
  await editor.fill(amount);
  const baseline=await execute(page);
  expect(baseline.status).toBe('verified');
  const signature=(r:FlowReceipt)=>createHash('sha256').update(JSON.stringify([r.flow,r.trace,r.outputs])).digest('hex');
  const digest=signature(baseline);
  const comparisons=[];
  for(const target of languages.filter(l=>l!==source)){
    // Restore the directed source language with the same saved typed source before each transition.
    if(await page.locator('html').getAttribute('lang')!==source)await language(page,source);
    await language(page,target);
    await expect(editor).toHaveValue(amount);
    const next=await execute(page);
    expect(next.status).toBe('verified');expect(signature(next)).toBe(digest);
    comparisons.push({source,target,source_text:amount,canonical:'0.0125',proof_sha256:digest});
  }
  await info.attach('automation-locales.json',{body:JSON.stringify({module:'automation-studio',comparisons,total:6}),contentType:'application/json'});
});
test('Automation opens files inertly, completes four local flows and rejects a forward reference',async({page},info)=>{
  await open(page);
  const file=page.locator('[data-testid="automation-studio"] input[type=file]').first();
  const doc={format:'dars-flow',version:1,id:'local',inputs:{},steps:[{id:'out',op:'let',value:'9'}],outputs:['out']};
  await file.setInputFiles({name:'ordinary.darsflow',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await expect(page.getByTestId('flow-status')).toContainText('open for review');await expect(page.getByTestId('flow-results')).toHaveCount(0);
  expect((await execute(page)).trace.every(step=>!step.proof)).toBe(true);
  await expect(page.getByTestId('flow-status')).toHaveText('Flow completed');
  for(const demo of ['finance','business','statistics','science']){
    await page.getByTestId('flow-demo').selectOption(demo);await page.getByTestId('flow-example').click();
    const r=await execute(page);expect(r.status).toBe('verified');
    if(demo==='science')await expect(page.getByTestId('flow-approximate')).toBeVisible();
    if(demo==='statistics')await info.attach('automation-preview.png',{body:await page.getByTestId('automation-studio').screenshot(),contentType:'image/png'});
  }
  await page.getByTestId('flow-editor').fill(JSON.stringify({...doc,steps:[{id:'out',op:'let',value:{ref:'missing'}}]}));
  await page.getByTestId('flow-run').click();await expect(page.getByTestId('flow-status')).toContainText('invalid_reference');
  await expect(page.getByTestId('flow-results')).toHaveCount(0);
});
test('A saved automation proof opens for review and requires an exact replay',async({page})=>{
  await open(page);
  const saved=await execute(page);
  const picker=page.locator('[data-testid="automation-studio"] input[type=file]').first();
  const load=(value:FlowReceipt)=>picker.setInputFiles({name:'recipe.proof.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await load(saved);
  await expect(page.getByTestId('flow-results')).toHaveCount(0);
  expect((await execute(page)).outputs).toEqual(saved.outputs);
  await load({...saved,outputs:{winner:'altered'}});
  await page.getByTestId('flow-run').click();
  await expect(page.getByTestId('flow-status')).toContainText('replay_mismatch');
  await expect(page.getByTestId('flow-results')).toHaveCount(0);
});
