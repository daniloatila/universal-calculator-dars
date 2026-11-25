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

type Operation = keyof typeof en.geometry.operations;
const g = en.geometry;
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const result = (page: Page) => page.getByTestId('geometry-result');
const coordinates = (page: Page) => page.getByRole('textbox', { name: g.coordinates, exact: true });
const operation = (page: Page, name: Operation) => page.getByRole('button', { name: g.operations[name], exact: true });
const calculate = (page: Page) => page.getByRole('button', { name: en.calculate, exact: true }).click();
const useExample = (page: Page) => page.getByRole('button', { name: g.useExample, exact: true }).click();
const advanced = /\/assets\/(?:tool-|calculation-proof-|dars_tool_wasm|module-frames)/u;

async function openWorkspace(page: Page) {
  await picker(page).selectOption('geometry');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(result(page)).toBeVisible();
}

test('Geometry runs eleven planar, solid and Cartesian operations with exact results', async ({ page }, testInfo) => {
  await page.goto('/');
  const standard = page.getByRole('textbox', { name: 'Expression', exact: true });
  await standard.fill('1/3');
  const before = performance.now();
  await openWorkspace(page);
  const activationMs = performance.now() - before;
  await page.getByRole('combobox', { name: g.unit, exact: true }).selectOption('cm');
  const examples: readonly [Operation, string][] = [
    ['rectangle', 'area=12; perimeter=14; diagonal=5'],
    ['circle', 'diameter=4; circumference=4*pi; area=4*pi'],
    ['triangle', 'perimeter=12; area=6; sides=scalene; angles=right'],
    ['polygon', 'area=12; perimeter=14; orientation=counterclockwise'],
    ['sphere', 'surface_area=36*pi; volume=36*pi'],
    ['cylinder', 'base_area=4*pi; lateral_area=12*pi; surface_area=20*pi; volume=12*pi'],
    ['cone', 'slant_height=5; base_area=9*pi; lateral_area=15*pi; surface_area=24*pi; volume=12*pi'],
    ['prism', 'base_area=6; base_perimeter=12; lateral_area=24; surface_area=36; volume=12'],
    ['distance', 'distance=5'],
    ['angle', 'angle=90'],
    ['segments', 'relation=cross; point=[2,2]'],
  ];
  const observations: { operation: Operation; throughBrowserMs: number }[] = [];
  for (const [name, canonical] of examples) {
    const start = performance.now();
    await operation(page, name).click();
    await useExample(page);
    await calculate(page);
    await expect(result(page)).toHaveAttribute('data-canonical', canonical);
    observations.push({ operation: name, throughBrowserMs: performance.now() - start });
    if (name === 'cylinder') await expect(result(page).locator('[data-quantity="volume"]')).toContainText('12*π cm³');
    if (name === 'triangle') await expect(result(page).locator('[data-quantity="angles"]')).toContainText(g.classification.right);
  }
  await expect(result(page).locator('[data-quantity="point"]')).toContainText('[2,2] cm');
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await picker(page).selectOption('standard');
  await expect(standard).toHaveValue('1/3');
  await openWorkspace(page);
  await expect(operation(page, 'segments')).toHaveAttribute('aria-pressed', 'true');
  await expect(result(page)).toHaveAttribute('data-canonical', 'relation=cross; point=[2,2]');
  await operation(page, 'rectangle').click();
  await expect(page.getByRole('textbox', { name: g.dimensions.width, exact: true })).toHaveValue('3');
  await testInfo.attach('geometry-interaction-observations', {
    contentType: 'application/json',
    body: JSON.stringify({ activationMs, observations, scope: 'Playwright actions + scheduler, worker, WASM and result DOM' }),
  });
});

test('Geometry preserves 3D distance, exact radians, segment relations and domain errors', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page);
  await operation(page, 'distance').click();
  await coordinates(page).fill('0 0 0;2 3 6');
  await coordinates(page).press('Control+Enter');
  await expect(result(page)).toHaveAttribute('data-canonical', 'distance=7');
  await operation(page, 'angle').click();
  await useExample(page);
  await page.getByRole('combobox', { name: g.angleUnit, exact: true }).selectOption('rad');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'angle=pi/2');
  await expect(result(page)).toContainText('π/2 rad');
  await operation(page, 'segments').click();
  for (const [source, canonical] of [
    ['0 0;4 0|2 0;6 0', 'relation=overlap; from=[2,0]; to=[4,0]'],
    ['0 0;1 1|1 1;2 0', 'relation=touch; point=[1,1]'],
    ['0 0;1 1|2 2;3 3', 'relation=disjoint'],
  ] as const) {
    await coordinates(page).fill(source);
    await calculate(page);
    await expect(result(page)).toHaveAttribute('data-canonical', canonical);
  }
  await operation(page, 'polygon').click();
  await coordinates(page).fill('0 0;4 4;0 4;4 0');
  await calculate(page);
  await expect(page.getByText(g.domainError, { exact: true })).toBeVisible();
  await expect(result(page)).not.toHaveAttribute('data-canonical', /./u);
  await operation(page, 'circle').click();
  await page.getByRole('textbox', { name: g.dimensions.radius, exact: true }).fill('0');
  await calculate(page);
  await expect(page.getByText(g.domainError, { exact: true })).toBeVisible();
});

test('Geometry draws one-shot adaptive diagrams and releases the canvas when switching modules', async ({ page }, testInfo) => {
  await page.goto('/');
  await openWorkspace(page);
  await page.getByRole('combobox', { name: g.unit, exact: true }).selectOption('cm');
  await operation(page, 'segments').click();
  await useExample(page);
  const frame = page.locator('.geometry-diagram canvas');
  const selectProfile = async (name: 'ultra_light' | 'maximum') => {
    await page.getByText('Operations', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption(name);
    await expect(page.locator('main')).toHaveAttribute('data-profile', name);
    await page.getByText('Operations', { exact: true }).click();
  };
  await selectProfile('ultra_light');
  await expect(frame).toHaveAttribute('data-detail', 'reduced');
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'relation=cross; point=[2,2]');
  await selectProfile('maximum');
  await expect(frame).toHaveAttribute('data-detail', 'full');
  const draws = await frame.getAttribute('data-draws');
  await page.waitForTimeout(280);
  await expect(frame).toHaveAttribute('data-draws', draws!);
  const diagram = await frame.elementHandle();
  const painted = await diagram!.evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0));
  expect(painted).toBe(true);
  const screenshot = testInfo.outputPath('geometry.png');
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await testInfo.attach('geometry-ui', { path: screenshot, contentType: 'image/png' });
  await picker(page).selectOption('standard');
  await expect(frame).toHaveCount(0);
  const released = await diagram!.evaluate((canvas: HTMLCanvasElement) => canvas.width === 0 && canvas.height === 0);
  expect(released).toBe(true);
  await testInfo.attach('geometry-diagram-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ profiles: { ultra_light: 'reduced', maximum: 'full' }, painted, idleDraws: 0, released }),
  });
});

test('Geometry exports power-aware unit metadata with exact symbolic values', async ({ page }, testInfo) => {
  await page.goto('/');
  await openWorkspace(page);
  await operation(page, 'sphere').click();
  await page.getByRole('combobox', { name: g.unit, exact: true }).selectOption('cm');
  await useExample(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', 'surface_area=36*pi; volume=36*pi');
  await expect(result(page)).toContainText('36*π cm³');
  const panel = page.locator('.calculation-proof');
  await panel.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  const bytes = await readFile(await download.path());
  const record = parseCalculationProofFile(bytes.toString('utf8'));
  expect(record).toMatchObject({
    module: 'geometry', operation: 'sphere', result: 'surface_area=36*pi; volume=36*pi',
    method: 'exact_sphere_measures', exactness: 'symbolic', units: { surface_area: 'cm^2', volume: 'cm^3' },
    error_bound: null, precision: null, variables: { radius: '3' },
  });
  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('pt-BR');
  await expect(panel.getByText(pt.geometry.proof.methods.exact_sphere_measures, { exact: true })).toBeVisible();
  await panel.getByTestId('proof-import-file').setInputFiles({
    name: 'geometry-proof.json', mimeType: 'application/json', buffer: bytes,
  });
  await expect(panel.getByText('exact_sphere_measures', { exact: true })).toBeVisible();
  await testInfo.attach('geometry-calculation-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ exactness: record?.exactness, result: record?.result, units: record?.units, variables: record?.variables }),
  });
});

test('Geometry localizes dimension inputs and diagrams across seven accessible locales', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 940 });
  await page.goto('/');
  await openWorkspace(page);
  await page.locator('details.settings summary').click();
  const languages = page.locator('details.settings select').first();
  const local: Readonly<Record<string, string>> = {
    'pt-BR': '0,5', ar: '٠٫٥', 'zh-CN': '０．５', hi: '०.५', es: '0,5', fr: '0,5', en: '0.5',
  };
  for (const [locale, messages] of Object.entries({ 'pt-BR': pt, ar, 'zh-CN': zh, hi, es, fr, en })) {
    await languages.selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const geo = messages.geometry;
    await expect(page.getByRole('heading', { name: geo.title, exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: geo.sketch.replace('{shape}', geo.operations.rectangle), exact: true })).toBeVisible();
    const width = page.getByRole('textbox', { name: geo.dimensions.width, exact: true });
    await width.fill(local[locale] ?? '0.5');
    await page.getByRole('textbox', { name: geo.dimensions.length, exact: true }).fill('2');
    await width.press('Control+Enter');
    await expect(result(page)).toHaveAttribute('data-canonical', /^area=1; perimeter=5; diagonal=/u);
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

test('Geometry loads one dedicated WASM on demand and calculates after offline reload', async ({ page, context }, testInfo) => {
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
  const exact = 'area=12; perimeter=14; diagonal=5';
  await expect(result(page)).toHaveAttribute('data-canonical', exact);
  await expect.poll(async () => (await cached()).some((path) => path.includes('geometry-worker-'))).toBe(true);
  await expect.poll(async () => (await cached()).filter((path) => path.endsWith('.wasm')).length).toBe(1);
  const prepared = await cached();
  expect(prepared.some((path) => /tool-(?:scientific|algebra|calculus|linear-algebra)-/u.test(path))).toBe(false);
  await page.getByText('Operations', { exact: true }).click();
  const offline = page.getByRole('checkbox', { name: 'Use cached assets only' });
  await offline.click();
  await expect(offline).toBeChecked();
  await context.setOffline(true);
  await page.reload();
  await openWorkspace(page);
  await useExample(page);
  await calculate(page);
  await expect(result(page)).toHaveAttribute('data-canonical', exact);
  await testInfo.attach('geometry-offline-proof', {
    contentType: 'application/json',
    body: JSON.stringify({ initialRequests: [], initialCache: [], prepared, offlineCanonical: exact, otherToolAssets: [] }),
  });
});

test.describe('Geometry worker isolation', () => {
  test.use({ serviceWorkers: 'block' });
  test('switching modules terminates unfinished work and retains the geometry draft', async ({ page, context }) => {
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
      await expect.poll(() => page.workers().some((worker) => worker.url().includes('geometry-worker'))).toBe(false);
      open();
      await openWorkspace(page);
      await expect(page.getByRole('textbox', { name: g.dimensions.width, exact: true })).toHaveValue('3');
      await calculate(page);
      await expect(result(page)).toHaveAttribute('data-canonical', 'area=12; perimeter=14; diagonal=5');
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
    } finally {
      open();
    }
  });
});
