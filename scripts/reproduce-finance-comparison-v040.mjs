import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runWindowsToolBenchmark } from '../benchmarks/windows-tool.mjs';

const [executable, output] = process.argv.slice(2);
assert(executable && output, 'Pass the verified 0.4.0 Windows executable and the output directory.');
const artifact = JSON.parse(await readFile(new URL('../evidence/objective-04/windows-artifact.json', import.meta.url), 'utf8'));
const digest = createHash('sha256').update(await readFile(executable)).digest('hex');
assert.equal(digest, artifact.sha256, 'The executable must match the audited 0.4.0 delivery.');
const folder = resolve(output);
await mkdir(folder, { recursive: true });

const observed = await runWindowsToolBenchmark({
  artifactObjective: 'objective-04', module: 'revision-01', label: 'comparison-0.4.0',
  async audit({ page, expect, data, sample }) {
    const chooser = page.getByRole('combobox', { name: 'Module', exact: true });
    const button = (name) => page.getByRole('button', { name, exact: true });
    await chooser.selectOption('financial');
    await page.getByTestId('finance-operation').selectOption('equivalent_rate');
    await button('Load example').click();
    for (const [field, value] of Object.entries({ rate: '0.10', from_periods_per_year: '2', to_periods_per_year: '2' })) {
      await page.locator(`[data-field="${field}"]`).fill(value);
    }
    const individual = [];
    for (const frequency of ['2', '1']) {
      await page.locator('[data-field="to_periods_per_year"]').fill(frequency);
      await button('Calculate').click();
      await expect(button('Save for comparison')).toBeVisible();
      const [result] = await Promise.all([
        page.waitForEvent('download'),
        button('Export result').click(),
      ]);
      const proof = JSON.parse(await readFile(await result.path())).proof;
      assert.equal(proof.engine_version, '0.4.0');
      assert.equal(Number(JSON.parse(proof.result).rate), frequency === '2' ? 0.10 : 0.21);
      individual.push(proof);
      await button('Save for comparison').click();
    }
    const scenarios = page.getByTestId('finance-scenarios');
    await scenarios.locator('summary').click();
    await scenarios.getByRole('combobox', { name: 'Reference', exact: true }).selectOption('1');
    await scenarios.getByRole('combobox', { name: 'Alternative', exact: true }).selectOption('2');
    const start = performance.now();
    await scenarios.locator('[data-metric="rate"]').click();
    await expect(scenarios.locator('.finance-delta')).toContainText('Relative difference (%)');
    await expect(scenarios.locator('.finance-delta')).toContainText('110');
    data.comparisonMilliseconds = performance.now() - start;
    await sample('comparison_visible', 'visible', 2);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      scenarios.getByRole('button', { name: 'Export scenarios', exact: true }).click(),
    ]);
    const bytes = await readFile(await download.path());
    const exported = JSON.parse(bytes);
    assert.equal(exported.schema, 1);
    assert.equal(exported.comparison.metric, 'rate');
    assert.equal(exported.comparison.proof.engine_version, '0.4.0');
    const delta = JSON.parse(exported.comparison.proof.result);
    assert.equal(delta.absolute_difference, '0.1100000000000000');
    assert.equal(delta.relative_percent, '110.0000000000');
    assert.equal(Number(delta.reference), 0.10);
    assert.equal(Number(delta.alternative), 0.21);
    await writeFile(join(folder, 'historical-scenarios.json'), bytes);
    data.reproduction = {
      status: 'reproduced',
      requests: exported.requests,
      calculationProofs: individual,
      comparisonProof: exported.comparison.proof,
      interfaceText: await scenarios.locator('.finance-delta').innerText(),
      exportedBytes: bytes.length,
    };
    await page.screenshot({ path: join(folder, 'before-windows.png'), fullPage: true });
  },
}, executable);

assert.equal(observed.executableSha256, digest);
assert.equal(observed.phases.after_close.processesAtEnd, 0);
const report = {
  schema: 1,
  version: '0.4.0',
  source_commit: artifact.source_commit,
  executable_sha256: digest,
  webview2: observed.webview,
  comparison_milliseconds: observed.comparisonMilliseconds,
  startup_to_checked_standard_ms: observed.startupToCheckedStandardMs,
  visible_standard_memory: observed.phases.standard_visible.processMemory.tree,
  visible_comparison_memory: observed.phases.comparison_visible.processMemory.tree,
  workers_after_comparison: observed.phases.comparison_visible.workersAtEnd,
  remaining_processes: observed.phases.after_close.processesAtEnd,
  ...observed.reproduction,
};
await writeFile(join(folder, 'before-windows.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, webview2: report.webview2,
  difference: JSON.parse(report.comparisonProof.result).absolute_difference,
  remaining_processes: report.remaining_processes }));
