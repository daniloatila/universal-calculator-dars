import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dataLabels } from '../src/data-lab-labels';
import en from '../src/locales/en.json' with { type: 'json' };

const t = dataLabels.en;
const file = (page: Page) => page.getByTestId('data-lab-file');
const result = (page: Page) => page.getByTestId('data-lab-result');
const run = (page: Page) => page.getByTestId('data-lab-run');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const option = (page: Page, label: string) => page.getByRole('combobox', { name: label, exact: true });
const table = (page: Page) => page.getByRole('table');

type Summary = {
  sha256: string;
  rows: number;
  source_rows: number;
  sheet?: string;
  steps: { operation: string; input_rows: number; output_rows: number; reduced_rows: number }[];
};

async function open(page: Page) {
  await page.goto('/');
  await option(page, en.operations.modulePicker).selectOption('data-lab');
  await expect(file(page)).toBeVisible();
}

async function inspect(page: Page) {
  await run(page).click();
  await expect(run(page)).toBeEnabled();
  await expect(result(page)).toBeVisible();
  const record = await result(page).getAttribute('data-canonical');
  return JSON.parse(record ?? '{}') as Summary;
}

async function download(page: Page, link: Locator) {
  const [record] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return { name: record.suggestedFilename(), bytes: await readFile(await record.path()) };
}

test('Data Lab applies explicit import conventions, replays native steps and exports protected and literal CSV', async ({ page }, info) => {
  await open(page);
  const csv = Buffer.from('id;amount;note\n001;1,25;=1+1\n001;1,25;=1+1\n002;;<b>literal</b>\n003;2,50;café\n', 'latin1');
  await file(page).setInputFiles({ name: 'sample.csv', mimeType: 'text/csv', buffer: csv });
  await page.getByText(t.advanced, { exact: true }).click();
  await option(page, t.delimiter).selectOption(';');
  await option(page, t.encoding).selectOption('latin1');
  await option(page, t.decimal).selectOption('comma');
  await option(page, t.header).selectOption('present');
  const original = await inspect(page);
  expect(original).toMatchObject({ rows: 4, source_rows: 4, steps: [] });
  await expect(table(page)).toContainText('001');
  await expect(table(page)).toContainText('café');
  await expect(table(page)).toContainText('<b>literal</b>');
  await expect(table(page).locator('tbody td b')).toHaveCount(0);
  await option(page, 'amount').selectOption('decimal');
  await option(page, t.columns).selectOption('id');
  await option(page, t.pipeline).selectOption('deduplicate');
  await button(page, t.add).click();
  await option(page, t.columns).selectOption('amount');
  await option(page, t.pipeline).selectOption('drop_missing');
  await button(page, t.add).click();
  const transformed = await inspect(page);
  expect(transformed).toMatchObject({ rows: 2, source_rows: 4, sha256: original.sha256 });
  expect(transformed.steps).toMatchObject([
    { operation: 'deduplicate', input_rows: 4, output_rows: 3, reduced_rows: 1 },
    { operation: 'drop_missing', input_rows: 3, output_rows: 2, reduced_rows: 1 },
  ]);
  await expect(table(page)).toContainText('1,25');
  await expect(page.locator('.data-stat').filter({ hasText: 'amount' })).toContainText('15/4');
  const guarded = await download(page, button(page, t.protected));
  const literal = await download(page, button(page, t.literal));
  expect(guarded.name).toBe('dars-data.csv');
  expect(guarded.bytes.toString()).toContain("'=1+1");
  expect(literal.bytes.toString()).toContain(',=1+1');
  expect(literal.bytes.toString()).not.toContain("'=1+1");
  const pipeline = await download(page, button(page, t.save));
  expect(pipeline.name).toBe('dars-pipeline.json');
  expect(JSON.parse(pipeline.bytes.toString())).toMatchObject({
    version: 'data-lab/2',
    configuration: { semantics_version: 2, format: 'csv', encoding: 'latin1', decimal: 'comma', delimiter: ';',
      steps: [{ op: 'deduplicate', columns: ['id'] }, { op: 'drop_missing', column: 'amount' }] },
  });
  const proof = await download(page, page.getByTestId('data-lab-proof-export'));
  expect(JSON.parse(proof.bytes.toString())).toMatchObject({
    module: 'data-lab', operation: 'dataset', variables: { sha256: original.sha256 },
  });

  await open(page);
  const replayBytes = Buffer.from('id;amount;note\nA;3,50;x\nA;3,50;x\nB;;y\nC;4,00;z\n', 'latin1');
  await file(page).setInputFiles({ name: 'compatible.csv', mimeType: 'text/csv', buffer: replayBytes });
  await page.getByText(t.advanced, { exact: true }).click();
  await page.getByLabel(t.load, { exact: true }).setInputFiles({
    name: 'pipeline.json', mimeType: 'application/json', buffer: pipeline.bytes,
  });
  await expect(option(page, t.delimiter)).toHaveValue(';');
  const replay = await inspect(page);
  expect(replay.rows).toBe(2);
  expect(replay.steps).toEqual(transformed.steps);
  expect(replay.sha256).not.toBe(original.sha256);
  await info.attach('data-lab-pipeline-ui', { contentType: 'application/json', body: JSON.stringify({
    sourceHash: original.sha256, replayHash: replay.sha256, steps: replay.steps,
    checks: { leadingZero: true, literalMarkup: true, latin1: true, protectedCsv: true, literalCsv: true },
  }) });
});

test('Data Lab accepts TSV, precision-preserving tabular JSON and an XLSX sheet with a stored formula cache', async ({ page }, info) => {
  await open(page);
  await page.getByText(t.advanced, { exact: true }).click();
  const encoded = Buffer.concat([Buffer.from([255, 254]), Buffer.from('id\tamount\n0007\t3.75\n', 'utf16le')]);
  await file(page).setInputFiles({ name: 'sample.tsv', mimeType: 'text/tab-separated-values', buffer: encoded });
  await option(page, t.encoding).selectOption('utf16le');
  expect((await inspect(page)).rows).toBe(1);
  await expect(table(page)).toContainText('0007');
  await expect(table(page)).toContainText('3.75');

  await file(page).setInputFiles({ name: 'sample.json', mimeType: 'application/json',
    buffer: Buffer.from('[{"id":"0011","amount":900719925474099312345},{"id":"0012","amount":null}]') });
  await option(page, t.encoding).selectOption('utf8');
  expect((await inspect(page)).rows).toBe(2);
  await expect(table(page)).toContainText('0011');
  await expect(table(page)).toContainText('900719925474099312345');

  const fixture = fileURLToPath(new URL('./fixtures/data-lab-example.xlsx', import.meta.url));
  await file(page).setInputFiles(fixture);
  const cached = await inspect(page);
  expect(cached).toMatchObject({ rows: 1, sheet: 'Cached' });
  await expect(table(page)).toContainText('001');
  await expect(table(page)).toContainText(t.cache);
  await option(page, t.sheet).selectOption('Alternate');
  expect((await inspect(page)).sheet).toBe('Alternate');
  await expect(table(page)).toContainText('002');
  await expect(table(page)).toContainText('42');
  await info.attach('data-lab-browser-formats', { contentType: 'application/json',
    body: JSON.stringify({ tsv: 'UTF-16LE', tabularJson: 'exact 21-digit input', xlsx: ['Cached', 'Alternate'], formulaCache: true }) });
});

test('Data Lab cancels a live import Worker and starts a healthy successor on the same page', async ({ page }, info) => {
  await page.addInitScript(() => {
    const native = window.Worker;
    const state = { active: 0, peak: 0, terminations: 0, progress: [] as number[], hold: true };
    Object.assign(window, { darsDataLabWorkers: state });
    window.Worker = class extends native {
      private owned = false;
      constructor(path: string | URL, options?: WorkerOptions) {
        super(path, options);
        if (!String(path).includes('data-lab-worker')) return;
        this.owned = true;
        state.active++;
        state.peak = Math.max(state.peak, state.active);
        this.addEventListener('message', (event) => {
          if (event.data.type === 'progress') state.progress.push(event.data.completed);
          else if (state.hold) event.stopImmediatePropagation();
        });
      }
      terminate() {
        if (this.owned) { this.owned = false; state.active--; state.terminations++; }
        super.terminate();
      }
    };
  });
  type Probe = { active: number; peak: number; terminations: number; progress: number[]; hold: boolean };
  const state = () => page.evaluate(() => (window as unknown as { darsDataLabWorkers: Probe }).darsDataLabWorkers);
  const rows = 1000;
  const fixture = 'id,amount\n' + Array.from({ length: rows }, (_, index) => 'id' + index + ',' + index + '.25').join('\n');
  await open(page);
  await file(page).setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture) });
  await run(page).click();
  await expect.poll(async () => (await state()).progress.length).toBeGreaterThan(1);
  await expect(page.getByRole('progressbar')).toBeVisible();
  await button(page, en.cancelCalculation).click();
  await expect.poll(async () => (await state()).terminations).toBe(1);
  expect((await state()).active).toBe(0);
  await expect(result(page)).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { darsDataLabWorkers: Probe }).darsDataLabWorkers.hold = false; });
  expect((await inspect(page)).rows).toBe(rows);
  expect(await state()).toMatchObject({ terminations: 2, peak: 1, active: 0 });
  await info.attach('data-lab-cancel-ui', { contentType: 'application/json', body: JSON.stringify({ rows, ...await state() }) });
});
