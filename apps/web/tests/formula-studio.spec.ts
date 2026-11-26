import { expect,test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LOCALES } from '../src/i18n';
import type { Locale } from '../src/i18n';
import { localizedDecimal } from '../src/locale-format';
import { formulaLabels } from '../src/formula-labels';
import type { FormulaReceipt } from '../src/formula-library';
import en from '../src/locales/en.json' with { type:'json' };

const locales=Object.keys(LOCALES) as Locale[];
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
async function language(page:Page,locale:Locale) {
  const settings=page.locator('details.settings');
  await settings.locator('summary').click();await settings.locator('select').first().selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);await settings.locator('summary').click();
}
async function open(page:Page) {
  await page.goto('/');
  await page.getByRole('combobox',{name:en.operations.modulePicker}).selectOption('formula-studio');
  await expect(page.getByTestId('formula-run')).toBeVisible();
}
async function run(page:Page,locale:Locale,expected:string) {
  await page.getByTestId('formula-run').click();
  const value=page.getByTestId('formula-result');
  await expect(value).toHaveAttribute('data-value',expected);
  const d=page.waitForEvent('download');await page.getByRole('button',{name:formulaLabels[locale].exportRun,exact:true}).click();
  const file=await d;return JSON.parse(await readFile((await file.path())!,'utf8')) as FormulaReceipt;
}
for(const source of locales) {
  test('Formula Studio preserves exact source notation and version from '+source+' to all six other languages',async({page},info)=>{
    await open(page);await language(page,source);
    await page.getByTestId('formula-pick-arithmetic-mean-1.0.0').click();
    const a=page.getByTestId('formula-input-a');await a.fill('');
    const number='2'+localizedDecimal(source)+'25';
    await a.fill(number);
    const b=page.getByTestId('formula-input-b');await b.fill('3/4');
    const baseline=await run(page,source,'3/2');
    expect(baseline.inputs.a).toEqual({value:'2.25',unit:'1'});
    expect(baseline.source_notation?.inputs.a).toEqual({text:number,locale:source});
    expect(baseline.proof.exactness).toBe('exact');
    const rows=[];
    for(const target of locales.filter(l=>l!==source)){
      await language(page,source);
      await language(page,target);await expect(a).toHaveValue(number);
      const next=await run(page,target,'3/2');expect(next).toEqual(baseline);
      rows.push({source,target,module:'formula-studio',formula:next.definition.id+'@'+next.definition.version,
        engine_version:next.proof.engine_version,source_input:number,canonical_input:next.inputs.a!.value,
        result:next.proof.result,unit:next.definition.unit,
        proof_sha256:hash(JSON.stringify(next.proof)),record_sha256:hash(JSON.stringify(next))});
    }
    await info.attach('formula-matrix',{body:JSON.stringify(rows),contentType:'application/json'});
    if(source==='pt-BR') {
      await info.attach('formula-record',{body:JSON.stringify(baseline),contentType:'application/json'});
      await info.attach('formula-studio',{body:await page.locator('.formula-studio').screenshot(),contentType:'image/png'});
    }
  });
}
test('Formula Studio stages imports, rejects failed verification, allows editing, duplication and exact versioned execution',async({page})=>{
  await open(page);
  const file=page.getByTestId('formula-file'), draft=page.getByTestId('formula-definition');
  const library=await readFile(new URL('../../../community/formulas/rectangle-area.json',import.meta.url),'utf8');
  const f=JSON.parse(library);
  f.id='custom-rectangle';f.tests[0].expected='19';
  await file.setInputFiles({name:'custom.darsformula',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f))});
  await expect(page.getByTestId('formula-state')).toHaveText(formulaLabels.en.draft);
  await expect(page.getByTestId('formula-result')).toHaveCount(0);
  await page.getByTestId('formula-verify').click();await expect(page.getByRole('alert')).toContainText('test_failed');
  await expect(page.getByTestId('formula-pick-custom-rectangle-1.0.0')).toHaveCount(0);
  await page.getByText(formulaLabels.en.definition,{exact:true}).click();
  f.tests[0].expected='12';await draft.fill(JSON.stringify(f));
  await page.getByTestId('formula-verify').click();await expect(page.getByTestId('formula-state')).toHaveText(formulaLabels.en.verified);
  const record=await run(page,'en','12');expect(record.proof.result).toBe('12');
  await page.locator('details.formula-proof > summary').click();
  expect(JSON.parse(await page.getByTestId('formula-proof-record').innerText())).toEqual(record);
  await page.getByRole('button',{name:formulaLabels.en.bump,exact:true}).click();
  await page.getByTestId('formula-verify').click();await expect(page.getByTestId('formula-pick-custom-rectangle-1.0.1')).toBeVisible();
  await page.getByRole('button',{name:formulaLabels.en.duplicate,exact:true}).click();
  await page.getByTestId('formula-verify').click();await expect(page.getByTestId('formula-pick-custom-rectangle-copy-1.0.0')).toBeVisible();
});
