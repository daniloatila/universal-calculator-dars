import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWindowsToolBenchmark } from './windows-tool.mjs';

const [baselineExecutable, candidateExecutable, ...extra] = process.argv.slice(2);
assert(baselineExecutable && candidateExecutable && !extra.length,
  'Pass the archived, audited 0.3.0 executable and the corrected 0.3.1 executable.');
const priorAssets = JSON.parse(await readFile(new URL('../evidence/objective-03/assets.json', import.meta.url), 'utf8'));
const root = fileURLToPath(new URL('../', import.meta.url));
const baselineHash = createHash('sha256').update(await readFile(resolve(root, baselineExecutable))).digest('hex');
assert.equal(baselineHash, priorAssets.windows.desktop.sha256, 'The baseline must be the previously audited Windows artifact.');

const expression = 'log(8;2)';
const exactResult = '3';
const transitions = Array.from({ length: 12 }, (_, index) => index % 2 === 0 ? ['en', 'pt-BR'] : ['pt-BR', 'en']);

async function audit({ page, expect, data, quantiles, sample, action }, expectedVersion) {
  const main = page.locator('main');
  const document = page.locator('html');
  const language = page.locator('details.settings select').first();
  const input = page.locator('.scientific-expression textarea');
  const result = page.getByTestId('scientific-result');
  let opened = 0;
  let closed = 0;
  let peak = 0;
  page.on('worker', (worker) => {
    if (!new URL(worker.url()).pathname.includes('/tool-scientific-worker-')) return;
    opened++;
    peak = Math.max(peak, opened - closed);
    worker.once('close', () => { closed++; });
  });

  async function calculate(label) {
    const started = performance.now();
    const worker = page.waitForEvent('worker', (entry) => entry.url().includes('/tool-scientific-worker-'));
    await page.getByRole('button', { name: label, exact: true }).click();
    await worker;
    await expect(result).toHaveAttribute('data-canonical', exactResult);
    const elapsed = performance.now() - started;
    await expect.poll(() => opened - closed).toBe(0);
    return elapsed;
  }

  await expect(document).toHaveAttribute('lang', 'en');
  const started = performance.now();
  await page.getByRole('combobox', { name: 'Module', exact: true }).selectOption('scientific');
  await expect(main).toHaveAttribute('data-module-phase', 'active');
  await expect(input).toBeVisible();
  data.selectionToScientificMilliseconds = performance.now() - started;
  await input.fill(expression);
  data.firstScientificCalculationMilliseconds = await calculate('Calculate');
  await sample('scientific_first_result', 'visible');
  await page.locator('details.settings summary').click();
  const exercise = (async () => {
    const interactions = [];
    for (const [from, to] of transitions) {
      const started = performance.now();
      await language.selectOption(to);
      await expect(document).toHaveAttribute('lang', to);
      const switchMilliseconds = performance.now() - started;
      await expect(input).toHaveValue(expression);
      await expect(result).toHaveAttribute('data-canonical', exactResult);
      const calculationMilliseconds = await calculate(to === 'pt-BR' ? 'Calcular' : 'Calculate');
      interactions.push({ from, to, switchMilliseconds, calculationMilliseconds });
    }
    return interactions;
  })();
  const [interactions] = await Promise.all([exercise, sample('scientific_locale_replay', 'visible')]);
  data.interactions = interactions;
  data.localeReplay = {
    switchMilliseconds: quantiles(interactions.map((entry) => entry.switchMilliseconds)),
    calculationMilliseconds: quantiles(interactions.map((entry) => entry.calculationMilliseconds)),
  };
  await page.locator('details.settings summary').click();
  await sample('scientific_idle', 'visible');
  assert.equal((await action('minimize')).state, 'minimized');
  await expect(main).toHaveAttribute('data-module-phase', 'suspended');
  await expect.poll(() => page.workers().length).toBe(0);
  await sample('scientific_minimized', 'minimized');
  assert.equal((await action('restore')).state, 'visible');
  await expect(main).toHaveAttribute('data-module-phase', 'active');
  await expect(input).toHaveValue(expression);
  await expect(result).toHaveAttribute('data-canonical', exactResult);
  data.recoveredScientificCalculationMilliseconds = await calculate('Calculate');
  await sample('scientific_restored', 'visible');
  const proof = page.locator('details.calculation-proof');
  await proof.locator('summary').click();
  const field = (label) => proof.locator('dl > div').filter({
    has: page.getByText(label, { exact: true }),
  }).locator('dd');
  await expect(field('Engine version')).toHaveText(expectedVersion);
  await expect(field('Normalized expression')).toHaveText('log(8,2)');
  data.engineVersion = expectedVersion;
  assert.equal(opened, 14);
  assert.equal(closed, opened);
  assert.equal(peak, 1);
  data.scientificWorkers = { opened, closed, peak };
}

const module = 'revision-01';
const baseline = await runWindowsToolBenchmark({
  module, label: 'audited-0.3.0', audit: (context) => audit(context, '0.3.0'),
}, baselineExecutable);
const candidate = await runWindowsToolBenchmark({
  module, label: 'corrected-0.3.1', audit: (context) => audit(context, '0.3.1'),
}, candidateExecutable);
assert.equal(baseline.webview, candidate.webview, 'Paired runs require the same installed WebView2 runtime.');
assert.notEqual(baseline.executableSha256, candidate.executableSha256);
assert.equal(baseline.phases.after_close.processesAtEnd, 0);
assert.equal(candidate.phases.after_close.processesAtEnd, 0);

function compare(read) {
  const previous = read(baseline);
  const corrected = read(candidate);
  return { baseline: previous, candidate: corrected, candidateMinusBaseline: corrected - previous };
}

function phaseComparison(name) {
  const readings = ['privateWorkingSetBytes', 'privateBytes', 'sharedWorkingSetBytes'];
  const memory = Object.fromEntries(['tree', 'host', 'auxiliary'].map((role) => [role, Object.fromEntries(readings.map((reading) =>
    [reading, compare((run) => run.phases[name].processMemory[role][reading].p50)]))]));
  return {
    processMedianBytes: memory,
    systemPhysicalMedianDeltaFromOwnAmbientBytes: compare((run) =>
      run.phases[name].systemPhysicalBytes.p50 - run.phases.ambient.systemPhysicalBytes.p50),
  };
}

const measurements = {
  schema: 1,
  method: 'One fresh WebView2 profile per artifact, on the same Windows device, with identical actions and six one-second samples per phase except the startup snapshot.',
  workload: {
    expression, exactResult, transitions,
    control: 'This spelling is accepted in both tested locales and both builds. The original comma defect is tested independently.',
    clocks: 'Switch from UI action to applied language. Calculation from UI action to checked canonical DOM result and worker admission.',
  },
  limitations: [
    'Cold startup has one measurement per artifact. Visible-window measurements include benchmark observation and rendering overhead.',
    'With twelve interactions per artifact, the nearest-rank p95 and p99 are the largest observation.',
    'Short bursts and idle windows describe this pair. They cannot establish long-run growth or an exclusive incremental physical RAM total.',
    'Shared working sets are summed by process and may count shared mappings more than once. System physical memory also reflects unrelated activity.',
  ],
  comparison: {
    startupToCheckedStandardMilliseconds: compare((run) => run.startupToCheckedStandardMs),
    selectionToScientificMilliseconds: compare((run) => run.selectionToScientificMilliseconds),
    firstScientificCalculationMilliseconds: compare((run) => run.firstScientificCalculationMilliseconds),
    switchP50Milliseconds: compare((run) => run.localeReplay.switchMilliseconds.p50),
    switchP95Milliseconds: compare((run) => run.localeReplay.switchMilliseconds.p95),
    calculationP50Milliseconds: compare((run) => run.localeReplay.calculationMilliseconds.p50),
    calculationP95Milliseconds: compare((run) => run.localeReplay.calculationMilliseconds.p95),
    recoveredScientificCalculationMilliseconds: compare((run) => run.recoveredScientificCalculationMilliseconds),
    phases: Object.fromEntries(Object.keys(baseline.phases).map((name) => [name, phaseComparison(name)])),
  },
  baseline,
  candidate,
};
const outputDirectory = new URL('../artifacts/objective-03/revision-01/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL('benchmark-pair.json', outputDirectory), `${JSON.stringify(measurements, null, 2)}\n`, { flush: true });
