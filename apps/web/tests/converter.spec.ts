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
import { catalog } from '../src/tool-converter-catalog';
import type { Category } from '../src/tool-converter-catalog';

const c = en.converter;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const result = (page: Page) => page.getByTestId('converter-result');
const button = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });
const amount = (page: Page) => page.getByRole('textbox', { name: c.amount, exact: true });
const category = (page: Page) => page.getByRole('combobox', { name: c.category, exact: true });
const unit = (page: Page, side: 'from' | 'to') =>
  page.getByRole('combobox', { name: side === 'from' ? c.fromUnit : c.toUnit, exact: true });
const advanced = /\/assets\/(?:tool-|dars_tool_wasm)/u;

async function openWorkspace(page: Page) {
  await picker(page).selectOption('converter');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

async function calculate(page: Page, input: string, expected: string) {
  await amount(page).fill(input);
  await button(page, en.calculate).click();
  await expect(result(page)).toHaveAttribute('data-canonical', expected);
}

test('Converter supports all seventeen unit categories and retains selections when returning', async ({ page }, testInfo) => {
  await page.goto('/');
  const standard = page.getByRole('textbox', { name: en.expression, exact: true });
  await standard.fill('1/3');
  const start = performance.now();
  await openWorkspace(page);
  const activationMs = performance.now() - start;
  await page.getByText('Operations', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption('ultra_light');
  await expect(page.locator('main')).toHaveAttribute('data-profile', 'ultra_light');
  await page.getByText('Operations', { exact: true }).click();
  const cases: readonly [Category, string, string][] = [
    ['length', '1', '100'], ['area', '1', '10000'], ['volume', '1', '1000'], ['mass', '1', '1000'],
    ['time', '1', '60'], ['temperature', '0', '32'], ['temperature_delta', '10', '18'],
    ['speed', '1', '18/5'], ['acceleration', '1', '196133/20000'], ['pressure', '1', '4053/40'],
    ['energy', '1', '3600000'], ['power', '1', '1000'], ['force', '1', '1/1000'], ['angle', '180', 'pi'],
    ['storage', '1', '15625/16384'], ['transfer', '1', '1/8'], ['fuel', '25', '4'],
  ];
  const observations: { category: Category; throughBrowserMs: number }[] = [];
  for (const [family, input, expected] of cases) {
    const started = performance.now();
    await category(page).selectOption(family);
    const codes = await unit(page, 'from').locator('option').evaluateAll((options) => options.map((entry) => (entry as HTMLOptionElement).value));
    expect(codes).toEqual(catalog[family]);
    if (family === 'fuel') await unit(page, 'from').selectOption('km/L');
    await calculate(page, input, expected);
    observations.push({ category: family, throughBrowserMs: performance.now() - started });
  }
  await expect(result(page)).toContainText('4 L/100 km');
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await picker(page).selectOption('standard');
  await expect(standard).toHaveValue('1/3');
  await openWorkspace(page);
  await expect(category(page)).toHaveValue('fuel');
  await expect(unit(page, 'from')).toHaveValue('km/L');
  await expect(amount(page)).toHaveValue('25');
  await expect(result(page)).toHaveAttribute('data-canonical', '4');
  await testInfo.attach('converter-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, observations, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });
});

test('Converter distinguishes exact and approximate factors, offsets and fuel reciprocals', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  await unit(page, 'from').selectOption('in');
  await calculate(page, '1', '127/50');
  await expect(result(page)).toContainText('127/50 cm');
  await button(page, c.swapUnits).click();
  await expect(unit(page, 'from')).toHaveValue('cm');
  await expect(unit(page, 'to')).toHaveValue('in');
  await calculate(page, '127/50', '1');
  await category(page).selectOption('temperature');
  await expect(unit(page, 'to').locator('option[value="delta_degF"]')).toHaveCount(0);
  await amount(page).fill('-274');
  await button(page, en.calculate).click();
  await expect(page.getByText(c.domainError, { exact: true })).toBeVisible();
  await category(page).selectOption('temperature_delta');
  await expect(unit(page, 'to').locator('option[value="degF"]')).toHaveCount(0);
  await calculate(page, '-274', '-2466/5');
  await category(page).selectOption('pressure');
  await unit(page, 'from').selectOption('mmHg');
  await unit(page, 'to').selectOption('Pa');
  await calculate(page, '1', '133.3224');
  await expect(page.locator('.converter-result-heading')).toContainText(en.approximate);
  await expect(result(page)).toContainText(c.significantDigits.replace('{count}', '7'));
  await category(page).selectOption('fuel');
  await unit(page, 'from').selectOption('L/100km');
  await unit(page, 'to').selectOption('km/L');
  await calculate(page, '8', '25/2');
  await amount(page).fill('0');
  await button(page, en.calculate).click();
  await expect(page.getByText(c.domainError, { exact: true })).toBeVisible();
});

test('Converter applies manual currency rates with four date statuses and no provider request', async ({ page, context }, testInfo) => {
  const external: string[] = [];
  context.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4174/')) external.push(request.url()); });
  await page.goto('/');
  await openWorkspace(page);
  await button(page, c.currency).click();
  await button(page, c.useExample).click();
  const source = 'https://example.invalid/local-rate-reference';
  await page.getByRole('textbox', { name: c.rateSource, exact: true }).fill(source);
  await calculate(page, '25', 'amount=125; status=expired');
  const status = page.locator('.converter-rate-status');
  await expect(status).toHaveText(c.validity.expired);
  await expect(page.locator('.converter-dates')).toContainText('2024-02-01');
  await expect(page.locator('.converter-dates')).toContainText(source);
  await expect(page.locator('.converter-dates a')).toHaveCount(0);
  await page.getByLabel(c.referenceDate, { exact: true }).fill('2024-01-31');
  await calculate(page, '25', 'amount=125; status=within_validity');
  await expect(status).toHaveText(c.validity.within_validity);
  await page.getByLabel(c.referenceDate, { exact: true }).fill('2024-01-01');
  await calculate(page, '25', 'amount=125; status=not_yet_valid');
  await expect(status).toHaveText(c.validity.not_yet_valid);
  await page.getByLabel(c.referenceDate, { exact: true }).fill('2024-02-01');
  await page.getByLabel(c.validUntil, { exact: true }).fill('');
  await calculate(page, '25', 'amount=125; status=unverified_validity');
  await expect(status).toHaveText(c.validity.unverified_validity);
  await page.getByLabel(c.validUntil, { exact: true }).fill('2024-01-05');
  await button(page, en.calculate).click();
  await expect(page.getByText(c.domainError, { exact: true })).toBeVisible();
  expect(external).toEqual([]);
  await testInfo.attach('converter-manual-validity', {
    contentType: 'application/json', body: JSON.stringify({ statuses: ['expired','within_validity','not_yet_valid','unverified_validity'],
      expiryIsInclusive: true, invalidDateOrderRejected: true, externalRequests: [] }),
  });
});

test('Converter exports exact manual-rate provenance and captures an explicitly expired result', async ({ page }, testInfo) => {
  await page.goto('/');
  await openWorkspace(page);
  await button(page, c.currency).click();
  await button(page, c.useExample).click();
  await calculate(page, '25', 'amount=125; status=expired');
  const screenshot = testInfo.outputPath('converter.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('converter-ui', { path: screenshot, contentType: 'image/png' });
  const panel = page.locator('.calculation-proof');
  await panel.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const raw = await readFile(await download.path());
  const proof = parseCalculationProofFile(raw.toString('utf8'));
  expect(proof).toMatchObject({
    schema: 1, module: 'converter', operation: 'currency', exactness: 'exact',
    result: 'amount=125; status=expired', expression: '25',
    options: { from: 'USD', to: 'BRL', rate: '5', source: c.exampleSource,
      as_of: '2024-01-10', valid_until: '2024-01-31', reference_date: '2024-02-01' },
  });
  expect(proof?.units).toMatchObject({ from: 'USD', to: 'BRL' });
  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('pt-BR');
  await expect(page.locator('.converter-rate-status')).toHaveText(pt.converter.validity.expired);
  await panel.getByTestId('proof-import-file').setInputFiles({ name: 'converter-proof.json', mimeType: 'application/json', buffer: raw });
  await expect(panel.getByText('amount=125; status=expired', { exact: true })).toBeVisible();
  await testInfo.attach('converter-currency-proof', {
    contentType: 'application/json', body: JSON.stringify({ result: proof?.result, exactness: proof?.exactness,
      options: proof?.options, units: proof?.units, references: proof?.references }),
  });
});

test('Converter supports seven locales and accessible narrow RTL unit and currency forms', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 940 });
  await page.goto('/');
  await openWorkspace(page);
  await page.locator('details.settings summary').click();
  const languages = page.locator('details.settings select').first();
  const variants: Readonly<Record<string, string>> = {
    'pt-BR': '1,25', ar: '١٫٢٥', 'zh-CN': '１．２５', hi: '१.२५', es: '1,25', fr: '1,25', en: '1.25',
  };
  for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
    await languages.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const localized = messages.converter;
    await expect(page.getByRole('heading', { name: localized.title, exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: localized.fromUnit, exact: true }).locator('option[value="m"]')).toHaveText(`m · ${localized.unitNames.m}`);
    const input = page.getByRole('textbox', { name: localized.amount, exact: true });
    await input.fill(variants[locale] ?? '1.25');
    await input.press('Control+Enter');
    await expect(result(page)).toHaveAttribute('data-canonical', '125');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (locale === 'ar') {
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await button(page, localized.currency).click();
      await button(page, localized.useExample).click();
      await button(page, messages.calculate).click();
      await expect(page.locator('.converter-rate-status')).toHaveText(localized.validity.expired);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('details.settings summary').click();
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
      await button(page, localized.units).click();
      await page.locator('details.settings summary').click();
    }
  }
});

test('Converter loads one isolated WASM on demand and supports manual currency offline', async ({ page, context }, testInfo) => {
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
  await calculate(page, '1', '100');
  await expect.poll(async () => (await cached()).some((path) => path.includes('converter-worker-'))).toBe(true);
  await expect.poll(async () => (await cached()).filter((path) => path.endsWith('.wasm')).length).toBe(1);
  const prepared = await cached();
  expect(prepared.some((path) => /tool-(?:scientific|algebra|calculus|linear-algebra|geometry|discrete|programmer)-/u.test(path))).toBe(false);
  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await openWorkspace(page);
  await button(page, c.currency).click();
  await button(page, c.useExample).click();
  await calculate(page, '25', 'amount=125; status=expired');
  await testInfo.attach('converter-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: 'amount=125; status=expired', otherToolAssets: [] }),
  });
});

test.describe('Converter worker isolation', () => {
  test.use({ serviceWorkers: 'block' });
  test('cancels unfinished work and retains the amount after switching modules', async ({ page, context }) => {
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
      await amount(page).fill('1');
      await button(page, en.calculate).click();
      await admitted;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '1');
      await amount(page).press('Escape');
      await expect(page.getByText(en.engineCancelled, { exact: true })).toBeVisible();
      await expect.poll(() => page.workers().some((worker) => worker.url().includes('converter-worker'))).toBe(false);
      open();
      await picker(page).selectOption('standard');
      await openWorkspace(page);
      await expect(amount(page)).toHaveValue('1');
      await button(page, en.calculate).click();
      await expect(result(page)).toHaveAttribute('data-canonical', '100');
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
    } finally {
      open();
    }
  });
});
