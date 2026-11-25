import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { ChartJob, trace } from './fixtures/module-shell/control';

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

const scheduler = (page: Page) => page.evaluate(() => {
  const data: typeof trace = Reflect.get(window, 'darsModuleShellTest');
  return {
    generation: data.schedulerGeneration,
    snapshot: data.scheduler?.getSnapshot(),
    workers: data.schedulerWorkers,
    events: data.schedulerEvents,
    results: data.schedulerResults,
  };
});

async function submit(page: Page, ...jobs: ChartJob[]) {
  await page.evaluate((requests) => {
    const data: typeof trace = Reflect.get(window, 'darsModuleShellTest');
    if (!data.scheduler) throw new Error('Chart scheduler is not active.');
    for (const request of requests) data.scheduler.submit(request);
  }, jobs);
}

function hanging(id: string, kind: ChartJob['kind'], timeoutMs: number): ChartJob {
  return { id, kind, timeoutMs, behavior: 'hang', value: 0 };
}

function completed(id: string, kind: ChartJob['kind'], value: number): ChartJob {
  return { id, kind, timeoutMs: 10_000, behavior: 'complete', value };
}

async function waitForHeartbeat(page: Page, id: string) {
  await expect.poll(async () => {
    const worker = (await scheduler(page)).workers.find((entry) => entry.id === id);
    return worker?.started && !worker.terminated ? worker.heartbeat : 0;
  }, { message: `Real Worker ${id} acknowledged starting and stayed active until recovery` }).toBeGreaterThan(0);
}

async function chooseProfile(page: Page, profile: string, concurrency: number) {
  await page.getByRole('combobox', { name: 'Performance profile', exact: true }).selectOption(profile);
  await expect(main(page)).toHaveAttribute('data-profile', profile);
  await expect.poll(async () => (await scheduler(page)).snapshot?.concurrency).toBe(concurrency);
}

function checkWorkerBalance(events: Awaited<ReturnType<typeof scheduler>>['events'], maximum: number) {
  const active = new Set<string>();
  let peak = 0;
  for (const { id, event } of events) {
    if (event === 'created') {
      expect(active.has(id), `Worker ${id} must only be admitted once`).toBe(false);
      active.add(id);
      peak = Math.max(peak, active.size);
    } else {
      expect(active.delete(id), `Native Worker ${id} must be terminated once`).toBe(true);
    }
  }
  expect(active.size).toBe(0);
  expect(peak).toBe(maximum);
}

test('real Workers time out, release foreground capacity, and return valid successors in every adaptive profile', async ({ page }, testInfo) => {
  await openFixture(page);
  await note(page).fill('Session retained across scheduler recovery');
  await picker(page).selectOption('chart-fixture');
  await expect(main(page)).toHaveAttribute('data-module-phase', 'active');
  await page.getByText('Operations', { exact: true }).click();

  const profiles = [
    ['ultra_light', 0], ['efficiency', 1], ['balanced', 2], ['performance', 3], ['maximum', 4],
  ] as const;
  for (const [profile, concurrency] of profiles) {
    await chooseProfile(page, profile, concurrency);
    const blocked = `${profile}-hang`;
    const successor = `${profile}-valid`;
    await submit(page, hanging(blocked, 'essential', 1500));
    await waitForHeartbeat(page, blocked);
    await submit(page, completed(successor, 'essential', 42 + concurrency));
    await expect.poll(async () => (await scheduler(page)).results[successor]).toEqual({
      status: 'completed', value: 42 + concurrency,
    });
    const current = await scheduler(page);
    expect(current.results[blocked]).toEqual({ status: 'timed_out' });
    expect(current.events.slice(-4)).toEqual([
      { id: blocked, event: 'created' }, { id: blocked, event: 'terminated' },
      { id: successor, event: 'created' }, { id: successor, event: 'terminated' },
    ]);
    expect(current.snapshot).toEqual({ active: 0, queued: 0, concurrency, closed: false });
    expect(current.generation).toBe(1);
  }
  await expect(main(page)).toHaveAttribute('data-module-phase', 'active');
  const evidence = await scheduler(page);
  expect(evidence.workers).toHaveLength(profiles.length * 2);
  checkWorkerBalance(evidence.events, 1);
  await picker(page).selectOption('note-fixture');
  await expect(note(page)).toHaveValue('Session retained across scheduler recovery');
  await testInfo.attach('scheduler-timeout-profiles', { body: JSON.stringify(evidence), contentType: 'application/json' });
});

test('real scheduler Workers recover from secondary hangs and release in-flight jobs on cancel, suspend, and switch', async ({ page }, testInfo) => {
  await openFixture(page);
  await note(page).fill('The app was never restarted');
  await picker(page).selectOption('chart-fixture');
  await expect(main(page)).toHaveAttribute('data-module-phase', 'active');
  await action(page, 'Add chart point').click();
  await page.getByText('Operations', { exact: true }).click();
  await chooseProfile(page, 'efficiency', 1);

  await submit(page, hanging('secondary-hang', 'secondary', 2000));
  await waitForHeartbeat(page, 'secondary-hang');
  await submit(page, completed('secondary-valid', 'secondary', 23), completed('independent-essential', 'essential', 24));
  await expect.poll(async () => (await scheduler(page)).results['secondary-valid']).toEqual({ status: 'completed', value: 23 });
  const afterBackground = await scheduler(page);
  expect(afterBackground.results).toMatchObject({
    'secondary-hang': { status: 'timed_out' },
    'independent-essential': { status: 'completed', value: 24 },
  });
  const backgroundTerminated = afterBackground.events.findIndex(({ id, event }) => id === 'secondary-hang' && event === 'terminated');
  const independentCompleted = afterBackground.events.findIndex(({ id, event }) => id === 'independent-essential' && event === 'terminated');
  const successorCreated = afterBackground.events.findIndex(({ id, event }) => id === 'secondary-valid' && event === 'created');
  expect(independentCompleted).toBeGreaterThan(0);
  expect(independentCompleted).toBeLessThan(backgroundTerminated);
  expect(backgroundTerminated).toBeLessThan(successorCreated);

  await submit(page, hanging('explicit-abort', 'essential', 10_000));
  await waitForHeartbeat(page, 'explicit-abort');
  await submit(page, completed('after-abort', 'essential', 25));
  await page.evaluate(() => {
    const data: typeof trace = Reflect.get(window, 'darsModuleShellTest');
    data.scheduler?.cancel('explicit-abort');
  });
  await expect.poll(async () => (await scheduler(page)).results['after-abort']).toEqual({ status: 'completed', value: 25 });
  expect((await scheduler(page)).results['explicit-abort']).toEqual({ status: 'cancelled' });
  expect((await scheduler(page)).events.slice(-4)).toEqual([
    { id: 'explicit-abort', event: 'created' }, { id: 'explicit-abort', event: 'terminated' },
    { id: 'after-abort', event: 'created' }, { id: 'after-abort', event: 'terminated' },
  ]);

  await submit(page, hanging('while-suspending', 'essential', 10_000));
  await waitForHeartbeat(page, 'while-suspending');
  await submit(page, completed('queued-while-suspending', 'essential', 26));
  await action(page, 'Suspend module').click();
  await expect(main(page)).toHaveAttribute('data-module-phase', 'suspended');
  await expect(main(page)).toHaveAttribute('data-workers', '0');
  await expect.poll(async () => (await scheduler(page)).results['while-suspending']).toEqual({ status: 'cancelled' });
  const suspended = await scheduler(page);
  expect(suspended.results['queued-while-suspending']).toEqual({ status: 'cancelled' });
  expect(suspended.workers.some(({ id }) => id === 'queued-while-suspending')).toBe(false);
  expect(suspended.snapshot).toMatchObject({ active: 0, queued: 0, closed: true });
  await action(page, 'Resume module').click();
  await expect(points(page)).toHaveText('1');
  await submit(page, completed('after-resume', 'essential', 27));
  await expect.poll(async () => (await scheduler(page)).results['after-resume']).toEqual({ status: 'completed', value: 27 });
  expect((await scheduler(page)).generation).toBe(2);

  await submit(page, hanging('while-switching', 'essential', 10_000));
  await waitForHeartbeat(page, 'while-switching');
  await picker(page).selectOption('note-fixture');
  await expect(note(page)).toHaveValue('The app was never restarted');
  await expect.poll(async () => (await scheduler(page)).results['while-switching']).toEqual({ status: 'cancelled' });
  expect((await scheduler(page)).snapshot).toMatchObject({ active: 0, queued: 0, closed: true });
  await picker(page).selectOption('chart-fixture');
  await expect(points(page)).toHaveText('1');
  await submit(page, completed('after-switch', 'essential', 28));
  await expect.poll(async () => (await scheduler(page)).results['after-switch']).toEqual({ status: 'completed', value: 28 });
  const evidence = await scheduler(page);
  expect(evidence.generation).toBe(3);
  expect(evidence.snapshot).toMatchObject({ active: 0, queued: 0, closed: false });
  expect(evidence.workers.every(({ terminated }) => terminated)).toBe(true);
  checkWorkerBalance(evidence.events, 2);
  await testInfo.attach('scheduler-cancel-suspend-switch', { body: JSON.stringify(evidence), contentType: 'application/json' });
});
