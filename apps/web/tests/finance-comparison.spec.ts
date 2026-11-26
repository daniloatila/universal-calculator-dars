import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import en from '../src/locales/en.json' with { type: 'json' };
import ar from '../src/locales/ar.json' with { type: 'json' };
import type { CalculationProof } from '../src/calculation-proof';
import type { FinanceModule } from '../src/finance-modules';

const labels = en.finance.labels;
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);
const scenarios = (page: Page) => page.getByTestId('finance-scenarios');
const delta = (page: Page) => scenarios(page).locator('.finance-delta');
const difference = (page: Page, key: string) => delta(page).locator(`[data-comparison-field="${key}"]`);
const catalogRow = (page: Page, key: string) => scenarios(page).getByRole('row').filter({ has: page.locator(`[data-metric="${key}"]`) });

async function openModule(page: Page, module: FinanceModule) {
  await page.goto('/');
  await page.getByRole('combobox', { name: en.operations.modulePicker, exact: true }).selectOption(module);
  await expect(page.getByRole('region', { name: en.finance.modules[module].title, exact: true })).toBeVisible();
}

async function save(page: Page, operation: string, overrides: Record<string, string> = {}, currency?: string) {
  await page.getByTestId('finance-operation').selectOption(operation);
  if (currency) await page.getByRole('combobox', { name: labels.currency, exact: true }).selectOption(currency);
  await button(page, labels.example).click();
  for (const [key, value] of Object.entries(overrides)) {
    const input = field(page, key);
    if (await input.evaluate((element) => element.tagName === 'SELECT')) await input.selectOption(value);
    else await input.fill(value);
  }
  const count = await scenarios(page).locator('li').count();
  await button(page, labels.calculate).click();
  await expect(button(page, labels.save_scenario)).toBeEnabled();
  await button(page, labels.save_scenario).click();
  await expect(scenarios(page).locator('li')).toHaveCount(count + 1);
}

async function saveRate(page: Page, rate: string, from = '1', to = from) {
  await save(page, 'equivalent_rate', { rate, from_periods_per_year: from, to_periods_per_year: to });
}

async function selectPair(page: Page, reference: string, alternative: string) {
  if (await scenarios(page).getAttribute('open') === null) await scenarios(page).locator('summary').first().click();
  await scenarios(page).getByRole('combobox', { name: labels.reference, exact: true }).selectOption(reference);
  await scenarios(page).getByRole('combobox', { name: labels.alternative, exact: true }).selectOption(alternative);
}

async function inspect(page: Page, key: string, status: string) {
  await expect(catalogRow(page, key)).toHaveAttribute('data-comparison-status', status);
  await scenarios(page).locator(`[data-metric="${key}"]`).click();
  await expect(delta(page)).toHaveAttribute('data-comparison-status', status);
  await expect(scenarios(page).locator(`[data-metric="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
}

test('equivalent semiannual and annual rates produce three zero differences and an exportable semantic proof', async ({ page }, info) => {
  await openModule(page, 'financial');
  await saveRate(page, '0.10', '2');
  await saveRate(page, '0.10', '2', '1');
  await selectPair(page, '1', '2');
  await inspect(page, 'rate', 'normalized');
  await expect(delta(page).locator('[data-original-value]')).toHaveText(['10%', '21%']);
  await expect(delta(page).locator('[data-normalized-value]')).toHaveText(['21%', '21%']);
  await expect(delta(page)).toContainText(labels.comparison_common_basis);
  await expect(difference(page, 'absolute_difference')).toHaveText('0');
  await expect(difference(page, 'percentage_points')).toHaveText('0');
  await expect(difference(page, 'relative_percent')).toHaveText('0%');
  await delta(page).getByTestId('finance-comparison-proof').locator('summary').click();
  const [file] = await Promise.all([
    page.waitForEvent('download'), button(page, labels.comparison_export_proof).click(),
  ]);
  expect(file.suggestedFilename()).toBe('dars-comparison-proof.json');
  const proof = JSON.parse(await readFile(await file.path(), 'utf8')) as CalculationProof;
  const result = JSON.parse(proof.result);
  expect(proof).toMatchObject({ schema: 1, module: 'financial', operation: 'scenario_compare', exactness: 'exact' });
  expect(JSON.parse(proof.normalized)).toMatchObject({
    reference: { operation: 'equivalent_rate' }, alternative: { operation: 'equivalent_rate' }, metric: 'rate',
  });
  expect(result.selected).toMatchObject({
    common_basis: { periods_per_year: 1, capitalization: 'compound', nature: 'effective' },
    exact_difference: '0',
    percentage_points: expect.stringMatching(/^0(?:\.0+)?$/u),
    relative_percent: expect.stringMatching(/^0(?:\.0+)?$/u),
    precision_used: { rounding: 'half_even', exact_arithmetic_on_compared_values: true },
  });
  await info.attach('normalized-rates-proof', { body: JSON.stringify(proof), contentType: 'application/json' });
});

test('rates distinguish fractional differences, percentage points, signed negative references, and zero references', async ({ page }) => {
  await openModule(page, 'financial');
  for (const rate of ['0.10', '0.12', '-0.1', '-0.08', '0']) await saveRate(page, rate);
  for (const reference of ['1', '3']) {
    await selectPair(page, reference, reference === '1' ? '2' : '4');
    await inspect(page, 'rate', 'direct');
    await expect(difference(page, 'absolute_difference')).toHaveText('0.02');
    await expect(difference(page, 'percentage_points')).toHaveText('2');
    await expect(difference(page, 'relative_percent')).toHaveText('20%');
    await expect(delta(page)).toContainText(labels.comparison_relative_basis);
  }
  await selectPair(page, '5', '2');
  await inspect(page, 'rate', 'direct');
  await expect(difference(page, 'percentage_points')).toHaveText('12');
  await expect(difference(page, 'relative_percent')).toHaveText('—');
  await expect(delta(page)).toContainText(labels.comparison_relative_zero);
});

test('comparator preserves differences below a cent and forbids currency-equivalent monetary deltas', async ({ page }) => {
  await openModule(page, 'financial');
  await save(page, 'simple_interest', { principal: '1', periods: '1', rate: '0.001' });
  await save(page, 'simple_interest', { principal: '1', periods: '1', rate: '0.002' });
  await save(page, 'simple_interest', { principal: '1', periods: '1', rate: '0.002' }, 'USD');
  await selectPair(page, '1', '2');
  await inspect(page, 'amount', 'direct');
  await expect(delta(page).locator('[data-original-value]')).toHaveText(['1.00', '1.00']);
  await expect(difference(page, 'absolute_difference')).toHaveText('0.001');
  await selectPair(page, '1', '3');
  await inspect(page, 'amount', 'incompatible');
  await expect(delta(page)).toContainText(labels.comparison_reason_currency_mismatch);
  await expect(delta(page).getByTestId('finance-comparison-differences')).toHaveCount(0);
});

test('a nonzero exact difference rounded to the display resolution is shown as approximately zero', async ({ page }) => {
  await openModule(page, 'financial');
  await save(page, 'simple_interest', { principal: '0.000000000001', periods: '1', rate: '0' });
  await save(page, 'simple_interest', { principal: '0.000000000001', periods: '1', rate: '0.000000000001' });
  await selectPair(page, '1', '2');
  await inspect(page, 'interest', 'direct');
  await expect(difference(page, 'absolute_difference')).toHaveText('≈0');
  await expect(difference(page, 'relative_percent')).toHaveText('—');
  const proof = delta(page).getByTestId('finance-comparison-proof');
  await proof.locator('summary').click();
  await expect(proof).toContainText('1/1,000,000,000,000,000,000,000,000');
});

test('a catalog separates contextual durations from comparable counts and preserves undefined indicators', async ({ page }) => {
  await openModule(page, 'investment');
  await save(page, 'project', { initial: '0', contribution: '0', periods: '2' });
  await save(page, 'project', { initial: '0', contribution: '0', periods: '3' });
  await selectPair(page, '1', '2');
  await expect(catalogRow(page, 'elapsed_periods')).toHaveAttribute('data-comparison-status', 'direct');
  await inspect(page, 'final_balance', 'contextual');
  await expect(delta(page)).toContainText(labels.horizon);
  await expect(delta(page).getByTestId('finance-comparison-differences')).toHaveCount(0);
  await inspect(page, 'simple_net_return', 'undefined');
  await expect(delta(page)).toContainText(labels.comparison_reason_undefined_value);
  await expect(delta(page).locator('[data-original-value]')).toHaveText(['—', '—']);
  await expect(delta(page).getByTestId('finance-comparison-differences')).toHaveCount(0);
});

test('unknown compounding periods remain contextual and an effective and nominal quote can share a supported annual basis', async ({ page }) => {
  await openModule(page, 'financial');
  await saveRate(page, '0.1', '2');
  await save(page, 'nominal_effective', { rate: '0.21', compounds: '2', direction: 'effective_to_nominal' });
  await save(page, 'rate', { present: '100', future: '121', periods: '2' });
  await selectPair(page, '1', '2');
  await inspect(page, 'rate', 'normalized');
  await expect(difference(page, 'absolute_difference')).toHaveText('0');
  await selectPair(page, '1', '3');
  await inspect(page, 'rate', 'contextual');
  await expect(delta(page)).toContainText(labels.comparison_reason_context_missing);
  await expect(delta(page)).toContainText(labels.periodicity);
  await expect(delta(page).getByTestId('finance-comparison-differences')).toHaveCount(0);
});

test('loan package and tax period differences remain contextual without suppressing every available metric', async ({ page }) => {
  await openModule(page, 'loans');
  await save(page, 'sac', { periods: '3', principal: '1000' });
  await save(page, 'price', { periods: '6', principal: '2000' });
  await selectPair(page, '1', '2');
  await expect(catalogRow(page, 'contract_periods')).toHaveAttribute('data-comparison-status', 'direct');
  await inspect(page, 'total_paid', 'contextual');
  await expect(delta(page)).toContainText(labels.principal_financed);
  await expect(delta(page)).toContainText(labels.horizon);
  await expect(delta(page).getByTestId('finance-comparison-differences')).toHaveCount(0);

  await page.getByRole('combobox', { name: en.operations.modulePicker, exact: true }).selectOption('tax');
  await expect(page.getByRole('region', { name: en.finance.modules.tax.title, exact: true })).toBeVisible();
  await save(page, 'br_irrf', { date: '2026-04-15' });
  await save(page, 'br_irrf', { date: '2026-05-15' });
  await selectPair(page, '1', '2');
  await inspect(page, 'withholding_tax', 'contextual');
  await expect(delta(page)).toContainText(labels.tax_period);
  await expect(delta(page).getByTestId('finance-comparison-differences')).toHaveCount(0);
});

test('business markup and margin keep their distinct bases and equal labels do not establish compatibility', async ({ page }) => {
  await openModule(page, 'business');
  await save(page, 'price', { markup: '0.25' });
  await save(page, 'margins');
  await save(page, 'price', { markup: '0.6' });
  await selectPair(page, '1', '2');
  await inspect(page, 'gross_profit', 'incompatible');
  await expect(delta(page)).toContainText(labels.comparison_reason_semantic_mismatch);
  await expect(delta(page).getByTestId('finance-comparison-differences')).toHaveCount(0);
  await selectPair(page, '1', '3');
  await inspect(page, 'markup', 'direct');
  await expect(difference(page, 'percentage_points')).toHaveText('35');
  await inspect(page, 'margin', 'direct');
  await expect(difference(page, 'percentage_points')).toHaveText('17.5');
});

test('periodic and dated annual modified internal returns do not produce an equivalent delta', async ({ page }) => {
  await openModule(page, 'financial');
  await save(page, 'mirr');
  await save(page, 'mirr', {
    'flows.0.date': '2026-01-01', 'flows.1.date': '2026-06-15', 'flows.2.date': '2027-01-01',
  });
  await selectPair(page, '1', '2');
  await inspect(page, 'mirr', 'contextual');
  await expect(delta(page)).toContainText(labels.comparison_reason_context_missing);
  await expect(delta(page).getByTestId('finance-comparison-differences')).toHaveCount(0);
});

test('suspending a pending comparison terminates its Worker and a resumed comparison completes', async ({ page }) => {
  await page.addInitScript(() => {
    const report = { active: 0, repliesHeld: 0, terminations: 0 };
    Object.defineProperty(window, 'darsComparisonWorkers', { value: report });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private counted = false;

      postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        const request = message as { operation?: string; input?: string };
        if (request.operation === 'scenario_compare' && request.input && JSON.parse(request.input).metric === 'rate') {
          this.counted = true;
          report.active++;
          if (report.repliesHeld === 0) {
            // Wait for the real WASM result, then leave the manager's request pending.
            this.onmessage = () => { report.repliesHeld++; };
          }
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }

      terminate() {
        if (this.counted) {
          this.counted = false;
          report.active--;
          report.terminations++;
        }
        super.terminate();
      }
    };
  });
  const report = () => page.evaluate(() => Reflect.get(window, 'darsComparisonWorkers'));
  await openModule(page, 'financial');
  await saveRate(page, '0.1', '2');
  await saveRate(page, '0.1', '2', '1');
  await selectPair(page, '1', '2');
  await scenarios(page).locator('[data-metric="rate"]').click();
  await expect.poll(report).toEqual({ active: 1, repliesHeld: 1, terminations: 0 });
  await page.getByText(en.operations.operations, { exact: true }).click();
  await button(page, en.operations.moduleSuspend).click();
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'suspended');
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await expect.poll(report).toEqual({ active: 0, repliesHeld: 1, terminations: 1 });
  await button(page, en.operations.moduleResume).click();
  await scenarios(page).locator('summary').first().click();
  await expect(delta(page)).toHaveCount(0);
  await inspect(page, 'rate', 'normalized');
  await expect(difference(page, 'absolute_difference')).toHaveText('0');
  await expect.poll(report).toEqual({ active: 0, repliesHeld: 1, terminations: 2 });
});

test('historical comparisons replay canonical inputs, reject tampering, and survive Arabic locale and suspension', async ({ page }) => {
  await openModule(page, 'financial');
  await scenarios(page).locator('summary').first().click();
  const historicalPath = new URL('../../../evidence/objective-04/revision-01/historical-scenarios.json', import.meta.url);
  const historical = JSON.parse(await readFile(historicalPath, 'utf8'));
  historical.comparison.proof = { result: 'FORGED COMPARISON' };
  historical.requests[0].result = 'FORGED OPERAND';
  const file = scenarios(page).locator('input[type=file]');
  await file.setInputFiles({ name: 'historical.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(historical)) });
  await expect(scenarios(page).locator('li')).toHaveCount(2);
  await expect(delta(page)).toHaveAttribute('data-comparison-status', 'normalized');
  await expect(delta(page)).not.toContainText(/FORGED/);
  await expect(difference(page, 'absolute_difference')).toHaveText('0');

  const [exported] = await Promise.all([page.waitForEvent('download'), button(page, labels.export_scenarios).click()]);
  const bytes = await readFile(await exported.path());
  const exportedDocument = JSON.parse(bytes.toString('utf8'));
  expect(exportedDocument).toMatchObject({ schema: 2, comparison: { reference_index: 0, alternative_index: 1, metric: 'rate' } });
  expect(exportedDocument.comparison).not.toHaveProperty('proof');
  await file.setInputFiles({ name: 'replay.json', mimeType: 'application/json', buffer: bytes });
  await expect(scenarios(page).locator('li')).toHaveCount(4);
  await expect(scenarios(page).getByRole('combobox', { name: labels.reference, exact: true })).toHaveValue('3');
  await expect(difference(page, 'percentage_points')).toHaveText('0');

  const corrupt = { schema: 2, requests: [{ ...exportedDocument.requests[0],
    input: JSON.stringify({ ...JSON.parse(exportedDocument.requests[0].input), rate: '1.0' }) }] };
  await file.setInputFiles({ name: 'corrupt.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupt)) });
  await expect(page.getByRole('alert')).toContainText(labels.invalid_input);
  await expect(scenarios(page).locator('li')).toHaveCount(4);
  await expect(difference(page, 'percentage_points')).toHaveText('0');

  await page.locator('details.settings summary').click();
  await page.locator('details.settings select').first().selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(delta(page)).toContainText(ar.finance.labels.comparison_status_normalized);
  await expect(difference(page, 'percentage_points')).toHaveText('٠');
  await page.locator('details.settings summary').click();
  await page.getByText(ar.operations.operations, { exact: true }).click();
  await button(page, ar.operations.moduleSuspend).click();
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'suspended');
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
  await button(page, ar.operations.moduleResume).click();
  await scenarios(page).locator('summary').first().click();
  await expect(delta(page)).toHaveAttribute('data-comparison-status', 'normalized');
  await expect(difference(page, 'percentage_points')).toHaveText('٠');
  await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
});
