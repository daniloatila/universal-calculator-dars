import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { LOCALES } from '../src/i18n';
import type { Locale, Messages } from '../src/i18n';
import type { CalculationProof } from '../src/calculation-proof';
import type { FinanceModule } from '../src/finance-modules';
import en from '../src/locales/en.json' with { type: 'json' };
import pt from '../src/locales/pt-BR.json' with { type: 'json' };
import zh from '../src/locales/zh-CN.json' with { type: 'json' };
import hi from '../src/locales/hi.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };
import ar from '../src/locales/ar.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const translations: Record<Locale, Messages> = { en, 'pt-BR': pt, 'zh-CN': zh, hi, es, ar, fr };
const modules: readonly FinanceModule[] = ['financial', 'investment', 'loans', 'tax', 'business'];
const samples: Record<FinanceModule, string> = {
  financial: 'irr', investment: 'project', loans: 'sac', tax: 'br_irrf', business: 'price',
};
const output = (page: Page) => page.getByTestId('finance-result');
const language = (page: Page) => page.locator('details.settings select').first();
const profile = (page: Page) => page.getByRole('combobox', { name: en.operations.selection, exact: true });
const option = (page: Page) => page.getByTestId('finance-operation');
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function selectLanguage(page: Page, locale: Locale) {
  const settings = page.locator('details.settings');
  if (await settings.getAttribute('open') === null) await settings.locator('summary').click();
  await language(page).selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
}

async function selectModule(page: Page, module: FinanceModule, locale: Locale) {
  const messages = translations[locale];
  await page.getByRole('combobox', { name: messages.operations.modulePicker, exact: true }).selectOption(module);
  await expect(page.getByRole('region', { name: messages.finance.modules[module].title, exact: true })).toBeVisible();
  await option(page).selectOption(samples[module]);
}

async function proof(page: Page, locale: Locale): Promise<CalculationProof> {
  const messages = translations[locale];
  await Promise.all([page.waitForEvent('worker'), button(page, messages.finance.labels.calculate).click()]);
  await expect(output(page).getByRole('button', { name: messages.finance.labels.export_result })).toBeVisible();
  const [event] = await Promise.all([page.waitForEvent('download'), button(page, messages.finance.labels.export_result).click()]);
  expect(event.suggestedFilename()).toBe('dars-finance-result.json');
  return JSON.parse(await readFile(await event.path(), 'utf8')).proof as CalculationProof;
}

for (const source of Object.keys(LOCALES) as Locale[]) {
  test(`finance drafts retain their source notation across six destinations from ${source}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.goto('/');
    const destinations = (Object.keys(LOCALES) as Locale[]).filter((locale) => locale !== source);
    const matches: { module: string; from: string; to: string }[] = [];
    for (const module of modules) {
      await selectLanguage(page, source);
      await selectModule(page, module, source);
      if (module === 'financial') await option(page).selectOption('npv');
      await button(page, translations[source].finance.labels.example).click();
      if (module === 'financial') {
        for (const [index, date] of ['2026-01-01', '2026-04-10', '2027-02-01'].entries()) {
          await field(page, `flows.${index}.date`).fill(date);
        }
      }
      const baseline = await proof(page, source);
      for (const locale of destinations) {
        await selectLanguage(page, source);
        await selectLanguage(page, locale);
        const replay = await proof(page, locale);
        expect(replay).toEqual(baseline);
        matches.push({ module, from: source, to: locale });
      }
    }
    expect(matches).toHaveLength(30);
    await info.attach('finance-language-matrix', { contentType: 'application/json', body: JSON.stringify(matches) });
  });
}

test('five financial workspaces calculate under all adaptive profiles without simultaneous workers', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const external: string[] = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') external.push(request.url());
  });
  await page.addInitScript(() => {
    const measurements = { active: 0, max: 0, initializations: 0, finance: 0 };
    Object.defineProperty(window, '__financeWorkerCounts', { value: measurements });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private live = true;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        measurements.active++;
        measurements.max = Math.max(measurements.max, measurements.active);
        measurements.initializations++;
        if (/tool-(financial|investment|loans|tax|business)-worker/u.test(String(url))) measurements.finance++;
      }
      terminate() {
        if (this.live) { this.live = false; measurements.active--; }
        super.terminate();
      }
    };
  });
  await page.goto('/');
  await selectLanguage(page, 'en');
  await page.getByText(en.operations.operations, { exact: true }).click();
  const checks = [];
  for (const id of ['ultra_light', 'efficiency', 'balanced', 'performance', 'maximum']) {
    await profile(page).selectOption(id);
    await expect(page.locator('main')).toHaveAttribute('data-profile', id);
    for (const module of modules) {
      await selectModule(page, module, 'en');
      await button(page, en.finance.labels.example).click();
      const result = await proof(page, 'en');
      expect(result.module).toBe(module);
      checks.push({ profile: id, module, operation: result.operation });
    }
  }
  const counts = await page.evaluate(() => (window as unknown as {
    __financeWorkerCounts: { active: number; max: number; initializations: number; finance: number };
  }).__financeWorkerCounts);
  expect(counts.active).toBe(0);
  expect(counts.max).toBe(1);
  expect(counts.finance).toBe(25);
  expect(checks).toHaveLength(25);
  expect(external).toEqual([]);
  await info.attach('finance-profiles', { contentType: 'application/json', body: JSON.stringify({ checks, counts, external }) });
});

test('cash-flow roots, currency scales, loan ledgers, and markup survive the complete UI', async ({ page }) => {
  await page.goto('/');
  await selectModule(page, 'financial', 'en');
  await button(page, en.finance.labels.example).click();
  const financial = JSON.parse((await proof(page, 'en')).result);
  expect(financial.roots.map((value: { rate: string }) => Number(value.rate))).toEqual([0.1, 0.2]);
  await selectModule(page, 'loans', 'en');
  await button(page, en.finance.labels.example).click();
  await field(page, 'rate').fill('0');
  const loans = JSON.parse((await proof(page, 'en')).result);
  expect(loans.rows).toHaveLength(3);
  expect(Number(loans.rows.at(-1).balance_end)).toBe(0);
  await selectModule(page, 'business', 'en');
  await button(page, en.finance.labels.example).click();
  await page.getByRole('combobox', { name: en.finance.labels.currency, exact: true }).selectOption('JPY');
  const business = await proof(page, 'en');
  expect(business.units.currency).toBe('JPY');
  const price = JSON.parse(business.result);
  expect(Number(price.price)).toBe(125);
  expect(Number(price.margin)).toBe(0.2);
});

test('scenario differences exclude undefined percentages and replay exported drafts locally', async ({ page }) => {
  await page.goto('/');
  await selectModule(page, 'investment', 'en');
  await button(page, en.finance.labels.example).click();
  await field(page, 'initial').fill('0');
  await field(page, 'contribution').fill('0');
  await proof(page, 'en');
  await button(page, en.finance.labels.save_scenario).click();
  await field(page, 'initial').fill('1000');
  await proof(page, 'en');
  await button(page, en.finance.labels.save_scenario).click();
  const scenarios = page.getByTestId('finance-scenarios');
  await scenarios.locator('summary').click();
  await scenarios.getByRole('combobox', { name: en.finance.labels.reference, exact: true }).selectOption('1');
  await scenarios.getByRole('combobox', { name: en.finance.labels.alternative, exact: true }).selectOption('2');
  await scenarios.locator('[data-metric="final_balance"]').click();
  await expect(scenarios.locator('.finance-delta')).toContainText(en.finance.labels.relative_difference);
  await expect(scenarios.locator('.finance-delta dd').last()).toHaveText('—');
  const [download] = await Promise.all([page.waitForEvent('download'), button(page, en.finance.labels.export_scenarios).click()]);
  const bytes = await readFile(await download.path());
  await scenarios.locator('input[type=file]').setInputFiles({ name: 'scenarios.json', mimeType: 'application/json', buffer: bytes });
  await expect(scenarios.locator('li')).toHaveCount(4);
  await expect(scenarios.getByRole('combobox', { name: en.finance.labels.reference, exact: true })).toHaveValue('3');
  await expect(scenarios.getByRole('combobox', { name: en.finance.labels.alternative, exact: true })).toHaveValue('4');
  await scenarios.locator('li').last().getByRole('button', { name: en.finance.labels.edit_scenario }).click();
  await expect(field(page, 'initial')).toHaveValue('1000');
});

test('business projections expose sensitivity and later pages', async ({ page }) => {
  await page.goto('/');
  await selectModule(page, 'business', 'en');
  await option(page).selectOption('plan');
  await button(page, en.finance.labels.example).click();
  await field(page, 'sensitivity_step').fill('0.10');
  await field(page, 'page_start').fill('2');
  await field(page, 'page_size').fill('1');
  const budget = JSON.parse((await proof(page, 'en')).result);
  expect(budget.sensitivity).not.toBeNull();
  expect(budget.rows).toHaveLength(1);
  expect(budget.rows[0].period).toBe(2);
});

test('dated flows keep monetary values paired through reorder and deletion', async ({ page }) => {
  await page.goto('/');
  await selectModule(page, 'financial', 'en');
  await option(page).selectOption('npv');
  await button(page, en.finance.labels.example).click();
  for (const [index, date] of ['2026-01-01', '2026-04-10', '2027-02-01'].entries()) {
    await field(page, `flows.${index}.date`).fill(date);
  }
  const rows = page.getByRole('group', { name: en.finance.labels.flows, exact: true }).locator('.finance-row');
  await rows.nth(2).getByRole('button', { name: en.finance.labels.move_up, exact: true }).click();
  await rows.nth(2).getByRole('button', { name: en.finance.labels.remove_row, exact: true }).click();
  expect(JSON.parse((await proof(page, 'en')).normalized)).toMatchObject({
    flows: ['-100', '-132'], dates: ['2026-01-01', '2027-02-01'],
  });
});

test('the narrow RTL finance workspace keeps forms and ledger accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await selectLanguage(page, 'ar');
  await selectModule(page, 'loans', 'ar');
  await button(page, ar.finance.labels.example).click();
  await proof(page, 'ar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const results = await new AxeBuilder({ page }).include('.finance-workspace')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map(({ id }) => id)).toEqual([]);
});

test('mixed-source fields survive digit paste, module suspension and preference reset', async ({ page }) => {
  await page.goto('/');
  await selectLanguage(page, 'pt-BR');
  await selectModule(page, 'investment', 'pt-BR');
  await button(page, pt.finance.labels.example).click();
  await field(page, 'rate').fill('0,025');
  await selectLanguage(page, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await field(page, 'contribution').fill('');
  await field(page, 'contribution').fill('١٠٠٫٥');
  const baseline = await proof(page, 'ar');
  expect(JSON.parse(baseline.normalized)).toMatchObject({ rate: '0.025', contribution: '100.5' });
  const original = JSON.parse(baseline.expression);
  expect(original.rate.locale).toBe('pt-BR');
  expect(original.contribution.locale).toBe('ar');
  await selectModule(page, 'loans', 'ar');
  await selectModule(page, 'investment', 'ar');
  await expect(field(page, 'contribution')).toHaveValue('١٠٠٫٥');
  expect(await proof(page, 'ar')).toEqual(baseline);
  await page.getByText(ar.operations.operations, { exact: true }).click();
  await button(page, ar.operations.clearPreferences).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await proof(page, 'en')).toEqual(baseline);
});
