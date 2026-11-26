import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LOCALES } from '../src/i18n';
import type { Locale, Messages } from '../src/i18n';
import type { CalculationProof } from '../src/calculation-proof';
import { scienceModules } from '../src/science-modules';
import type { CalculationScienceModule, ScienceModule } from '../src/science-modules';
import { distributions, scienceOperations } from '../src/science-forms';
import en from '../src/locales/en.json' with { type: 'json' };
import pt from '../src/locales/pt-BR.json' with { type: 'json' };
import zh from '../src/locales/zh-CN.json' with { type: 'json' };
import hi from '../src/locales/hi.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };
import ar from '../src/locales/ar.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const messages: Record<Locale, Messages> = { en, 'pt-BR': pt, 'zh-CN': zh, hi, es, ar, fr };
const languages = Object.keys(LOCALES) as Locale[];
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const output = (page: Page) => page.getByTestId('science-result');
const field = (page: Page, key: string) => page.locator('[data-science-field="' + key + '"]');
const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

type Request = { module: string; operation: string; input: string; options: Record<string, unknown> };
type Exchange = { request: Request; proof?: CalculationProof; error?: string };
declare global { interface Window { darsScienceExchanges: Exchange[] } }

async function observe(page: Page) {
  await page.addInitScript(() => {
    const origin = window.Worker;
    window.darsScienceExchanges = [];
    window.Worker = class extends origin {
      private exchange?: Exchange;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', ({ data }) => {
          if (this.exchange && data.ok === true && data.proof) this.exchange.proof = data.proof;
          if (this.exchange && data.ok === false && typeof data.code === 'string') this.exchange.error = data.code;
        });
      }
      postMessage(message: Request, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (typeof message?.input === 'string' && typeof message.operation === 'string') {
          this.exchange = { request: structuredClone(message) };
          window.darsScienceExchanges.push(this.exchange);
        }
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    };
  });
}

async function language(page: Page, locale: Locale) {
  const settings = page.locator('details.settings');
  if (await settings.getAttribute('open') === null) await settings.locator('summary').click();
  await settings.locator('select').first().selectOption(locale);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await settings.locator('summary').click();
}

async function open(page: Page, module: ScienceModule, locale: Locale = 'en') {
  const labels = messages[locale];
  const picker = page.getByRole('combobox', { name: labels.operations.modulePicker, exact: true });
  await picker.selectOption(module);
  if (module === 'data-lab') await expect(page.getByTestId('data-lab-example')).toBeVisible();
  else await expect(page.getByRole('region', { name: labels.science.modules[module].title, exact: true })).toBeVisible();
}

async function run(page: Page, module: CalculationScienceModule) {
  const count = await page.evaluate(() => window.darsScienceExchanges.length);
  await page.getByTestId('science-run').click();
  await expect.poll(() => page.evaluate((index) => {
    const reply = window.darsScienceExchanges[index];
    return reply?.proof?.module ?? reply?.error;
  }, count)).toBe(module);
  const exchange = await page.evaluate((index) => window.darsScienceExchanges[index]!, count);
  expect(exchange.proof).toBeTruthy();
  await expect(output(page)).toHaveAttribute('data-canonical', exchange.proof!.result);
  return { request: exchange.request, proof: exchange.proof!, result: JSON.parse(exchange.proof!.result) };
}

async function dataProof(page: Page) {
  await page.getByTestId('data-lab-run').click();
  const exportProof = page.getByTestId('data-lab-proof-export');
  await expect(exportProof).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), exportProof.click()]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  return exported.proof ?? exported;
}

const fixtureField: Record<CalculationScienceModule, [string, string]> = {
  statistics: ['values', '1.5 2.5 3.5'],
  probability: ['x', '0.5'],
  simulation: ['samples', '40'],
  optimization: ['expression', 'x^2-2.25'],
  'physics-engineering': ['voltage', '12.5'],
  'graph-lab': ['expressions', 'sin(x)+0.5\ncos(x)'],
};

function inNotation(value: string, locale: Locale) {
  const notation = new Intl.NumberFormat(LOCALES[locale].format, { useGrouping: false });
  const decimal = notation.formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
  return value.replaceAll('.', decimal).replace(/[0-9]/gu, (digit) => notation.format(Number(digit)));
}

for (const source of languages) {
  for (const target of languages) {
    if (source === target) continue;
    test('science notation ' + source + ' → ' + target + ' preserves seven canonical results and proofs', async ({ page, browser }, info) => {
      test.setTimeout(90_000);
      await observe(page);
      await page.goto('/');
      await language(page, source);
      const retained = new Map<ScienceModule, unknown>();
      for (const module of scienceModules) {
        await open(page, module, source);
        if (module === 'data-lab') {
          await page.getByTestId('data-lab-example').click();
          retained.set(module, await dataProof(page));
        } else {
          await page.getByTestId('science-example').click();
          const [id, original] = fixtureField[module];
          await field(page, id).fill(inNotation(original, source));
          const { request, proof } = await run(page, module);
          retained.set(module, { request, proof });
        }
      }
      await language(page, target);
      const checks = [];
      for (const module of scienceModules) {
        await open(page, module, target);
        let replay;
        if (module === 'data-lab') replay = await dataProof(page);
        else {
          const [id, original] = fixtureField[module];
          await expect(field(page, id)).toHaveValue(inNotation(original, source));
          const { request, proof } = await run(page, module);
          replay = { request, proof };
        }
        expect(replay).toEqual(retained.get(module));
        checks.push({ module, proofSha256: sha256(replay) });
      }
      await info.attach('science-locale-transition', {
        contentType: 'application/json',
        body: JSON.stringify({ source, target, checks, browser: browser.version() }),
      });
    });
  }
}

test('scientific workspace proves sample conventions, analytic probability, optimization and dimensions', async ({ page }, info) => {
  test.setTimeout(120_000);
  await observe(page);
  await page.goto('/');
  await open(page, 'statistics');
  expect((await run(page, 'statistics')).result).toMatchObject({ mean: 3, median: 3, variance: 2.5 });
  await field(page, 'options.population').selectOption('true');
  expect((await run(page, 'statistics')).result.variance).toBe(2);
  await field(page, 'values').fill('10000000000000001 10000000000000002 10000000000000003');
  expect((await run(page, 'statistics')).result.variance).toBeCloseTo(2 / 3, 15);
  await open(page, 'probability');
  expect((await run(page, 'probability')).result.point.cdf).toBeCloseTo(0.5, 15);
  await field(page, 'distribution').selectOption('binomial');
  await field(page, 'x').fill('5');
  expect((await run(page, 'probability')).result.point.mass).toBeCloseTo(0.24609375, 15);
  await open(page, 'optimization');
  expect((await run(page, 'optimization')).result.point[0]).toBeCloseTo(Math.sqrt(2), 7);
  await page.getByTestId('science-operation').selectOption('minimize_univariate');
  const minimum = (await run(page, 'optimization')).result;
  expect(minimum.point[0]).toBeCloseTo(3, 6);
  expect(minimum.value).toBeCloseTo(2, 8);
  await open(page, 'physics-engineering');
  const electrical = (await run(page, 'physics-engineering')).result;
  expect(electrical.values).toMatchObject({ current: { value: '2', unit: 'A' }, power: { value: '24', unit: 'W' } });
  await info.attach('science-examples', { contentType: 'application/json', body: JSON.stringify({ electrical, minimum }) });
  await page.screenshot({ path: info.outputPath('science-ohm.png'), fullPage: true });
  const examples: { module: string; operation: string; proofSha256: string }[] = [];
  for (const module of scienceModules) {
    if (module === 'data-lab') continue;
    await open(page, module);
    for (const operation of scienceOperations[module]) {
      await test.step(module + ' · ' + operation.id, async () => {
        await page.getByTestId('science-operation').selectOption(operation.id);
        await page.getByTestId('science-example').click();
        const { proof } = await run(page, module);
        expect(proof.operation).toBe(operation.id);
        examples.push({ module, operation: operation.id, proofSha256: sha256(proof) });
        if (operation === scienceOperations[module][0]) {
          if (module === 'graph-lab' || module === 'probability' || module === 'simulation') {
            await expect(page.getByTestId('science-canvas')).toHaveAttribute('data-draws', /^[1-9]/u);
          }
          await page.screenshot({ path: info.outputPath('workspace-' + module + '.png'), fullPage: true });
        }
      });
    }
  }
  await open(page, 'probability');
  await page.getByTestId('science-operation').selectOption('distribution');
  await page.locator('.science-advanced summary').click();
  await field(page, 'lower').fill('');
  await field(page, 'upper').fill('');
  await field(page, 'probability').fill('');
  for (const id of Object.keys(distributions)) {
    await test.step('distribution · ' + id, async () => {
      await field(page, 'distribution').selectOption(id);
      const { result, proof } = await run(page, 'probability');
      expect(result.distribution).toBe(id);
      examples.push({ module: 'probability', operation: id, proofSha256: sha256(proof) });
    });
  }
  await info.attach('science-form-examples', { contentType: 'application/json', body: JSON.stringify(examples) });
});

test('Graph Lab draws real discontinuous curves and 3D surfaces, responds to the camera and exports locally', async ({ page }, info) => {
  await observe(page);
  await page.goto('/');
  await open(page, 'graph-lab');
  await field(page, 'expressions').fill('1/x\nsin(x)');
  const data = (await run(page, 'graph-lab')).result;
  expect(data.series).toHaveLength(2);
  expect(data.series[0].points).toContain(null);
  const canvas = page.getByTestId('science-canvas');
  await expect(canvas).toHaveAttribute('data-draws', /^[1-9]/u);
  const originalDraws = Number(await canvas.getAttribute('data-draws'));
  await button(page, en.science.labels.zoom_in).click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-draws'))).toBeGreaterThan(originalDraws);
  await page.getByTestId('science-operation').selectOption('surface');
  const surface = await run(page, 'graph-lab');
  expect(surface.result.grid.z.length).toBeGreaterThan(7);
  await expect(canvas).toHaveAttribute('data-draws', /^[1-9]/u);
  const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await button(page, en.science.labels.rotate).click();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(before);
  await canvas.evaluate((element) => element.dispatchEvent(new Event('contextlost')));
  await expect(page.getByTestId('science-chart')).toContainText(en.science.labels.context_lost);
  await canvas.evaluate((element) => element.dispatchEvent(new Event('contextrestored')));
  await expect(page.getByTestId('science-chart')).toContainText(en.science.labels.inspect_hint);
  const inspector = page.getByRole('slider', { name: en.science.labels.plot_point, exact: false });
  await inspector.press('ArrowRight');
  await expect(inspector).toHaveValue('1');
  await page.getByText(en.operations.operations, { exact: true }).click();
  const profile = page.getByRole('combobox', { name: en.operations.selection, exact: true });
  const profiles = ['ultra_light', 'efficiency', 'balanced', 'performance', 'maximum'];
  for (const mode of profiles) {
    await profile.selectOption(mode);
    await expect(page.locator('main')).toHaveAttribute('data-profile', mode);
    await expect(output(page)).toHaveAttribute('data-canonical', surface.proof.result);
    if (mode === 'ultra_light') await expect(canvas).toHaveAttribute('data-detail', 'reduced');
  }
  await page.getByText(en.operations.operations, { exact: true }).click();
  for (const [key, filename] of [['export_png', 'dars-graph.png'], ['export_graph_csv', 'dars-graph-data.csv']] as const) {
    const [download] = await Promise.all([page.waitForEvent('download'), button(page, en.science.labels[key]).click()]);
    expect(download.suggestedFilename()).toBe(filename);
    expect((await readFile(await download.path())).length).toBeGreaterThan(300);
  }
  await info.attach('graph-adaptive-ui', { contentType: 'application/json', body: JSON.stringify({
    profiles, proofSha256: sha256(surface.proof), contextRecoveryEvent: true, keyboardInspection: true,
  }) });
  await page.screenshot({ path: info.outputPath('science-graph-3d.png'), fullPage: true });
  await open(page, 'statistics');
  await expect(canvas).toHaveCount(0);
});

test('simulation emits real monotone progress, releases a cancelled Worker and replays the same sample', async ({ page }) => {
  await observe(page);
  await page.addInitScript(() => {
    const parent = window.Worker;
    const state = { active: 0, terminations: 0, progress: [] as number[], block: true };
    Object.assign(window, { darsSimulationProbe: state });
    window.Worker = class extends parent {
      private owned = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('tool-simulation-worker')) return;
        state.active++;
        this.owned = true;
        this.addEventListener('message', (event) => {
          if (event.data.type === 'progress') state.progress.push(event.data.completed);
          else if (state.block) event.stopImmediatePropagation();
        });
      }
      terminate() {
        if (this.owned) { this.owned = false; state.active--; state.terminations++; }
        super.terminate();
      }
    };
  });
  type Probe = { active: number; terminations: number; progress: number[]; block: boolean };
  const state = () => page.evaluate(() => (window as unknown as { darsSimulationProbe: Probe }).darsSimulationProbe);
  await page.goto('/');
  await open(page, 'simulation');
  await page.getByTestId('science-run').click();
  await expect.poll(async () => (await state()).progress.length).toBeGreaterThan(1);
  await expect(page.getByRole('progressbar')).toBeVisible();
  await page.getByTestId('science-cancel').click();
  await expect.poll(async () => (await state()).terminations).toBe(1);
  expect((await state()).active).toBe(0);
  await page.evaluate(() => { (window as unknown as { darsSimulationProbe: Probe }).darsSimulationProbe.block = false; });
  const first = await run(page, 'simulation');
  const second = await run(page, 'simulation');
  expect(second.proof).toEqual(first.proof);
  expect((await state()).active).toBe(0);
  await expect(page.getByTestId('science-canvas')).toBeVisible();
});

test('scientific labels keep their mathematical meaning in all seven languages', async ({ page }, info) => {
  test.setTimeout(90_000);
  await observe(page);
  await page.goto('/');
  expect(en.science.labels.method).toBe('Method');
  expect(pt.science.labels.method).toBe('Método');
  expect(en.science.labels.probability).toBe('Probability');
  expect(pt.science.labels.probability).toBe('Probabilidade');
  expect(en.science.labels.sample_values).toBe('Sample');
  expect(pt.science.labels.sample_values).toBe('Amostra');
  const reading = (key: string) => output(page).locator('[data-science-reading="' + key + '"]');

  for (const locale of languages) {
    const terms = messages[locale].science.labels;
    await test.step(locale, async () => {
      await language(page, locale);
      await open(page, 'statistics', locale);
      await page.getByTestId('science-operation').selectOption('descriptive');
      await page.getByTestId('science-example').click();
      expect((await run(page, 'statistics')).result.population).toBe(false);
      const convention = reading('population').locator('xpath=following-sibling::dd');
      await expect(convention).toHaveText(terms.sample_values);
      await expect(reading('probability')).toHaveText(terms.probability);
      await field(page, 'options.population').selectOption('true');
      expect((await run(page, 'statistics')).result.population).toBe(true);
      await expect(convention).toHaveText(terms.population_values);
      await page.getByTestId('science-operation').selectOption('chi_square_independence');
      await expect(page.getByRole('textbox', { name: terms.contingency_table, exact: true })).toBeVisible();

      await open(page, 'probability', locale);
      await page.getByTestId('science-example').click();
      await run(page, 'probability');
      await expect(reading('probability')).toHaveText([terms.probability, terms.probability]);
      await expect(reading('density')).toHaveText(terms.density_probability);
      await page.locator('.science-advanced summary').click();
      await expect(page.getByRole('textbox', { name: terms.quantile_probability, exact: true })).toBeVisible();
      await field(page, 'distribution').selectOption('gamma');
      await expect(page.getByRole('textbox', { name: terms.rate_parameter, exact: true })).toBeVisible();

      await open(page, 'simulation', locale);
      await page.getByTestId('science-example').click();
      await field(page, 'samples').fill('64');
      await run(page, 'simulation');
      await expect(reading('method')).toHaveText([terms.method, terms.method]);
      await expect(reading('level')).toHaveText([terms.confidence_level, terms.confidence_level]);
      await expect(output(page).getByText(terms.clt_normal, { exact: true })).toBeVisible();
      await expect(output(page).getByText(terms.wilson, { exact: true })).toBeVisible();
      await field(page, 'model').selectOption('random_walk');
      await expect(page.getByRole('textbox', { name: terms.starting_value, exact: true })).toBeVisible();
      await field(page, 'model').selectOption('finance');
      await expect(page.getByRole('textbox', { name: terms.initial_wealth, exact: true })).toBeVisible();

      await open(page, 'optimization', locale);
      await page.getByTestId('science-operation').selectOption('newton');
      await expect(page.getByRole('textbox', { name: terms.initial_estimate, exact: true })).toBeVisible();

      await open(page, 'physics-engineering', locale);
      await page.getByTestId('science-operation').selectOption('ideal_gas');
      await expect(page.getByRole('textbox', { name: terms.amount_of_substance, exact: true })).toBeVisible();
    });
  }
  await info.attach('science-label-locales', {
    contentType: 'application/json', body: JSON.stringify({ locales: languages, samplePopulation: true, probability: true,
      confidenceMethods: true, initialValues: true, rateParameter: true, contingencyTable: true }),
  });
});

test('all science workspace controls render at 320 pixels in Arabic with local-only requests', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const remote: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') remote.push(url.origin);
  });
  await page.goto('/');
  await language(page, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  for (const module of scienceModules) {
    await open(page, module, 'ar');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
  await open(page, 'statistics', 'ar');
  for (const theme of ['dark', 'light', 'oled']) {
    const settings = page.locator('details.settings');
    await settings.locator('summary').click();
    await settings.getByRole('combobox', { name: ar.appearance, exact: true }).selectOption(theme);
    await settings.locator('summary').click();
    expect((await new AxeBuilder({ page }).include('.science-workspace')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  expect(remote).toEqual([]);
  await page.screenshot({ path: info.outputPath('science-rtl-320.png'), fullPage: true });
});

test('science engines load on demand and all seven science workspaces calculate after an offline reload', async ({ page, context }, info) => {
  await observe(page);
  const assets = new Set<string>();
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4174') assets.add(url.pathname);
    else if (url.protocol.startsWith('http')) external.push(url.origin);
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect([...assets].filter((path) => /\/assets\/(?:science-|data-lab-|tool-(?:statistics|simulation|optimization|physics-engineering|graph-lab|probability)-|dars_tool_wasm)/u.test(path))).toEqual([]);
  const samples = new Map<ScienceModule, string>();
  for (const module of scienceModules) {
    await open(page, module);
    if (module === 'data-lab') await page.getByTestId('data-lab-example').click();
    samples.set(module, module === 'data-lab' ? sha256(await dataProof(page)) : sha256((await run(page, module)).proof));
    if (module === 'data-lab') await page.screenshot({ path: info.outputPath('workspace-data-lab.png'), fullPage: true });
  }
  await context.setOffline(true);
  const navigation = await page.reload();
  expect(navigation?.fromServiceWorker()).toBe(true);
  for (const module of scienceModules) {
    await open(page, module);
    if (module === 'data-lab') await page.getByTestId('data-lab-example').click();
    expect(module === 'data-lab' ? sha256(await dataProof(page)) : sha256((await run(page, module)).proof)).toBe(samples.get(module));
  }
  expect(external).toEqual([]);
  await info.attach('science-offline', { contentType: 'application/json',
    body: JSON.stringify({ modules: Array.from(samples.keys()), proofHashes: [...samples], external }) });
});
