import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runWindowsToolBenchmark } from '../benchmarks/windows-tool.mjs';

const [executable, expectedSha, output] = process.argv.slice(2);
assert(executable && /^[0-9a-f]{64}$/u.test(expectedSha ?? '') && output,
  'Pass the 0.4.1 Windows executable, its verified SHA-256, and an output directory.');
const digest = createHash('sha256').update(await readFile(executable)).digest('hex');
assert.equal(digest, expectedSha);
const folder = resolve(output);
await mkdir(folder, { recursive: true });
const historical = new URL('../evidence/objective-04/revision-01/historical-scenarios.json', import.meta.url);

async function exportProof(details, page) {
  if (!(await details.evaluate((element) => element.open))) await details.locator('summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    details.getByRole('button', { name: 'Export comparison proof', exact: true }).click(),
  ]);
  const bytes = await readFile(await download.path());
  return { proof: JSON.parse(bytes), bytes: bytes.length };
}

function checkProof(proof) {
  assert.equal(proof.engine_version, '0.4.1');
  assert.equal(proof.operation, 'scenario_compare');
  const { selected } = JSON.parse(proof.result);
  assert.equal(selected.status, 'normalized');
  assert.deepEqual(selected.common_basis, { capitalization: 'compound', nature: 'effective', periods_per_year: 1 });
  assert.equal(selected.normalization.reference.value, '21/100');
  assert.equal(selected.normalization.alternative.value, '21/100');
  assert.equal(selected.exact_difference, '0');
  assert.equal(Number(selected.percentage_points), 0);
  assert.equal(Number(selected.relative_percent), 0);
}

const observed = await runWindowsToolBenchmark({
  artifactObjective: 'objective-04', module: 'revision-01', label: 'comparison-0.4.1',
  async audit({ page, expect, data, sample }) {
    const main = page.locator('main');
    const chooser = page.getByRole('combobox', { name: 'Module', exact: true });
    const button = (name) => page.getByRole('button', { name, exact: true });
    await page.context().setOffline(true);
    const workers = { opened: 0, closed: 0, peak: 0 };
    const observe = (worker) => {
      if (!/tool-financial-worker/u.test(worker.url())) return;
      workers.opened++;
      workers.peak = Math.max(workers.peak, workers.opened - workers.closed);
      worker.once('close', () => { workers.closed++; });
    };
    const network = [];
    page.on('worker', observe);
    page.context().on('request', (request) => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.hostname !== 'tauri.localhost') network.push(url.origin);
    });
    await chooser.selectOption('financial');
    await page.getByTestId('finance-operation').selectOption('equivalent_rate');
    await button('Load example').click();
    for (const [field, value] of Object.entries({ rate: '0.10', from_periods_per_year: '2', to_periods_per_year: '2' })) {
      await page.locator(`[data-field="${field}"]`).fill(value);
    }
    for (const frequency of ['2', '1']) {
      await page.locator('[data-field="to_periods_per_year"]').fill(frequency);
      await button('Calculate').click();
      await expect(button('Save for comparison')).toBeVisible();
      await button('Save for comparison').click();
    }
    const scenarios = page.getByTestId('finance-scenarios');
    const detail = scenarios.locator('.finance-delta[data-comparison-status="normalized"]');
    await scenarios.locator(':scope > summary').click();
    await scenarios.getByRole('combobox', { name: 'Reference', exact: true }).selectOption('1');
    const pairStarted = performance.now();
    await scenarios.getByRole('combobox', { name: 'Alternative', exact: true }).selectOption('2');
    const rate = scenarios.locator('[data-metric="rate"]');
    await expect(rate).toBeVisible();
    data.pairMilliseconds = performance.now() - pairStarted;
    const selectedStarted = performance.now();
    await rate.click();
    await expect(detail).toBeVisible();
    await expect(detail.locator('[data-comparison-field="absolute_difference"]')).toContainText('0');
    data.selectedMilliseconds = performance.now() - selectedStarted;
    await expect(main).toHaveAttribute('data-workers', '0');
    await sample('comparison_visible', 'visible', 2);
    await page.screenshot({ path: join(folder, 'after-windows.png'), fullPage: true });
    const proofPanel = scenarios.getByTestId('finance-comparison-proof');
    const { proof, bytes } = await exportProof(proofPanel, page);
    checkProof(proof);
    await writeFile(join(folder, 'comparison-proof.json'), JSON.stringify(proof, null, 2) + '\n');
    const [scenarioDownload] = await Promise.all([
      page.waitForEvent('download'),
      scenarios.getByRole('button', { name: 'Export scenarios', exact: true }).click(),
    ]);
    const scenarioBytes = await readFile(await scenarioDownload.path());
    assert.equal(JSON.parse(scenarioBytes).schema, 2);
    await writeFile(join(folder, 'replay-v2.json'), scenarioBytes);

    const importStarted = performance.now();
    await scenarios.locator('input[type=file]').setInputFiles({
      name: 'historical-v1.json', mimeType: 'application/json', buffer: await readFile(historical),
    });
    await expect(scenarios.getByRole('combobox', { name: 'Reference', exact: true })).toHaveValue('3');
    await expect(detail).toBeVisible();
    data.importMilliseconds = performance.now() - importStarted;
    const imported = await exportProof(proofPanel, page);
    checkProof(imported.proof);
    assert.equal(imported.proof.normalized, proof.normalized);
    assert.equal(imported.proof.result, proof.result);

    await chooser.selectOption('business');
    await expect(main).toHaveAttribute('data-module-phase', 'active');
    await chooser.selectOption('financial');
    if (!(await scenarios.evaluate((element) => element.open))) await scenarios.locator(':scope > summary').click();
    await expect(detail).toBeVisible();
    await expect(main).toHaveAttribute('data-workers', '0');
    await expect.poll(() => workers.closed).toBe(workers.opened);
    assert.equal(workers.peak, 1);
    assert.deepEqual(network, []);
    data.finance = {
      proofBytes: bytes, scenarioExportBytes: scenarioBytes.length, historicalImportReproduced: true,
      retainedAfterSwitch: true, workers, externalHttpRequests: network.length,
    };
  },
}, executable);

assert.equal(observed.phases.after_close.processesAtEnd, 0);
const report = {
  schema: 1,
  version: '0.4.1',
  executable_sha256: digest,
  webview2: observed.webview,
  pair_milliseconds: observed.pairMilliseconds,
  selected_milliseconds: observed.selectedMilliseconds,
  import_milliseconds: observed.importMilliseconds,
  startup_to_checked_standard_ms: observed.startupToCheckedStandardMs,
  visible_standard_memory: observed.phases.standard_visible.processMemory.tree,
  visible_comparison_memory: observed.phases.comparison_visible.processMemory.tree,
  workers_after_comparison: observed.phases.comparison_visible.workersAtEnd,
  remaining_processes: observed.phases.after_close.processesAtEnd,
  ...observed.finance,
};
await writeFile(join(folder, 'after-windows.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ version: report.version, webview2: report.webview2, ...observed.finance }));
