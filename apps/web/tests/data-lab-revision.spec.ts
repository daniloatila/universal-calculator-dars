import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dataLabels } from '../src/data-lab-labels';
import en from '../src/locales/en.json' with { type: 'json' };

const t = dataLabels.en;
const mixed = '[{"valor":1.25},{"valor":"2,50"}]';
const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const result = (page: Page) => page.getByTestId('data-lab-result');
const previous = (page: Page) => page.getByTestId('data-lab-previous-result');
const run = (page: Page) => page.getByTestId('data-lab-run');
const controls = (page: Page, name: string) => page.getByRole('combobox', { name, exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const budget = (page: Page) => page.getByTestId('data-lab-budget');
const main = (page: Page) => page.locator('main');
const proofFile = fileURLToPath(new URL('./fixtures/data-lab-v1-proof.json', import.meta.url));
const workbookFactory = fileURLToPath(new URL('../../../tests/fixtures/data_revision_workbook.py', import.meta.url));

type Manifest = {
  sha256: string;
  rows: number;
  source_rows: number;
  profile: { column: { name: string }; origins: Record<string, number>; statistics: null | { n: number; sum: string; mean: string } }[];
  steps: { operation: string; output_rows: number }[];
};

async function open(page: Page) {
  await page.goto('/');
  await controls(page, en.operations.modulePicker).selectOption('data-lab');
  await expect(run(page)).toBeVisible();
}

async function expand(page: Page) {
  const summary = page.locator('.data-lab').getByText(t.advanced, { exact: true });
  if (await summary.locator('..').getAttribute('open') === null) await summary.click();
}

async function language(page: Page, locale: keyof typeof dataLabels) {
  const settings = page.locator('details.settings');
  await settings.locator('summary').click();
  await settings.locator('select').first().selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await settings.locator('summary').click();
}

async function input(page: Page, bytes: string | Buffer, name = 'source.json') {
  await page.getByTestId('data-lab-file').setInputFiles({
    name, mimeType: 'application/octet-stream', buffer: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
  });
}

async function recipe(page: Page, bytes: string | Buffer) {
  await expand(page);
  await page.getByTestId('data-lab-recipe-file').setInputFiles({
    name: 'dars-record.json', mimeType: 'application/json', buffer: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
  });
}

async function inspect(page: Page) {
  await run(page).click();
  await expect(run(page)).toBeEnabled();
  await expect(result(page)).toBeVisible();
  return JSON.parse((await result(page).getAttribute('data-canonical'))!) as Manifest;
}

async function downloaded(page: Page, trigger = page.getByTestId('data-lab-proof-export')) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger.click()]);
  return readFile(await file.path());
}

async function cell(page: Page, row: number, name: string) {
  const labels = await page.getByRole('table').locator('thead th > bdi').allTextContents();
  const index = labels.indexOf(name);
  expect(index).toBeGreaterThanOrEqual(0);
  return page.getByRole('table').locator('tbody tr').nth(row).getByTestId('data-lab-cell').nth(index);
}

async function assertCell(target: Locator, values: { source?: string; state?: string; canonical?: string | null }) {
  if (values.source) await expect(target).toHaveAttribute('data-source-type', values.source);
  if (values.state) await expect(target).toHaveAttribute('data-validity', values.state);
  if (values.canonical === null) await expect(target).not.toHaveAttribute('data-canonical', /./u);
  else if (values.canonical !== undefined) await expect(target).toHaveAttribute('data-canonical', values.canonical);
}

async function details(page: Page, target: Locator) {
  await target.click();
  const view = page.getByTestId('data-lab-cell-details');
  await expect(view).toBeFocused();
  return (label: string) => view.locator('dl div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
}

type WorkerProbe = { started: number; active: number; peak: number; closed: number; held: number; progress: number[]; paused: boolean };

async function watchWorkers(page: Page, paused = false) {
  await page.addInitScript((paused) => {
    const state = { started: 0, active: 0, peak: 0, closed: 0, held: 0, progress: [] as number[], paused };
    Object.assign(window, { darsDataRevisionWorkers: state });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private counted = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('data-lab-worker')) return;
        this.counted = true;
        state.started++;
        state.active++;
        state.peak = Math.max(state.active, state.peak);
        this.addEventListener('message', event => {
          if (event.data.type === 'progress') state.progress.push(event.data.completed);
          else if (state.paused) {
            event.stopImmediatePropagation();
            state.held++;
            Object.assign(window, { darsReleaseDataRevision: () => {
              state.paused = false;
              this.dispatchEvent(new MessageEvent('message', { data: event.data }));
            } });
          }
        });
      }
      terminate() {
        if (this.counted) {
          this.counted = false;
          state.active--;
          state.closed++;
        }
        super.terminate();
      }
    };
  }, paused);
  return () => page.evaluate(() => Reflect.get(window, 'darsDataRevisionWorkers') as WorkerProbe);
}

test('Data Lab separates JSON native numbers, localized text, exact exponents and missing states', async ({ page }, info) => {
  await open(page);
  await input(page, mixed);
  await expand(page);
  await controls(page, t.decimal).selectOption('comma');
  await inspect(page);
  await controls(page, 'valor').selectOption('decimal');
  const baseline = await inspect(page);
  expect(baseline.sha256).toBe(sha256(mixed));
  expect(baseline.profile[0]?.statistics).toMatchObject({ n: 2, sum: '15/4', mean: '15/8' });
  const native = await cell(page, 0, 'valor');
  const localized = await cell(page, 1, 'valor');
  await assertCell(native, { source: 'number', state: 'valid', canonical: '5/4' });
  await assertCell(localized, { source: 'text', state: 'valid', canonical: '5/2' });
  const fields = await details(page, native);
  await expect(fields(t.sourceNotation)).toHaveText(t.nativeJson);
  await expect(fields(t.originalValue)).toHaveText('1.25');
  await page.screenshot({ path: info.outputPath('data-revision-mixed-json-en.png'), fullPage: true });
  await button(page, t.closeDetails).click();
  await expect(native).toBeFocused();
  const localizedFields = await details(page, localized);
  await expect(localizedFields(t.sourceNotation)).toHaveText(t.comma);
  const locales = Object.keys(dataLabels) as (keyof typeof dataLabels)[];
  for (const locale of locales) {
    await language(page, locale);
    const l = dataLabels[locale];
    await expect(budget(page)).toHaveAccessibleName(l.resourceBudget);
    await expect(localizedFields(l.sourceNotation)).toHaveText(l.comma);
    await expect(result(page)).toHaveAttribute('data-canonical', JSON.stringify(baseline));
    if (locale === 'pt-BR') await page.screenshot({ path: info.outputPath('data-revision-mixed-json-pt-BR.png'), fullPage: true });
    if (locale === 'ar') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  }
  await language(page, 'en');

  const more = '[{"valor":123456789012345678901.25e-2,"id":"0007"},{"valor":0},{"valor":""},{"valor":null},{},{"valor":"?"}]';
  await input(page, more);
  const extended = await inspect(page);
  expect(extended.profile.find(x => x.column.name === 'valor')?.statistics).toMatchObject({
    n: 2, sum: '98765431209876543121/80', mean: '98765431209876543121/160',
  });
  await expect(await cell(page, 0, 'id')).toHaveText('0007');
  await assertCell(await cell(page, 0, 'id'), { source: 'text', state: 'valid', canonical: '0007' });
  await assertCell(await cell(page, 1, 'valor'), { source: 'number', state: 'valid', canonical: '0' });
  for (const [i, state] of ['empty', 'null', 'absent', 'invalid'].entries()) {
    await assertCell(await cell(page, i + 2, 'valor'), { state, canonical: null });
  }
  await info.attach('data-revision-json', { contentType: 'application/json', body: JSON.stringify({
    mixed: { sha256: baseline.sha256, statistics: baseline.profile[0]?.statistics }, exact: extended.profile, locales,
  }) });
});

test('Data Lab preserves literal XLSX types, direct and cached dates, both epochs and successive casts', async ({ page }, info) => {
  test.setTimeout(45_000);
  await open(page);
  await expand(page);
  const observed = [];
  for (const epoch of ['1900', '1904']) {
    const fixture = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', workbookFactory, epoch]);
    await input(page, fixture, 'date-types.xlsx');
    await controls(page, t.decimal).selectOption('comma');
    await inspect(page);
    for (const name of ['direct_date', 'formula_date', 'iso_date']) await controls(page, name).selectOption('date');
    for (const name of ['amount', 'cached_number', 'cached_text']) await controls(page, name).selectOption('decimal');
    await controls(page, 'flag').selectOption('boolean');
    const record = await inspect(page);
    expect(record.profile.find(x => x.column.name === 'amount')?.statistics).toMatchObject({ n: 3, sum: '379/100' });
    expect(record.profile.find(x => x.column.name === 'cached_number')?.statistics).toMatchObject({ n: 3, sum: '21/2' });
    expect(record.profile.find(x => x.column.name === 'cached_text')?.statistics).toMatchObject({ n: 3, sum: '45/4' });
    for (const row of [0, 1, 2]) await assertCell(await cell(page, row, 'id'), { source: 'text', state: 'valid', canonical: '0001' });
    await assertCell(await cell(page, 0, 'flag'), { source: 'boolean', state: 'valid', canonical: 'false' });
    const date = epoch === '1900' ? '1900-03-01T06:00:00' : '1904-03-02T06:00:00';
    const direct = await cell(page, 1, 'direct_date');
    const cached = await cell(page, 1, 'formula_date');
    await assertCell(direct, { source: 'date', state: 'valid', canonical: date });
    await assertCell(cached, { source: 'date', state: 'valid', canonical: date });
    const cacheFields = await details(page, cached);
    await expect(cacheFields(t.cacheState)).toHaveText(t.cache);
    await expect(cacheFields(t.cacheValue)).toHaveText('61.25');
    await expect(cacheFields(t.formulaContent)).toHaveText('C3');
    await expect(cacheFields(t.dateEpoch)).toHaveText(epoch);
    await expect(cacheFields(t.numberFormat)).toHaveText('yyyy-mm-dd hh:mm:ss');
    if (epoch === '1900') await page.screenshot({ path: info.outputPath('data-revision-cached-date-en.png'), fullPage: true });
    await assertCell(await cell(page, 0, 'iso_date'), { source: 'date', state: 'valid', canonical: '2024-04-06T07:08:09' });
    for (const [name, state, label] of [
      ['no_cache', 'uncached', t.absent], ['empty_cache', 'uncached', t.empty], ['cached_error', 'error', t.error],
    ] as const) {
      const target = await cell(page, 0, name);
      await assertCell(target, { state, canonical: null });
      await expect((await details(page, target))(t.cacheState)).toHaveText(label);
    }
    const edge = await cell(page, 0, 'formula_date');
    await assertCell(edge, epoch === '1900' ? { state: 'invalid', canonical: null } : { state: 'valid', canonical: '1904-03-01T12:00:00' });
    await expect((await details(page, edge))(t.dateValidity)).toHaveText(epoch === '1900' ? t.fictitiousDate : t.valid);
    await controls(page, 'formula_date').selectOption('decimal');
    const decimal = await inspect(page);
    expect(decimal.profile.find(x => x.column.name === 'formula_date')?.statistics).toBeNull();
    await assertCell(await cell(page, 1, 'formula_date'), { source: 'date', state: 'invalid', canonical: null });
    await controls(page, 'formula_date').selectOption('text');
    await inspect(page);
    await assertCell(await cell(page, 1, 'formula_date'), { source: 'date', state: 'valid', canonical: '61.25' });
    await controls(page, 'formula_date').selectOption('date');
    await inspect(page);
    await assertCell(await cell(page, 1, 'formula_date'), { source: 'date', state: 'valid', canonical: date });
    observed.push({ epoch, inputSha256: record.sha256, date, exactAmounts: record.profile.find(x => x.column.name === 'amount')?.statistics });
  }
  await info.attach('data-revision-xlsx', { contentType: 'application/json', body: JSON.stringify(observed) });
});

test('Data Lab migrates historical v1 records explicitly and verifies the original hash and replayed v2 proof', async ({ page }, info) => {
  await open(page);
  await input(page, mixed);
  const original = await readFile(proofFile);
  await recipe(page, original);
  const replay = page.getByTestId('data-lab-replay');
  await expect(replay).toHaveAttribute('data-mode', 'historical');
  await expect(run(page)).toBeDisabled();
  await replay.getByText(t.historicalRecord, { exact: true }).click();
  await expect(replay.locator('pre')).toContainText('"sum":"5/2"');
  await page.screenshot({ path: info.outputPath('data-revision-historical-proof-en.png'), fullPage: true });
  await button(page, t.migrateRecipe).click();
  await expect(replay).toHaveAttribute('data-mode', 'migration');
  await input(page, '[{"valor":2.50}]');
  await run(page).click();
  await expect(page.getByRole('alert')).toContainText('source_mismatch');
  await expect(result(page)).toHaveCount(0);
  await input(page, mixed);
  const modern = await inspect(page);
  expect(modern.profile[0]?.statistics).toMatchObject({ n: 2, sum: '15/4', mean: '15/8' });
  expect(modern.sha256).toBe(sha256(mixed));
  const v2 = await downloaded(page);
  const parsed = JSON.parse(v2.toString());
  expect(parsed.algorithm_version).toBe('data-lab/2');
  expect(JSON.parse(parsed.expression)).toMatchObject({ sha256: modern.sha256, semantics_version: 2 });

  await open(page);
  await recipe(page, v2);
  await expect(replay).toHaveAttribute('data-mode', 'exact');
  await expect(controls(page, t.decimal)).toBeDisabled();
  await input(page, mixed);
  expect(await inspect(page)).toEqual(modern);
  await expect(replay).toContainText(t.verifiedReplay);
  expect(JSON.parse((await downloaded(page)).toString()).result).toBe(parsed.result);

  parsed.result = parsed.result.replace('"15/4"', '"99/4"');
  await recipe(page, JSON.stringify(parsed));
  await run(page).click();
  await expect(page.getByRole('alert')).toContainText('proof_mismatch');
  await expect(result(page)).toHaveCount(0);
  await expect(previous(page)).toBeVisible();
  await info.attach('data-revision-migration', { contentType: 'application/json', body: JSON.stringify({
    sourceSha256: modern.sha256, historical: JSON.parse(original.toString()).algorithm_version, current: 'data-lab/2',
    currentProofSha256: sha256(v2), sourceMismatchRejected: true, tamperedResultRejected: true,
  }) });
});

test('Data Lab enforces the profile resource ceiling before reading and preserves a successful result after a bounded transformation rejection', async ({ page }, info) => {
  const worker = await watchWorkers(page);
  await open(page);
  await expand(page);
  await expect(budget(page)).toHaveAttribute('max', /\d+/u);
  await budget(page).fill('65536');
  const bytes = 'id,value\n' + Array.from({ length: 96 }, (_, i) => `${i},normal-${'X'.repeat(115)}`).join('\n');
  await input(page, bytes, 'bounded.csv');
  await run(page).click();
  await expect(page.getByRole('alert')).toContainText('resource_budget');
  expect(await worker()).toMatchObject({ started: 0, active: 0 });
  await budget(page).fill('1048576');
  expect((await inspect(page)).rows).toBe(96);
  const thin = '[{"id":"A","value":"ok"},' + Array.from({ length: 17 }, () => '{"id":"A"}').join(',') + ']';
  await input(page, thin);
  const before = await inspect(page);
  await budget(page).fill('65536');
  const steps = [{ op: 'fill_missing', column: 'value', value: 'bounded '.repeat(160) }];
  await page.getByRole('textbox', { name: t.pipeline }).fill(JSON.stringify(steps));
  await run(page).click();
  await expect(page.getByRole('alert')).toContainText('resource_budget');
  await expect(previous(page)).toHaveAttribute('data-canonical', JSON.stringify(before));
  await expect(result(page)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('data-revision-resource-rejection-en.png'), fullPage: true });
  expect(await worker()).toMatchObject({ started: 3, closed: 3, active: 0, peak: 1 });
  await budget(page).fill('1048576');
  const after = await inspect(page);
  expect(after).toMatchObject({ sha256: before.sha256, rows: 18, steps: [{ operation: 'fill_missing', output_rows: 18 }] });
  const cellFields = await details(page, await cell(page, 1, 'value'));
  await expect(cellFields(t.operation)).toHaveText(t.fill_missing);
  await expect(cellFields(t.replacedState)).toHaveText(t.absent);
  expect(await worker()).toMatchObject({ started: 4, closed: 4, active: 0, peak: 1 });
  await info.attach('data-revision-resource-recovery', { contentType: 'application/json', body: JSON.stringify({
    budgetsBytes: [65536, 1048576], largestInputBytes: Buffer.byteLength(bytes), inputSha256: before.sha256,
    outputRows: after.rows, preflightWithoutWorker: true, previousResultPreserved: true, workers: await worker(),
  }) });
});

test('Data Lab applies one cumulative budget to joins and successive text transforms', async ({ page }, info) => {
  await open(page);
  await expand(page);
  await input(page, 'id\n' + Array.from({ length: 16 }, () => 'A').join('\n'), 'joined.csv');
  await budget(page).fill('65536');
  const setSteps = (steps: unknown[]) => page.getByRole('textbox', { name: t.pipeline }).fill(JSON.stringify(steps));
  const join = { op: 'join', column: 'id', name: 'lookup', lookup: [['A', '\u0390'.repeat(208)]], mode: 'left' };
  await setSteps([join]);
  await run(page).click();
  await expect(page.getByRole('alert')).toContainText('resource_budget');
  await budget(page).fill('1048576');
  const both = [join, { op: 'text', column: 'lookup', name: 'upper', transform: 'uppercase' },
    { op: 'text', column: 'upper', name: 'lower', transform: 'lowercase' }];
  await setSteps(both);
  const work = await inspect(page);
  expect(work.rows).toBe(16);
  expect(work.steps.map(step => step.operation)).toEqual(['join','text','text']);
  await expect((await details(page, await cell(page, 1, 'lookup')))(t.operation)).toHaveText(t.join);
  await budget(page).fill('131072');
  await run(page).click();
  await expect(page.getByRole('alert')).toContainText('resource_budget');
  await expect(previous(page)).toBeVisible();
  await info.attach('data-revision-cumulative', { contentType: 'application/json', body: JSON.stringify({
    inputBytes: 34, rows: work.rows, sha256: work.sha256, steps: work.steps.map(step => step.operation),
    testedBudgets: [65536,131072,1048576], safeRejection: true,
  }) });
});

test('Data Lab retires pending work when Adaptive lowers its budget and accepts a new profile-safe run', async ({ page }, info) => {
  const worker = await watchWorkers(page, true);
  await open(page);
  await expand(page);
  await page.getByText(en.operations.operations, { exact: true }).click();
  const policy = controls(page, en.operations.selection);
  await policy.selectOption('maximum');
  await expect(budget(page)).toHaveAttribute('max', String(256 * 2 ** 20));
  await budget(page).fill(String(128 * 2 ** 20));
  await input(page, mixed);
  await run(page).click();
  await expect.poll(async () => (await worker()).held).toBe(1);
  await policy.selectOption('ultra_light');
  await expect(budget(page)).toHaveAttribute('max', String(32 * 2 ** 20));
  await expect(page.getByRole('alert')).toContainText('resource_budget');
  expect(await worker()).toMatchObject({ started: 1, closed: 1, active: 0 });
  await expect(result(page)).toHaveCount(0);
  await button(page, t.useProfileBudget).click();
  await page.evaluate(() => { Reflect.get(window, 'darsDataRevisionWorkers').paused = false; });
  expect((await inspect(page)).rows).toBe(2);
  const proof = JSON.parse((await downloaded(page)).toString());
  expect(JSON.parse(proof.expression)).toMatchObject({ resource_policy: { limit_bytes: 32 * 2 ** 20 } });
  expect(await worker()).toMatchObject({ started: 2, closed: 2, active: 0, peak: 1 });
  await info.attach('data-revision-adaptive', { contentType: 'application/json', body: JSON.stringify({
    initialCeilingBytes: 256 * 2 ** 20, lowerCeilingBytes: 32 * 2 ** 20, activeWorkersAfterRecovery: 0,
  }) });
});

test('Data Lab suspension, switching, in-flight language changes and offline replay release workers and preserve canonical values', async ({ page, context, baseURL }, info) => {
  const worker = await watchWorkers(page, true);
  // Make the first, uncontrolled visit deterministic. The production worker must recover the
  // UI chunks already requested before it claimed the page, without warming unrelated tools.
  await page.addInitScript(() => {
    if (navigator.serviceWorker.controller) return;
    const register = ServiceWorkerContainer.prototype.register;
    const permit = new Promise<void>(resolve => {
      window.addEventListener('start-data-test-service-worker', () => resolve(), { once: true });
    });
    ServiceWorkerContainer.prototype.register = async function (...args) {
      await permit;
      return Reflect.apply(register, this, args);
    };
  });
  const outbound = new Set<string>();
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL!).origin) outbound.add(url.origin);
  });
  // Use the real contract bytes, with their completion held across the controller change.
  let arrived!: () => void, release!: () => void;
  const requestStarted = new Promise<void>(resolve => { arrived = resolve; });
  const mayFinish = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/assets\/data-lab-contract-[\w-]+\.js$/u, async route => {
    arrived();
    await mayFinish;
    await route.continue();
  });
  await page.goto('/');
  await controls(page, en.operations.modulePicker).selectOption('data-lab');
  await requestStarted;
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
    .some(item => /\/assets\/tool-data-lab-/u.test(item.name)))).toBe(true);
  expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
  const earlyAssets = await page.evaluate(() => performance.getEntriesByType('resource').map(item => item.name)
    .filter(name => /\/assets\/(?:tool-data-lab-|data-lab-contract-)/u.test(name)));
  expect(earlyAssets.some(url => url.endsWith('.js'))).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('start-data-test-service-worker')));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  release();
  await expect(run(page)).toBeVisible();
  const contractUrl = await page.evaluate(() => performance.getEntriesByType('resource')
    .find(entry => /\/assets\/data-lab-contract-/u.test(entry.name))?.name);
  expect(contractUrl).toBeDefined();
  await expect.poll(() => page.evaluate(async urls => {
    const names = (await caches.keys()).filter(key => key.startsWith('dars-static:'));
    const keys = (await Promise.all(names.map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat();
    return urls.every(url => keys.includes(url)) && !keys.some(url => /\/assets\/tool-(?:loans|physics-engineering)-/u.test(url));
  }, [...earlyAssets, contractUrl!])).toBe(true);
  await input(page, mixed);
  await run(page).click();
  await expect.poll(async () => (await worker()).held).toBe(1);
  const settings = page.locator('details.settings');
  await settings.locator('summary').click();
  await settings.locator('select').first().selectOption('pt-BR');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await settings.locator('summary').click();
  await page.evaluate(() => Reflect.get(window, 'darsReleaseDataRevision')());
  await expect(result(page)).toBeVisible();
  const proof = JSON.parse((await downloaded(page)).toString());
  expect(proof.expression_locale).toBe('en');
  expect(proof.variables.sha256).toBe(sha256(mixed));
  await settings.locator('summary').click();
  await settings.locator('select').first().selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await settings.locator('summary').click();

  await page.evaluate(() => { Reflect.get(window, 'darsDataRevisionWorkers').paused = true; });
  await run(page).click();
  await expect.poll(async () => (await worker()).held).toBe(2);
  await page.getByText(en.operations.operations, { exact: true }).click();
  await button(page, en.operations.moduleSuspend).click();
  await expect(main(page)).toHaveAttribute('data-module-phase', 'suspended');
  await expect(main(page)).toHaveAttribute('data-workers', '0');
  await expect.poll(async () => (await worker()).active).toBe(0);
  await button(page, en.operations.moduleResume).click();
  await expect(run(page)).toBeDisabled();
  await expect(result(page)).toHaveCount(0);
  await input(page, mixed);
  await run(page).click();
  await expect.poll(async () => (await worker()).held).toBe(3);
  await controls(page, en.operations.modulePicker).selectOption('standard');
  await expect(main(page)).toHaveAttribute('data-module-phase', 'active');
  await expect.poll(async () => (await worker()).active).toBe(0);
  await controls(page, en.operations.modulePicker).selectOption('data-lab');
  await expect(run(page)).toBeDisabled();
  await expect(result(page)).toHaveCount(0);

  await context.setOffline(true);
  expect((await page.reload())?.fromServiceWorker()).toBe(true);
  await controls(page, en.operations.modulePicker).selectOption('data-lab');
  await page.evaluate(() => { Reflect.get(window, 'darsDataRevisionWorkers').paused = false; });
  await input(page, mixed);
  await recipe(page, JSON.stringify(proof));
  await expect(page.getByTestId('data-lab-replay')).toHaveAttribute('data-mode', 'exact');
  expect((await inspect(page)).sha256).toBe(sha256(mixed));
  expect(JSON.parse((await downloaded(page)).toString()).result).toBe(proof.result);
  expect(await worker()).toMatchObject({ started: 1, closed: 1, peak: 1, active: 0 });
  expect([...outbound]).toEqual([]);
  await info.attach('data-revision-offline-lifecycle', { contentType: 'application/json', body: JSON.stringify({
    sourceSha256: sha256(mixed), sourceLocale: proof.expression_locale, offlineNavigationFromServiceWorker: true,
    workerReleasedOnSuspend: true, workerReleasedOnSwitch: true, originalProofReproduced: true,
    firstVisitAssetsRecovered: [...earlyAssets,contractUrl!].map(url => new URL(url).pathname.split('/').at(-1)),
    inFlightAssetRecovered: true, outbound: [...outbound],
  }) });
});

test.describe('Data Lab worker preparation', () => {
  test.use({ serviceWorkers: 'block' });

  test('cancels actual local import preparation while WASM initialization is pending and restarts', async ({ page, context }, info) => {
    const worker = await watchWorkers(page);
    let held = false;
    let holdFirst = true;
    let release!: () => void;
    const delay = new Promise<void>(done => { release = done; });
    await context.route(/\/assets\/dars_tool_wasm_bg-.*\.wasm$/u, async route => {
      if (holdFirst) {
        holdFirst = false;
        held = true;
        await delay;
      }
      await route.continue().catch(() => {});
    });
    try {
      await open(page);
      await input(page, 'id,value\nA,1.25\nB,2.50\n', 'preparing.csv');
      await run(page).click();
      await expect.poll(() => held).toBe(true);
      await expect.poll(async () => (await worker()).progress).toEqual([0]);
      await button(page, en.cancelCalculation).click();
      await expect.poll(async () => (await worker()).closed).toBe(1);
      await expect(result(page)).toHaveCount(0);
      release();
      expect((await inspect(page)).rows).toBe(2);
      expect(await worker()).toMatchObject({ started: 2, closed: 2, active: 0, peak: 1 });
      await info.attach('data-revision-cancel-preparation', {
        contentType: 'application/json', body: JSON.stringify({ workerReleasedBeforeFileRead: true, worker: await worker() }),
      });
    } finally {
      release();
    }
  });
});
