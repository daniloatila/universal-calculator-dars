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
import type { Field, Operation } from '../src/tool-date-time-input';

const d = en.dateTime;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const result = (page: Page) => page.getByTestId('date-time-result');
const button = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });
const operation = (page: Page, name: Operation) => button(page, d.operations[name]);
const field = (page: Page, name: Field) => page.getByRole('textbox', { name: d.fields[name], exact: true });
const calculate = (page: Page) => button(page, en.calculate).click();
const example = (page: Page) => button(page, d.useExample).click();
const advanced = /\/assets\/(?:tool-|dars_tool_wasm)/u;
const difference = 'days=2; weeks=0; remaining_days=2';
const firstFold = 'local=2024-11-03T05:30:00; utc=2024-11-03T05:30:00Z; from_offset=-04:00; to_offset=+00:00; from_dst=true; to_dst=false; resolution=earlier';
const secondFold = 'local=2024-11-03T06:30:00; utc=2024-11-03T06:30:00Z; from_offset=-05:00; to_offset=+00:00; from_dst=false; to_dst=false; resolution=later';

async function openWorkspace(page: Page) {
  await picker(page).selectOption('date-time');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

test('Date & Time handles all eight operations and restores both workspaces', async ({ page }, testInfo) => {
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
  const cases: readonly [Operation, string][] = [
    ['difference', difference], ['age', 'years=24; months=0; days=1; total_days=8767'],
    ['period', 'date=2024-02-29'], ['calendar', 'weekday=4; day_of_year=60; iso_year=2024; iso_week=9; leap_year=true; days_in_month=29'],
    ['business_days', 'business_days=4'], ['deadline', 'date=2024-01-16'],
    ['timezone', firstFold], ['duration', 'seconds=3600.000000000'],
  ];
  const observations: { operation: Operation; throughBrowserMs: number }[] = [];
  for (const [name, value] of cases) {
    const started = performance.now();
    await operation(page, name).click();
    await example(page);
    await calculate(page);
    await expect(result(page)).toHaveAttribute('data-canonical', value);
    observations.push({ operation: name, throughBrowserMs: performance.now() - started });
  }
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await picker(page).selectOption('standard');
  await expect(standard).toHaveValue('1/3');
  await openWorkspace(page);
  await expect(operation(page, 'duration')).toHaveAttribute('aria-pressed', 'true');
  await expect(result(page)).toHaveAttribute('data-canonical', 'seconds=3600.000000000');
  await operation(page, 'difference').click();
  await expect(field(page, 'start')).toHaveValue('2024-02-28');
  await expect(field(page, 'end')).toHaveValue('2024-03-01');
  await testInfo.attach('date-time-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, observations, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });
});

test('Date & Time separates signed civil periods and absolute nanosecond durations', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  await field(page, 'start').fill('2024-01-09');
  await field(page, 'end').fill('2024-01-01');
  await field(page, 'end').press('Control+Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', 'days=-8; weeks=-1; remaining_days=-1');
  await operation(page, 'period').click();
  await example(page);
  const overflow = page.getByRole('combobox', { name: d.monthOverflow, exact: true });
  await overflow.selectOption('reject');
  await calculate(page);
  await expect(page.getByText(d.domainError, { exact: true })).toBeVisible();
  await overflow.selectOption('clamp');
  await field(page, 'date').fill('2024-03-31');
  await field(page, 'months').fill('-1');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'date=2024-02-29');
  await operation(page, 'duration').click();
  await field(page, 'instantStart').fill('2024-01-01T00:00:00.000000001Z');
  await field(page, 'instantEnd').fill('2024-01-01T00:00:00Z');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'seconds=-0.000000001');
  await field(page, 'instantEnd').fill('2024-01-01T00:00:00');
  await calculate(page);
  await expect(page.getByText(d.invalid, { exact: true })).toBeVisible();
});

test('Date & Time applies supplied weekdays, holidays and deadline counting bases', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  await operation(page, 'business_days').click();
  await example(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'business_days=4');
  await page.getByRole('checkbox', { name: d.weekdays[6], exact: true }).check();
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'business_days=5');
  await field(page, 'start').fill('2024-01-15');
  await field(page, 'end').fill('2024-01-08');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'business_days=-5');
  await expect(page.locator('.date-time-versions')).toContainText('custom-weekdays-holidays-v1');
  const calendar = page.getByRole('group', { name: d.workCalendar, exact: true });
  for (const day of await calendar.getByRole('checkbox').all()) await day.uncheck();
  await calculate(page);
  await expect(page.getByText(d.workingWeekError, { exact: true })).toBeVisible();
  await operation(page, 'deadline').click();
  await example(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'date=2024-01-16');
  await page.getByRole('combobox', { name: d.deadlineBasis, exact: true }).selectOption('civil');
  await expect(calendar).toHaveCount(0);
  await field(page, 'count').fill('-2');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'date=2024-01-06');
});

test('Date & Time resolves repeated local times and rejects skipped local times for every policy', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  await operation(page, 'timezone').click();
  await field(page, 'local').fill('2024-11-03T01:30:00');
  const resolution = page.getByRole('combobox', { name: d.disambiguation, exact: true });
  await calculate(page);
  await expect(page.getByText(d.ambiguous, { exact: true })).toBeVisible();
  await resolution.selectOption('earlier');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', firstFold);
  await expect(result(page).locator('[data-date-field="from_dst"] dd')).toHaveText(d.boolean.true);
  await resolution.selectOption('later');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', secondFold);
  await expect(result(page).locator('[data-date-field="from_dst"] dd')).toHaveText(d.boolean.false);
  await field(page, 'local').fill('2024-03-10T02:30:00');
  for (const policy of ['reject','earlier','later']) {
    await resolution.selectOption(policy);
    await calculate(page);
    await expect(page.getByText(d.nonexistent, { exact: true })).toBeVisible();
    await expect(result(page)).not.toHaveAttribute('data-canonical', /./u);
  }
});

test('Date & Time exports bundled time-zone provenance with exact offsets and DST flags', async ({ page, context }, testInfo) => {
  const requests: string[] = [];
  context.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4174/')) requests.push(request.url());
  });
  await page.goto('/');
  await openWorkspace(page);
  await operation(page, 'timezone').click();
  await example(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', firstFold);
  await expect(result(page).locator('[data-date-field="from_offset"] dd')).toHaveText('-04:00');
  await expect(result(page).locator('[data-date-field="to_offset"] dd')).toHaveText('+00:00');
  await expect(page.locator('.date-time-versions')).toContainText(d.tzdbVersion);
  await expect(page.locator('.date-time-versions')).toContainText('rearguard');
  const screenshot = testInfo.outputPath('date-time.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('date-time-ui', { path: screenshot, contentType: 'image/png' });

  const panel = page.locator('.calculation-proof');
  await panel.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const bytes = await readFile(await download.path());
  const proof = parseCalculationProofFile(bytes.toString('utf8'));
  expect(proof).toMatchObject({
    module: 'date-time', operation: 'timezone', method: 'iana_bundled_timezone_conversion', exactness: 'exact',
    expression: '2024-11-03T01:30:00', result: firstFold,
    options: { from: 'America/New_York', to: 'UTC', disambiguation: 'earlier' },
    variables: { tzdb_version: expect.stringMatching(/^\d{4}[a-z]$/u), tzdb_format: 'rearguard' },
  });
  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('pt-BR');
  await expect(panel.getByText(pt.dateTime.proof.methods.iana_bundled_timezone_conversion, { exact: true })).toBeVisible();
  await panel.getByTestId('proof-import-file').setInputFiles({ name: 'date-time-proof.json', mimeType: 'application/json', buffer: bytes });
  await expect(panel.getByText('iana_bundled_timezone_conversion', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await testInfo.attach('date-time-zone-proof', {
    contentType: 'application/json', body: JSON.stringify({
      method: proof?.method, result: proof?.result, tzdbVersion: proof?.variables.tzdb_version,
      tzdbFormat: proof?.variables.tzdb_format, options: proof?.options, externalRequests: [],
    }),
  });
});

test('Date & Time supports seven locales and accessible 320 px RTL calendar controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 940 });
  await page.goto('/');
  await openWorkspace(page);
  await page.locator('details.settings summary').click();
  const languages = page.locator('details.settings select').first();
  for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
    await languages.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const localized = messages.dateTime;
    await expect(page.getByRole('heading', { name: localized.title, exact: true })).toBeVisible();
    const bounds = locale === 'ar' ? ['٢٠٢٤-٠٢-٢٨', '٢٠٢٤-٠٣-٠١'] : locale === 'hi' ? ['२०२४-०२-२८', '२०२४-०३-०१']
      : locale === 'zh-CN' ? ['２０２４－０２－２８', '２０２４－０３－０１'] : ['2024-02-28', '2024-03-01'];
    await page.getByRole('textbox', { name: localized.fields.start, exact: true }).fill(bounds[0]!);
    const end = page.getByRole('textbox', { name: localized.fields.end, exact: true });
    await end.fill(bounds[1]!);
    await end.press('Control+Enter');
    await expect(result(page)).toHaveAttribute('data-canonical', difference);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (locale === 'ar') {
      await expect(page.locator('html')).toHaveAttribute('dir','rtl');
      await button(page, localized.operations.business_days).click();
      await button(page, localized.useExample).click();
      await button(page, messages.calculate).click();
      await expect(result(page)).toHaveAttribute('data-canonical', 'business_days=4');
      await expect(page.getByRole('checkbox', { name: localized.weekdays[1], exact: true })).toBeChecked();
      await page.locator('details.settings summary').click();
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await button(page, localized.operations.difference).click();
      await page.locator('details.settings summary').click();
    }
  }
});

test('Date & Time loads one isolated bundled WASM on demand and converts zones offline', async ({ page, context }, testInfo) => {
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
  await example(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', difference);
  await expect.poll(async () => (await cached()).some((path) => path.includes('date-time-worker-'))).toBe(true);
  await expect.poll(async () => (await cached()).filter((path) => path.endsWith('.wasm')).length).toBe(1);
  const prepared = await cached();
  expect(prepared.some((path) => /tool-(?:scientific|algebra|calculus|linear-algebra|geometry|discrete|programmer|converter)-/u.test(path))).toBe(false);
  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await openWorkspace(page);
  await operation(page, 'timezone').click();
  await example(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', firstFold);
  await testInfo.attach('date-time-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: firstFold, otherToolAssets: [] }),
  });
});

test.describe('Date & Time worker isolation', () => {
  test.use({ serviceWorkers: 'block' });
  test('cancels pending work and restores the date draft after switching modules', async ({ page, context }) => {
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
      await example(page);
      await calculate(page);
      await admitted;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '1');
      await field(page, 'start').press('Escape');
      await expect(page.getByText(en.engineCancelled, { exact: true })).toBeVisible();
      await expect.poll(() => page.workers().some((worker) => worker.url().includes('date-time-worker'))).toBe(false);
      open();
      await picker(page).selectOption('standard');
      await openWorkspace(page);
      await expect(field(page, 'start')).toHaveValue('2024-02-28');
      await calculate(page);
      await expect(result(page)).toHaveAttribute('data-canonical', difference);
      await expect(page.locator('main')).toHaveAttribute('data-workers','0');
    } finally {
      open();
    }
  });
});
