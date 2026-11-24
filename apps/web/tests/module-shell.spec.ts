import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { trace } from './fixtures/module-shell/control';

const fixturePrefix = '/__dars-module-shell/';
const contentTypes: Record<string, string> = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  wasm: 'application/wasm',
};

async function openFixture(page: Page) {
  const result = await build({
    root: fileURLToPath(new URL('../', import.meta.url)),
    configFile: false,
    base: './',
    publicDir: false,
    plugins: [react()],
    logLevel: 'error',
    build: {
      write: false, reportCompressedSize: false,
      rollupOptions: { input: fileURLToPath(new URL('./fixtures/module-shell/index.html', import.meta.url)) },
    },
  });
  const output = new Map<string, { contentType: string; body: Buffer }>();
  for (const bundle of Array.isArray(result) ? result : [result]) {
    if (!('output' in bundle)) throw new Error('Expected an in-memory Vite fixture build.');
    for (const file of bundle.output) {
      const source = file.type === 'chunk' ? file.code : file.source;
      output.set(file.fileName, {
        contentType: contentTypes[file.fileName.split('.').at(-1) ?? ''] ?? 'application/octet-stream',
        body: typeof source === 'string' ? Buffer.from(source, 'utf8') : Buffer.from(source),
      });
    }
  }
  const index = [...output.keys()].find((name) => name.endsWith('/index.html'));
  if (!index) throw new Error('Fixture HTML was not emitted.');
  await page.context().route('**' + fixturePrefix + '**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = output.get(path.slice(fixturePrefix.length));
    return file ? route.fulfill(file) : route.fulfill({ status: 404 });
  });
  await page.goto(fixturePrefix + index);
}

const main = (page: Page) => page.getByRole('main');
const picker = (page: Page) => page.getByRole('combobox', { name: 'Module', exact: true });
const note = (page: Page) => page.getByRole('textbox', { name: 'Fixture note', exact: true });
const points = (page: Page) => page.locator('output[aria-label="Chart points"]');
const action = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const observe = (page: Page) => page.evaluate(() => {
  const data: typeof trace = Reflect.get(window, 'darsModuleShellTest');
  return {
    imported: data.imported,
    started: data.chartWorkersStarted,
    stopped: data.chartWorkersStopped,
    disposals: data.chartDisposals,
    cacheBudget: data.chartCacheBudget,
    waiting: data.finishChart !== undefined,
  };
});

test('the real app shell selects heterogeneous modules and globally clears both active and suspended state', async ({ page }, testInfo) => {
  await openFixture(page);
  await expect(note(page)).toBeVisible();
  await expect(page).toHaveTitle('DARS · Note fixture');
  await expect(main(page)).toHaveAttribute('data-module-id', 'note-fixture');
  expect((await observe(page)).imported).toEqual(['note']);
  await note(page).fill('A draft specific to the note module');

  await picker(page).selectOption('chart-fixture');
  await expect(page.getByRole('heading', { name: 'Chart fixture', exact: true })).toBeVisible();
  await expect(main(page)).toHaveAttribute('data-module-phase', 'active');
  await expect(main(page)).toHaveAttribute('data-workers', '1');
  await expect(note(page)).toHaveCount(0);
  await action(page, 'Add chart point').click();
  await action(page, 'Add chart point').click();
  await expect(points(page)).toHaveText('2');
  await page.getByText('Operations', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption('efficiency');
  await expect.poll(async () => (await observe(page)).cacheBudget).toBe(4);
  await page.getByText('Local diagnostics', { exact: true }).click();
  await expect(page.getByTestId('module-phase')).toHaveText('Chart fixture · Active');
  expect(await observe(page)).toMatchObject({ imported: ['note', 'chart'], started: 1, stopped: 0 });

  await action(page, 'Suspend module').click();
  await expect(main(page)).toHaveAttribute('data-module-phase', 'suspended');
  await expect(main(page)).toHaveAttribute('data-workers', '0');
  await expect(points(page)).toHaveCount(0);
  await action(page, 'Resume module').click();
  await expect(points(page)).toHaveText('2');
  expect(await observe(page)).toMatchObject({ started: 2, stopped: 1 });

  await picker(page).selectOption('note-fixture');
  await expect(note(page)).toHaveValue('A draft specific to the note module');
  await expect(main(page)).toHaveAttribute('data-workers', '0');
  await action(page, 'Clear calculations and session').click();
  await expect(note(page)).toHaveValue('');
  await picker(page).selectOption('chart-fixture');
  await expect(points(page)).toHaveText('0');
  await action(page, 'Add chart point').click();
  await expect(points(page)).toHaveText('1');
  await action(page, 'End module').click();
  await expect(main(page)).toHaveAttribute('data-module-phase', 'terminated');
  await expect(main(page)).toHaveAttribute('data-workers', '0');
  await action(page, 'Resume module').click();
  await expect(points(page)).toHaveText('0');
  await testInfo.attach('generic-module-shell-proof', { body: JSON.stringify(await observe(page)), contentType: 'application/json' });
});

test('the same app shell isolates a hung module, retries and disposes a late runtime', async ({ page }, testInfo) => {
  await openFixture(page);
  await note(page).fill('Retained independently of chart failure');
  await page.evaluate(() => { Reflect.get(window, 'darsModuleShellTest').hangNextChart = true; });
  await picker(page).selectOption('chart-fixture');
  await expect(main(page)).toHaveAttribute('data-module-phase', 'recoverable_failure');
  await expect(main(page)).toHaveAttribute('data-workers', '0');
  expect(await observe(page)).toMatchObject({ started: 1, stopped: 1, disposals: 0, waiting: true });
  await action(page, 'Retry module').click();
  await expect(points(page)).toHaveText('0');
  await expect(main(page)).toHaveAttribute('data-workers', '1');
  await page.evaluate(() => Reflect.get(window, 'darsModuleShellTest').finishChart());
  await expect.poll(async () => (await observe(page)).disposals).toBe(1);
  await expect(main(page)).toHaveAttribute('data-module-phase', 'active');
  await expect(main(page)).toHaveAttribute('data-workers', '1');
  expect(await observe(page)).toMatchObject({ started: 2, stopped: 1, waiting: false });
  await action(page, 'Interrupt chart fixture').click();
  await expect(main(page)).toHaveAttribute('data-module-phase', 'recoverable_failure');
  await expect(main(page)).toHaveAttribute('data-workers', '0');
  await picker(page).selectOption('note-fixture');
  await expect(note(page)).toHaveValue('Retained independently of chart failure');
  await testInfo.attach('module-shell-recovery-proof', { body: JSON.stringify(await observe(page)), contentType: 'application/json' });
});
