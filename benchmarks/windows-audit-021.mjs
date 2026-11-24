import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { cpus, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const smoke = process.argv.includes('--quick');
const diagnosticOnly = process.argv.includes('--diagnostic-only');
assert(!(smoke && diagnosticOnly), 'Choose either --quick or --diagnostic-only.');
const args = process.argv.slice(2).filter((value) => value !== '--quick' && value !== '--diagnostic-only');
assert.equal(process.platform, 'win32', 'Use an interactive Windows session');
assert.equal(args.length, 3, 'Pass the 0.1.1, 0.2.0 and 0.2.1 Windows executables in that order.');
const versions = ['0.1.1', '0.2.0', '0.2.1'];
const artifactRoot = resolve(root, 'artifacts/objective-02/revision-01');
await mkdir(artifactRoot, { recursive: true });
const directory = await mkdtemp(join(artifactRoot, diagnosticOnly ? 'native-interaction-diagnostic-' : smoke ? 'native-smoke-' : 'native-comparison-'));
const [rawPath, summaryPath] = [join(directory, 'samples.jsonl'), join(directory, 'benchmarks.json')];
const durations = smoke
  ? { ambient: 1, settle: 2, load: 2, idle: 2, minimized: 2, recovery: 2 }
  : { ambient: 3, settle: 8, load: 19, idle: 15, minimized: 14, recovery: 13 };
const controller = new AbortController();
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => controller.abort());
const sleep = (ms) => wait(ms, undefined, { signal: controller.signal });
const inputs = await Promise.all(args.map(async (name, index) => {
  const path = resolve(root, name);
  const bytes = await readFile(path);
  return { path, version: versions[index], bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
const report = {
  schema: 1, status: 'in_progress', qualifying: false, utcStarted: new Date().toISOString(),
  ...(diagnosticOnly ? { mode: 'diagnostic-only', durations: null } : { durations }),
  order: smoke || diagnosticOnly ? [0, 1, 2] : [0, 1, 2, 2, 1, 0],
  inputs: inputs.map(({ path, ...safe }) => safe),
  environment: { platform: process.platform, release: release(), architecture: process.arch,
    processor: cpus()[0]?.model, logicalProcessors: cpus().length, usablePhysicalBytes: totalmem(), node: process.version },
  runs: [], qualificationIssues: [],
};
const checkpoint = async (event) => {
  await writeFile(rawPath, JSON.stringify(event) + '\n', { flag: 'a', flush: true });
  await writeFile(summaryPath + '.tmp', JSON.stringify(report, null, 2) + '\n', { flush: true });
  await rename(summaryPath + '.tmp', summaryPath);
  console.log(JSON.stringify(event));
};
const logSample = (event) => writeFile(rawPath, JSON.stringify(event) + '\n', { flag: 'a', flush: true });

const sampler = diagnosticOnly ? undefined : spawn('pwsh.exe',
  ['-NoProfile', '-NonInteractive', '-File', join(root, 'benchmarks/windows-process-sampler.ps1')],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
sampler?.stdin.on('error', () => {});
const lines = sampler ? createInterface({ input: sampler.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]() : undefined;
let requestId = 0;
async function receive() {
  let deadline;
  try {
    const response = await Promise.race([
      lines.next(),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Win32 sampler response deadline')), 15000); }),
    ]);
    assert(!response.done, 'Win32 sampler exited');
    return JSON.parse(response.value);
  } finally { clearTimeout(deadline); }
}

async function native(action, pid) {
  controller.signal.throwIfAborted();
  const id = ++requestId;
  sampler.stdin.write(JSON.stringify({ id, action, pid }) + '\n');
  const reply = await receive();
  assert.equal(reply.id, id);
  if (reply.error) throw new Error(reply.error);
  return reply.result;
}

function quantiles(numbers) {
  if (!numbers.length) return null;
  const sorted = numbers.toSorted((a, b) => a - b);
  const q = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { count: numbers.length, first: numbers[0], last: numbers.at(-1),
    min: sorted[0], p50: q(.5), p95: q(.95), p99: q(.99), max: sorted.at(-1) };
}

const memoryFields = ['workingSetBytes', 'privateWorkingSetBytes', 'privateBytes', 'sharedWorkingSetBytes', 'sharedCommitBytes'];
function memory(records) {
  return Object.fromEntries(memoryFields.map((field) => [field, records.reduce((result, row) =>
    result + (field === 'sharedWorkingSetBytes' ? Math.max(0, row.workingSetBytes - row.privateWorkingSetBytes) : row[field]), 0)]));
}

function processApp(app, scope) {
  if (!app) return Promise.resolve({});
  return Promise.all([
    app.renderer.send('Runtime.getHeapUsage').catch(() => null),
    app.cdp.send('SystemInfo.getProcessInfo').catch(() => null),
    app.page.locator('main').evaluate((el) => ({
      visibility: document.visibilityState, module: el.dataset.modulePhase ?? null, profile: el.dataset.profile ?? null,
      workerOwnership: el.dataset.workers === undefined ? null : Number(el.dataset.workers),
    }), { timeout: 4000 }).catch(() => null),
  ]).then(([heap, processes, ui]) => ({
    heap, ui, workers: app.page.workers().length, processes: processes?.processInfo ?? [],
    scope,
  }));
}

function cpu(samples) {
  let processTicks = 0;
  const map = (sample) => new Map(sample.tree.filter((row) => !row.error).map((row) => [row.pid + ':' + row.creation, row.cpu100ns]));
  let prior = map(samples[0]);
  for (const sample of samples.slice(1)) {
    const next = map(sample);
    for (const [key, value] of next) if (prior.has(key)) processTicks += Math.max(0, value - prior.get(key));
    prior = next;
  }
  const first = samples[0];
  const last = samples.at(-1);
  const cpuMs = processTicks / 10000;
  const all = (last.system.kernel100ns - first.system.kernel100ns) + (last.system.user100ns - first.system.user100ns);
  const idle = last.system.idle100ns - first.system.idle100ns;
  return { oneLogicalCpuPercent: 100 * cpuMs / (last.timeMs - first.timeMs), systemPercent: all > 0 ? 100 * (all - idle) / all : null };
}

async function phase(run, key, app, expected, exercise) {
  const seconds = durations[key];
  const samples = [];
  const job = exercise ? exercise(seconds * 1000).then((value) => ({ value }), (error) => ({ error })) : null;
  for (;;) {
    const data = await native('sample', app?.handle.pid ?? 0);
    if (app) assert(data.tree.some((row) => row.host && !row.error), 'Native host disappeared during ' + key);
    const sample = { ...data, workers: app?.page.workers().length ?? null };
    samples.push(sample);
    await logSample({ type: 'sample', run: run.number, phase: key, ...sample });
    const elapsed = sample.timeMs - samples[0].timeMs;
    if (elapsed >= 1000 * seconds) break;
    await sleep(Math.max(10, Math.min(smoke ? 400 : 2400, 1000 * seconds - elapsed)));
  }
  const loaded = await job;
  if (loaded?.error) throw loaded.error;
  const last = samples.at(-1);
  const detail = await processApp(app, key);
  const roles = new Map((detail.processes ?? []).map((item) => [Number(item.id), item.type]));
  const typed = {};
  for (const row of last.tree.filter((item) => !item.error)) {
    const label = row.host ? 'host' : (roles.get(row.pid) ?? 'unclassified_webview');
    (typed[label] ??= []).push(row);
  }
  const selectors = { tree: () => true, host: (r) => r.host, helpers: (r) => !r.host };
  const errors = samples.reduce((sum, sample) => sum + sample.tree.filter((row) => row.error).length, 0);
  const matches = samples.filter((sample) => sample.window.state === expected).length;
  const record = {
    seconds: (last.timeMs - samples[0].timeMs) / 1000,
    samples: samples.length, expected, matchingWindowSamples: matches, errors,
    memory: Object.fromEntries(Object.entries(selectors).map(([role, include]) => {
      const rows = samples.map((sample) => memory(sample.tree.filter((r) => !r.error && include(r))));
      return [role, Object.fromEntries(memoryFields.map((field) => [field, quantiles(rows.map((sample) => sample[field]))]))];
    })),
    lastProcessTypes: Object.fromEntries(Object.entries(typed).map(([type, rows]) => [type, { count: rows.length, ...memory(rows) }])),
    systemPhysicalBytes: quantiles(samples.map((item) => item.system.physicalInUseBytes)),
    systemCommitBytes: quantiles(samples.map((item) => item.system.committedBytes)),
    workers: quantiles(samples.map((sample) => sample.workers).filter(Number.isInteger)),
    cpu: cpu(samples),
    browserEnd: app ? { heap: detail.heap, ui: detail.ui, workers: detail.workers } : null,
    ...(loaded ? { interaction: loaded.value } : {}),
  };
  run.phases[key] = record;
  if (matches !== samples.length || errors) report.qualificationIssues.push({ run: run.number, phase: key, matches, samples: samples.length, errors });
  await checkpoint({ type: 'phase', run: run.number, key, sampleCount: samples.length, matches, errors });
  return record;
}

let opening;
async function start(input) {
  const profile = await mkdtemp(join(directory, 'webview-'));
  const started = performance.now();
  const handle = spawn(input.path, [], {
    env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0' },
    stdio: 'ignore',
  });
  const app = opening = { handle };
  let port;
  for (let attempt = 0; attempt < 300 && handle.exitCode === null; attempt++) {
    try {
      const value = (await readFile(join(profile, 'EBWebView', 'DevToolsActivePort'), 'utf8')).trim().split(/\s/)[0];
      if (/^\d{1,5}$/.test(value)) { port = value; break; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await sleep(50);
  }
  assert(port, 'WebView2 did not start its test-only local endpoint');
  const browser = app.browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 10000 });
  const context = browser.contexts()[0];
  const page = app.page = context.pages()[0] ?? await context.waitForEvent('page');
  app.input = page.getByRole('textbox', { name: 'Expression', exact: true });
  app.button = page.getByRole('button', { name: 'Calculate', exact: true });
  app.result = page.getByTestId('result');
  await app.input.fill('0.1+0.2', { timeout: 8000 });
  await app.button.click({ timeout: 8000 });
  await expect(app.result).toHaveText('0.3', { timeout: 8000 });
  app.launchMs = performance.now() - started;
  if (!diagnosticOnly) {
    app.renderer = await context.newCDPSession(page);
    app.cdp = await browser.newBrowserCDPSession();
  }
  return app;
}

async function stop() {
  const app = opening;
  opening = undefined;
  if (!app) return;
  try { await app.browser?.close().catch(() => {}); }
  finally {
    if (app.handle.exitCode === null) {
      app.handle.kill();
      for (let attempt = 0; attempt < 40 && app.handle.exitCode === null; attempt++) await wait(50);
    }
  }
}

const thousands = new Intl.NumberFormat('en-US');
function task(index) {
  if (index % 4 !== 0) return ['3*(' + index + '+7)-2', thousands.format(3 * (index + 7) - 2)];
  const prefix = thousands.format(index + Math.floor(index * Math.SQRT2 / 100));
  return [String(index) + '+sqrt(2)%', new RegExp('^' + prefix + '\\.\\d+$')];
}

async function workload(app, durationMs) {
  const started = performance.now();
  const fill = [], click = [], display = [], total = [];
  do {
    const [expression, expected] = task(total.length + 1);
    const before = performance.now();
    await app.input.fill(expression);
    const filled = performance.now();
    await app.button.click();
    const clicked = performance.now();
    await expect(app.result).toHaveText(expected);
    const read = performance.now();
    fill.push(filled - before);
    click.push(clicked - filled);
    display.push(read - clicked);
    total.push(read - before);
    await sleep(130);
  } while (performance.now() - started < durationMs);
  return { verifiedCount: total.length, fill: quantiles(fill), normalClick: quantiles(click),
    waitForCheckedDisplay: quantiles(display), externalTotal: quantiles(total) };
}

async function installResultClock(page) {
  await page.addInitScript(() => {
    const WorkerClass = globalThis.Worker;
    const starts = [];
    const roundTrips = [];
    let latestWasmBytes = null;
    let active;
    let probeNumber = 0;

    globalThis.__darsBenchWorker = () => ({ starts: starts.slice(), roundTrips: roundTrips.slice(), latestWasmBytes });
    globalThis.__darsBenchResultClock = {
      begin() {
        if (active) throw new Error('Overlapping calculation probes');
        active = { number: ++probeNumber, sent: 0, received: 0, arrival: null };
        return active.number;
      },
      end(number) {
        if (active?.number !== number) throw new Error('Mismatched calculation probe');
        const completed = active;
        active = undefined;
        return completed;
      },
    };
    globalThis.Worker = class extends WorkerClass {
      constructor(...args) {
        super(...args);
        const createdAt = performance.now();
        const jobs = new Map();
        const original = this.postMessage;
        this.postMessage = function (message, ...rest) {
          if (Number.isSafeInteger(message?.id)) {
            jobs.set(message.id, { sentAt: performance.now(), probe: active?.number });
            if (active) active.sent++;
          }
          return original.apply(this, [message, ...rest]);
        };
        // Installed before the application registers its Worker result handler.
        this.addEventListener('message', ({ data }) => {
          const arrivedAt = performance.now();
          if (data?.type === 'ready') starts.push(arrivedAt - createdAt);
          if (data?.type === 'result' && jobs.has(data.id)) {
            const job = jobs.get(data.id);
            jobs.delete(data.id);
            roundTrips.push(arrivedAt - job.sentAt);
            if (active && active.number === job.probe) {
              active.received++;
              active.arrival ??= arrivedAt;
            }
          }
          if (Number.isSafeInteger(data?.wasmBytes)) latestWasmBytes = data.wasmBytes;
        }, { capture: true });
      }
    };
  });
}

function checkResultClock(page, expected) {
  return page.evaluate((value) => new Promise((resolve, reject) => {
    const output = document.querySelector('[data-testid="result"]');
    const button = document.querySelector('button[aria-label="Calculate"]');
    if (!output || !button) throw new Error('Calculation probe controls unavailable');
    const clock = globalThis.__darsBenchResultClock;
    const number = clock.begin();
    const alreadyMatched = output.textContent?.trim() === value;
    let checkedAt = null;
    let frameId;
    let ended = false;

    function complete(status) {
      ended = true;
      observer.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frameId);
      const frameAt = performance.now();
      const probe = clock.end(number);
      const matched = checkedAt !== null && probe.sent === 1 && probe.received === 1 &&
        probe.arrival !== null && probe.arrival >= before && probe.arrival <= checkedAt;
      resolve({
        probe: number,
        status: status === 'unchanged' ? status : matched ? 'matched' : 'worker_result_unmatched',
        dispatched: probe.sent,
        received: probe.received,
        workerArrivalAfterClickMs: probe.arrival === null ? null : probe.arrival - before,
        commit: checkedAt === null ? null : checkedAt - before,
        frame: checkedAt === null ? null : frameAt - checkedAt,
        workerResultArrivalToCheckedDomMs: matched ? checkedAt - probe.arrival : null,
        workerResultArrivalToNextAnimationFrameMs: matched ? frameAt - probe.arrival : null,
      });
    }

    const observer = new MutationObserver(() => {
      if (output.textContent?.trim() !== value) return;
      checkedAt = performance.now();
      observer.disconnect();
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => complete('checked'));
    });
    observer.observe(output, { childList: true, characterData: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
      clock.end(number);
      reject(new Error('Checked DOM result timed out'));
    }, 2500);

    function checkUnchanged() {
      if (ended || checkedAt !== null) return;
      if (!button.disabled && output.textContent?.trim() === value) return complete('unchanged');
      frameId = requestAnimationFrame(checkUnchanged);
    }

    const before = performance.now();
    button.click();
    if (alreadyMatched) frameId = requestAnimationFrame(checkUnchanged);
  }), expected);
}

async function focus(app) {
  if (diagnosticOnly) await installResultClock(app.page);
  else await app.page.addInitScript(() => {
    const workerClass = globalThis.Worker;
    const starts = [];
    const roundTrips = [];
    let latestWasmBytes = null;
    globalThis.__darsBenchWorker = () => ({ starts: starts.slice(), roundTrips: roundTrips.slice(), latestWasmBytes });
    globalThis.Worker = class extends workerClass {
      constructor(...args) {
        super(...args);
        const initial = performance.now();
        const jobs = new Map();
        const original = this.postMessage;
        this.postMessage = function (message, ...rest) {
          if (Number.isSafeInteger(message?.id)) jobs.set(message.id, performance.now());
          return original.apply(this, [message, ...rest]);
        };
        this.addEventListener('message', ({ data }) => {
          if (data?.type === 'ready') starts.push(performance.now() - initial);
          if (data?.type === 'result' && jobs.has(data.id)) {
            roundTrips.push(performance.now() - jobs.get(data.id));
            jobs.delete(data.id);
          }
          if (Number.isSafeInteger(data?.wasmBytes)) latestWasmBytes = data.wasmBytes;
        });
      }
    };
  });
  await app.page.reload({ timeout: 10000 });
  await expect(app.input).toBeVisible({ timeout: 8000 });
  const inside = [], nextFrame = [], normal = [], forced = [];
  const resultClockSamples = [];
  const steps = smoke ? 6 : 50;
  for (let i = 0; i < steps; i++) {
    const n = i % 70;
    await app.input.fill(n + '+0.1+0.2');
    await expect(app.button).toBeEnabled();
    const result = diagnosticOnly
      ? await checkResultClock(app.page, String(n) + '.3')
      : await app.page.evaluate((expected) => new Promise((resolve, reject) => {
          const output = document.querySelector('[data-testid="result"]');
          const button = document.querySelector('button[aria-label="Calculate"]');
          const before = performance.now();
          let finished;
          const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Checked DOM result timed out')); }, 2500);
          const observer = new MutationObserver(() => {
            if (output.textContent?.trim() !== expected) return;
            finished = performance.now();
            observer.disconnect();
            requestAnimationFrame(() => { clearTimeout(timer); resolve({ commit: finished - before, frame: performance.now() - finished }); });
          });
          observer.observe(output, { childList: true, characterData: true, subtree: true });
          button.click();
      }), String(n) + '.3');
    if (result.commit !== null) inside.push(result.commit);
    if (result.frame !== null) nextFrame.push(result.frame);
    if (diagnosticOnly) resultClockSamples.push(result);

    // Counterbalance normal and force in the focused diagnostic step only.
    for (const force of i % 2 ? [true, false] : [false, true]) {
      await app.input.fill((n + (force ? 100 : 200)) + '+0.1+0.2');
      await expect(app.button).toBeEnabled();
      const started = performance.now();
      await app.button.click({ force });
      (force ? forced : normal).push(performance.now() - started);
      await expect(app.result).toHaveText(String(n + (force ? 100 : 200)) + '.3');
    }
  }
  const workers = await app.page.evaluate(() => globalThis.__darsBenchWorker());
  return { clickToResultDom: quantiles(inside), domResultToNextAnimationFrame: quantiles(nextFrame),
    isolatedNormalLocatorClick: quantiles(normal), isolatedForcedLocatorClick: quantiles(forced),
    workerStartup: quantiles(workers.starts), workerRoundTrip: quantiles(workers.roundTrips),
    lastReportedWasmBytes: workers.latestWasmBytes,
    ...(diagnosticOnly ? {
      timingClock: 'renderer performance.now()',
      checkedResultProbes: resultClockSamples.length,
      workerResultArrivalToCheckedDom: quantiles(resultClockSamples.map((sample) => sample.workerResultArrivalToCheckedDomMs).filter(Number.isFinite)),
      workerResultArrivalToNextAnimationFrame: quantiles(resultClockSamples.map((sample) => sample.workerResultArrivalToNextAnimationFrameMs).filter(Number.isFinite)),
      resultClockSamples,
    } : {}) };
}

try {
  if (!diagnosticOnly) assert((await receive()).ready);
  await checkpoint({ type: 'begin', summary: summaryPath.split(/[\\/]/).at(-1), directory: directory.split(/[\\/]/).at(-1) });
  for (const index of report.order) {
    const binary = inputs[index];
    const run = { number: report.runs.length + 1, version: binary.version, phases: {} };
    report.runs.push(run);
    if (diagnosticOnly) {
      const app = await start(binary);
      run.launchToExactResultMs = app.launchMs;
      run.webView = app.browser.version();
      run.interactionDiagnostic = await focus(app);
      await stop();
      const probes = run.interactionDiagnostic.resultClockSamples;
      const workerResultMatches = run.interactionDiagnostic.workerResultArrivalToCheckedDom?.count ?? 0;
      const unchanged = probes.filter((probe) => probe.status === 'unchanged').length;
      if (!workerResultMatches || workerResultMatches + unchanged !== probes.length) {
        report.qualificationIssues.push({ run: run.number, workerResultMatches, unchanged, probes: probes.length });
      }
      await checkpoint({ type: 'complete-run', run: run.number, version: run.version,
        checkedResultProbes: probes.length, workerResultMatches, unchanged });
      continue;
    }
    await phase(run, 'ambient', null, 'missing');
    const app = await start(binary);
    run.launchToExactResultMs = app.launchMs;
    run.webView = app.browser.version();
    await phase(run, 'settle', app, 'visible');
    await phase(run, 'load', app, 'visible', (duration) => workload(app, duration));
    await app.input.fill('100');
    await app.page.getByRole('button', { name: 'Store in memory', exact: true }).click();
    await expect(app.page.getByRole('button', { name: 'Recall memory', exact: true })).toBeEnabled();
    await phase(run, 'idle', app, 'visible');
    assert.equal((await native('minimize', app.handle.pid)).state, 'minimized');
    await phase(run, 'minimized', app, 'minimized');
    assert.equal((await native('restore', app.handle.pid)).state, 'visible');
    const resumed = performance.now();
    await app.page.getByRole('button', { name: 'Recall memory', exact: true }).click({ timeout: 8000 });
    await app.button.click({ timeout: 8000 });
    await expect(app.result).toHaveText('100');
    run.nativeRestoreToExactRecallMs = performance.now() - resumed;
    await phase(run, 'recovery', app, 'visible');
    run.interactionDiagnostic = await focus(app);
    await stop();
    await sleep(smoke ? 300 : 1600);
    run.residualProcessCount = (await native('sample', app.handle.pid)).tree.length;
    if (run.residualProcessCount) report.qualificationIssues.push({ run: run.number, residual: run.residualProcessCount });
    await checkpoint({ type: 'complete-run', run: run.number, version: run.version, verifiedLoadCases: run.phases.load.interaction.verifiedCount });
  }
  for (const input of inputs) assert.equal(createHash('sha256').update(await readFile(input.path)).digest('hex'), input.sha256);
  report.status = report.qualificationIssues.length ? 'complete_with_limitations' : 'complete';
  report.qualifying = !smoke && !diagnosticOnly && !report.qualificationIssues.length;
  report.utcEnded = new Date().toISOString();
  await checkpoint({ type: 'end', status: report.status, qualifying: report.qualifying });
} catch (error) {
  report.status = 'interrupted';
  report.qualificationIssues.push({ code: error.name });
  await checkpoint({ type: 'end', status: report.status, qualifying: false });
  throw error;
} finally {
  await stop();
  sampler?.stdin.end();
}
