import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Messages } from '../src/i18n';

const input = (page: Page) => page.getByRole('textbox', { name: 'Expression', exact: true });
const result = (page: Page) => page.getByTestId('result');
const main = (page: Page) => page.getByRole('main');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const profile = (page: Page) => page.getByRole('combobox', { name: 'Performance profile', exact: true });
const offline = (page: Page) => page.getByRole('checkbox', { name: 'Use cached assets only', exact: true });

async function openOperations(page: Page) {
  await page.getByText('Operations', { exact: true }).click();
  await expect(profile(page)).toBeVisible();
}

async function calculate(page: Page, expression: string, expected: string) {
  await input(page).fill(expression);
  await button(page, 'Calculate').click();
  await expect(result(page)).toHaveText(expected);
}

test('resource profiles retire and wake a real worker without changing exact math', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const trace = { created: 0, terminated: 0 };
    Reflect.set(window, 'darsTestWorkers', trace);
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        trace.created++;
      }

      terminate() {
        trace.terminated++;
        super.terminate();
      }
    };
  });
  const counters = () => page.evaluate(() => Reflect.get(window, 'darsTestWorkers') as {
    created: number; terminated: number;
  });

  await page.goto('/');
  await openOperations(page);
  await page.getByText('Local diagnostics', { exact: true }).click();
  await profile(page).selectOption('ultra_light');
  await expect(main(page)).toHaveAttribute('data-profile', 'ultra_light');
  await expect(page.getByTestId('effective-profile')).toHaveText('Ultra Light');
  await expect(page.locator('html')).toHaveAttribute('data-resource-effects', 'reduced');
  await expect(main(page)).toHaveAttribute('data-workers', '0', { timeout: 7_000 });
  await expect(page.getByTestId('active-workers')).toHaveText('0');
  await expect(page.getByTestId('wasm-memory')).not.toHaveAttribute('data-bytes', /^\d+$/);
  const retired = await counters();
  expect(retired.created).toBeGreaterThanOrEqual(1);
  expect(retired.terminated).toBe(retired.created);

  await calculate(page, '0.1+0.2', '0.3');
  await expect(main(page)).toHaveAttribute('data-workers', '0', { timeout: 7_000 });
  const wokeAndRetired = await counters();
  expect(wokeAndRetired.created).toBe(retired.created + 1);
  expect(wokeAndRetired.terminated).toBe(retired.terminated + 1);

  await profile(page).selectOption('maximum');
  await expect(main(page)).toHaveAttribute('data-profile', 'maximum');
  await expect(page.getByTestId('effective-profile')).toHaveText('Maximum');
  await expect(page.locator('html')).toHaveAttribute('data-resource-effects', 'full');
  await calculate(page, '0.1+0.2', '0.3');
  await expect(main(page)).toHaveAttribute('data-workers', '1');
  await expect(page.getByTestId('active-workers')).toHaveText('1');
  await expect(page.getByTestId('wasm-memory')).toHaveAttribute('data-bytes', /^[1-9]\d*$/, { timeout: 12_500 });
  const liveWasmBytes = Number(await page.getByTestId('wasm-memory').getAttribute('data-bytes'));
  const maximumStart = await counters();
  expect(maximumStart.created).toBe(wokeAndRetired.created + 1);

  // Contrast Maximum after the full one-second Ultra Light retirement window.
  await page.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 1_250)));
  const maximumAfterUltraWindow = await counters();
  expect(maximumAfterUltraWindow).toEqual(maximumStart);
  await expect(main(page)).toHaveAttribute('data-workers', '1');
  await page.reload();
  await openOperations(page);
  await expect(profile(page)).toHaveValue('maximum');
  await expect(main(page)).toHaveAttribute('data-profile', 'maximum');
  await testInfo.attach('worker-policy-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ retired, wokeAndRetired, maximumStart, maximumAfterUltraWindow, exactResult: '0.3', liveWasmBytes }),
  });
});

test('offline mode persists through reload and blocks a real uncached same-origin request', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await openOperations(page);
  await expect(offline(page)).toBeEnabled();
  const probe = () => page.evaluate(async () => {
    const url = new URL('dars-worker.js?operations-network-probe', location.href);
    const cached = Boolean(await caches.match(url.href));
    try {
      const response = await fetch(url, { cache: 'no-store' });
      return { cached, status: response.status, blocked: false };
    } catch {
      return { cached, status: null, blocked: true };
    }
  });
  const online = await probe();
  expect(online).toEqual({ cached: false, status: 200, blocked: false });

  await offline(page).click();
  await expect(offline(page)).toBeChecked();
  await expect(offline(page)).toBeEnabled();
  const blocked = await probe();
  expect(blocked).toEqual({ cached: false, status: null, blocked: true });
  await calculate(page, '200+10%', '220');

  await page.reload();
  await openOperations(page);
  await expect(offline(page)).toBeChecked();
  const afterReload = await probe();
  expect(afterReload).toEqual(blocked);
  await calculate(page, '0.1+0.2', '0.3');
  await offline(page).click();
  await expect(offline(page)).not.toBeChecked();
  await expect(offline(page)).toBeEnabled();
  const restored = await probe();
  expect(restored).toEqual(online);
  await testInfo.attach('offline-policy-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ online, blocked, afterReload, restored }),
  });
});

test('visibility suspension recovers exact session state and the privacy action discards it', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => hidden ? 'hidden' : 'visible',
    });
    Reflect.set(window, 'darsTestSetHidden', (value: boolean) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    });
  });
  const changeVisibility = (hidden: boolean) => page.evaluate((value) => {
    Reflect.get(window, 'darsTestSetHidden')(value);
  }, hidden);

  await page.goto('/');
  await openOperations(page);
  await profile(page).selectOption('maximum');
  await input(page).fill('100');
  await button(page, 'Store in memory').click();
  await expect(button(page, 'Recall memory')).toBeEnabled();
  await input(page).fill('sqrt(2)%');
  await button(page, 'Add to memory').click();
  await expect(button(page, 'Add to memory')).toBeEnabled();
  await button(page, 'Recall memory').click();
  await button(page, 'Calculate').click();
  await expect(result(page)).toHaveText('100.014142135623730950488');
  const reference = await input(page).inputValue();
  expect(reference).toMatch(/^@\d+$/);

  await changeVisibility(true);
  await expect(main(page)).toHaveAttribute('data-module-phase', 'suspended');
  await expect(main(page)).toHaveAttribute('data-workers', '0');
  await expect(input(page)).toHaveCount(0);
  await changeVisibility(false);
  await expect(main(page)).toHaveAttribute('data-module-phase', 'active');
  await expect(input(page)).toHaveValue(reference);
  await expect(result(page)).toHaveText('100.014142135623730950488');
  await expect(button(page, 'Recall memory')).toBeEnabled();
  await button(page, 'Multiply').click();
  await button(page, '2').click();
  await button(page, 'Calculate').click();
  await expect(result(page)).toHaveText('200.028284271247461900976');

  await button(page, 'Clear calculations and session').click();
  await expect(input(page)).toHaveValue('');
  await expect(result(page)).toHaveText('0');
  await expect(button(page, 'Recall memory')).toBeDisabled();
  await expect(page.getByText('No calculations yet', { exact: true })).toBeVisible();
  await testInfo.attach('visibility-session-proof', {
    contentType: 'application/json',
    body: JSON.stringify({
      source: 'Injected document visibility and dispatched the production visibility event.',
      suspendedWorkers: 0,
      recovered: '100.014142135623730950488',
      continued: '200.028284271247461900976',
      cleared: true,
    }),
  });
});

test('reset preferences clears DARS settings while preserving unrelated browser keys', async ({ page }) => {
  await page.goto('/');
  await openOperations(page);
  await profile(page).selectOption('maximum');
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('light');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.getByText('Configuración', { exact: true }).click();
  const readSettings = () => page.evaluate(() => ({
    theme: localStorage.getItem('dars.preference.theme'),
    profile: localStorage.getItem('dars.preference.profile'),
    language: localStorage.getItem('dars.preference.language'),
    unrelated: localStorage.getItem('dars-other-test-key'),
  }));
  await page.evaluate(() => localStorage.setItem('dars-other-test-key', 'retained'));
  expect(await readSettings()).toEqual({ theme: 'light', profile: 'maximum', language: 'es', unrelated: 'retained' });
  await button(page, 'Restablecer idioma, apariencia y perfil').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(profile(page)).toHaveValue('auto');
  expect(await readSettings()).toEqual({ theme: null, profile: null, language: null, unrelated: 'retained' });
});

test('operations, privacy and diagnostics fit 320 px and retain preferences in all seven locales', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(50_000);
  if (!baseURL) throw new Error('The locale test requires the production preview URL.');
  const caseLocales = [
    ['en', 'en-US'], ['pt-BR', 'pt-BR'], ['zh-CN', 'zh-CN'], ['hi', 'hi-IN-u-nu-deva'],
    ['es', 'es'], ['ar', 'ar-EG'], ['fr', 'fr-FR'],
  ] as const;
  const origin = new URL(baseURL).origin;
  const measurements = [];
  for (const [locale, numberLocale] of caseLocales) {
    const messages: Messages = JSON.parse(await readFile(new URL('../src/locales/' + locale + '.json', import.meta.url), 'utf8'));
    const context = await browser.newContext({ baseURL, locale, viewport: { width: 320, height: 760 } });
    const external = new Set<string>();
    context.on('request', (request) => {
      const requested = new URL(request.url());
      if (['http:', 'https:'].includes(requested.protocol) && requested.origin !== origin) external.add(requested.origin);
    });
    try {
      const page = await context.newPage();
      const m = messages.operations;
      const selection = page.getByRole('combobox', { name: m.selection, exact: true });
      const languageDirection = locale === 'ar' ? 'rtl' : 'ltr';
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', languageDirection);
      await page.getByText(m.operations, { exact: true }).click();
      await expect(page.getByRole('heading', { name: m.privacy, exact: true })).toBeVisible();
      await expect(selection.locator('option')).toHaveCount(6);
      await selection.selectOption('maximum');
      await page.getByText(m.diagnostics, { exact: true }).click();
      await expect(page.getByTestId('effective-profile')).toHaveText(m.maximum);
      await expect(page.getByTestId('module-phase')).toHaveText(messages.standard + ' · ' + m.active);
      const num = new Intl.NumberFormat(numberLocale, { useGrouping: false });
      const expression = page.getByRole('textbox', { name: messages.expression, exact: true });
      await expect(expression).toHaveAttribute('dir', 'ltr');
      await expression.fill(num.format(0.1) + '+' + num.format(0.2));
      await page.getByRole('button', { name: messages.calculate, exact: true }).click();
      await expect(result(page)).toHaveText(num.format(0.3));
      await expect(page.getByTestId('active-workers')).toHaveText(num.format(1));
      const geometry = await page.locator('.operations-content').evaluate((panel) => ({
        viewport: innerWidth, root: document.documentElement.scrollWidth, panel: panel.clientWidth,
        panelContent: panel.scrollWidth,
      }));
      expect(geometry.viewport).toBe(320);
      expect(geometry.root).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.panelContent).toBeLessThanOrEqual(geometry.panel);

      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await page.getByText(m.operations, { exact: true }).click();
      await expect(selection).toHaveValue('maximum');
      expect([...external]).toEqual([]);
      measurements.push({ locale, direction: languageDirection, geometry, result: num.format(0.3), externalRequests: external.size });
    } finally {
      await context.close();
    }
  }
  await testInfo.attach('localized-operations-proof', {
    contentType: 'application/json', body: JSON.stringify(measurements),
  });
});
