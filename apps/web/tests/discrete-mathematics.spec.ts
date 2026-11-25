import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseCalculationProofFile } from '../src/calculation-proof';
import ar from '../src/locales/ar.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import hi from '../src/locales/hi.json' with { type: 'json' };
import pt from '../src/locales/pt-BR.json' with { type: 'json' };
import zh from '../src/locales/zh-CN.json' with { type: 'json' };
import type { Field, Group, Operation } from '../src/tool-discrete-input';

const d = en.discrete;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const result = (page: Page) => page.getByTestId('discrete-mathematics-result');
const field = (page: Page, name: Field) => page.getByRole('textbox', { name: d.fields[name], exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const calculate = (page: Page) => button(page, en.calculate).click();
const useExample = (page: Page) => button(page, d.useExample).click();
const advanced = /\/assets\/(?:tool-|dars_tool_wasm)/u;
const implicationTable = '{"variables":["A","B"],"rows":[[0,0,1],[0,1,1],[1,0,0],[1,1,1]]}';

async function openWorkspace(page: Page) {
  await picker(page).selectOption('discrete-mathematics');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

async function select(page: Page, group: Group, operation: Operation) {
  await button(page, d.groups[group]).click();
  await button(page, d.operations[operation]).click();
}

test('Discrete Mathematics runs all sixteen operations and restores state after switching modules', async ({ page }, testInfo) => {
  await page.goto('/');
  const standard = page.getByRole('textbox', { name: en.expression, exact: true });
  await standard.fill('1/3');
  const before = performance.now();
  await openWorkspace(page);
  const activationMs = performance.now() - before;
  await page.getByText('Operations', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption('ultra_light');
  await expect(page.locator('main')).toHaveAttribute('data-profile', 'ultra_light');
  await page.getByText('Operations', { exact: true }).click();
  const examples: readonly [Group, Operation, string][] = [
    ['combinatorics', 'permutations', '3628800'], ['combinatorics', 'arrangements', '720'],
    ['combinatorics', 'combinations', '120'], ['sets', 'set_union', '[1,2,3,4,"alpha","beta"]'],
    ['sets', 'set_intersection', '[2,3]'], ['sets', 'set_difference', '[1,"alpha"]'],
    ['sets', 'set_symmetric_difference', '[1,4,"alpha","beta"]'], ['sets', 'set_subset', 'false'],
    ['logic', 'logic', 'false'], ['logic', 'truth_table', implicationTable],
    ['integers', 'prime', 'prime'], ['integers', 'factor', '[2,2,2,3,3,5]'],
    ['integers', 'gcd', '6'], ['integers', 'lcm', '420'],
    ['integers', 'modular', '6'], ['sequences', 'sequence', '144'],
  ];
  const observations: { operation: Operation; throughBrowserMs: number }[] = [];
  for (const [group, operation, expected] of examples) {
    const start = performance.now();
    await select(page, group, operation);
    await useExample(page);
    await calculate(page);
    await expect(result(page)).toHaveAttribute('data-canonical', expected);
    observations.push({ operation, throughBrowserMs: performance.now() - start });
  }
  await picker(page).selectOption('standard');
  await expect(standard).toHaveValue('1/3');
  await openWorkspace(page);
  await expect(button(page, d.groups.sequences)).toHaveAttribute('aria-pressed', 'true');
  await expect(result(page)).toHaveAttribute('data-canonical', '144');
  await button(page, d.groups.combinatorics).click();
  await expect(button(page, d.operations.combinations)).toHaveAttribute('aria-pressed', 'true');
  await expect(field(page, 'n')).toHaveValue('10');
  await expect(field(page, 'k')).toHaveValue('3');
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await testInfo.attach('discrete-mathematics-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, observations, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });
});

test('Discrete Mathematics handles repetition, modular inverse and exact sequence modes', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  for (const [name, expected] of [['permutations', '60'], ['arrangements', '1000'], ['combinations', '220']] as const) {
    await select(page, 'combinatorics', name);
    await page.getByRole('checkbox', { name: d.repetition, exact: true }).check();
    await useExample(page);
    await calculate(page);
    await expect(result(page)).toHaveAttribute('data-canonical', expected);
  }
  await select(page, 'integers', 'modular');
  await page.getByRole('combobox', { name: d.modularMode, exact: true }).selectOption('pow');
  await field(page, 'value').fill('3');
  await field(page, 'exponent').fill('-1');
  await field(page, 'modulus').fill('11');
  await field(page, 'exponent').press('Control+Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', '4');
  await field(page, 'value').fill('22');
  await calculate(page);
  await expect(page.getByText(d.domainError, { exact: true })).toBeVisible();
  await select(page, 'sequences', 'sequence');
  await page.getByRole('combobox', { name: d.sequenceMode, exact: true }).selectOption('geometric');
  await field(page, 'firstTerm').fill('3');
  await field(page, 'ratio').fill('-2');
  await field(page, 'index').fill('5');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '-96');
});

test('Discrete Mathematics retains exact integer tokens and recognizes an empty set', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  await select(page, 'sets', 'set_union');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '[]');
  await expect(result(page)).toContainText('∅');
  await field(page, 'leftSet').fill('9007199254740993 alpha');
  await field(page, 'rightSet').fill('9007199254740992');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '[9007199254740992,9007199254740993,"alpha"]');
  await expect(result(page)).toContainText('{9007199254740992, 9007199254740993, alpha}');
  await select(page, 'integers', 'factor');
  await field(page, 'integer').fill('18446744073709551557');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '[18446744073709551557]');
  await expect(result(page)).toContainText('18446744073709551557');
});

test('Discrete Mathematics renders safe truth tables, inserts operators and pages 256 assignments', async ({ page }, testInfo) => {
  await page.goto('/');
  await openWorkspace(page);
  await select(page, 'logic', 'truth_table');
  const formula = field(page, 'proposition');
  await formula.fill('A');
  await formula.press('End');
  await button(page, d.operatorLabels.implies).click();
  await formula.press('End');
  await formula.press('B');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', implicationTable);
  const table = result(page).getByRole('table', { name: d.operations.truth_table, exact: true });
  expect(await table.getByRole('columnheader').allTextContents()).toEqual(['A', 'B', 'Result']);
  expect(await table.locator('tbody tr td:last-child').allTextContents()).toEqual(['1', '1', '0', '1']);
  await formula.fill('(A ∧ B) ∨ (C ∧ D) ∨ (E ∧ F) ∨ (G ∧ H)');
  await calculate(page);
  await expect(table.locator('tbody tr')).toHaveCount(16);
  await expect(result(page)).toContainText('Rows 1–16 of 256');
  await button(page, d.table.next).click();
  await expect(result(page)).toContainText('Rows 17–32 of 256');
  await expect(table.locator('tbody tr')).toHaveCount(16);
  expect(new Set(await table.locator('tbody tr td:last-child').allTextContents())).toEqual(new Set(['0', '1']));
  const screenshot = testInfo.outputPath('discrete-mathematics.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('discrete-mathematics-ui', { path: screenshot, contentType: 'image/png' });
  await testInfo.attach('discrete-mathematics-truth-table', {
    contentType: 'application/json', body: JSON.stringify({ variables: 8, assignments: 256, visibleRows: 16, displayedPage: 2 }),
  });
  for (const invalid of ['globalThis.alert(A)', 'constructor']) {
    await formula.fill(invalid);
    await calculate(page);
    await expect(page.getByText(d.invalid, { exact: true })).toBeVisible();
  }
});

test('Discrete Mathematics distinguishes deterministic and probable primality and exports the record', async ({ page }, testInfo) => {
  await page.goto('/');
  await openWorkspace(page);
  await select(page, 'integers', 'prime');
  await field(page, 'integer').fill('18446744073709551557');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'prime');
  await expect(result(page)).toContainText(d.deterministicExplanation);
  await field(page, 'integer').fill('170141183460469231731687303715884105727');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'probable_prime');
  await expect(result(page)).toContainText(d.probableExplanation);
  await expect(result(page)).not.toContainText(d.deterministicExplanation);
  const panel = page.locator('.calculation-proof');
  await panel.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const bytes = await readFile(await download.path());
  const proof = parseCalculationProofFile(bytes.toString('utf8'));
  expect(proof).toMatchObject({
    schema: 1, module: 'discrete-mathematics', operation: 'prime', result: 'probable_prime',
    exactness: 'approximate', precision: null, error_bound: null, method: 'fixed_base_probable_primality',
    constraints: ['Passed 12 fixed strong probable-prime tests'],
  });
  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('pt-BR');
  await expect(panel.getByText(pt.discrete.proof.methods.fixed_base_probable_primality, { exact: true })).toBeVisible();
  await panel.getByTestId('proof-import-file').setInputFiles({ name: 'discrete-proof.json', mimeType: 'application/json', buffer: bytes });
  await expect(panel.getByText('fixed_base_probable_primality', { exact: true })).toBeVisible();
  await testInfo.attach('discrete-mathematics-primality-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ result: proof?.result, method: proof?.method, precision: proof?.precision,
      error_bound: proof?.error_bound, constraints: proof?.constraints }),
  });
});

test('Discrete Mathematics supports seven languages and an accessible narrow RTL workspace', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 940 });
  await page.goto('/');
  await openWorkspace(page);
  await select(page, 'combinatorics', 'combinations');
  await page.locator('details.settings summary').click();
  const languages = page.locator('details.settings select').first();
  for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
    await languages.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const localized = messages.discrete;
    await expect(page.getByRole('heading', { name: localized.title, exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: localized.category, exact: true })).toBeVisible();
    const n = page.getByRole('textbox', { name: localized.fields.n, exact: true });
    const variants = locale === 'ar' ? ['١٠', '٣'] : locale === 'hi' ? ['१०', '३'] : locale === 'zh-CN' ? ['１０', '３'] : ['10', '3'];
    await n.fill(variants[0]!);
    await page.getByRole('textbox', { name: localized.fields.k, exact: true }).fill(variants[1]!);
    await n.press('Control+Enter');
    await expect(result(page)).toHaveAttribute('data-canonical', '120');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (locale === 'ar') {
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await page.locator('details.settings summary').click();
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
      await page.locator('details.settings summary').click();
    }
  }
});

test('Discrete Mathematics loads its worker and WASM on demand and works offline', async ({ page, context }, testInfo) => {
  const requested = new Set<string>();
  context.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (advanced.test(path)) requested.add(path);
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached = async () => (await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('dars-static:'));
    const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return entries.flat().map((request) => new URL(request.url).pathname);
  })).filter((path) => advanced.test(path)).sort();
  expect([...requested]).toEqual([]);
  expect(await cached()).toEqual([]);
  await openWorkspace(page);
  expect([...requested].some((path) => path.endsWith('.wasm'))).toBe(false);
  await useExample(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '3628800');
  await expect.poll(async () => (await cached()).some((path) => path.includes('discrete-worker-'))).toBe(true);
  await expect.poll(async () => (await cached()).filter((path) => path.endsWith('.wasm')).length).toBe(1);
  const prepared = await cached();
  expect(prepared.some((path) => /tool-(?:scientific|algebra|calculus|linear-algebra|geometry)-/u.test(path))).toBe(false);
  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await openWorkspace(page);
  await useExample(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '3628800');
  await testInfo.attach('discrete-mathematics-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: '3628800', otherToolAssets: [] }),
  });
});

test.describe('Discrete Mathematics worker isolation', () => {
  test.use({ serviceWorkers: 'block' });
  test('cancels a pending worker explicitly and restores a draft on switching modules', async ({ page, context }) => {
    let open!: () => void;
    let observed!: () => void;
    const admitted = new Promise<void>((resolve) => { observed = resolve; });
    const release = new Promise<void>((resolve) => { open = resolve; });
    let first = true;
    await context.route(/\/assets\/dars_tool_wasm[^/]*\.wasm$/u, async (route) => {
      if (first) {
        first = false;
        observed();
        await release;
        await route.abort().catch(() => undefined);
      } else await route.continue();
    });
    try {
      await page.goto('/');
      await openWorkspace(page);
      await select(page, 'integers', 'factor');
      await field(page, 'integer').fill('360');
      await calculate(page);
      await admitted;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '1');
      await field(page, 'integer').press('Escape');
      await expect(page.getByText(en.engineCancelled, { exact: true })).toBeVisible();
      await expect.poll(() => page.workers().some((worker) => worker.url().includes('discrete-worker'))).toBe(false);
      open();
      await picker(page).selectOption('standard');
      await openWorkspace(page);
      await expect(field(page, 'integer')).toHaveValue('360');
      await calculate(page);
      await expect(result(page)).toHaveAttribute('data-canonical', '[2,2,2,3,3,5]');
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
    } finally {
      open();
    }
  });
});
