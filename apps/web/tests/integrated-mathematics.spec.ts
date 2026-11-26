import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { parseCalculationProofFile } from '../src/calculation-proof';
import { proofLabels } from '../src/calculation-proof-labels';
import { financeModules } from '../src/finance-modules';
import { scienceModules } from '../src/science-modules';
import ar from '../src/locales/ar.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import hi from '../src/locales/hi.json' with { type: 'json' };
import pt from '../src/locales/pt-BR.json' with { type: 'json' };
import zh from '../src/locales/zh-CN.json' with { type: 'json' };

const modules = ['standard', 'scientific', 'algebra', 'calculus', 'linear-algebra', 'geometry',
  'discrete-mathematics', 'programmer', 'converter', 'date-time'] as const;
const registeredModules = [...modules, ...financeModules, ...scienceModules, 'math-notebook', 'formula-studio', 'automation-studio'];
type Module = typeof modules[number];
const profiles = ['ultra_light', 'efficiency', 'balanced', 'performance', 'maximum'] as const;
const advancedAsset = /\/assets\/(?:tool-|science-|data-lab-|module-frames-|dars_tool_wasm)/u;
const viewerAsset = /\/assets\/calculation-proof-panel-[\w-]+\.js$/u;
const picker = (page: Page) => page.getByRole('combobox', { name: en.operations.modulePicker, exact: true });
const editor = (page: Page, label = en.expression) => page.getByRole('textbox', { name: label, exact: true });
const record = (page: Page) => page.locator('details.calculation-proof');
const buttons = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });

interface Probe {
  active: number;
  maximum: number;
  calls: number;
}

async function requireProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = { active: 0, maximum: 0, calls: 0 };
    Object.defineProperty(window, '__darsIntegratedProbe', { value: probe });
    const Original = window.Worker;
    const originalPost = Original.prototype.postMessage;
    Object.defineProperty(Original.prototype, 'postMessage', {
      value: function postMessage(this: Worker, ...args: unknown[]) {
        probe.calls++;
        return Reflect.apply(originalPost, this, args);
      },
    });
    window.Worker = class extends Original {
      private live = true;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        probe.active++;
        probe.maximum = Math.max(probe.maximum, probe.active);
      }
      terminate() {
        if (this.live) {
          this.live = false;
          probe.active--;
        }
        super.terminate();
      }
    };
  });
}

function probe(page: Page) {
  return page.evaluate(() => ({ ...(window as unknown as { __darsIntegratedProbe: Probe }).__darsIntegratedProbe }));
}

async function openProof(page: Page) {
  const panel = record(page);
  await panel.locator('summary').click();
  await expect(panel.locator('.calculation-proof-body')).toBeVisible();
  return panel;
}

async function downloadRecord(page: Page, panel: Locator, label: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: label, exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('dars-calculation-record.json');
  const bytes = await readFile(await download.path());
  const record = parseCalculationProofFile(bytes.toString('utf8'));
  expect(record).not.toBeNull();
  return { bytes, record: record! };
}

test('Standard opens the shared Proof viewer offline on first use without loading advanced engines', async ({ page, context }, testInfo) => {
  const requests = new Set<string>();
  context.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (advancedAsset.test(path)) requests.add(path);
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(record(page).locator('.calculation-proof-body')).toHaveCount(0);
  const resources = async () => (await page.evaluate(() => performance.getEntriesByType('resource').map((item) => new URL(item.name).pathname)))
    .filter((path) => viewerAsset.test(path));
  expect(await resources()).toEqual([]);
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('dars-static:'));
    const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return entries.flat().map((entry) => new URL(entry.url).pathname);
  });
  expect(cached.filter((path) => advancedAsset.test(path))).toEqual([]);
  expect(cached.filter((path) => viewerAsset.test(path))).toHaveLength(1);
  await page.getByText(en.operations.operations, { exact: true }).click();
  const onlyCache = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await onlyCache.click();
  await expect(onlyCache).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await editor(page).fill('1/3');
  await editor(page).press('Enter');
  await expect(page.getByTestId('result')).toContainText('0.333');
  const panel = await openProof(page);
  const { record: offlineRecord } = await downloadRecord(page, panel, proofLabels.en.exportFile);
  expect(offlineRecord).toMatchObject({
    schema: 1, module: 'standard', operation: 'evaluate', expression: '1/3', normalized: '1/3',
    result: '1/3', exactness: 'exact', precision: null,
  });
  expect(offlineRecord.standard_bindings).toBeUndefined();
  expect([...requests]).toEqual([]);
  await testInfo.attach('integrated-offline-standard-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ proofResult: offlineRecord.result, offlineFirstUse: true, viewerWasPrecached: true, requestedAdvancedAssets: [] }),
  });
});

test('Standard exports localized originals and retained @ bindings and imports as inert text', async ({ page, context }, testInfo) => {
  await requireProbe(page);
  const external: string[] = [];
  context.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4174/')) external.push(request.url());
  });
  await page.goto('/');
  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('pt-BR');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.locator('details.settings summary').click();
  const input = editor(page, pt.expression);
  await input.fill('0,5×2');
  await input.press('Enter');
  await expect(page.getByTestId('result')).toHaveText('1');
  const panel = await openProof(page);
  const first = await downloadRecord(page, panel, proofLabels['pt-BR'].exportFile);
  expect(first.record).toMatchObject({
    expression: '0,5×2', normalized: '0.5*2', result: '1', method: 'standard_rational_expression', exactness: 'exact',
  });
  await expect(panel.locator('dd').filter({ hasText: '0,5×2' })).toBeVisible();
  await input.fill('sqrt(2)');
  await buttons(page, pt.storeMemory).click();
  await expect(page.locator('.memory-filled')).toBeVisible();
  await input.fill('');
  await buttons(page, pt.recallMemory).click();
  await expect(input).toHaveValue('@1');
  await input.fill('(@1)×2');
  await input.press('Enter');
  await expect(page.getByTestId('result')).toContainText('2,828');
  const second = await downloadRecord(page, panel, proofLabels['pt-BR'].exportFile);
  expect(second.record).toMatchObject({
    module: 'standard', expression: '(@1)×2', normalized: '(@1)*2', exactness: 'approximate',
    method: 'standard_certified_interval', precision: 24, rounding: 'nearest_ties_even',
    standard_bindings: { '1': expect.any(String) },
  });
  expect(second.record.error_bound).toMatch(/^\d+e-\d+$/u);
  expect(Object.keys(second.record.standard_bindings ?? {})).toEqual(['1']);
  await expect(panel.getByText(proofLabels['pt-BR'].fields.standard_bindings, { exact: true })).toBeVisible();
  const screenshot = testInfo.outputPath('standard-proof.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('integrated-standard-proof-ui', { path: screenshot, contentType: 'image/png' });

  const past = await probe(page);
  const preferences = await page.evaluate(() => ({ ...localStorage }));
  const literal = '<img src="https://example.invalid/ignore-proof">';
  const imported = panel.getByTestId('proof-import-file');
  await imported.setInputFiles({
    name: 'local-record.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...second.record, expression: literal })),
  });
  await expect(panel.getByText(proofLabels['pt-BR'].imported, { exact: true })).toBeVisible();
  await expect(panel.getByText(literal, { exact: true })).toBeVisible();
  await expect(panel.locator('img,a')).toHaveCount(0);
  await expect(input).toHaveValue('(@1)×2');
  await expect(page.getByTestId('result')).toContainText('2,828');
  expect((await probe(page)).calls).toBe(past.calls);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(preferences);
  expect(external).toEqual([]);
  await panel.getByRole('button', { name: proofLabels['pt-BR'].dismiss, exact: true }).click();
  await expect(panel.getByText(proofLabels['pt-BR'].computed, { exact: true })).toBeVisible();
  await testInfo.attach('integrated-standard-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ localizedOriginal: first.record.expression, replayInput: second.record.normalized,
      bindingIds: Object.keys(second.record.standard_bindings ?? {}), precision: second.record.precision,
      errorBound: second.record.error_bound, importWorkerCalls: 0, persistedRecords: 0, externalRequests: [] }),
  });
});

test('All ten workspaces calculate individually across five profiles with one worker and searchable navigation', async ({ page, context }, testInfo) => {
  await requireProbe(page);
  const external: string[] = [];
  const advancedRequests = new Set<string>();
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4174') external.push(url.origin);
    if (advancedAsset.test(url.pathname)) advancedRequests.add(url.pathname);
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(picker(page).locator('option')).toHaveCount(registeredModules.length);
  expect(await picker(page).locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)))
    .toEqual(registeredModules);
  expect([...advancedRequests]).toEqual([]);
  const search = page.getByRole('searchbox', { name: en.tools.search, exact: true });
  await search.fill('date & time');
  expect(await picker(page).locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(['standard', 'date-time']);
  await search.clear();

  const cases: readonly [Module, string, string, (() => Promise<void>)?][] = [
    ['standard', 'result', '0.333', () => editor(page).fill('1/3')],
    ['scientific', 'scientific-result', '1', () => editor(page).fill('sin(90°)')],
    ['algebra', 'algebra-result', '1', () => editor(page).fill('x/x')],
    ['calculus', 'calculus-result', '3*x^2', () => editor(page).fill('x^3')],
    ['linear-algebra', 'linear-algebra-result', '-2', () => buttons(page, en.linearAlgebra.useExample).click()],
    ['geometry', 'geometry-result', 'area=12; perimeter=14; diagonal=5', () => buttons(page, en.geometry.useExample).click()],
    ['discrete-mathematics', 'discrete-mathematics-result', '3628800', () => buttons(page, en.discrete.useExample).click()],
    ['programmer', 'programmer-result', 'binary=00101010; octal=052; decimal=42; hexadecimal=2A',
      () => page.getByRole('textbox', { name: en.programmer.fields.value, exact: true }).fill('42')],
    ['converter', 'converter-result', '100',
      () => page.getByRole('textbox', { name: en.converter.amount, exact: true }).fill('1')],
    ['date-time', 'date-time-result', 'days=2; weeks=0; remaining_days=2', () => buttons(page, en.dateTime.useExample).click()],
  ];
  const observations: { id: Module; profile: string; milliseconds: number }[] = [];
  const main = page.locator('main');
  for (const [index, [id, testId, expected, fill]] of cases.entries()) {
    if (index !== 0) await picker(page).selectOption(id);
    const answer = page.getByTestId(testId);
    await expect(answer).toBeVisible();
    await expect(main).toHaveAttribute('data-module-phase', 'active');
    const profile = profiles[Math.floor(index / 2)]!;
    if (index % 2 === 0) {
      await page.getByText(en.operations.operations, { exact: true }).click();
      await page.getByRole('combobox', { name: en.operations.selection, exact: true }).selectOption(profile);
      await page.getByText(en.operations.operations, { exact: true }).click();
    }
    await expect(main).toHaveAttribute('data-profile', profile);
    const before = performance.now();
    await fill?.();
    await buttons(page, en.calculate).click();
    if (id === 'standard') await expect(answer).toContainText(expected);
    else await expect(answer).toHaveAttribute('data-canonical', expected);
    await expect(record(page)).toHaveCount(1);
    observations.push({ id, profile, milliseconds: performance.now() - before });
  }
  await picker(page).selectOption('standard');
  await expect(editor(page)).toHaveValue('1/3');
  const panel = await openProof(page);
  await expect(panel.getByText(proofLabels.en.computed, { exact: true })).toBeVisible();
  const state = await probe(page);
  expect(state.maximum).toBe(1);
  expect(external).toEqual([]);
  await testInfo.attach('integrated-module-matrix', {
    contentType: 'application/json',
    body: JSON.stringify({ modules: observations, profiles, maximumConcurrentWorkers: state.maximum,
      externalRequests: [], advancedRequests: [...advancedRequests].sort() }),
  });
});

test.describe('localized touch workspace', () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 940 } });
  test('Standard record and navigation are available in seven languages with touch and accessible RTL', async ({ page }) => {
    await page.goto('/');
    await buttons(page, '1').tap();
    await buttons(page, en.add).tap();
    await buttons(page, '2').tap();
    await buttons(page, en.calculate).tap();
    await expect(page.getByTestId('result')).toHaveText('3');
    await record(page).locator('summary').tap();
    await expect(record(page).getByText(proofLabels.en.computed, { exact: true })).toBeVisible();
    await page.locator('details.settings summary').tap();
    const languages = page.locator('details.settings select').first();
    for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
      await languages.selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const localPicker = page.getByRole('combobox', { name: messages.operations.modulePicker, exact: true });
      await expect(localPicker.locator('option')).toHaveCount(registeredModules.length);
      await expect(record(page).locator('summary')).toHaveText(messages.standardRecord.title);
      const search = page.getByRole('searchbox', { name: messages.tools.search, exact: true });
      await search.fill(messages.dateTime.title);
      expect(await localPicker.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)))
        .toEqual(['standard', 'date-time']);
      await search.clear();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (locale === 'ar') {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await page.locator('details.settings summary').tap();
        const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
        await page.locator('details.settings summary').tap();
      }
    }
  });
});
