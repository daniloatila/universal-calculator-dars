import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';

const command = 'dars_native_capabilities';

if (isMainThread) await run();
else runCpuFixture();

function runCpuFixture() {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  const stop = performance.now() + 6000;
  let value = 1;
  parentPort.postMessage('ready');
  while (performance.now() < stop) {
    const until = performance.now() + 20;
    while (performance.now() < until) value = Math.imul(value + 1, 1664525);
    Atomics.wait(pause, 0, 0, 30);
  }
  parentPort.postMessage(value);
}

async function run() {
  if (process.platform !== 'win32') throw new Error('Native capability verification requires Windows and an interactive session.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
  const { chromium, expect } = require('@playwright/test');
  const revision = process.argv.includes('--objective-02-revision-02') ? 'revision-02' : 'revision-01';
  const artifactRoot = resolve(root, 'artifacts/objective-02', revision);
  await mkdir(artifactRoot, { recursive: true });
  const profile = await mkdtemp(join(artifactRoot, 'native-sensors-profile-'));
  const [executablePath = 'target/release/dars-desktop.exe'] =
    process.argv.slice(2).filter((arg) => arg !== '--objective-02-revision-02');
  const executable = resolve(root, executablePath);
  const artifactSha256 = createHash('sha256').update(await readFile(executable)).digest('hex');
  const app = spawn(executable, [], {
    cwd: profile, stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0 --lang=en-US' },
  });
  let spawnError;
  app.on('error', (error) => { spawnError = error; });
  const sampler = spawn('pwsh.exe', [
    '-NoProfile', '-NonInteractive', '-File', join(root, 'benchmarks/windows-process-sampler.ps1'),
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
  let samplerError;
  sampler.on('error', (error) => { samplerError = error; });
  sampler.stdin.on('error', () => {});
  const lines = createInterface({ input: sampler.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  let requestId = 0;

  async function readSampler(timeoutMs) {
    let timer;
    try {
      const item = await Promise.race([
        lines.next(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(samplerError ?? new Error('The test window driver timed out.')), timeoutMs);
        }),
      ]);
      if (item.done) throw samplerError ?? new Error('The test window driver closed.');
      return JSON.parse(item.value);
    } finally {
      clearTimeout(timer);
    }
  }

  async function changeWindow(action) {
    const id = ++requestId;
    sampler.stdin.write(JSON.stringify({ id, action, pid: app.pid }) + '\n');
    const reply = await readSampler(10000);
    assert.equal(reply.id, id);
    if (reply.error) throw new Error(reply.error);
    return reply.result;
  }

  const sampleFresh = async () => {
    await delay(2200);
    return sample();
  };

  let browser;
  let page;
  const activeLoad = [];
  async function sample() {
    return page.evaluate(async (command) => {
      const before = performance.now();
      const reading = await window.__TAURI_INTERNALS__.invoke(command, {});
      return { reading, roundTripMs: performance.now() - before };
    }, command);
  }

  try {
    assert((await readSampler(15000)).ready);
    const portPath = join(profile, 'EBWebView', 'DevToolsActivePort');
    let port;
    const deadline = performance.now() + 15000;
    while (!port && performance.now() < deadline && !spawnError && app.exitCode === null) {
      try {
        const entry = (await readFile(portPath, 'utf8')).split(/\r?\n/)[0];
        if (/^\d{1,5}$/.test(entry) && Number(entry) > 0 && Number(entry) <= 65535) port = entry;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (!port) await delay(35);
    }
    if (!port) throw spawnError ?? new Error('The packaged WebView2 debugging endpoint did not open.');
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 10000 });
    const [context] = browser.contexts();
    assert(context);
    page = context.pages()[0] ?? await context.waitForEvent('page', { timeout: 10000 });
    await page.waitForURL((url) => url.hostname === 'tauri.localhost' || url.protocol === 'tauri:', { timeout: 10000 });

    const input = page.getByRole('textbox', { name: 'Expression', exact: true });
    const calculator = page.getByRole('button', { name: 'Calculate', exact: true });
    await input.fill('0.1+0.2');
    await calculator.click();
    await expect(page.getByTestId('result')).toHaveText('0.3');
    const wrongBody = await page.evaluate(async (command) => {
      try {
        await window.__TAURI_INTERNALS__.invoke(command, { selector: 'unexpected' });
        return null;
      } catch (error) {
        return String(error);
      }
    }, command);
    assert.equal(wrongBody, 'native_sensors_invalid_request');

    const first = await sampleFresh();
    const cached = await sample();
    assert.equal(cached.reading.nativeSampleCount, first.reading.nativeSampleCount);
    assert(first.reading.nativeSampleAgeMs < 2000 && cached.reading.nativeSampleAgeMs < 2000);
    assert.equal(first.reading.schema, 1);
    assert.equal(first.reading.source, 'windows');
    assert.equal(first.reading.platform, 'Windows');
    assert(['x86_64', 'aarch64', 'x86', 'arm'].includes(first.reading.architecture));
    assert(first.reading.hardwareThreads > 0);
    assert(first.reading.nativePhysicalTotalBytes > 0);
    assert(first.reading.nativePhysicalAvailableBytes >= 0 &&
      first.reading.nativePhysicalAvailableBytes <= first.reading.nativePhysicalTotalBytes);
    assert.equal(typeof first.reading.nativeLowMemory, 'boolean');
    assert(first.reading.nativeHostWorkingSetBytes > 0 && first.reading.nativeHostPrivateBytes > 0);
    assert(first.reading.nativeMonitorCostUs >= 0);
    assert.equal(first.reading.thermalState, null);
    assert.equal(first.reading.gpuAvailable, null);
    assert.equal(first.reading.nativeWebviewMemoryTarget, 'normal');

    const baselines = [await sampleFresh(), await sampleFresh()];
    for (const { reading } of baselines) {
      assert(reading.nativeCpuIntervalMs >= 100);
      assert(reading.nativeHostCpuOneCore >= 0);
      if (reading.hardwareThreads <= 64) {
        assert(typeof reading.nativeCpuLoad === 'number' && reading.nativeCpuLoad >= 0 && reading.nativeCpuLoad <= 1);
      }
    }

    // At most four workers and 40% duty each for six seconds. This supplies a comparison reading,
    // without attempting to push the machine past the policy's sustained overload threshold.
    const workerCount = Math.min(4, Math.floor(first.reading.hardwareThreads / 4));
    let boundedCpu;
    if (workerCount > 0 && baselines.every(({ reading }) => typeof reading.nativeCpuLoad === 'number')) {
      for (let index = 0; index < workerCount; index++) activeLoad.push(new Worker(new URL(import.meta.url)));
      await Promise.all(activeLoad.map((worker) => once(worker, 'message')));
      const loaded = [await sampleFresh(), await sampleFresh()];
      await Promise.all(activeLoad.map((worker) => worker.terminate()));
      activeLoad.length = 0;
      const average = (items) => items.reduce((sum, { reading }) => sum + reading.nativeCpuLoad, 0) / items.length;
      boundedCpu = {
        workerCount, dutyFraction: 0.4, maximumFixtureMs: 6000,
        baseline: baselines.map(({ reading }) => reading.nativeCpuLoad),
        loaded: loaded.map(({ reading }) => reading.nativeCpuLoad),
        difference: average(loaded) - average(baselines),
        nativeMonitorCostUs: loaded.map(({ reading }) => reading.nativeMonitorCostUs),
        nativeRoundTripMs: loaded.map(({ roundTripMs }) => roundTripMs),
      };
    }

    const operations = page.locator('details.operations');
    await operations.locator('summary').first().click();
    const diagnostics = operations.locator('details.local-diagnostics');
    await diagnostics.locator('summary').first().click();
    await expect(diagnostics.getByTestId('native-sample-cost')).toHaveAttribute('data-us', /^\d+$/);
    const graphics = diagnostics.getByText('Graphics context test', { exact: true }).locator('..').locator('dd');
    await expect(graphics).toHaveText(/^(Context created|Context creation failed|Unavailable)$/);
    const graphicsProbe = await graphics.textContent();
    await diagnostics.locator('summary').first().click();
    await operations.locator('summary').first().click();

    const main = page.locator('main[data-profile]');
    const prior = await main.getAttribute('data-profile');
    assert(prior && prior !== 'ultra_light', 'Use a visible Auto baseline with no preexisting Ultra Light safety restriction.');
    const minimized = await changeWindow('minimize');
    assert.equal(minimized.state, 'minimized');
    await expect(main).toHaveAttribute('data-profile', 'ultra_light');
    await expect(main).toHaveAttribute('data-module-phase', 'suspended');
    await expect(main).toHaveAttribute('data-workers', '0');
    await expect.poll(async () => (await sample()).reading.nativeWebviewMemoryTarget).toBe('low');
    const hidden = await sample();
    assert.equal(hidden.reading.nativeWindowState, 'minimized');
    const restored = await changeWindow('restore');
    assert.equal(restored.state, 'visible');
    await expect(main).toHaveAttribute('data-module-phase', 'active');
    await input.fill('1/3');
    await calculator.click();
    await expect(page.getByTestId('result')).toHaveText('0.333333333333333333333333');
    await expect.poll(async () => (await sample()).reading.nativeWebviewMemoryTarget).toBe('normal');
    const after = await sample();
    assert.equal(after.reading.nativeWindowState, 'visible');

    const report = {
      status: 'complete', artifactSha256, webviewVersion: browser.version(), observedAtUtc: new Date().toISOString(),
      requestValidation: 'fixed empty request accepted; unexpected selector rejected',
      sampleCache: { sampleCount: first.reading.nativeSampleCount, cachedSameCount: true },
      visibleSnapshot: baselines.at(-1),
      boundedCpu: boundedCpu ?? null,
      graphicsProbe,
      automaticNativeWindowTransition: {
        selection: 'auto', previousProfile: prior, minimizedProfile: 'ultra_light', minimizedModule: 'suspended',
        minimizedWorkers: 0, reportedNativeWindow: hidden.reading.nativeWindowState,
        minimizedWebviewMemoryTarget: hidden.reading.nativeWebviewMemoryTarget,
        restoredNativeWindow: after.reading.nativeWindowState,
        restoredWebviewMemoryTarget: after.reading.nativeWebviewMemoryTarget,
        restoredProfile: await main.getAttribute('data-profile'),
        exactRationalRecheckedAfterRestore: true,
      },
    };
    assert.equal(createHash('sha256').update(await readFile(executable)).digest('hex'), artifactSha256);
    await writeFile(join(artifactRoot, 'native-sensor-verification.json'), JSON.stringify(report, null, 2) + '\n', { flush: true });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.allSettled(activeLoad.map((worker) => worker.terminate()));
    if (app.exitCode === null && app.signalCode === null && app.pid) {
      try { await changeWindow('close'); } catch {}
      for (let i = 0; i < 40 && app.exitCode === null && app.signalCode === null; i++) await delay(25);
      if (app.exitCode === null && app.signalCode === null) app.kill();
    }
    await browser?.close().catch(() => {});
    sampler.stdin.end();
  }
}
