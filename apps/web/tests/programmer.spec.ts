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

type Operation = keyof typeof en.programmer.operations;
const p = en.programmer;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const result = (page: Page) => page.getByTestId('programmer-result');
const button = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });
const operation = (page: Page, key: Operation) => button(page, p.operations[key]);
const field = (page: Page, name: keyof typeof p.fields) => page.getByRole('textbox', { name: p.fields[name], exact: true });
const width = (page: Page) => page.getByRole('textbox', { name: p.bitWidth, exact: true });
const inputBase = (page: Page) => page.getByRole('combobox', { name: p.inputBase, exact: true });
const signed = (page: Page) => page.getByRole('checkbox', { name: p.signed, exact: true });
const advance = /\/assets\/(?:tool-|dars_tool_wasm)/u;

async function openWorkspace(page: Page) {
  await picker(page).selectOption('programmer');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

function canonical(value: bigint, bits = 8, sign = false) {
  const encoded = BigInt.asUintN(bits, value);
  const display = sign ? BigInt.asIntN(bits, encoded) : encoded;
  return `binary=${encoded.toString(2).padStart(bits, '0')}; octal=${encoded.toString(8).padStart(Math.ceil(bits / 3), '0')}; decimal=${display}; hexadecimal=${encoded.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0')}`;
}

async function calculate(page: Page, value: string, expected: string, second?: string) {
  await field(page, 'value').fill(value);
  if (second !== undefined) {
    const operand = field(page, 'secondValue');
    await (await operand.isVisible() ? operand : field(page, 'count')).fill(second);
  }
  await button(page, en.calculate).click();
  await expect(result(page)).toHaveAttribute('data-canonical', expected);
}

test('Programmer runs all eleven operations with fixed-width results in four bases', async ({ page }, testInfo) => {
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
  const vectors: readonly [Operation, string, bigint, string?][] = [
    ['convert', '42', 42n], ['and', '170', 0n, '85'], ['or', '170', 255n, '85'], ['xor', '170', 255n, '85'],
    ['not', '170', 85n], ['shift_left', '3', 12n, '2'], ['shift_right_logical', '128', 64n, '1'],
    ['shift_right_arithmetic', '128', 192n, '1'], ['rotate_left', '129', 3n, '9'],
    ['rotate_right', '129', 192n, '1'], ['twos_complement', '1', 255n],
  ];
  const observations: { operation: Operation; throughBrowserMs: number }[] = [];
  for (const [name, input, output, secondary] of vectors) {
    const start = performance.now();
    await operation(page, name).click();
    await calculate(page, input, canonical(output), secondary);
    observations.push({ operation: name, throughBrowserMs: performance.now() - start });
  }
  await expect(result(page).locator('[data-base="binary"] dd')).toHaveText('11111111');
  await expect(result(page).locator('[data-base="octal"] dd')).toHaveText('377');
  await expect(result(page).locator('[data-base="decimal"] dd')).toHaveText('255');
  await expect(result(page).locator('[data-base="hexadecimal"] dd')).toHaveText('FF');
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await picker(page).selectOption('standard');
  await expect(standard).toHaveValue('1/3');
  await openWorkspace(page);
  await expect(operation(page, 'twos_complement')).toHaveAttribute('aria-pressed', 'true');
  await expect(result(page)).toHaveAttribute('data-canonical', canonical(255n));
  await operation(page, 'convert').click();
  await expect(field(page, 'value')).toHaveValue('42');
  await testInfo.attach('programmer-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, observations, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });
});

test('Programmer distinguishes raw patterns, signed values, over-width shifts and rejected inputs', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  await inputBase(page).selectOption('16');
  await signed(page).check();
  await calculate(page, 'FF', canonical(-1n, 8, true));
  await expect(page.locator('[data-sign-bit]')).toHaveText('1');
  await operation(page, 'twos_complement').click();
  await calculate(page, '80', canonical(-128n, 8, true));
  await expect(page.locator('.programmer-constraints').getByText(p.proof.minSigned, { exact: true })).toBeVisible();
  await operation(page, 'shift_right_arithmetic').click();
  await calculate(page, '0x80', canonical(-1n, 8, true), '8');
  await expect(page.locator('.programmer-constraints').getByText(p.proof.shiftLimit, { exact: true })).toBeVisible();
  await operation(page, 'shift_right_logical').click();
  await calculate(page, '0x80', canonical(0n, 8, true), '8');
  await operation(page, 'convert').click();
  await field(page, 'value').fill('+80');
  await button(page, en.calculate).click();
  await expect(page.getByText(p.domainError, { exact: true })).toBeVisible();
  await signed(page).uncheck();
  await field(page, 'value').fill('-1');
  await button(page, en.calculate).click();
  await expect(page.getByText(p.domainError, { exact: true })).toBeVisible();
  await field(page, 'value').fill('100');
  await button(page, en.calculate).click();
  await expect(page.getByText(p.domainError, { exact: true })).toBeVisible();
  await field(page, 'value').fill('FF');
  await width(page).fill('1025');
  await button(page, en.calculate).click();
  await expect(page.getByText(p.invalidWidth, { exact: true })).toBeVisible();
});

test('Programmer preserves wide integer text and pages the full 1024-bit word', async ({ page }, testInfo) => {
  await page.goto('/');
  await openWorkspace(page);
  for (const [base, input, value] of [['2', '0b1010', 10n], ['8', '0o37', 31n], ['16', '0xAB', 171n]] as const) {
    await inputBase(page).selectOption(base);
    await calculate(page, input, canonical(value));
  }
  await inputBase(page).selectOption('10');
  await button(page, '64 bits').click();
  await calculate(page, '9007199254740993', canonical(9007199254740993n, 64));
  await expect(result(page).locator('[data-base="decimal"] dd')).toHaveText('9007199254740993');
  await width(page).fill('1024');
  const max = (1n << 1024n) - 1n;
  await calculate(page, String(max), canonical(max, 1024));
  await expect(result(page).locator('[data-base="binary"] dd')).toHaveText('1'.repeat(1024));
  await expect(page.locator('.programmer-bit-cells span')).toHaveCount(64);
  await expect(page.getByText('Bits 1,023–960', { exact: true })).toBeVisible();
  await button(page, p.next).click();
  await expect(page.getByText('Bits 959–896', { exact: true })).toBeVisible();
  await button(page, p.previous).click();
  await expect(button(page, p.previous)).toBeDisabled();

  await inputBase(page).selectOption('16');
  await button(page, '16 bits').click();
  await signed(page).check();
  await calculate(page, '80A2', canonical(0x80a2n, 16, true));
  await expect(page.locator('[data-sign-bit]')).toHaveText('1');
  const screenshot = testInfo.outputPath('programmer.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('programmer-ui', { path: screenshot, contentType: 'image/png' });
  await testInfo.attach('programmer-width-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ wideBits: 1024, bitsPerPage: 64, preservedBeyondSafeInteger: '9007199254740993', signed16: canonical(0x80a2n, 16, true) }),
  });
});

test('Programmer exports and reopens the exact width and decimal-count rotation proof', async ({ page }, testInfo) => {
  await page.goto('/');
  await openWorkspace(page);
  await operation(page, 'rotate_left').click();
  await inputBase(page).selectOption('16');
  await calculate(page, '81', canonical(3n), '9');
  await expect(page.locator('.programmer-constraints').getByText(p.proof.rotation.replace('{count}', '1'), { exact: true })).toBeVisible();
  const panel = page.locator('.calculation-proof');
  await panel.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const bytes = await readFile(await download.path());
  const proof = parseCalculationProofFile(bytes.toString('utf8'));
  expect(proof).toMatchObject({
    module: 'programmer', operation: 'rotate_left', exactness: 'exact', method: 'fixed_width_rotate_left',
    expression: '81 9', result: canonical(3n), options: { base: 16, width: 8, signed: false }, variables: { a: '129', count: '9' },
    precision: null, error_bound: null,
  });
  expect(proof?.constraints).toContain('Effective rotation count: 1');
  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('pt-BR');
  await expect(panel.getByText(pt.programmer.proof.rotation.replace('{count}', '1'), { exact: true })).toBeVisible();
  await panel.getByTestId('proof-import-file').setInputFiles({ name: 'programmer-proof.json', mimeType: 'application/json', buffer: bytes });
  await expect(panel.getByText('fixed_width_rotate_left', { exact: true })).toBeVisible();
  await testInfo.attach('programmer-rotation-proof', {
    contentType: 'application/json', body: JSON.stringify({ result: proof?.result, options: proof?.options, constraints: proof?.constraints }),
  });
});

test('Programmer supports seven locales and accessible RTL bit positions at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 940 });
  await page.goto('/');
  await openWorkspace(page);
  await page.locator('details.settings summary').click();
  const languages = page.locator('details.settings select').first();
  for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
    await languages.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const localized = messages.programmer;
    await expect(page.getByRole('heading', { name: localized.title, exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: localized.presets, exact: true })).toBeVisible();
    const [bits, value] = locale === 'ar' ? ['١٢', '٢٥٥'] : locale === 'hi' ? ['१२', '२५५'] : locale === 'zh-CN' ? ['１２', '２５５'] : ['12', '255'];
    await page.getByRole('textbox', { name: localized.bitWidth, exact: true }).fill(bits);
    const entry = page.getByRole('textbox', { name: localized.fields.value, exact: true });
    await entry.fill(value);
    await entry.press('Control+Enter');
    await expect(result(page)).toHaveAttribute('data-canonical', canonical(255n, 12));
    const preview = page.getByRole('list', { name: localized.bitPreview, exact: true });
    await expect(preview).toHaveAttribute('dir', 'ltr');
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

test('Programmer loads only its worker and WASM on demand and calculates offline', async ({ page, context }, testInfo) => {
  const requested = new Set<string>();
  context.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (advance.test(path)) requested.add(path);
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached = async () => (await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('dars-static:'));
    const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return entries.flat().map((request) => new URL(request.url).pathname);
  })).filter((path) => advance.test(path)).sort();
  expect([...requested]).toEqual([]);
  expect(await cached()).toEqual([]);
  await openWorkspace(page);
  expect([...requested].some((path) => path.endsWith('.wasm'))).toBe(false);
  await calculate(page, '42', canonical(42n));
  await expect.poll(async () => (await cached()).some((path) => path.includes('programmer-worker-'))).toBe(true);
  await expect.poll(async () => (await cached()).filter((path) => path.endsWith('.wasm')).length).toBe(1);
  const prepared = await cached();
  expect(prepared.some((path) => /tool-(?:scientific|algebra|calculus|linear-algebra|geometry|discrete)-/u.test(path))).toBe(false);
  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await openWorkspace(page);
  await calculate(page, '42', canonical(42n));
  await testInfo.attach('programmer-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: canonical(42n), otherToolAssets: [] }),
  });
});

test.describe('Programmer worker isolation', () => {
  test.use({ serviceWorkers: 'block' });
  test('cancels unfinished work and resumes the input after switching modules', async ({ page, context }) => {
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
      await field(page, 'value').fill('42');
      await button(page, en.calculate).click();
      await admitted;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '1');
      await field(page, 'value').press('Escape');
      await expect(page.getByText(en.engineCancelled, { exact: true })).toBeVisible();
      await expect.poll(() => page.workers().some((worker) => worker.url().includes('programmer-worker'))).toBe(false);
      open();
      await picker(page).selectOption('standard');
      await openWorkspace(page);
      await expect(field(page, 'value')).toHaveValue('42');
      await button(page, en.calculate).click();
      await expect(result(page)).toHaveAttribute('data-canonical', canonical(42n));
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
    } finally {
      open();
    }
  });
});
