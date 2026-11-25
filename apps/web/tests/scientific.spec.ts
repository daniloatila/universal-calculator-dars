import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import ar from '../src/locales/ar.json' with { type: 'json' };
import en from '../src/locales/en.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import hi from '../src/locales/hi.json' with { type: 'json' };
import pt from '../src/locales/pt-BR.json' with { type: 'json' };
import zh from '../src/locales/zh-CN.json' with { type: 'json' };

const advancedAsset = /\/assets\/(?:tool-|calculation-proof-|dars_tool_wasm)/;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const expression = (page: Page) => page.getByRole('textbox', { name: 'Expression', exact: true });
const result = (page: Page) => page.getByTestId('scientific-result');

async function scientific(page: Page) {
  await picker(page).selectOption('scientific');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

async function calculate(page: Page, input: string, expected: string) {
  await expression(page).fill(input);
  await expression(page).press('Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', expected);
}

test('Scientific computes the required vectors and preserves Standard and adaptive behavior', async ({ page }, testInfo) => {
  await page.goto('/');
  await expression(page).fill('1/3');
  const started = performance.now();
  await scientific(page);
  const activationMs = performance.now() - started;
  await page.getByText('Operations', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption('ultra_light');
  await expect(page.locator('main')).toHaveAttribute('data-profile', 'ultra_light');
  const timing: { expression: string; throughBrowserMs: number }[] = [];
  for (const [input, value] of [
    ['sin(90°)', '1'], ['cos(180°)', '-1'], ['ln(1)', '0'], ['log(1024,2)', '10'],
    ['20!', '2432902008176640000'],
  ] as const) {
    const before = performance.now();
    await calculate(page, input, value);
    timing.push({ expression: input, throughBrowserMs: performance.now() - before });
  }
  await page.getByRole('combobox', { name: 'Angle unit' }).selectOption('grad');
  await calculate(page, 'sin(100)', '1');
  await page.getByRole('combobox', { name: 'Angle unit' }).selectOption('rad');
  await page.getByRole('combobox', { name: 'Number system' }).selectOption('complex');
  await calculate(page, 'sqrt(-1)', 'i');
  await page.getByText('Operations', { exact: true }).click();
  const screenshot = testInfo.outputPath('scientific.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('scientific-ui', { path: screenshot, contentType: 'image/png' });
  await calculate(page, 'exp(i*pi)+1', '0');
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await testInfo.attach('scientific-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, timing, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });

  await picker(page).selectOption('standard');
  await expect(expression(page)).toHaveValue('1/3');
  await scientific(page);
  await expect(expression(page)).toHaveValue('exp(i*pi)+1');
  await expect(result(page)).toHaveAttribute('data-canonical', '0');
  await page.getByText('Operations', { exact: true }).click();
  await page.getByRole('button', { name: 'Clear calculations and session', exact: true }).click();
  await expect(expression(page)).toHaveValue('');
  await expect(result(page)).not.toHaveAttribute('data-canonical', /./);
});

test('Scientific options control working precision and engineering notation and expose domain failures', async ({ page }) => {
  await page.goto('/');
  await scientific(page);
  const precision = page.getByRole('textbox', { name: 'Working digits' });
  await precision.fill('7');
  await expression(page).fill('approx(pi)');
  await expression(page).press('Enter');
  await expect(page.getByText(en.scientific.precisionError, { exact: true })).toBeVisible();
  await precision.fill('12');
  await calculate(page, 'approx(pi)', '3.14159265359');
  await expect(page.locator('.scientific-result-label')).toContainText(en.approximate);
  await page.getByRole('combobox', { name: 'Notation' }).selectOption('engineering');
  await calculate(page, '10000', '10e+3');
  await expect(page.locator('.scientific-result-label')).toContainText(en.exact);
  await expression(page).fill('ln(-1)');
  await expression(page).press('Enter');
  await expect(page.getByText(en.domainError, { exact: true })).toBeVisible();
  await expect(result(page)).not.toHaveAttribute('data-canonical', /./);
});

test('Scientific normalizes localized input and keeps its controls within a narrow RTL layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 920 });
  await page.goto('/');
  await scientific(page);
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('pt-BR');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.getByRole('textbox', { name: pt.expression, exact: true }).fill('log(1024;2)');
  await page.getByRole('textbox', { name: pt.expression, exact: true }).press('Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', '10');
  // Locale changes preserve the display state. Enter the same exact computation using Arabic digits.
  await page.getByRole('combobox', { name: pt.language, exact: true }).selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const arabicExpression = page.getByRole('textbox', { name: ar.expression, exact: true });
  await arabicExpression.fill('sin(٩٠°)+٠٫٥');
  await arabicExpression.press('Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', /^(3\/2|1\.5)$/);
  await page.locator('details.settings summary').click();
  await expect(page.getByRole('combobox', { name: ar.operations.modulePicker, exact: true })).toHaveValue('scientific');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);

  await page.locator('details.settings summary').click();
  const languageSelector = page.locator('details.settings select').first();
  for (const [locale, messages] of Object.entries({ 'zh-CN': zh, hi, es, fr, en })) {
    await languageSelector.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: messages.scientific.title, exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: messages.scientific.angle })).toBeVisible();
  }
});

test('Scientific assets are absent on initial opening and remain usable after explicit offline preparation', async ({ page, context }, testInfo) => {
  const requested = new Set<string>();
  context.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (advancedAsset.test(path)) requested.add(path);
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached = async () => (await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('dars-static:'));
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => new URL(request.url).pathname);
  })).filter((path) => advancedAsset.test(path)).sort();
  expect([...requested]).toEqual([]);
  expect(await cached()).toEqual([]);

  await scientific(page);
  await calculate(page, 'cos(180°)', '-1');
  await expect.poll(async () => (await cached()).some((path) => path.endsWith('.wasm'))).toBe(true);
  await expect.poll(async () => (await cached()).some((path) => path.includes('scientific-worker-'))).toBe(true);
  const prepared = await cached();

  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await scientific(page);
  await calculate(page, 'sin(90°)', '1');
  await testInfo.attach('scientific-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: '1' }),
  });
});

test.describe('Scientific worker cancellation', () => {
  test.use({ serviceWorkers: 'block' });

  test('Scientific cancels an admitted worker and calculates on a fresh worker', async ({ page, context }) => {
    let release!: () => void;
    let observed!: () => void;
    const requestObserved = new Promise<void>((resolve) => { observed = resolve; });
    const permit = new Promise<void>((resolve) => { release = resolve; });
    let first = true;
    await context.route(/\/assets\/dars_tool_wasm[^/]*\.wasm$/, async (route) => {
      if (first) {
        first = false;
        observed();
        await permit;
        await route.abort().catch(() => undefined);
      } else await route.continue();
    });
    try {
      await page.goto('/');
      await scientific(page);
      await expression(page).fill('sin(90°)');
      await expression(page).press('Enter');
      await requestObserved;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '1');
      await expression(page).press('Escape');
      await expect(page.getByText('Calculation cancelled.', { exact: true })).toBeVisible();
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
      release();
      await calculate(page, 'ln(1)', '0');
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
    } finally {
      release();
    }
  });
});
