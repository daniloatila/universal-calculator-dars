import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { proofLabels } from '../src/calculation-proof-labels';
import { button, catalogs, currencySource, digitsIn, fixtures, languages, resultFor, select, textbox } from './fixtures/locale-transition';
import type { Language } from './fixtures/locale-transition';

type Request = {
  id?: number;
  type?: string;
  module?: string;
  operation?: string;
  input: string;
  original_input?: string;
  originalExpression?: string;
  options?: Record<string, unknown>;
};

type RecordValue = {
  module: string;
  operation: string;
  expression: string;
  normalized: string;
  result: string;
  options: Record<string, unknown>;
};

type Reply = { ok: true; proof: RecordValue } | { ok: false; code: string };
type Exchange = { request: Request; reply?: Reply };

interface Probe {
  exchanges: Exchange[];
  hold: boolean;
  held: boolean;
  release: (() => void) | undefined;
}

declare global { interface Window { localeTransitionProbe: Probe } }

async function observeWorkers(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = { exchanges: [], hold: false, held: false, release: undefined };
    window.localeTransitionProbe = probe;
    const Original = window.Worker;
    window.Worker = class extends Original {
      private current: Exchange | undefined;

      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', ({ data }) => {
          if (this.current && data.type === 'result') this.current.reply = data.result;
          if (this.current && typeof data.ok === 'boolean') this.current.reply = data;
        });
      }

      postMessage(message: Request, options?: StructuredSerializeOptions | Transferable[]) {
        const send = () => {
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
        };
        if (typeof message?.input === 'string') {
          this.current = { request: structuredClone(message) };
          probe.exchanges.push(this.current);
          if (probe.hold) {
            probe.hold = false;
            probe.held = true;
            probe.release = send;
            return;
          }
        }
        send();
      }
    };
  });
}

const settings = (page: Page) => page.locator('details.settings');

async function changeLanguage(page: Page, language: Language) {
  const menu = settings(page);
  if (!await menu.evaluate((element) => (element as HTMLDetailsElement).open)) await menu.locator('summary').click();
  await menu.locator('select').first().selectOption(language);
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await menu.locator('summary').click();
}

async function openModule(page: Page, language: Language, module: string) {
  const messages = catalogs[language];
  const navigation = page.getByRole('navigation', { name: messages.tools.navigation, exact: true });
  await select(navigation, messages.operations.modulePicker).selectOption(module);
  await expect(page.locator('main')).toHaveAttribute('data-module-id', module);
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'active');
  await expect(resultFor(page, module)).toBeVisible();
}

function exchanges(page: Page) {
  return page.evaluate(() => window.localeTransitionProbe.exchanges);
}

async function readExchange(page: Page, index: number) {
  await expect.poll(async () => (await exchanges(page))[index]?.reply, { message: `worker reply for submission ${index + 1}` }).toBeDefined();
  return (await exchanges(page))[index] as Exchange & { reply: Reply };
}

async function submit(page: Page, language: Language) {
  const index = (await exchanges(page)).length;
  await button(page, catalogs[language].calculate).click();
  return readExchange(page, index);
}

function proofOf(exchange: Exchange) {
  const reply = exchange.reply;
  if (!reply?.ok) throw new Error(`Expected a real engine result for ${exchange.request.input}. Received ${JSON.stringify(reply)}.`);
  if (!reply.proof) throw new Error(`No calculation proof returned for ${exchange.request.input}.`);
  return reply.proof;
}

function requestContent(request: Request) {
  return Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'id'));
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

for (const source of languages) {
  for (const target of languages) {
    if (source === target) continue;
    test(`locale matrix ${source} → ${target}: all ten mathematical requests and proofs are invariant`, async ({ page, browser }, testInfo) => {
      test.setTimeout(90_000);
      await observeWorkers(page);
      await page.goto('/');
      await changeLanguage(page, source);

      const prior = new Map<string, Exchange>();
      for (const fixture of fixtures) {
        await test.step(`enter and evaluate ${fixture.module} in ${source}`, async () => {
          await openModule(page, source, fixture.module);
          await fixture.fill(page, source);
          const baseline = await submit(page, source);
          const proof = proofOf(baseline);
          expect(baseline.request.input).toBe(fixture.input);
          if (fixture.options) expect(baseline.request.options).toMatchObject(fixture.options);
          expect(proof).toMatchObject({ operation: fixture.operation, result: fixture.result });
          if (fixture.module !== 'standard') await expect(resultFor(page, fixture.module)).toHaveAttribute('data-canonical', fixture.result);
          prior.set(fixture.module, baseline);
        });
      }

      await changeLanguage(page, target);
      expect(await exchanges(page)).toHaveLength(fixtures.length);
      const modules = [];
      for (const fixture of fixtures) {
        const row = await test.step(`retained ${fixture.module} without editing in ${target}`, async () => {
          await openModule(page, target, fixture.module);
          if (fixture.module !== 'standard') await expect(resultFor(page, fixture.module)).toHaveAttribute('data-canonical', fixture.result);
          const before = prior.get(fixture.module)!;
          const after = await submit(page, target);
          const firstProof = proofOf(before);
          const lastProof = proofOf(after);
          expect(requestContent(after.request)).toEqual(requestContent(before.request));
          expect(lastProof).toEqual(firstProof);
          if (fixture.module !== 'standard') await expect(resultFor(page, fixture.module)).toHaveAttribute('data-canonical', fixture.result);
          return {
            module: fixture.module,
            operation: fixture.operation,
            normalized: lastProof.normalized,
            result: lastProof.result,
            requestSha256: digest(requestContent(after.request)),
            proofSha256: digest(lastProof),
          };
        });
        modules.push(row);
      }
      expect(await exchanges(page)).toHaveLength(fixtures.length * 2);
      const report = { source, target, browser: { channel: testInfo.project.use.channel ?? 'bundled', version: browser.version() }, modules };
      await testInfo.attach('locale-transition-pair', {
        contentType: 'application/json', body: JSON.stringify({ ...report, pairSha256: digest(report) }),
      });
    });
  }
}

test('language changes before first evaluation and during a held real request preserve Scientific notation and portable proof', async ({ page }) => {
  await observeWorkers(page);
  await page.goto('/');
  await openModule(page, 'en', 'scientific');
  await textbox(page, catalogs.en.expression).fill('log(8,2)');
  await changeLanguage(page, 'pt-BR');
  await expect(textbox(page, catalogs['pt-BR'].expression)).toHaveValue('log(8,2)');
  await expect(page.locator('.input-notation').getByText('English', { exact: true })).toBeVisible();
  expect(await exchanges(page)).toHaveLength(0);

  await page.evaluate(() => { window.localeTransitionProbe.hold = true; });
  await button(page, catalogs['pt-BR'].calculate).click();
  await expect.poll(() => page.evaluate(() => window.localeTransitionProbe.held)).toBe(true);
  await changeLanguage(page, 'ar');
  await expect(button(page, catalogs.ar.calculate)).toBeDisabled();
  await page.evaluate(() => { window.localeTransitionProbe.release?.(); });
  const baseline = await readExchange(page, 0);
  expect(baseline.request).toMatchObject({ input: 'log(8,2)' });
  expect(proofOf(baseline)).toMatchObject({ expression: 'log(8,2)', result: '3' });
  await expect(resultFor(page, 'scientific')).toHaveAttribute('data-canonical', '3');

  const panel = page.locator('details.calculation-proof');
  await panel.locator('summary').click();
  const download = async (language: Language) => {
    const [file] = await Promise.all([page.waitForEvent('download'), button(page, proofLabels[language].exportFile).click()]);
    return readFile(await file.path());
  };
  const before = await download('ar');
  expect(JSON.parse(before.toString('utf8'))).toMatchObject({ expression: 'log(8,2)', expression_locale: 'en', result: '3' });
  await changeLanguage(page, 'en');
  expect(await exchanges(page)).toHaveLength(1);
  expect(await download('en')).toEqual(before);
});

test('an explicitly suspended Scientific draft survives language changes, preference reset and warm offline catalogs', async ({ page, context }) => {
  await observeWorkers(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await openModule(page, 'en', 'scientific');
  await changeLanguage(page, 'pt-BR');
  await textbox(page, catalogs['pt-BR'].expression).fill('log(8,2)');
  const decimalLog = await submit(page, 'pt-BR');
  expect(decimalLog.request.input).toBe('log(8.2)');
  expect(proofOf(decimalLog).result).toMatch(/^0\.913813852/u);
  await changeLanguage(page, 'ar');
  await changeLanguage(page, 'hi');
  await changeLanguage(page, 'pt-BR');
  await expect.poll(() => page.evaluate(async () => {
    const keys = await caches.keys();
    const assets = (await Promise.all(keys.map(async (key) => (await caches.open(key)).keys()))).flat();
    return ['pt-BR', 'ar', 'hi'].every((locale) => assets.some((asset) => new RegExp(`/assets/${locale}-[\\w-]+\\.js$`, 'u').test(new URL(asset.url).pathname)));
  })).toBe(true);

  await button(page, catalogs['pt-BR'].operations.moduleSuspend).click();
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'suspended');
  await context.setOffline(true);
  await changeLanguage(page, 'ar');
  await changeLanguage(page, 'hi');
  await expect(page.locator('main')).toHaveAttribute('data-module-phase', 'suspended');
  await button(page, catalogs.hi.operations.moduleResume).click();
  await expect(textbox(page, catalogs.hi.expression)).toHaveValue('log(8,2)');
  const offline = await submit(page, 'hi');
  expect(requestContent(offline.request)).toEqual(requestContent(decimalLog.request));
  expect(proofOf(offline)).toEqual(proofOf(decimalLog));

  await page.locator('details.operations summary').click();
  await button(page, catalogs.hi.operations.clearPreferences).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(textbox(page, catalogs.en.expression)).toHaveValue('log(8,2)');
  const reset = await submit(page, 'en');
  expect(requestContent(reset.request)).toEqual(requestContent(decimalLog.request));
  expect(proofOf(reset)).toEqual(proofOf(decimalLog));
  await changeLanguage(page, 'pt-BR');
  expect(proofOf(await submit(page, 'pt-BR'))).toEqual(proofOf(decimalLog));
});

test('incomplete notation and an ambiguous civil time remain explicit errors across language changes', async ({ page }) => {
  await observeWorkers(page);
  await page.goto('/');
  await openModule(page, 'en', 'scientific');
  await textbox(page, catalogs.en.expression).fill('log(8,');
  await changeLanguage(page, 'pt-BR');
  await expect(textbox(page, catalogs['pt-BR'].expression)).toHaveValue('log(8,');
  const incomplete = await submit(page, 'pt-BR');
  expect(incomplete.request.input).toBe('log(8,');
  expect(incomplete.reply).toMatchObject({ ok: false });
  await expect(resultFor(page, 'scientific')).not.toHaveAttribute('data-canonical', /./u);
  await expect(page.getByText(catalogs['pt-BR'].invalidExpression, { exact: true })).toBeVisible();

  await openModule(page, 'pt-BR', 'date-time');
  const d = catalogs['pt-BR'].dateTime;
  await button(page, d.operations.timezone).click();
  await textbox(page, d.fields.local).fill('2024-11-03T01:30:00');
  const earlier = await submit(page, 'pt-BR');
  expect(earlier.reply).toEqual({ ok: false, code: 'ambiguous_local_time' });
  await expect(page.getByText(d.ambiguous, { exact: true })).toBeVisible();
  await changeLanguage(page, 'en');
  const later = await submit(page, 'en');
  expect(requestContent(later.request)).toEqual(requestContent(earlier.request));
  expect(later.reply).toEqual(earlier.reply);
  await expect(page.getByText(catalogs.en.dateTime.ambiguous, { exact: true })).toBeVisible();
});

test('independently edited currency amount retains the rate notation, dates and unmodified source text', async ({ page }) => {
  await observeWorkers(page);
  await page.goto('/');
  await changeLanguage(page, 'pt-BR');
  await openModule(page, 'pt-BR', 'converter');
  const currency = fixtures.find((fixture) => fixture.module === 'converter')!;
  await currency.fill(page, 'pt-BR');
  expect(proofOf(await submit(page, 'pt-BR')).result).toBe(currency.result);

  await changeLanguage(page, 'en');
  const c = catalogs.en.converter;
  const amount = textbox(page, c.amount);
  await expect(amount).toHaveValue('1,25');
  await expect(textbox(page, c.exchangeRate)).toHaveValue('2,5');
  await amount.clear();
  await amount.fill('1.5');
  const edited = await submit(page, 'en');
  expect(edited.request).toMatchObject({ input: '1.5', options: { rate: '2.5', source: currencySource, reference_date: '2024-01-31' } });
  expect(proofOf(edited).result).toBe('amount=15/4; status=within_validity');

  await changeLanguage(page, 'ar');
  const checked = await submit(page, 'ar');
  expect(requestContent(checked.request)).toEqual(requestContent(edited.request));
  expect(proofOf(checked)).toEqual(proofOf(edited));
  await expect(textbox(page, catalogs.ar.converter.rateSource)).toHaveValue(currencySource);
});

test('numeric set members and working-calendar dates preserve their grammar while malformed names remain invalid', async ({ page }) => {
  await observeWorkers(page);
  await page.goto('/');
  await changeLanguage(page, 'hi');
  await openModule(page, 'hi', 'discrete-mathematics');
  const d = catalogs.hi.discrete;
  await button(page, d.groups.sets).click();
  await button(page, d.operations.set_union).click();
  await textbox(page, d.fields.leftSet).fill('१२ alpha१');
  await textbox(page, d.fields.rightSet).fill('३');
  const malformed = await submit(page, 'hi');
  expect(malformed.request.input).toBe('12 alpha१|3');
  expect(malformed.reply).toEqual({ ok: false, code: 'invalid_input' });
  await changeLanguage(page, 'en');
  const repeated = await submit(page, 'en');
  expect(requestContent(repeated.request)).toEqual(requestContent(malformed.request));
  expect(repeated.reply).toEqual(malformed.reply);

  await changeLanguage(page, 'ar');
  await openModule(page, 'ar', 'date-time');
  const calendar = catalogs.ar.dateTime;
  await button(page, calendar.operations.business_days).click();
  await textbox(page, calendar.fields.start).fill(digitsIn('2024-01-08', 'ar'));
  await textbox(page, calendar.fields.end).fill(digitsIn('2024-01-15', 'ar'));
  await textbox(page, calendar.holidays).fill(digitsIn('2024-01-12', 'ar'));
  const counted = await submit(page, 'ar');
  expect(counted.request).toMatchObject({ input: '2024-01-08|2024-01-15', options: { weekdays: '1,2,3,4,5', holidays: '2024-01-12' } });
  expect(proofOf(counted).result).toBe('business_days=4');
  await changeLanguage(page, 'zh-CN');
  const next = await submit(page, 'zh-CN');
  expect(requestContent(next.request)).toEqual(requestContent(counted.request));
  expect(proofOf(next)).toEqual(proofOf(counted));
});
