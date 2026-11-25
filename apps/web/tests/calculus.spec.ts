import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parseCalculationProofFile } from '../src/calculation-proof';
import ar from '../src/locales/ar.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import hi from '../src/locales/hi.json' with { type: 'json' };
import pt from '../src/locales/pt-BR.json' with { type: 'json' };
import zh from '../src/locales/zh-CN.json' with { type: 'json' };

type Operation = keyof typeof en.calculus.operations;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const expression = (page: Page) => page.getByRole('textbox', { name: 'Expression', exact: true });
const result = (page: Page) => page.getByTestId('calculus-result');
const operation = (page: Page, name: Operation) =>
  page.getByRole('button', { name: en.calculus.operations[name], exact: true });
const advanced = /\/assets\/(?:tool-|dars_tool_wasm)/;

async function calculus(page: Page) {
  await picker(page).selectOption('calculus');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

async function calculate(page: Page, value: string, expected: string | RegExp) {
  await expression(page).fill(value);
  await expression(page).press('Control+Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', expected);
}

test('Calculus performs higher and partial derivatives, integrals and a Taylor expansion', async ({ page }, testInfo) => {
  await page.goto('/');
  await expression(page).fill('1/3');
  const before = performance.now();
  await calculus(page);
  const activationMs = performance.now() - before;
  await page.getByText('Operations', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption('ultra_light');
  await expect(page.locator('main')).toHaveAttribute('data-profile', 'ultra_light');
  await page.getByText('Operations', { exact: true }).click();
  const observations: { operation: Operation; throughBrowserMs: number }[] = [];
  async function verify(name: Operation, input: string, expected: string | RegExp) {
    const start = performance.now();
    await operation(page, name).click();
    await calculate(page, input, expected);
    observations.push({ operation: name, throughBrowserMs: performance.now() - start });
  }

  await page.getByRole('combobox', { name: en.calculus.fields.order, exact: true }).selectOption('2');
  await verify('derivative', 'x^4', '12*x^2');
  await page.getByRole('combobox', { name: en.calculus.fields.variable, exact: true }).selectOption('y');
  await verify('derivative', 'x^3*y+2*y^2', '4');
  await verify('antiderivative', '3*x^2+2*x', /^x\^3\s*\+\s*x\^2\s*\+\s*C$/u);
  await verify('integral', 'x^2', '1/3');
  await operation(page, 'series').click();
  await page.getByRole('combobox', { name: en.calculus.fields.terms, exact: true }).selectOption('4');
  await verify('series', 'exp(x)', /x\^3.*O\(x\^4\)/u);
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await picker(page).selectOption('standard');
  await expect(expression(page)).toHaveValue('1/3');
  await calculus(page);
  await expect(operation(page, 'series')).toHaveAttribute('aria-pressed', 'true');
  await expect(result(page)).toHaveAttribute('data-canonical', /O\(x\^4\)/u);
  await operation(page, 'derivative').click();
  await expect(expression(page)).toHaveValue('x^3*y+2*y^2');
  await expect(page.getByRole('combobox', { name: en.calculus.fields.variable, exact: true })).toHaveValue('y');
  await expect(page.getByRole('combobox', { name: en.calculus.fields.order, exact: true })).toHaveValue('2');
  await testInfo.attach('calculus-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, observations, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });
});

test('Calculus distinguishes limits, unsupported primitives and undefined integrals', async ({ page }) => {
  await page.goto('/');
  await calculus(page);
  await operation(page, 'limit').click();
  const side = page.getByRole('combobox', { name: en.calculus.fields.side, exact: true });
  await calculate(page, '(1-cos(x))/x^2', '1/2');
  await calculate(page, '1/x', 'does_not_exist');
  await expect(result(page)).toContainText(en.calculus.noLimit);
  await side.selectOption('left');
  await calculate(page, '1/x', '-inf');
  await expect(result(page)).toContainText('-∞');
  await side.selectOption('right');
  await calculate(page, '1/x', 'inf');
  await page.getByRole('textbox', { name: en.calculus.fields.point, exact: true }).fill('+∞');
  await expect(side).toBeDisabled();
  await expect(side).toHaveValue('both');
  await calculate(page, 'x/(x+1)', '1');

  await operation(page, 'antiderivative').click();
  await expression(page).fill('exp(x^2)');
  await expression(page).press('Control+Enter');
  const workspace = page.getByRole('region', { name: en.calculus.title, exact: true });
  await expect(workspace.getByText(en.tools.unsupported, { exact: true })).toBeVisible();
  await expect(result(page)).not.toHaveAttribute('data-canonical', /./u);
  await operation(page, 'integral').click();
  await page.getByRole('textbox', { name: en.calculus.fields.lower, exact: true }).fill('-1');
  await expression(page).fill('1/x');
  await expression(page).press('Control+Enter');
  await expect(workspace.getByText(en.domainError, { exact: true })).toBeVisible();
  await expect(result(page)).not.toHaveAttribute('data-canonical', /./u);
});

test('Calculus exposes numerical tolerance and an uncertified estimate in its downloadable proof', async ({ page }, testInfo) => {
  await page.goto('/');
  await calculus(page);
  await operation(page, 'numerical_integral').click();
  await page.getByRole('button', { name: /Use example/u }).click();
  await expect(expression(page)).toHaveValue('exp(-x^2)');
  await page.getByRole('textbox', { name: en.calculus.fields.tolerance, exact: true }).fill('1e-9');
  await page.getByRole('button', { name: en.calculate, exact: true }).click();
  await expect(result(page)).toHaveAttribute('data-canonical', /^0\.746824/u);
  const estimate = page.locator('.calculus-error-estimate');
  await expect(estimate).toContainText(en.calculus.estimatedError);
  await expect(estimate).toContainText(en.calculus.fields.tolerance);
  await expect(page.locator('.calculus-result-label')).toContainText(en.approximate);
  const screenshot = testInfo.outputPath('calculus.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('calculus-ui', { path: screenshot, contentType: 'image/png' });

  const panel = page.locator('.calculation-proof');
  await panel.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const downloaded = await readFile(await download.path());
  const record = parseCalculationProofFile(downloaded.toString('utf8'));
  expect(record).toMatchObject({
    module: 'calculus', operation: 'numerical_integral', exactness: 'approximate', error_bound: null,
    method: 'adaptive_simpson_quadrature',
    expression: 'exp(-x^2)', options: { lower: '0', upper: '1', variable: 'x' },
  });
  const error = record?.constraints.find((value) => value.startsWith('Estimated absolute quadrature error (uncertified): '));
  expect(error).toMatch(/^Estimated absolute quadrature error \(uncertified\): [\de.+-]+$/iu);
  expect(Number(record?.tolerance)).toBe(1e-9);
  expect(Math.abs(Number(record?.result) - 0.746824132812427)).toBeLessThan(1e-9);
  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('pt-BR');
  await expect(estimate).toContainText(pt.calculus.estimatedError);
  await expect(panel.getByText(pt.calculus.proof.methods.numerical_integral, { exact: true })).toBeVisible();
  await panel.getByTestId('proof-import-file').setInputFiles({
    name: 'calculus-proof.json', mimeType: 'application/json', buffer: downloaded,
  });
  await expect(panel.getByText('adaptive_simpson_quadrature', { exact: true })).toBeVisible();
  await expect(panel.getByText(pt.calculus.proof.methods.numerical_integral, { exact: true })).toHaveCount(0);
  await testInfo.attach('calculus-numerical-proof', {
    contentType: 'application/json',
    body: JSON.stringify({
      exactness: record?.exactness, result: record?.result, tolerance: record?.tolerance,
      error_bound: record?.error_bound, estimate: error,
    }),
  });
});

test('Calculus localizes operation controls, numeric parameters and the narrow RTL layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 940 });
  await page.goto('/');
  await calculus(page);
  await operation(page, 'integral').click();
  await page.locator('details.settings summary').click();
  const languages = page.locator('details.settings select').first();
  const localBounds: Readonly<Record<string, string>> = {
    'pt-BR': '0,5', ar: '٠٫٥', 'zh-CN': '０．５', hi: '०.५', es: '0,5', fr: '0,5', en: '0.5',
  };
  for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
    await languages.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: messages.calculus.title, exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: messages.calculus.operation, exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: messages.calculus.parameters, exact: true })).toBeVisible();
    const upper = page.getByRole('textbox', { name: messages.calculus.fields.upper, exact: true });
    await upper.fill('');
    await upper.fill(localBounds[locale] ?? '0.5');
    const draft = page.getByRole('textbox', { name: messages.expression, exact: true });
    await draft.fill('x');
    await draft.press('Control+Enter');
    await expect(result(page)).toHaveAttribute('data-canonical', '1/8');
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

test('Calculus prepares one isolated WASM lazily and calculates after offline reload', async ({ page, context }, testInfo) => {
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
  await calculus(page);
  expect([...requested].some((path) => path.endsWith('.wasm'))).toBe(false);
  await calculate(page, 'x^2', '2*x');
  await expect.poll(async () => (await cached()).some((path) => path.includes('calculus-worker-'))).toBe(true);
  await expect.poll(async () => (await cached()).filter((path) => path.endsWith('.wasm')).length).toBe(1);
  const prepared = await cached();
  expect(prepared.some((path) => /scientific-|algebra-/u.test(path))).toBe(false);
  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await calculus(page);
  await calculate(page, 'x^3', '3*x^2');
  await testInfo.attach('calculus-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: '3*x^2', otherToolAssets: [] }),
  });
});

test.describe('Calculus worker isolation', () => {
  test.use({ serviceWorkers: 'block' });
  test('switching modules stops a pending Calculus worker and keeps the draft', async ({ page, context }) => {
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
      await calculus(page);
      await expression(page).fill('x^3');
      await expression(page).press('Control+Enter');
      await admitted;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '1');
      await picker(page).selectOption('standard');
      await expect.poll(() => page.workers().some((worker) => worker.url().includes('calculus-worker'))).toBe(false);
      open();
      await calculus(page);
      await expect(expression(page)).toHaveValue('x^3');
      await calculate(page, 'x^3', '3*x^2');
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
    } finally {
      open();
    }
  });
});
