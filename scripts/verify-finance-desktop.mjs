import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { runWindowsToolBenchmark } from '../benchmarks/windows-tool.mjs';

const argumentsList = process.argv.slice(2);
const baselineOnly = argumentsList[0] === '--baseline-only';
const candidateOnly = argumentsList[0] === '--candidate-only';
const [baselineArgument, candidateArgument, expectedCandidateSha, outputArgument] = baselineOnly
  ? [argumentsList[1], undefined, undefined, argumentsList[2]]
  : candidateOnly ? [undefined, argumentsList[1], argumentsList[2], argumentsList[3]] : argumentsList;
const candidateVersion = argumentsList[4] ?? (candidateOnly ? '0.5.0' : '0.4.0');
const validCandidate = candidateArgument && /^[a-f0-9]{64}$/u.test(expectedCandidateSha ?? '') &&
  /^(?:0\.4\.[01]|0\.5\.0)$/u.test(candidateVersion);
assert(outputArgument && (baselineOnly ? baselineArgument && argumentsList.length === 3
  : validCandidate && [4,5].includes(argumentsList.length) && (candidateOnly || baselineArgument)),
  'Pass BASELINE_EXE CANDIDATE_EXE VERIFIED_SHA256 OUTPUT_JSON [VERSION], --baseline-only BASELINE_EXE OUTPUT_JSON, or --candidate-only CANDIDATE_EXE VERIFIED_SHA256 OUTPUT_JSON [VERSION].');

const output = resolve(outputArgument);
const screenshotDirectory = join(dirname(output), `${basename(output, '.json')}-screenshots`);
await mkdir(screenshotDirectory, { recursive: true });
const receipt = candidateOnly ? undefined
  : JSON.parse(await readFile(new URL('../evidence/objective-03/revision-01/windows-artifact.json', import.meta.url), 'utf8'));

async function verifiedExecutable(argument, expectedSha) {
  const executable = resolve(argument);
  const actualSha = createHash('sha256').update(await readFile(executable)).digest('hex');
  assert.equal(actualSha, expectedSha, 'The executable must match its verified provenance receipt.');
  return executable;
}

const baselineExecutable = candidateOnly ? undefined : await verifiedExecutable(baselineArgument, receipt.sha256);
const candidateExecutable = baselineOnly ? undefined : await verifiedExecutable(candidateArgument, expectedCandidateSha);

const repeatedStandard = [
  { expression: '0.1+0.2', expected: '0.3' },
  { expression: '9*(1+2)', expected: '27' },
  { expression: '200+10%', expected: '220' },
  { expression: '123.45-0.45', expected: '123' },
];

const financeExamples = [
  { module: 'financial', operation: 'irr', check(result) {
    assert.equal(result.status, 'solved');
    const roots = result.roots.map((entry) => entry.rate_exact);
    assert.deepEqual(roots, ['1/10', '1/5']);
    return { roots };
  } },
  { module: 'investment', operation: 'project', check(result) {
    assert.equal(result.final_balance, '1367.25');
    return { finalBalance: result.final_balance };
  } },
  { module: 'loans', operation: 'sac', check(result) {
    assert.equal(result.summary.method, 'sac');
    assert.equal(result.summary.interest, '40.00');
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows.at(-1).balance_end, '0.00');
    return { rows: result.rows.length, interest: result.summary.interest, closingBalance: result.rows.at(-1).balance_end };
  } },
  { module: 'tax', operation: 'br_irrf', check(result) {
    assert.equal(result.withholding_tax, '382.88');
    assert.equal(result.rule_version, 'BR-2026.1');
    return { withholding: result.withholding_tax, ruleVersion: result.rule_version };
  } },
  { module: 'business', operation: 'price', check(result) {
    assert.equal(result.price, '125.00');
    assert.equal(Number(result.margin), 0.2);
    return { price: result.price, margin: result.margin };
  } },
];

function proofField(proof, field) {
  return proof.getByText(field, { exact: true }).locator('xpath=following-sibling::dd[1]');
}

async function openProof(proof) {
  if (!(await proof.evaluate((element) => element.open))) {
    await proof.locator('summary').click();
  }
}

async function audit(context, version, candidate) {
  const { page, expect, data, quantiles, calculateStandard, sample, action } = context;
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForURL((url) => url.hostname === 'tauri.localhost' || url.protocol === 'tauri:');
  const main = page.locator('main');
  const modulePicker = page.getByRole('combobox', { name: 'Module', exact: true });
  const button = (label) => page.getByRole('button', { name: label, exact: true });
  const cleanWorkers = async () => {
    await expect(main).toHaveAttribute('data-workers', '0');
    await expect.poll(() => page.workers().length).toBe(0);
  };
  const standardWorker = async () => {
    await expect(main).toHaveAttribute('data-workers', '1');
    await expect.poll(() => page.workers().length).toBe(1);
  };

  const externalRequests = [];
  page.context().on('request', (request) => {
    const address = new URL(request.url());
    if ((address.protocol === 'https:' || address.protocol === 'http:') && address.hostname !== 'tauri.localhost') {
      externalRequests.push(address.origin);
    }
  });

  data.interactions = [];
  for (let repetition = 0; repetition < 3; repetition++) {
    for (const fixture of repeatedStandard) {
      data.interactions.push({ ...fixture, milliseconds: await calculateStandard(fixture) });
    }
  }
  data.standardRecalculationMs = quantiles(data.interactions.map((entry) => entry.milliseconds));
  const standardProof = main.locator('details.calculation-proof');
  await openProof(standardProof);
  await expect(proofField(standardProof, 'Engine version')).toHaveText(version);
  data.engineVersion = version;
  await standardProof.locator('summary').click();
  await standardWorker();
  data.standardVisibleWorkers = page.workers().length;
  await sample('standard_recalculated', 'visible');
  await page.screenshot({ path: join(screenshotDirectory, `${candidate ? 'candidate' : 'baseline'}-standard.png`) });

  if (candidate) {
    await page.context().setOffline(true);
    const workers = { opened: 0, closed: 0, peak: 0 };
    const workerModules = [];
    const financeWorker = /\/tool-(financial|investment|loans|tax|business)-worker[^/]*\.js$/u;
    const observeWorker = (worker) => {
      const parsed = financeWorker.exec(new URL(worker.url()).pathname);
      workerModules.push(parsed?.[1] ?? 'unexpected');
      workers.opened++;
      workers.peak = Math.max(workers.peak, workers.opened - workers.closed);
      worker.once('close', () => { workers.closed++; });
    };
    page.on('worker', observeWorker);

    data.financeExamples = [];
    for (const fixture of financeExamples) {
      const { module, operation } = fixture;
      await modulePicker.selectOption(module);
      await expect(main).toHaveAttribute('data-module-id', module);
      await expect(main).toHaveAttribute('data-module-phase', 'active');
      await cleanWorkers();
      await page.getByTestId('finance-operation').selectOption(operation);
      await button('Load example').click();
      const result = page.getByTestId('finance-result');
      const exportButton = result.getByRole('button', { name: 'Export result', exact: true });
      await expect(exportButton).toHaveCount(0);
      const started = performance.now();
      const [worker] = await Promise.all([page.waitForEvent('worker', { timeout: 12_000 }), button('Calculate').click()]);
      assert.equal(financeWorker.exec(new URL(worker.url()).pathname)?.[1], module);
      await expect(exportButton).toBeVisible({ timeout: 12_000 });
      const resultMilliseconds = performance.now() - started;
      const proof = result.locator('details.calculation-proof');
      await openProof(proof);
      await expect(proofField(proof, 'Engine version')).toHaveText(version);
      const checked = fixture.check(JSON.parse(await proofField(proof, 'Result').textContent()));
      await cleanWorkers();
      await expect.poll(() => workers.opened - workers.closed).toBe(0);
      const screenshot = `candidate-${module}.png`;
      await proof.locator('summary').click();
      await page.screenshot({ path: join(screenshotDirectory, screenshot), fullPage: true });
      data.financeExamples.push({ module, operation, resultMilliseconds, checked, screenshot });
    }
    assert.deepEqual(workerModules, financeExamples.map(({ module }) => module));
    assert.deepEqual(workers, { opened: financeExamples.length, closed: financeExamples.length, peak: 1 });
    data.financeWorkers = workers;
    page.off('worker', observeWorker);
    await sample('finance_idle', 'visible');
    assert.equal((await action('minimize')).state, 'minimized');
    await expect(main).toHaveAttribute('data-module-phase', 'suspended');
    await cleanWorkers();
    await sample('finance_minimized', 'minimized');
    assert.equal((await action('restore')).state, 'visible');
    await expect(main).toHaveAttribute('data-module-phase', 'active');
    await expect(page.getByTestId('finance-result').getByRole('button', { name: 'Export result', exact: true })).toBeVisible();
    await cleanWorkers();
    await modulePicker.selectOption('standard');
    await expect(page.getByTestId('result')).toHaveText(repeatedStandard.at(-1).expected);
    data.recoveredStandardMs = await calculateStandard({ expression: '2+3*4', expected: '14' });
    await standardWorker();
    await sample('standard_after_finance', 'visible');
  }
  assert.deepEqual(externalRequests, []);
  data.externalHttpRequestsDuringAudit = externalRequests.length;
}

const run = (executable, version, candidate) => runWindowsToolBenchmark({
  artifactObjective: version === '0.5.0' ? 'objective-05' : 'objective-04',
  module: version === '0.5.0' ? 'desktop-finance' : 'desktop',
  label: `review-${version}`, audit: (context) => audit(context, version, candidate),
}, executable);
const baseline = baselineExecutable ? await run(baselineExecutable, '0.3.1', false) : null;
if (baseline) assert.equal(baseline.executableSha256, receipt.sha256);
const candidate = candidateExecutable ? await run(candidateExecutable, candidateVersion, true) : null;
if (candidate) assert.equal(candidate.executableSha256, expectedCandidateSha);
if (candidate && baseline) {
  assert.equal(baseline.webview, candidate.webview);
  assert.notEqual(baseline.executableSha256, candidate.executableSha256);
  assert.deepEqual(baseline.interactions.map(({ expression, expected }) => ({ expression, expected })),
    candidate.interactions.map(({ expression, expected }) => ({ expression, expected })));
}

function compare(read) {
  const previous = read(baseline);
  const next = read(candidate);
  return { baseline: previous, candidate: next, candidateMinusBaseline: next - previous };
}

function memoryComparison(phase) {
  return Object.fromEntries(['tree', 'host', 'auxiliary'].map((kind) => [kind,
    Object.fromEntries(['privateWorkingSetBytes', 'privateBytes'].map((metric) => [metric,
      compare((run) => run.phases[phase].processMemory[kind][metric].p50),
    ])),
  ]));
}

const report = {
  schema: 1, status: candidateOnly ? 'candidate_only' : candidate ? 'complete' : 'baseline_only',
  method: candidateOnly ? 'Fresh WebView2 profile and five checked offline finance cases with exact candidate provenance.'
    : 'Fresh WebView2 profiles and the same interactive Windows device. Paired Standard workload and candidate-only offline finance cases.',
  limitations: [
    'The startup clock includes one native sampler call and ends at the checked Standard result.',
    'One startup and twelve visible Standard recalculations per artifact describe this controlled run, not long-run behavior.',
    'Private working set is process-resident private memory. Private bytes is process private commit. Adjacent samples can vary with OS activity.',
  ],
  screenshotDirectory: basename(screenshotDirectory),
  comparison: candidate && baseline ? {
    startupToCheckedStandardMs: compare((run) => run.startupToCheckedStandardMs),
    standardRecalculationP50Ms: compare((run) => run.standardRecalculationMs.p50),
    standardRecalculationP95Ms: compare((run) => run.standardRecalculationMs.p95),
    startupVisibleMemory: memoryComparison('startup_visible'),
    standardVisibleMemory: memoryComparison('standard_visible'),
    standardRecalculatedMemory: memoryComparison('standard_recalculated'),
  } : null,
  baseline, candidate,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flush: true });
console.log(JSON.stringify({ status: report.status, examples: candidate?.financeExamples.length ?? 0,
  baselineProcessesAfterClose: baseline?.phases.after_close.processesAtEnd ?? null,
  candidateProcessesAfterClose: candidate?.phases.after_close.processesAtEnd ?? null }));
