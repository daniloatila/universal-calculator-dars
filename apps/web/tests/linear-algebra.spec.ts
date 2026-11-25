import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { parseCalculationProofFile } from '../src/calculation-proof';
import ar from '../src/locales/ar.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import hi from '../src/locales/hi.json' with { type: 'json' };
import pt from '../src/locales/pt-BR.json' with { type: 'json' };
import zh from '../src/locales/zh-CN.json' with { type: 'json' };

type Operation = keyof typeof en.linearAlgebra.operations;
const m = en.linearAlgebra;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const result = (page: Page) => page.getByTestId('linear-algebra-result');
const operation = (page: Page, name: Operation) => page.getByRole('button', { name: m.operations[name], exact: true });
const cell = (page: Page, name: 'A' | 'B', row: number, column: number) =>
  page.getByRole('textbox', { name: `${name}[${row},${column}]`, exact: true });
const calculate = (page: Page) => page.getByRole('button', { name: en.calculate, exact: true }).click();
const useExample = (page: Page) => page.getByRole('button', { name: m.useExample, exact: true }).click();
const advanced = /\/assets\/(?:tool-|dars_tool_wasm)/u;

async function openWorkspace(page: Page) {
  await picker(page).selectOption('linear-algebra');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

async function pasteMatrix(start: Locator, text: string) {
  await start.evaluate((input, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', value);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, text);
}

test('Linear algebra runs all fourteen operations and preserves Standard and adaptive behavior', async ({ page }, testInfo) => {
  await page.goto('/');
  const standard = page.getByRole('textbox', { name: 'Expression', exact: true });
  await standard.fill('1/3');
  const before = performance.now();
  await openWorkspace(page);
  const activationMs = performance.now() - before;
  await page.getByText('Operations', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption('ultra_light');
  await expect(page.locator('main')).toHaveAttribute('data-profile', 'ultra_light');
  await page.getByText('Operations', { exact: true }).click();
  const examples: readonly [Operation, string | RegExp][] = [
    ['add', '[[2,2],[3,5]]'], ['subtract', '[[0,2],[3,3]]'], ['multiply', '[[5],[11]]'],
    ['transpose', '[[1,4],[2,5],[3,6]]'], ['determinant', '-2'], ['inverse', '[[-2,1],[3/2,-1/2]]'],
    ['rank', '1'], ['dot', '32'], ['cross', '[0,0,1]'], ['solve', '{"status":"unique","solution":[1,2]}'],
    ['eigenvalues', '[2,3]'], ['eigenvectors', '{"values":[2,3],"vectors":[[0,1],[1,0]]}'],
    ['lu', '{"P":[[0,1],[1,0]],"L":[[1,0],[0,1]],"U":[[3,4],[0,2]]}'],
    ['qr', /^\{"Q":\[.+,"R":\[.+\}$/u],
  ];
  const observations: { operation: Operation; throughBrowserMs: number }[] = [];
  for (const [name, expected] of examples) {
    const started = performance.now();
    await operation(page, name).click();
    await useExample(page);
    await calculate(page);
    await expect(result(page)).toHaveAttribute('data-canonical', expected);
    observations.push({ operation: name, throughBrowserMs: performance.now() - started });
  }
  await expect(result(page).getByRole('table', { name: 'Q', exact: true })).toBeVisible();
  await expect(result(page).getByRole('table', { name: 'R', exact: true })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await picker(page).selectOption('standard');
  await expect(standard).toHaveValue('1/3');
  await openWorkspace(page);
  await expect(operation(page, 'qr')).toHaveAttribute('aria-pressed', 'true');
  await expect(result(page)).toHaveAttribute('data-canonical', examples.at(-1)![1]);
  await expect(cell(page, 'A', 3, 2)).toHaveValue('1');
  await testInfo.attach('linear-algebra-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, observations, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });
});

test('Linear algebra edits, pastes and resizes matrices by keyboard while retaining exact integer text', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  const first = cell(page, 'A', 1, 1);
  await pasteMatrix(first, '1\t2\t3\r\n4\t5\t6');
  const columns = page.getByRole('combobox', { name: m.columns.A, exact: true });
  await expect(columns).toHaveValue('3');
  await expect(cell(page, 'A', 2, 3)).toHaveValue('6');
  await first.press('ArrowDown');
  await expect(cell(page, 'A', 2, 1)).toBeFocused();
  await cell(page, 'A', 2, 1).press('Alt+ArrowRight');
  await expect(cell(page, 'A', 2, 2)).toBeFocused();
  await pasteMatrix(first, '9\t9\n9');
  await expect(page.getByText(m.invalidBlock, { exact: true })).toBeVisible();
  await expect(first).toHaveValue('1');

  await operation(page, 'transpose').click();
  await first.press('Control+Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', '[[1,4],[2,5],[3,6]]');
  await columns.selectOption('1');
  const rows = page.getByRole('combobox', { name: m.rows.A, exact: true });
  await rows.selectOption('1');
  await expect(first).toHaveValue('1');
  await first.fill('9007199254740993');
  await first.press('Control+Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', '[[9007199254740993]]');
  await expect(result(page)).toContainText('9,007,199,254,740,993');
});

test('Linear algebra distinguishes incompatible, indeterminate, singular and invalid input', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  await operation(page, 'solve').click();
  const first = cell(page, 'A', 1, 1);
  const right = cell(page, 'B', 1, 1);
  await pasteMatrix(first, '1 1;2 2');
  await pasteMatrix(right, '1;2');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '{"status":"infinite","particular":[1,0],"basis":[[-1,1]],"parameters":["t1"]}');
  await expect(result(page)).toContainText(m.infinite);
  await expect(result(page).getByRole('table', { name: m.basis, exact: true })).toBeVisible();
  await cell(page, 'B', 2, 1).fill('3');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '{"status":"inconsistent"}');
  await expect(result(page)).toContainText(m.inconsistent);

  await operation(page, 'inverse').click();
  await calculate(page);
  await expect(page.getByText(m.singular, { exact: true })).toBeVisible();
  await first.fill('1/0');
  await calculate(page);
  await expect(page.getByText(en.domainError, { exact: true })).toBeVisible();
  await expect(page.getByText(m.singular, { exact: true })).toHaveCount(0);
  await first.fill('1 | 1');
  await calculate(page);
  await expect(page.getByText(m.invalidCell, { exact: true })).toBeVisible();
});

test('Linear algebra shows observed numerical diagnostics and exports canonical proof', async ({ page }, testInfo) => {
  await page.goto('/');
  await openWorkspace(page);
  await operation(page, 'qr').click();
  await useExample(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', /^\{"Q":/u);
  await expect(page.locator('.linear-result-heading')).toContainText(en.approximate);
  const diagnostics = page.locator('.linear-constraints');
  await expect(diagnostics).toContainText(m.proof.relativeResidual);
  await expect(diagnostics).toContainText(m.proof.orthogonality);
  await expect(diagnostics).toContainText('Exact rank: 2 of 2');
  const q = result(page).getByRole('region', { name: 'Q', exact: true });
  expect(await q.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const screenshot = testInfo.outputPath('linear-algebra.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('linear-algebra-ui', { path: screenshot, contentType: 'image/png' });

  const panel = page.locator('.calculation-proof');
  await panel.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const bytes = await readFile(await download.path());
  const proof = parseCalculationProofFile(bytes.toString('utf8'));
  expect(proof).toMatchObject({
    module: 'linear_algebra', operation: 'qr', exactness: 'approximate', error_bound: null,
    method: 'verified_householder_qr', variables: { A: '3×2 matrix' }, precision: 15,
  });
  expect(proof?.constraints).toEqual(expect.arrayContaining([expect.stringMatching(/^Relative Frobenius residual \(observed\): /u)]));
  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('pt-BR');
  await expect(diagnostics).toContainText(pt.linearAlgebra.proof.relativeResidual);
  await expect(panel.getByText(pt.linearAlgebra.proof.methods.verified_householder_qr, { exact: true })).toBeVisible();
  await panel.getByTestId('proof-import-file').setInputFiles({ name: 'linear-proof.json', mimeType: 'application/json', buffer: bytes });
  await expect(panel.getByText('verified_householder_qr', { exact: true })).toBeVisible();
  await testInfo.attach('linear-algebra-numerical-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ exactness: proof?.exactness, method: proof?.method, tolerance: proof?.tolerance,
      error_bound: proof?.error_bound, constraints: proof?.constraints }),
  });
});

test('Linear algebra localizes controls and decimal cells with accessible 320 px RTL and wide grids', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 940 });
  await page.goto('/');
  await openWorkspace(page);
  await page.locator('details.settings summary').click();
  const languages = page.locator('details.settings select').first();
  const local = {
    'pt-BR': ['0,5', '1', '2'], ar: ['٠٫٥', '١', '٢'], 'zh-CN': ['０．５', '1', '2'],
    hi: ['०.५', '१', '२'], es: ['0,5', '1', '2'], fr: ['0,5', '1', '2'], en: ['0.5', '1', '2'],
  } as const;
  for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
    await languages.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const a = messages.linearAlgebra;
    await expect(page.getByRole('heading', { name: a.title, exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: a.operation, exact: true })).toBeVisible();
    const [value, one, two] = local[locale as keyof typeof local];
    const input = page.getByRole('textbox', { name: `A[${one},${one}]`, exact: true });
    await input.fill(value);
    await page.getByRole('textbox', { name: `A[${two},${two}]`, exact: true }).fill(one);
    await input.press('Control+Enter');
    await expect(result(page)).toHaveAttribute('data-canonical', '1/2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (locale === 'ar') {
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await page.getByRole('combobox', { name: a.columns.A, exact: true }).selectOption('12');
      const grid = page.getByRole('region', { name: a.grid.A, exact: true });
      expect(await grid.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      expect(await grid.evaluate((element) => {
        const region = element.getBoundingClientRect();
        const first = element.querySelector('input')!.getBoundingClientRect();
        return first.left >= region.left && first.right <= region.right;
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('details.settings summary').click();
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
      await page.getByRole('combobox', { name: a.columns.A, exact: true }).selectOption('2');
      await page.locator('details.settings summary').click();
    }
  }
});

test('Linear algebra loads one isolated WASM on demand and recalculates offline', async ({ page, context }, testInfo) => {
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
  await expect(result(page)).toHaveAttribute('data-canonical', '-2');
  await expect.poll(async () => (await cached()).some((path) => path.includes('linear-algebra-worker-'))).toBe(true);
  await expect.poll(async () => (await cached()).filter((path) => path.endsWith('.wasm')).length).toBe(1);
  const prepared = await cached();
  expect(prepared.some((path) => /tool-(?:scientific|calculus|algebra)-/u.test(path))).toBe(false);
  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await openWorkspace(page);
  await useExample(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', '-2');
  await testInfo.attach('linear-algebra-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: '-2', otherToolAssets: [] }),
  });
});

test.describe('Linear algebra worker isolation', () => {
  test.use({ serviceWorkers: 'block' });
  test('switching modules terminates unfinished work and retains the matrix draft', async ({ page, context }) => {
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
      await useExample(page);
      await calculate(page);
      await admitted;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '1');
      await picker(page).selectOption('standard');
      await expect.poll(() => page.workers().some((worker) => worker.url().includes('linear-algebra-worker'))).toBe(false);
      open();
      await openWorkspace(page);
      await expect(cell(page, 'A', 2, 1)).toHaveValue('3');
      await calculate(page);
      await expect(result(page)).toHaveAttribute('data-canonical', '-2');
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
    } finally {
      open();
    }
  });
});
