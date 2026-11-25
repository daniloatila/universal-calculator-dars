import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { runWindowsToolBenchmark } from './windows-tool.mjs';

const [baselineExecutable, candidateExecutable, ...extra] = process.argv.slice(2);
assert(baselineExecutable && candidateExecutable && !extra.length, 'Pass the approved 0.2.2 and candidate 0.3.0 executables.');

const standardCases = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  return { expression: `3*(${number}+7)-2`, expected: String(3 * (number + 7) - 2) };
});
const lastStandard = standardCases.at(-1);
const cycles = [
  { id: 'programmer', profile: 'ultra_light', cases: [
    { operation: 'Convert', inputs: { Value: '42' }, result: 'binary=00101010; octal=052; decimal=42; hexadecimal=2A' },
    { operation: 'Convert', inputs: { Value: '3' }, result: 'binary=00000011; octal=003; decimal=3; hexadecimal=03' },
  ] },
  { id: 'calculus', profile: 'efficiency', cases: [
    { operation: 'Derivative', inputs: { Expression: 'x^3' }, result: '3*x^2' },
    { operation: 'Derivative', inputs: { Expression: '7' }, result: '0' },
  ] },
  { id: 'date-time', profile: 'balanced', cases: [
    { operation: 'Date difference', inputs: { 'Start date': '2024-02-28', 'End date': '2024-03-01' },
      result: 'days=2; weeks=0; remaining_days=2' },
    { operation: 'Date difference', inputs: { 'Start date': '2024-01-09', 'End date': '2024-01-01' },
      result: 'days=-8; weeks=-1; remaining_days=-1' },
  ] },
  { id: 'linear-algebra', profile: 'performance', cases: [
    { operation: 'Determinant', inputs: { 'A[1,1]': '1', 'A[1,2]': '2', 'A[2,1]': '3', 'A[2,2]': '4' }, result: '-2' },
    { operation: 'Determinant', inputs: { 'A[1,1]': '2', 'A[1,2]': '1', 'A[2,1]': '0', 'A[2,2]': '4' }, result: '8' },
  ] },
  { id: 'scientific', profile: 'maximum', cases: [
    { inputs: { Expression: 'sin(90°)' }, result: '1' },
    { inputs: { Expression: 'cos(180°)' }, result: '-1' },
  ] },
];

async function suspend({ page, expect, action, sample }, name, count) {
  assert.equal((await action('minimize')).state, 'minimized');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'suspended');
  await expect.poll(() => page.workers().length).toBe(0);
  await sample(`${name}_minimized`, 'minimized', count);
  assert.equal((await action('restore')).state, 'visible');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
}

async function standard(context) {
  const { page, expect, data, quantiles, calculateStandard, sample } = context;
  const elapsed = (async () => {
    const latencies = [];
    for (const example of standardCases) latencies.push(await calculateStandard(example));
    return quantiles(latencies);
  })();
  [data.standardInteractionMilliseconds] = await Promise.all([elapsed, sample('standard_load', 'visible')]);
  await sample('standard_idle', 'visible');
  await suspend(context, 'standard', 6);
  await expect(page.getByRole('textbox', { name: 'Expression', exact: true })).toHaveValue(lastStandard.expression);
  await expect(page.getByTestId('result')).toHaveText(lastStandard.expected);
  data.standardRecoveryMilliseconds = await calculateStandard({ expression: '46/2', expected: '23' });
  await sample('standard_restored', 'visible');
}

async function chosenProfile(page, expect, profile) {
  const panel = page.locator('details.operations');
  await panel.locator('summary').first().click();
  const picker = page.getByRole('combobox', { name: 'Performance profile', exact: true });
  await picker.selectOption(profile);
  await expect(page.locator('main')).toHaveAttribute('data-profile', profile);
  await panel.locator('summary').first().click();
}

async function mixed(context) {
  const { page, expect, data, quantiles, sample, screenshot } = context;
  const chooser = page.getByRole('combobox', { name: 'Module', exact: true });
  const field = (name) => page.getByRole('textbox', { name, exact: true });
  let workersOpened = 0;
  let workersClosed = 0;
  let maximumObservedWorkers = 0;
  const track = (worker) => {
    workersOpened++;
    maximumObservedWorkers = Math.max(maximumObservedWorkers, page.workers().length);
    worker.once('close', () => { workersClosed++; });
  };
  page.workers().forEach(track);
  page.on('worker', track);
  data.mixedCycles = [];

  for (const cycle of cycles) {
    await chosenProfile(page, expect, cycle.profile);
    await chooser.selectOption(cycle.id);
    const shell = page.locator('main');
    await expect(shell).toHaveAttribute('data-module-id', cycle.id);
    await expect(shell).toHaveAttribute('data-module-phase', 'active');
    await expect.poll(() => page.workers().length).toBe(0);
    const result = page.getByTestId(`${cycle.id}-result`);
    const check = async ({ operation, inputs, result: canonical }) => {
      if (operation) await page.getByRole('button', { name: operation, exact: true }).click();
      const started = performance.now();
      for (const [name, value] of Object.entries(inputs)) await field(name).fill(value);
      await page.getByRole('button', { name: 'Calculate', exact: true }).click();
      await expect(result).toHaveAttribute('data-canonical', canonical);
      return performance.now() - started;
    };
    const load = (async () => {
      const elapsed = [];
      for (const example of [...cycle.cases, ...cycle.cases]) elapsed.push(await check(example));
      return quantiles(elapsed);
    })();
    const [interactionMilliseconds] = await Promise.all([load, sample(`${cycle.id}_load`, 'visible', 3)]);
    await expect.poll(() => page.workers().length).toBe(0);
    await sample(`${cycle.id}_idle`, 'visible', 3);
    await suspend(context, cycle.id, 3);
    const retained = cycle.cases.at(-1);
    for (const [name, value] of Object.entries(retained.inputs)) await expect(field(name)).toHaveValue(value);
    await expect(result).toHaveAttribute('data-canonical', retained.result);
    const recoveryMilliseconds = await check(cycle.cases[0]);
    await expect.poll(() => page.workers().length).toBe(0);
    await sample(`${cycle.id}_restored`, 'visible', 3);
    data.mixedCycles.push({ module: cycle.id, profile: cycle.profile, interactionMilliseconds, recoveryMilliseconds,
      draftRetained: true, resultRetained: true, liveWorkersAfterResult: page.workers().length });
    await chooser.selectOption('standard');
    await expect(page.getByTestId('result')).toHaveText('23');
  }
  await expect(page.locator('main')).toHaveAttribute('data-module-id', 'standard');
  const standardWorkers = page.workers();
  assert(standardWorkers.length <= 1);
  assert(standardWorkers.every((worker) => /\/wasm-worker-[\w-]+\.js$/u.test(new URL(worker.url()).pathname)));
  data.standardWorkersWhileActive = standardWorkers.length;
  const record = page.locator('details.standard-proof');
  await record.getByText('Calculation record', { exact: true }).click();
  await expect(record.getByRole('button', { name: 'Download JSON', exact: true })).toBeEnabled();
  await expect(record.getByText('This calculation', { exact: true })).toBeVisible();
  const normalized = record.locator('dl > div').filter({ has: page.getByText('Normalized expression', { exact: true }) });
  await expect(normalized.locator('dd')).toHaveText('46/2');
  data.standardRecordAfterSwitch = true;
  await screenshot('standard-restored-windows.png');
  await page.getByRole('button', { name: 'Suspend module', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'suspended');
  await expect.poll(() => page.workers().length).toBe(0);
  await expect.poll(() => workersOpened - workersClosed).toBe(0);
  assert.equal(maximumObservedWorkers, 1);
  data.mixedWorkers = { opened: workersOpened, closed: workersClosed, peakObserved: maximumObservedWorkers };
}

const module = 'integrated-platform';
const baseline = await runWindowsToolBenchmark({ module, label: 'approved-0.2.2', audit: standard }, baselineExecutable);
const candidate = await runWindowsToolBenchmark({ module, label: 'review-0.3.0', audit: async (context) => {
  await standard(context);
  await mixed(context);
} }, candidateExecutable);
assert.equal(baseline.webview, candidate.webview, 'Paired runs require the same WebView2 version.');
const directory = new URL('../artifacts/objective-03/integrated-platform/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('paired-windows.json', directory), JSON.stringify({ baseline, candidate }, null, 2) + '\n', { flush: true });
