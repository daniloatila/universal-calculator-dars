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

type Operation = keyof typeof en.algebra.operations;
const advancedAsset = /\/assets\/(?:tool-|dars_tool_wasm)/;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const result = (page: Page) => page.getByTestId('algebra-result');

async function algebra(page: Page) {
  await picker(page).selectOption('algebra');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

function operation(page: Page, name: Operation) {
  return page.getByRole('button', { name: en.algebra.operations[name], exact: true });
}

async function calculate(page: Page, name: Operation, text: string, value: string | RegExp) {
  await operation(page, name).click();
  const expression = page.getByRole('textbox', { name: en.algebra.inputs[name], exact: true });
  await expression.fill(text);
  await expression.press('Control+Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', value);
}

test('Algebra runs its nine operations, exposes domain restrictions and preserves module state', async ({ page }, testInfo) => {
  await page.goto('/');
  const standardInput = page.getByRole('textbox', { name: 'Expression', exact: true });
  await standardInput.fill('1/3');
  const before = performance.now();
  await algebra(page);
  const activationMs = performance.now() - before;
  await page.getByText('Operations', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption('ultra_light');
  await expect(page.locator('main')).toHaveAttribute('data-profile', 'ultra_light');
  await page.getByText('Operations', { exact: true }).click();

  const vectors: readonly [Operation, string, string][] = [
    ['simplify', 'x/x', '1'],
    ['expand', '(x+1)^2', 'x^2+2*x+1'],
    ['factor', 'x^2-1', '(x-1)*(x+1)'],
    ['polynomial', 'x^2-3x+2', '[1,-3,2]'],
    ['solve', '(x-2)^2=0', 'x=2 [m=2]'],
    ['inequality', 'x^2>1', '(-inf,-1) union (1,inf)'],
    ['system', 'x+y=3\nx-y=1', 'x=2; y=1'],
    ['substitute', 'x^2+y; x=2; y=3', '7'],
    ['verify', 'x^2=4; x=2', 'true'],
  ];
  const observations: { operation: Operation; throughBrowserMs: number }[] = [];
  for (const [name, input, expected] of vectors) {
    const start = performance.now();
    await calculate(page, name, input, expected);
    observations.push({ operation: name, throughBrowserMs: performance.now() - start });
    if (name === 'simplify') {
      await expect(page.locator('.algebra-constraints')).toContainText(/x\s*(?:!=|≠)\s*0/);
      const screenshot = testInfo.outputPath('algebra.png');
      await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
      await testInfo.attach('algebra-ui', { path: screenshot, contentType: 'image/png' });
    }
  }
  await expect(result(page)).toContainText(en.algebra.verified);
  await calculate(page, 'verify', 'x^2=4; x=3', 'false');
  await expect(result(page)).toContainText(en.algebra.rejected);
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await picker(page).selectOption('standard');
  await expect(standardInput).toHaveValue('1/3');
  await algebra(page);
  await expect(operation(page, 'verify')).toHaveAttribute('aria-pressed', 'true');
  await expect(result(page)).toHaveAttribute('data-canonical', 'false');
  await operation(page, 'simplify').click();
  await expect(page.getByRole('textbox', { name: 'Expression', exact: true })).toHaveValue('x/x');
  await testInfo.attach('algebra-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, observations, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });
});

test('Algebra changes solution domains and keeps restrictions when verifying excluded values', async ({ page }) => {
  await page.goto('/');
  await algebra(page);
  await calculate(page, 'solve', 'x^2+1=0', /^(none|\{\})$/);
  await expect(result(page)).toContainText(en.algebra.noSolution);
  await page.getByRole('combobox', { name: en.algebra.domain }).selectOption('complex');
  await calculate(page, 'solve', 'x^2+1=0', /x=.*i.*x=.*i/);
  await page.getByRole('combobox', { name: en.algebra.domain }).selectOption('real');
  await calculate(page, 'verify', 'x/x=1; x=0', 'false');
  await expect(result(page)).toContainText(en.algebra.rejected);
  await operation(page, 'simplify').click();
  const expression = page.getByRole('textbox', { name: 'Expression', exact: true });
  await expression.fill('globalThis.Math.PI');
  await expression.press('Control+Enter');
  await expect(page.getByText(en.tools.unsupported, { exact: true })).toBeVisible();
  await expect(result(page)).not.toHaveAttribute('data-canonical', /./);
});

test('Algebra controls are localized in seven languages and retain an accessible 320 px RTL layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 940 });
  await page.goto('/');
  await algebra(page);
  await operation(page, 'substitute').click();
  await page.locator('details.settings summary').click();
  const languages = page.locator('details.settings select').first();
  const localInputs: Readonly<Record<string, string>> = {
    'pt-BR': 'x+0,5; x=2',
    ar: 'x+٠٫٥؛ x=٢',
    'zh-CN': 'x+０.５； x＝２',
  };
  for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
    await languages.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: messages.algebra.title, exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: messages.algebra.operation })).toBeVisible();
    const draft = page.getByRole('textbox', { name: messages.algebra.inputs.substitute, exact: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const localized = localInputs[locale];
    if (localized) {
      await draft.fill('');
      await draft.fill(localized);
      await draft.press('Control+Enter');
      await expect(result(page)).toHaveAttribute('data-canonical', '5/2');
    }
    if (locale === 'ar') {
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await page.locator('details.settings summary').click();
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
      await page.locator('details.settings summary').click();
    }
  }
});

test('Algebra prepares only its own resources and calculates after offline reload', async ({ page, context }, testInfo) => {
  const requested = new Set<string>();
  context.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (advancedAsset.test(path)) requested.add(path);
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached = async () => (await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('dars-static:'));
    const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return entries.flat().map((request) => new URL(request.url).pathname);
  })).filter((path) => advancedAsset.test(path)).sort();
  expect([...requested]).toEqual([]);
  expect(await cached()).toEqual([]);

  await algebra(page);
  await calculate(page, 'expand', '(x+1)^2', 'x^2+2*x+1');
  await expect.poll(async () => (await cached()).some((path) => path.includes('algebra-worker-'))).toBe(true);
  await expect.poll(async () => (await cached()).filter((path) => path.endsWith('.wasm')).length).toBe(1);
  const prepared = await cached();
  expect(prepared.some((path) => path.includes('scientific-'))).toBe(false);
  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await algebra(page);
  await calculate(page, 'simplify', 'x/x', '1');
  await testInfo.attach('algebra-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: '1', scientificAssets: [] }),
  });
});

test.describe('Algebra worker isolation', () => {
  test.use({ serviceWorkers: 'block' });
  test('switching modules terminates an admitted Algebra worker and allows a fresh calculation', async ({ page, context }) => {
    let open!: () => void;
    let observed!: () => void;
    const admitted = new Promise<void>((resolve) => { observed = resolve; });
    const release = new Promise<void>((resolve) => { open = resolve; });
    let first = true;
    await context.route(/\/assets\/dars_tool_wasm[^/]*\.wasm$/, async (route) => {
      if (first) {
        first = false;
        observed();
        await release;
        await route.abort().catch(() => undefined);
      } else await route.continue();
    });
    try {
      await page.goto('/');
      await algebra(page);
      const expression = page.getByRole('textbox', { name: 'Expression', exact: true });
      await expression.fill('x/x');
      await expression.press('Control+Enter');
      await admitted;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '1');
      await picker(page).selectOption('standard');
      await expect.poll(() => page.workers().some((worker) => worker.url().includes('algebra-worker'))).toBe(false);
      open();
      await algebra(page);
      await expect(expression).toHaveValue('x/x');
      await calculate(page, 'simplify', 'x/x', '1');
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
    } finally {
      open();
    }
  });
});
