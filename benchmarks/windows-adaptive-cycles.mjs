import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { arch, cpus, release, totalmem } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (process.platform !== 'win32') throw new Error('Run the Windows adaptive benchmark in an interactive Windows session.');
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const executable = resolve(root, args.find((argument) => !argument.startsWith('--')) ?? 'target/release/dars-desktop.exe');
const base = resolve(root, 'artifacts/objective-02');
const timings = quick
  ? { ambient: 2, stabilization: 2, workload: 2, idle: 3, minimized: 3, recovery: 2, closed: 2 }
  : { ambient: 25, stabilization: 20, workload: 28, idle: 18, minimized: 15, recovery: 14, closed: 20 };
const cycleProfiles = quick ? ['ultra_light', 'maximum'] : ['ultra_light', 'maximum', 'maximum', 'ultra_light'];
const samplingMs = quick ? 500 : 4000;
const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());
const sleep = (ms) => delay(ms, undefined, { signal: controller.signal });

await mkdir(base, { recursive: true });
const run = await mkdtemp(join(base, quick ? 'windows-adaptive-smoke-' : 'windows-adaptive-cycles-'));
const eventsPath = join(run, 'samples.jsonl');
const reportPath = join(run, 'benchmarks.json');
const bytes = await readFile(executable);
const initialHash = createHash('sha256').update(bytes).digest('hex');
const state = {
  schema: 1, status: 'in_progress', qualifying: false,
  startUtc: new Date().toISOString(),
  environment: { platform: process.platform, arch: arch(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, installedMemoryBytes: totalmem(), node: process.version },
  executable: { sha256: initialHash, bytes: bytes.length },
  timingsSeconds: timings, sampleEveryMs: samplingMs, cycleProfiles, phases: {}, starts: [],
};

function writeDurably(path, content, mode = 'w') {
  const fd = openSync(path, mode);
  try {
    writeSync(fd, content, null, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function log(event) {
  writeDurably(eventsPath, JSON.stringify(event) + '\n', 'a');
}

async function checkpoint(event) {
  log(event);
  const temporary = reportPath + '.tmp';
  writeDurably(temporary, JSON.stringify(state, null, 2) + '\n');
  await rename(temporary, reportPath);
  console.log(JSON.stringify(event));
}

const sampler = spawn('pwsh.exe', ['-NoProfile', '-NonInteractive', '-File', join(root, 'benchmarks/windows-process-sampler.ps1')], {
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'inherit'],
});
sampler.stdin.on('error', () => {});
let samplerError;
sampler.on('error', (error) => { samplerError = error; });
const lines = createInterface({ input: sampler.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
let requestId = 0;

async function receive(timeoutMs) {
  let timer;
  try {
    const response = await Promise.race([
      lines.next(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(samplerError ?? new Error('Win32 sampler reply timed out.')), timeoutMs); }),
    ]);
    if (response.done) throw samplerError ?? new Error('Win32 sampler exited.');
    return JSON.parse(response.value);
  } finally {
    clearTimeout(timer);
  }
}

async function request(action, pid, signal = controller.signal) {
  signal?.throwIfAborted();
  const id = ++requestId;
  sampler.stdin.write(JSON.stringify({ id, action, pid }) + '\n');
  const value = await receive(10000);
  assert.equal(value.id, id, 'Unexpected Win32 sampler reply');
  if (value.error) throw new Error(value.error);
  return value.result;
}

function quantiles(values) {
  if (!values.length) return null;
  const ordered = values.toSorted((a, b) => a - b);
  return { min: ordered[0], median: ordered[Math.floor(ordered.length / 2)], max: ordered.at(-1), first: values[0], last: values.at(-1) };
}

const memoryKeys = ['workingSetBytes', 'privateWorkingSetBytes', 'privateBytes', 'sharedWorkingSetBytes', 'sharedCommitBytes'];
function totals(sample, role) {
  const rows = sample.tree.filter((item) => !item.error && (role === 'tree' || item.host === (role === 'host')));
  return Object.fromEntries(memoryKeys.map((key) => [key, rows.reduce((sum, item) => sum +
    (key === 'sharedWorkingSetBytes' ? Math.max(0, item.workingSetBytes - item.privateWorkingSetBytes) : item[key]), 0)]));
}

function cpuTime(samples) {
  const read = (sample) => new Map(sample.tree.filter((row) => !row.error).map((row) => [row.pid + ':' + row.creation, row.cpu100ns]));
  let previous = read(samples[0]);
  let sum = 0;
  let observedStarts = 0;
  let observedExits = 0;
  for (const sample of samples.slice(1)) {
    const current = read(sample);
    for (const [pid, value] of current) {
      if (previous.has(pid)) sum += Math.max(0, value - previous.get(pid));
      else observedStarts++;
    }
    for (const pid of previous.keys()) if (!current.has(pid)) observedExits++;
    previous = current;
  }
  const first = samples[0];
  const last = samples.at(-1);
  const wallMs = last.timeMs - first.timeMs;
  const all = last.system.kernel100ns - first.system.kernel100ns + last.system.user100ns - first.system.user100ns;
  const idle = last.system.idle100ns - first.system.idle100ns;
  const oneCore = 100 * (sum / 10000) / wallMs;
  return {
    processCpuSecondsObserved: sum / 10000000,
    processOneLogicalCpuPercent: oneCore,
    processTotalMachinePercent: oneCore / state.environment.logicalCpus,
    systemPercent: 100 * (all - idle) / all,
    processStartsBetweenSamples: observedStarts, processExitsBetweenSamples: observedExits,
  };
}

async function phase(name, seconds, app, expectedWindow, workload) {
  const samples = [];
  const durationMs = seconds * 1000;
  log({ type: 'phase-start', name, expectedWindow, minimumSeconds: seconds });
  const exercise = workload?.(durationMs).then((value) => ({ value }), (error) => ({ error }));
  for (;;) {
    const reading = await request('sample', app?.handle.pid ?? 0);
    if (app && !reading.tree.some((row) => row.host && !row.error)) throw new Error('The desktop host disappeared during ' + name);
    const sample = { ...reading, workers: app?.page.workers().length ?? null };
    samples.push(sample);
    log({ type: 'sample', name, ...sample });
    const elapsed = sample.timeMs - samples[0].timeMs;
    if (elapsed >= durationMs) break;
    await sleep(Math.max(10, Math.min(samplingMs, durationMs - elapsed)));
  }
  const work = await exercise;
  if (work?.error) throw work.error;

  const phaseSummary = {
    durationSeconds: (samples.at(-1).timeMs - samples[0].timeMs) / 1000,
    expectedWindow,
    matchingWindowSamples: samples.filter((sample) => sample.window.state === expectedWindow).length,
    foregroundSamples: samples.filter((sample) => sample.window.foreground).length,
    samples: samples.length,
    errors: samples.reduce((count, sample) => count + sample.tree.filter((row) => row.error).length, 0),
    maxProcessCount: Math.max(...samples.map((sample) => sample.tree.length)),
    workers: quantiles(samples.map((sample) => sample.workers).filter(Number.isInteger)),
    memory: {},
    system: {},
    cpu: cpuTime(samples),
  };
  for (const role of ['tree', 'host', 'auxiliary']) {
    const values = samples.map((sample) => totals(sample, role));
    phaseSummary.memory[role] = Object.fromEntries(memoryKeys.map((key) => [key, quantiles(values.map((row) => row[key]))]));
  }
  for (const key of ['physicalInUseBytes', 'committedBytes']) {
    phaseSummary.system[key] = quantiles(samples.map((sample) => sample.system[key]));
  }
  if (work) phaseSummary.workload = work.value;
  state.phases[name] = phaseSummary;
  await checkpoint({ type: 'phase-end', name, seconds: phaseSummary.durationSeconds,
    samples: phaseSummary.samples, windowMatches: phaseSummary.matchingWindowSamples, errors: phaseSummary.errors,
    workersAtEnd: phaseSummary.workers?.last ?? null, operations: phaseSummary.workload?.completed ?? null });
  return phaseSummary;
}

let active;
function alive(handle) {
  return handle.exitCode === null && handle.signalCode === null;
}

async function closeApp() {
  if (!active) return;
  const { handle, browser } = active;
  active = undefined;
  if (handle.pid && alive(handle)) {
    try {
      // Native close is scoped to the test process. Cleanup must run even after cancellation.
      await request('close', handle.pid, null);
      for (let i = 0; i < 40 && alive(handle); i++) await delay(50);
    } catch {}
    if (alive(handle)) {
      handle.kill();
      for (let i = 0; i < 100 && alive(handle); i++) await delay(50);
      if (alive(handle)) throw new Error('The test process did not exit.');
    }
  }
  if (browser) await browser.close().catch(() => {});
}

async function startApp(profile, kind) {
  controller.signal.throwIfAborted();
  const portFile = join(profile, 'EBWebView', 'DevToolsActivePort');
  try { await unlink(portFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const started = performance.now();
  const handle = spawn(executable, [], {
    cwd: run,
    stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0 --lang=en-US' },
  });
  let launchError;
  handle.on('error', (error) => { launchError = error; });
  active = { handle };
  let port;
  while (performance.now() - started < 18000 && alive(handle) && !launchError) {
    try {
      const value = (await readFile(portFile, 'utf8')).split(/\r?\n/)[0];
      if (/^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) <= 65535) { port = value; break; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await sleep(35);
  }
  if (!port) throw launchError ?? new Error('Test-only WebView2 debugging port not available.');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 10000 });
  active.browser = browser;
  const [context] = browser.contexts();
  assert(context, 'A real WebView2 context is required.');
  const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 10000 });
  await page.waitForURL((url) => url.hostname === 'tauri.localhost' || url.protocol === 'tauri:', { timeout: 10000 });
  const app = {
    handle, page,
    input: page.getByRole('textbox', { name: 'Expression', exact: true }),
    calculate: page.getByRole('button', { name: 'Calculate', exact: true }),
    result: page.getByTestId('result'),
    operations: page.locator('details.operations'),
    cdp: undefined,
    workerEvents: [],
  };
  const rememberWorker = (worker, event) => {
    app.workerEvents.push({ event, at: performance.now() });
    worker.once('close', () => app.workerEvents.push({ event: 'closed', at: performance.now() }));
  };
  for (const worker of page.workers()) rememberWorker(worker, 'already-active');
  page.on('worker', (worker) => rememberWorker(worker, 'created'));
  await checkCalculation(app, '0.1+0.2', '0.3');
  const startup = { kind, launchToFirstResultMs: Math.round(performance.now() - started), webViewVersion: browser.version() };
  state.starts.push(startup);
  await checkpoint({ type: 'startup', ...startup });
  app.cdp = await context.newCDPSession(page).catch(() => undefined);
  return app;
}

async function checkCalculation(app, expression, expected) {
  await app.input.fill(expression, { timeout: 8000 });
  await app.calculate.click({ timeout: 8000 });
  await expect(app.result).toHaveText(expected, { timeout: 8000 });
}

async function setDetails(details, open) {
  if (await details.evaluate((element) => element.open) === open) return;
  const summary = details.locator('summary').first();
  await summary.click({ timeout: 8000 });
  await expect.poll(() => details.evaluate((element) => element.open), { timeout: 5000 }).toBe(open);
}

async function selectProfile(app, profile) {
  await setDetails(app.operations, true);
  const select = app.page.getByRole('combobox', { name: 'Performance profile', exact: true });
  await select.selectOption(profile);
  await expect(select).toHaveValue(profile);
  await setDetails(app.operations, false);
}

async function runtimeSnapshot(app) {
  const dom = await app.page.locator('main[data-module-phase]').evaluate((element) => ({
    visibility: document.visibilityState,
    phase: element.getAttribute('data-module-phase'),
    profile: element.getAttribute('data-profile'),
    reportedWorkers: Number(element.getAttribute('data-workers')),
  }), undefined, { timeout: 5000 });
  return { ...dom, workers: app.page.workers().length };
}

async function snapshot(app, inspectModule = false) {
  const heap = await app.cdp?.send('Runtime.getHeapUsage').catch(() => undefined);
  const result = {
    ...await runtimeSnapshot(app),
    rendererJavaScriptHeap: heap ? {
      usedBytes: heap.usedSize, totalBytes: heap.totalSize,
      embedderUsedBytes: heap.embedderHeapUsedSize, backingStorageBytes: heap.backingStorageSize,
    } : null,
  };
  if (!inspectModule) return result;

  await setDetails(app.operations, true);
  const diagnostics = app.operations.locator('details.local-diagnostics');
  await setDetails(diagnostics, true);
  const workerCount = diagnostics.getByTestId('active-workers');
  await expect.poll(async () => {
    const reported = Number(await workerCount.textContent());
    return reported === app.page.workers().length;
  }, { timeout: 5000 }).toBe(true);
  const raw = await diagnostics.getByTestId('wasm-memory').getAttribute('data-bytes');
  result.application = {
    workers: Number(await workerCount.textContent()),
    effectiveProfile: await diagnostics.getByTestId('effective-profile').textContent(),
    wasmLinearMemoryBytes: raw !== null && /^\d+$/.test(raw) ? Number(raw) : null,
  };
  await setDetails(diagnostics, false);
  await setDetails(app.operations, false);
  return result;
}

async function workload(app, durationMs) {
  const start = performance.now();
  const format = new Intl.NumberFormat('en-US');
  const latencies = [];
  let lastResultAt;
  while (performance.now() - start < durationMs) {
    const iteration = latencies.length + 1;
    const before = performance.now();
    if (iteration % 4 === 0) {
      await checkCalculation(app, 'sqrt(2)%', '0.0141421356237309504880169');
    } else {
      await checkCalculation(app, '3*(' + iteration + '+7)-2', format.format(3 * (iteration + 7) - 2));
    }
    lastResultAt = performance.now();
    latencies.push(lastResultAt - before);
    await sleep(130);
  }
  return {
    completed: latencies.length, durationSeconds: (performance.now() - start) / 1000,
    endToEndLatencyMs: quantiles(latencies), lastResultAt,
  };
}

function compareCycles(cycles) {
  const result = {};
  for (const profile of new Set(cycleProfiles)) {
    const matching = cycles.filter((cycle) => cycle.profile === profile);
    const byPhase = {};
    for (const phase of ['workload', 'idle', 'minimized', 'recovery']) {
      const rows = matching.map((cycle) => state.phases[cycle.name + '-' + phase]);
      byPhase[phase] = {
        workersAtEnd: rows.map((row) => row.workers.last),
        privateResidentBytes: quantiles(rows.map((row) => row.memory.tree.privateWorkingSetBytes.median)),
        privateCommitBytes: quantiles(rows.map((row) => row.memory.tree.privateBytes.median)),
        jsRendererHeapUsedBytes: quantiles(matching.map((cycle) => cycle.after[phase]?.rendererJavaScriptHeap?.usedBytes).filter(Number.isFinite)),
        wasmLinearMemoryBytes: quantiles(matching.map((cycle) => cycle.after[phase]?.application?.wasmLinearMemoryBytes).filter(Number.isFinite)),
      };
    }
    result[profile] = byPhase;
  }
  return result;
}

try {
  assert((await receive(20000)).ready, 'Win32 sampler handshake missing.');
  await checkpoint({ type: 'begin', run: basename(run), sha256: initialHash });
  await phase('ambient', timings.ambient, null, 'missing');
  const profile = await mkdtemp(join(run, 'webview-'));
  const app = await startApp(profile, 'fresh-profile');
  await app.input.fill('100');
  await app.page.getByRole('button', { name: 'Store in memory', exact: true }).click();
  await expect(app.page.getByRole('button', { name: 'Recall memory', exact: true })).toBeEnabled();
  await phase('stabilization', timings.stabilization, app, 'visible');
  state.cycles = [];

  for (const [index, selection] of cycleProfiles.entries()) {
    const name = 'cycle-' + (index + 1);
    await selectProfile(app, selection);
    const cycle = { name, profile: selection, start: await snapshot(app), after: {} };
    const load = await phase(name + '-workload', timings.workload, app, 'visible', (duration) => workload(app, duration));
    assert(load.workload.completed > 0, 'A cycle must exercise calculation.');
    cycle.after.workload = await snapshot(app, true);
    await phase(name + '-idle', timings.idle, app, 'visible');
    cycle.after.idle = await snapshot(app, true);
    const idleClose = app.workerEvents.find((event) => event.event === 'closed' &&
      event.at >= load.workload.lastResultAt);
    cycle.workerClosedAfterVisibleActivityMs = idleClose ? idleClose.at - load.workload.lastResultAt : null;

    const beforeMinimizing = app.page.workers().length;
    await request('minimize', app.handle.pid);
    await phase(name + '-minimized', timings.minimized, app, 'minimized');
    cycle.after.minimized = { ...await runtimeSnapshot(app), beforeMinimizing };
    await request('restore', app.handle.pid);

    const recoveryStarted = performance.now();
    await app.input.fill('');
    await app.page.getByRole('button', { name: 'Recall memory', exact: true }).click();
    await app.calculate.click({ timeout: 8000 });
    await expect(app.result).toHaveText('100', { timeout: 8000 });
    cycle.resumeToExactRecallMs = performance.now() - recoveryStarted;
    await phase(name + '-recovery', timings.recovery, app, 'visible');
    cycle.after.recovery = await snapshot(app);
    state.cycles.push(cycle);
    await checkpoint({ type: 'cycle-end', name, selection, resumeToExactRecallMs: cycle.resumeToExactRecallMs,
      workerClosedAfterVisibleActivityMs: cycle.workerClosedAfterVisibleActivityMs, after: cycle.after });
  }

  if (!quick) await selectProfile(app, 'auto');
  await closeApp();
  await phase('closed', timings.closed, null, 'missing');
  state.residualTreeAfterClose = (await request('sample', app.handle.pid)).tree.length;
  if (!quick) {
    for (const kind of ['reused-profile', 'fresh-profile', 'reused-profile', 'fresh-profile']) {
      const nextProfile = kind === 'reused-profile' ? profile : await mkdtemp(join(run, 'fresh-webview-'));
      await startApp(nextProfile, kind);
      await closeApp();
      await sleep(1000);
    }
  }
  state.endUtc = new Date().toISOString();
  state.finalExecutableSha256 = createHash('sha256').update(await readFile(executable)).digest('hex');
  state.comparisons = compareCycles(state.cycles);
  state.systemVsAmbient = Object.fromEntries(Object.entries(state.phases)
    .filter(([name]) => name !== 'ambient')
    .map(([name, reading]) => [name, {
      physicalInUseBytes: reading.system.physicalInUseBytes.median - state.phases.ambient.system.physicalInUseBytes.median,
      committedBytes: reading.system.committedBytes.median - state.phases.ambient.system.committedBytes.median,
    }]));
  state.qualificationIssues = [];
  if (state.finalExecutableSha256 !== initialHash) state.qualificationIssues.push('Executable changed during the run.');
  if (state.residualTreeAfterClose !== 0) state.qualificationIssues.push('Descendants remained after closing.');
  for (const [name, item] of Object.entries(state.phases)) {
    if (item.errors || item.matchingWindowSamples !== item.samples) state.qualificationIssues.push('Incomplete native observations during ' + name);
  }
  for (const cycle of state.cycles) {
    const expectedIdleWorkers = cycle.profile === 'ultra_light' ? 0 : 1;
    if (cycle.after.idle.workers !== expectedIdleWorkers) {
      state.qualificationIssues.push('Unexpected worker budget at the end of ' + cycle.name + ' idle.');
    }
    if (!Number.isInteger(cycle.after.workload.application.wasmLinearMemoryBytes) ||
        cycle.after.workload.application.wasmLinearMemoryBytes <= 0) {
      state.qualificationIssues.push('WASM linear memory was unavailable after ' + cycle.name + ' workload.');
    }
    if (cycle.after.minimized.workers !== 0 || cycle.after.minimized.reportedWorkers !== 0) {
      state.qualificationIssues.push('A worker remained during ' + cycle.name + ' minimization.');
    }
    if (cycle.after.minimized.phase !== 'suspended' || cycle.after.minimized.profile !== 'ultra_light') {
      state.qualificationIssues.push('The native minimized window did not suspend the application during ' + cycle.name);
    }
    if (cycle.after.recovery.visibility !== 'visible') state.qualificationIssues.push('Page failed to recover visibility after ' + cycle.name);
  }
  state.status = state.qualificationIssues.length ? 'completed_with_limitations' : 'complete';
  state.qualifying = !quick && !state.qualificationIssues.length;
  await checkpoint({ type: 'end', run: basename(run), status: state.status, qualifying: state.qualifying, issues: state.qualificationIssues });
} catch (error) {
  state.status = 'interrupted';
  state.qualifying = false;
  await checkpoint({ type: 'interrupted', run: basename(run), message: error.message });
  throw error;
} finally {
  try { await closeApp(); } finally { sampler.stdin.end(); }
}
