import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cpus, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export async function runWindowsToolBenchmark(suite, argument = process.argv[2]) {
  assert.equal(process.platform, 'win32', 'An interactive Windows session is required.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
  const { chromium, expect } = require('@playwright/test');
  const executable = resolve(root, argument ?? 'target/release/dars-desktop.exe');
  const base = join(root, 'artifacts', 'objective-03', suite.module);
  await mkdir(base, { recursive: true });
  const run = await mkdtemp(join(base, 'windows-'));
  const sampler = spawn('pwsh.exe', [
    '-NoProfile', '-NonInteractive', '-File', join(root, 'benchmarks/windows-process-sampler.ps1'),
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
  sampler.stdin.on('error', () => {});
  const lines = createInterface({ input: sampler.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  let nextId = 0;
  let app;
  let browser;
  let page;
  const hashes = (data) => createHash('sha256').update(data).digest('hex');
  const data = {
    status: 'in_progress',
    method: 'Interactive Windows WebView2. Fresh profile, ordered checked calculations, Win32 sampling of host and auxiliary processes.',
    executableSha256: hashes(await readFile(executable)),
    environment: { release: release(), processor: cpus()[0]?.model, logicalProcessors: cpus().length, physicalBytes: totalmem() },
    phases: {},
    interactions: [],
  };

  async function receive() {
    let timer;
    try {
      const result = await Promise.race([
        lines.next(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Win32 sampler timeout')), 15000); }),
      ]);
      assert(!result.done, 'Win32 sampler closed.');
      return JSON.parse(result.value);
    } finally {
      clearTimeout(timer);
    }
  }

  async function native(action, pid = app?.pid ?? 0) {
    const id = ++nextId;
    sampler.stdin.write(JSON.stringify({ id, action, pid }) + '\n');
    const reply = await receive();
    assert.equal(reply.id, id);
    assert(!reply.error, reply.error);
    return reply.result;
  }

  function quantiles(values) {
    const ordered = values.toSorted((a, b) => a - b);
    const q = (p) => ordered[Math.ceil(ordered.length * p) - 1];
    return { count: ordered.length, p50: q(.5), p95: q(.95), p99: q(.99) };
  }

  function totals(sample, predicate) {
    const rows = sample.tree.filter(predicate);
    return Object.fromEntries(['workingSetBytes', 'privateWorkingSetBytes', 'privateBytes', 'sharedCommitBytes']
      .map((key) => [key, rows.reduce((n, row) => n + row[key], 0)]));
  }

  async function checkpoint() {
    await writeFile(join(run, 'windows.json'), JSON.stringify(data, null, 2) + '\n', { flush: true });
  }

  async function samplePhase(name, state, pid, count = 6) {
    const rows = [];
    for (let index = 0; index < count; index++) {
      const row = await native('sample', pid);
      assert.equal(row.window.state, state, name);
      assert(row.tree.every((process) => !process.error), name);
      rows.push(row);
      if (index + 1 < count) await delay(1000);
    }
    const first = rows[0];
    const last = rows.at(-1);
    const before = new Map(first.tree.map((node) => [node.pid + ':' + node.creation, node.cpu100ns]));
    const cpuTicks = last.tree.reduce((sum, node) => {
      const initial = before.get(node.pid + ':' + node.creation);
      return sum + (initial === undefined ? 0 : Math.max(0, node.cpu100ns - initial));
    }, 0);
    const processMemory = Object.fromEntries([
      ['tree', () => true], ['host', (row) => row.host], ['auxiliary', (row) => !row.host],
    ].map(([kind, predicate]) => {
      const measurements = rows.map((row) => totals(row, predicate));
      return [kind, Object.fromEntries(Object.keys(measurements[0]).map((key) =>
        [key, quantiles(measurements.map((row) => row[key]))]))];
    }));
    data.phases[name] = {
      state, count, intervalSeconds: (last.timeMs - first.timeMs) / 1000, processMemory,
      cpuOneLogicalPercent: 100 * cpuTicks / 10000 / (last.timeMs - first.timeMs),
      systemPhysicalBytes: quantiles(rows.map((row) => row.system.physicalInUseBytes)),
      systemCommitBytes: quantiles(rows.map((row) => row.system.committedBytes)),
      workersAtEnd: pid ? page.workers().length : 0,
      processesAtEnd: last.tree.length,
    };
    await checkpoint();
  }

  async function calculate({ expression, expected, operation, field = 'Expression' }, testId) {
    if (operation) await page.getByRole('button', { name: operation, exact: true }).click();
    const started = performance.now();
    if (testId !== 'result' && suite.enter) await suite.enter(page, expression, operation);
    else await page.getByRole('textbox', { name: field, exact: true }).fill(expression);
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    const result = expect(page.getByTestId(testId));
    if (testId !== 'result') await result.toHaveAttribute('data-canonical', expected);
    else await result.toHaveText(expected);
    return performance.now() - started;
  }

  try {
    assert((await receive()).ready);
    await samplePhase('ambient', 'missing', 0);
    const profile = await mkdtemp(join(run, 'profile-'));
    const started = performance.now();
    app = spawn(executable, [], {
      stdio: 'ignore',
      env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0 --lang=en-US' },
    });
    let port;
    while (performance.now() - started < 15000 && app.exitCode === null && !port) {
      try { [port] = (await readFile(join(profile, 'EBWebView', 'DevToolsActivePort'), 'utf8')).split(/\s+/u); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!port) await delay(35);
    }
    assert(/^\d{1,5}$/u.test(port ?? ''), 'WebView2 debugging port absent.');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const [context] = browser.contexts();
    page = context.pages()[0] ?? await context.waitForEvent('page');
    data.webview = browser.version();
    await calculate({ expression: '0.1+0.2', expected: '0.3' }, 'result');
    data.startupToCheckedStandardMs = performance.now() - started;
    await samplePhase('standard_visible', 'visible', app.pid);

    let workersOpened = 0;
    let workersClosed = 0;
    page.on('worker', (worker) => {
      workersOpened++;
      worker.once('close', () => { workersClosed++; });
    });
    const chooser = page.getByRole('combobox', { name: 'Module', exact: true });
    const selectStarted = performance.now();
    await chooser.selectOption(suite.module);
    await expect(page.getByRole('region', { name: suite.title, exact: true })).toBeVisible();
    const resultId = `${suite.module}-result`;
    data[suite.selectionKey] = performance.now() - selectStarted;
    for (const example of suite.examples) {
      data.interactions.push({ expression: example.expression, milliseconds: await calculate(example, resultId) });
    }
    const toolLoad = (async () => {
      const samples = [];
      const until = performance.now() + 5400;
      for (let index = 0; index < 50 && performance.now() < until; index++) {
        const example = suite.workload[index % suite.workload.length];
        samples.push(await calculate(example, resultId));
        await delay(60);
      }
      return quantiles(samples);
    })();
    [data.sustainedInteractionMilliseconds] = await Promise.all([
      toolLoad, samplePhase(`${suite.module}_load`, 'visible', app.pid),
    ]);
    await calculate(suite.resume, resultId);
    await expect.poll(() => page.workers().length).toBe(0);
    await page.screenshot({ path: join(run, `${suite.module}-windows.png`) });
    await samplePhase(`${suite.module}_idle`, 'visible', app.pid);
    assert.equal((await native('minimize')).state, 'minimized');
    await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'suspended');
    await samplePhase(`${suite.module}_minimized`, 'minimized', app.pid);
    assert.equal((await native('restore')).state, 'visible');
    await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
    if (suite.verifyRetained) await suite.verifyRetained(page, suite.resume.expression, expect, suite.resume.operation);
    else await expect(page.getByRole('textbox', { name: suite.resume.field ?? 'Expression', exact: true })).toHaveValue(suite.resume.expression);
    await expect(page.getByTestId(resultId)).toHaveAttribute('data-canonical', suite.resume.expected);
    data.interactions.push({ expression: suite.recovery.expression, milliseconds: await calculate(suite.recovery, resultId) });
    await samplePhase(`${suite.module}_restored`, 'visible', app.pid);
    await expect.poll(() => page.workers().length).toBe(0);
    await expect.poll(() => workersOpened - workersClosed).toBe(0);
    data[suite.workersKey] = { opened: workersOpened, closed: workersClosed };
    await chooser.selectOption('standard');
    await expect(page.getByTestId('result')).toHaveText('0.3');
    assert.equal(hashes(await readFile(executable)), data.executableSha256);
    await native('close');
    await expect.poll(() => app.exitCode === null, { timeout: 5000 }).toBe(false);
    const exitObserved = performance.now();
    await expect.poll(async () => (await native('sample', app.pid)).tree.length, { timeout: 5000 }).toBe(0);
    data.descendantsClearedAfterExitMs = performance.now() - exitObserved;
    await samplePhase('after_close', 'missing', app.pid);
    assert.equal(data.phases.after_close.processesAtEnd, 0);
    data.status = 'complete';
    await checkpoint();
    console.log(JSON.stringify({ status: data.status, phases: Object.keys(data.phases), interactions: data.interactions.length }));
  } finally {
    if (app?.exitCode === null) {
      try { await native('close'); } catch { /* The owned test process is closed below. */ }
      if (app.exitCode === null) app.kill();
    }
    sampler.stdin.end();
    await browser?.close().catch(() => {});
  }
}
