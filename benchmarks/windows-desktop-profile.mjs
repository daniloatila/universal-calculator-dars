import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { arch, cpus, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const arguments_ = process.argv.slice(2);
const quick = arguments_.includes('--quick');
const visibleTail = arguments_.includes('--visible-tail');
const executable = resolve(root, arguments_.find((arg) => !arg.startsWith('--')) ?? 'target/release/dars-desktop.exe');
const base = resolve(root, 'artifacts/objective-01/revision-01');
const seconds = quick
  ? { ambient: 2, stabilization: 2, idle: 2, minimized: 2, workload: 2, recovery: 2, closed: 2 }
  : { ambient: 30, stabilization: 25, idle: 65, minimized: 60, workload: 100, recovery: 65, closed: 25 };
const sampleEveryMs = quick ? 500 : 4000;
const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());
const sleep = (ms) => delay(ms, undefined, { signal: controller.signal });

await mkdir(base, { recursive: true });
const runPrefix = quick ? 'desktop-quick-' : visibleTail ? 'desktop-visible-tail-' : 'desktop-profile-';
const runFolder = await mkdtemp(join(base, runPrefix));
const eventsPath = join(runFolder, 'samples.jsonl');
const summaryPath = join(runFolder, 'benchmarks.json');
const state = {
  schema: 1,
  status: 'in_progress',
  qualifying: false,
  scope: visibleTail ? 'visible-workload-and-recovery' : 'full-desktop-profile',
  environment: { platform: process.platform, arch: arch(), release: release(), logicalCpus: cpus().length, cpu: cpus()[0]?.model, installedMemoryBytes: totalmem() },
  artifact: { bytes: null, sha256: null },
  minimumPhaseSeconds: seconds,
  sampleEveryMs,
  phases: {},
  startups: [],
};
const bytes = await readFile(executable);
state.artifact.bytes = bytes.length;
state.artifact.sha256 = createHash('sha256').update(bytes).digest('hex');

function durableWrite(path, bytesToWrite, flag = 'w') {
  const fd = openSync(path, flag);
  try {
    writeSync(fd, bytesToWrite, null, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function log(event) {
  durableWrite(eventsPath, JSON.stringify(event) + '\n', 'a');
}

async function checkpoint(event) {
  log(event);
  const temporary = summaryPath + '.tmp';
  durableWrite(temporary, JSON.stringify(state, null, 2) + '\n');
  await rename(temporary, summaryPath);
  console.log(JSON.stringify(event));
}

const sampler = spawn('pwsh.exe', ['-NoProfile', '-NonInteractive', '-File', join(root, 'benchmarks/windows-process-sampler.ps1')], {
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'inherit'],
});
sampler.stdin.on('error', () => {});
const lines = createInterface({ input: sampler.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
let requestId = 0;

async function receive(timeoutMs) {
  let alarm;
  try {
    const line = await Promise.race([
      lines.next(),
      new Promise((_, reject) => { alarm = setTimeout(() => reject(new Error('Sampler reply timed out.')), timeoutMs); }),
    ]);
    if (line.done) throw new Error('The metrics sampler exited before returning a result.');
    return JSON.parse(line.value);
  } finally {
    clearTimeout(alarm);
  }
}

async function request(action, pid) {
  controller.signal.throwIfAborted();
  const id = ++requestId;
  sampler.stdin.write(JSON.stringify({ id, action, pid }) + '\n');
  const reply = await receive(10000);
  if (reply.id !== id) throw new Error('Mismatched sampler response.');
  if (reply.error) throw new Error(reply.error);
  return reply.result;
}

function summarize(values) {
  const ordered = values.toSorted((a, b) => a - b);
  const median = ordered[Math.floor(ordered.length / 2)];
  return { min: ordered[0], median, max: ordered.at(-1), first: values[0], last: values.at(-1) };
}

const memoryKeys = ['workingSetBytes', 'privateWorkingSetBytes', 'privateBytes', 'sharedWorkingSetBytes', 'sharedCommitBytes'];
function sampleWithTotals(sample) {
  const totals = { host: 0, auxiliary: 0 };
  const errors = sample.tree.filter((row) => row.error !== undefined);
  for (const role of ['host', 'auxiliary', 'tree']) {
    const selected = sample.tree.filter((row) => row.error === undefined && (role === 'tree' || row.host === (role === 'host')));
    totals[role] = Object.fromEntries(memoryKeys.map((name) => [name, selected.reduce((sum, row) =>
      sum + (name === 'sharedWorkingSetBytes' ? Math.max(0, row.workingSetBytes - row.privateWorkingSetBytes) : row[name]), 0)]));
  }
  return { ...sample, totals, errors };
}

function processIdentity(row) {
  return row.pid + ':' + row.creation;
}

function cpuSummary(samples) {
  let processTime = 0;
  let starts = 0;
  let exits = 0;
  for (let i = 1; i < samples.length; i++) {
    const before = new Map(samples[i - 1].tree.filter((row) => row.error === undefined).map((row) => [processIdentity(row), row.cpu100ns]));
    const after = new Map(samples[i].tree.filter((row) => row.error === undefined).map((row) => [processIdentity(row), row.cpu100ns]));
    for (const [id, time] of after) {
      if (before.has(id)) processTime += Math.max(0, time - before.get(id));
      else starts++;
    }
    for (const id of before.keys()) if (!after.has(id)) exits++;
  }
  const a = samples[0];
  const b = samples.at(-1);
  const wallMs = b.timeMs - a.timeMs;
  const kernelAndUserTime = b.system.kernel100ns - a.system.kernel100ns + b.system.user100ns - a.system.user100ns;
  const inactiveTime = b.system.idle100ns - a.system.idle100ns;
  return {
    processCpuSecondsObserved: processTime / 10000000,
    processOneLogicalCpuPercent: 100 * (processTime / 10000) / wallMs,
    processTotalMachinePercent: 100 * (processTime / 10000) / wallMs / state.environment.logicalCpus,
    systemPercent: 100 * (kernelAndUserTime - inactiveTime) / kernelAndUserTime,
    processStartsBetweenSamples: starts,
    processExitsBetweenSamples: exits,
  };
}

async function phase(name, pid, expectedWindow, workload) {
  const samples = [];
  const started = performance.now();
  const durationMs = seconds[name] * 1000;
  log({ type: 'phase-start', name, requiredSeconds: seconds[name] });
  const work = workload ? workload(durationMs).then((value) => ({ value }), (error) => ({ error })) : null;
  for (;;) {
    const stats = sampleWithTotals(await request('sample', pid));
    if (pid && !stats.tree.some((row) => row.host && row.error === undefined)) {
      log({ type: 'sample-rejected', name, reason: 'Host process missing or unreadable', elapsedMs: performance.now() - started });
      throw new Error('The audited desktop process disappeared during ' + name);
    }
    samples.push(stats);
    log({ type: 'sample', name, ...stats });
    if (stats.timeMs - samples[0].timeMs >= durationMs) break;
    const wait = Math.max(10, Math.min(sampleEveryMs, durationMs - (stats.timeMs - samples[0].timeMs)));
    await sleep(wait);
  }
  const completion = await work;
  if (completion?.error) throw completion.error;
  const summary = {
    durationSeconds: (samples.at(-1).timeMs - samples[0].timeMs) / 1000,
    samples: samples.length,
    expectedWindow,
    matchingWindowSamples: samples.filter((entry) => entry.window.state === expectedWindow).length,
    foregroundSamples: samples.filter((entry) => entry.window.foreground).length,
    maxProcessCount: Math.max(...samples.map((entry) => entry.tree.length)),
    errors: samples.reduce((sum, entry) => sum + entry.errors.length, 0),
    memory: {},
    system: {},
    cpu: cpuSummary(samples),
  };
  for (const role of ['tree', 'host', 'auxiliary']) {
    summary.memory[role] = Object.fromEntries(memoryKeys.map((key) => [key, summarize(samples.map((sample) => sample.totals[role][key]))]));
  }
  for (const key of ['committedBytes', 'physicalInUseBytes']) {
    summary.system[key] = summarize(samples.map((sample) => sample.system[key]));
  }
  if (work) summary.workload = completion.value;
  state.phases[name] = summary;
  await checkpoint({ type: 'phase-complete', name, seconds: summary.durationSeconds, samples: summary.samples,
    windowMatches: summary.matchingWindowSamples, errors: summary.errors, workload: summary.workload?.completed });
}

let active;
function alive(handle) {
  return handle.exitCode === null && handle.signalCode === null;
}
async function closeApp() {
  if (!active) return;
  const { handle, browser } = active;
  active = undefined;
  if (alive(handle)) {
    try {
      await request('close', handle.pid);
      for (let i = 0; i < 100 && alive(handle); i++) await delay(50);
    } catch {
      // Process-scoped fallback ensures cleanup even when the sampler has failed.
    }
    if (alive(handle)) {
      handle.kill();
      for (let i = 0; i < 100 && alive(handle); i++) await delay(50);
      if (alive(handle)) throw new Error('The audited desktop process failed to stop.');
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
    cwd: runFolder, stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0' },
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
  if (!port) throw launchError ?? new Error('No local WebView2 debugging port was produced.');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 10000 });
  active.browser = browser;
  const [context] = browser.contexts();
  if (!context) throw new Error('No WebView2 browser context.');
  const page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 10000 });
  await page.waitForURL((url) => url.hostname === 'tauri.localhost' || url.protocol === 'tauri:', { timeout: 10000 });
  const input = page.getByRole('textbox', { name: 'Expression', exact: true });
  const button = page.getByRole('button', { name: 'Calculate', exact: true });
  const result = page.getByTestId('result');
  await input.fill('0.1+0.2', { timeout: 8000 });
  await expect(button).toBeEnabled({ timeout: 8000 });
  await button.click({ timeout: 8000 });
  await expect(result).toHaveText('0.3', { timeout: 8000 });
  const startup = { kind, launchToFirstResultMs: Math.round(performance.now() - started), webViewVersion: browser.version() };
  state.startups.push(startup);
  await checkpoint({ type: 'startup', ...startup });
  return { pid: handle.pid, input, button, result };
}

async function exercise(app, durationMs) {
  const started = performance.now();
  const latencies = [];
  const format = new Intl.NumberFormat('en-US');
  while (performance.now() - started < durationMs) {
    controller.signal.throwIfAborted();
    const iteration = latencies.length + 1;
    const start = performance.now();
    if (iteration % 4 === 0) {
      await app.input.fill(String(iteration) + '+sqrt(2)%');
      await app.button.click();
      // Validate the entire decimal with a separate trusted prefix/suffix shape.
      await expect(app.result).toHaveText(new RegExp('^' + format.format(iteration + Math.floor(iteration * Math.SQRT2 / 100)).replaceAll(',', '\\,') + '\\.\\d+$'));
    } else {
      await app.input.fill('3*(' + iteration + '+7)-2');
      await app.button.click();
      await expect(app.result).toHaveText(format.format(3 * (iteration + 7) - 2));
    }
    latencies.push(performance.now() - start);
    await sleep(130);
  }
  return { completed: latencies.length, durationSeconds: (performance.now() - started) / 1000, endToEndLatencyMs: summarize(latencies), workload: 'Alternating exact arithmetic and compound expressions with irrational relative percentages.' };
}

function makeComparison() {
  state.comparisons = {};
  for (const name of ['idle', 'minimized', 'workload', 'recovery', 'closed']) {
    const phaseData = state.phases[name];
    state.comparisons[name] = {
      // System-wide estimates contain ordinary ambient workload changes.
      systemCommitDeltaVsUnlaunchedBytes: phaseData.system.committedBytes.median - state.phases.ambient.system.committedBytes.median,
      systemPhysicalDeltaVsUnlaunchedBytes: phaseData.system.physicalInUseBytes.median - state.phases.ambient.system.physicalInUseBytes.median,
      attributableTreePrivateBytes: phaseData.memory.tree.privateBytes.median,
      attributableTreePrivateResidentBytes: phaseData.memory.tree.privateWorkingSetBytes.median,
    };
  }
  state.recoveryVsIdle = Object.fromEntries(memoryKeys.map((key) => [key,
    state.phases.recovery.memory.tree[key].median - state.phases.idle.memory.tree[key].median]));
}

try {
  if (process.platform !== 'win32') throw new Error('The process sampler requires Windows.');
  if (!(await receive(20000)).ready) throw new Error('No Windows process sampler handshake.');
  await checkpoint({ type: 'begin', run: runFolder.split(/[\\/]/).at(-1), sha256: state.artifact.sha256 });
  const shared = await mkdtemp(join(runFolder, 'primary-webview-'));
  if (!visibleTail) await phase('ambient', 0, 'missing');
  const app = await startApp(shared, 'fresh-profile');
  await phase('stabilization', app.pid, 'visible');
  if (!visibleTail) {
    await phase('idle', app.pid, 'visible');
    await request('minimize', app.pid);
    await phase('minimized', app.pid, 'minimized');
    await request('restore', app.pid);
  }
  await phase('workload', app.pid, 'visible', (durationMs) => exercise(app, durationMs));
  await phase('recovery', app.pid, 'visible');
  await closeApp();
  if (visibleTail) {
    state.recoveryVsStabilization = Object.fromEntries(memoryKeys.map((key) => [key,
      state.phases.recovery.memory.tree[key].median - state.phases.stabilization.memory.tree[key].median]));
  } else {
    state.residualTreeImmediatelyAfterClose = (await request('sample', app.pid)).tree.length;
    await phase('closed', 0, 'missing');
    state.residualTreeAfterClosedPhase = (await request('sample', app.pid)).tree.length;
    for (const kind of ['reused-profile', 'fresh-profile', 'reused-profile', 'fresh-profile']) {
      const profile = kind === 'reused-profile' ? shared : await mkdtemp(join(runFolder, 'fresh-webview-'));
      await startApp(profile, kind);
      await closeApp();
      await sleep(1500);
    }
    makeComparison();
  }
  state.qualificationIssues = [];
  if (state.residualTreeAfterClosedPhase) state.qualificationIssues.push('Some descendants remained after the closed phase.');
  for (const [name, data] of Object.entries(state.phases)) {
    if (data.matchingWindowSamples !== data.samples) state.qualificationIssues.push('Unexpected window state during ' + name);
    if (data.errors) state.qualificationIssues.push('Unreadable descendant samples during ' + name);
  }
  state.status = state.qualificationIssues.length ? 'completed_with_limitations' : 'complete';
  state.qualifying = !quick && !state.qualificationIssues.length;
  await checkpoint({ type: 'end', status: state.status, qualifying: state.qualifying, summary: runFolder.split(/[\\/]/).at(-1) + '/benchmarks.json' });
} catch (error) {
  state.status = 'interrupted';
  state.qualifying = false;
  await checkpoint({ type: 'interrupted', message: error.message });
  throw error;
} finally {
  await closeApp();
  sampler.stdin.end();
}
