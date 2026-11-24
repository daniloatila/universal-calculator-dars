import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EvaluationRequest } from '../src/engine';

const result = (page: Page) => page.getByTestId('result');
const input = (page: Page) => page.locator('input[name=expression]');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function open(page: Page) {
  await page.goto('/');
  await input(page).fill('0');
  await expect(button(page, 'Calculate')).toBeEnabled();
}

async function calculate(page: Page, expression?: string, label = 'Calculate') {
  if (expression !== undefined) await input(page).fill(expression);
  await button(page, label).click();
}

async function memory(page: Page, name: string, expression: string) {
  await input(page).fill(expression);
  await button(page, name).click();
  await expect(button(page, name)).toBeEnabled();
}

test('MR immediately after M+ recalls an irrational absolute percentage without relative re-evaluation', async ({ page }) => {
  await open(page);
  await memory(page, 'Store in memory', '100');
  await memory(page, 'Add to memory', 'sqrt(2)%');
  await button(page, 'Recall memory').click();
  await expect(input(page)).toHaveValue(/^@\d+$/);
  await calculate(page);
  await expect(result(page)).toHaveText('100.014142135623730950488');
  await expect(page.getByText('Approximate', { exact: true })).toBeVisible();

  await button(page, 'Multiply').click();
  await button(page, '2').click();
  await calculate(page);
  await expect(result(page)).toHaveText('200.028284271247461900976');
  await calculate(page, '200+10%');
  await expect(result(page)).toHaveText('220');

  await memory(page, 'Store in memory', '200+10%');
  await input(page).fill('200+');
  await button(page, 'Recall memory').click();
  await calculate(page);
  await expect(result(page)).toHaveText('420');

  await memory(page, 'Store in memory', 'sqrt(2)%');
  await input(page).fill('100+');
  await button(page, 'Recall memory').click();
  await calculate(page);
  await expect(result(page)).toHaveText('100.014142135623730950488');
});

test('M−, negatives and large exact values survive recall, explicit percentages and powers', async ({ page }) => {
  await open(page);
  await button(page, 'Exact').click();
  await memory(page, 'Store in memory', '-3/7');
  await memory(page, 'Add to memory', '0.25%');
  await memory(page, 'Subtract from memory', '-2/7');
  await button(page, 'Recall memory').click();
  await expect(input(page)).toHaveValue('-393/2800');
  await calculate(page);
  await expect(result(page)).toHaveText('-393/2,800');

  await memory(page, 'Store in memory', '2/3');
  await button(page, 'Recall memory').click();
  await button(page, 'Power').click();
  await button(page, '2').click();
  await calculate(page);
  await expect(result(page)).toHaveText('4/9');
  await input(page).fill('300+');
  await button(page, 'Recall memory').click();
  await button(page, 'Percent').click();
  await calculate(page);
  await expect(result(page)).toHaveText('302');

  await memory(page, 'Store in memory', '2^1000');
  await memory(page, 'Add to memory', '1');
  await button(page, 'Recall memory').click();
  await expect(input(page)).toHaveValue(/^@\d+$/);
  await calculate(page);
  await expect(result(page)).toHaveText(new Intl.NumberFormat('en-US').format(2n ** 1000n + 1n));
  await button(page, 'Clear memory').click();
  await expect(button(page, 'Recall memory')).toBeDisabled();
});

test('a sequence of irrational additions preserves the original history value through MC, undo and locale change', async ({ page }) => {
  await open(page);
  await memory(page, 'Store in memory', '100');
  for (let index = 0; index < 20; index++) await memory(page, 'Add to memory', 'sqrt(2)%');
  await button(page, 'Recall memory').click();
  const reference = await input(page).inputValue();
  await calculate(page);
  await expect(result(page)).toHaveText('100.28284271247461900976');
  await button(page, 'Clear memory').click();
  await memory(page, 'Store in memory', '23');
  await button(page, `Use history expression: ${reference}`).click();
  await input(page).fill('9');
  await button(page, 'Undo').click();
  await expect(input(page)).toHaveValue(reference);
  await page.getByText('Settings', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('pt-BR');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.getByText('Configurações', { exact: true }).click();
  await calculate(page, undefined, 'Calcular');
  await expect(result(page)).toHaveText('100,28284271247461900976');
  await memory(page, 'Somar à memória', '0,5%');
  await button(page, 'Recuperar memória').click();
  await calculate(page, undefined, 'Calcular');
  await expect(result(page)).toHaveText('23,005');
});

type TestControl = {
  holdNext: EvaluationRequest['type'] | null;
  held: number;
  terminated: number;
  lateReply: (() => void) | null;
  release: (() => void) | null;
};
declare global { interface Window { darsTest: TestControl } }

async function interceptNextWorkerRequest(page: Page) {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const control: TestControl = { holdNext: null, held: 0, terminated: 0, lateReply: null, release: null };
    window.darsTest = control;
    window.Worker = class extends Original {
      postMessage(request: EvaluationRequest) {
        if (request.type !== control.holdNext) {
          super.postMessage(request);
          return;
        }
        control.holdNext = null;
        control.held++;
        const prior = this.onmessage;
        control.lateReply = () => prior?.call(this, new MessageEvent('message', {
          data: { type: 'result', id: request.id, result: { ok: true, exact: '999', approximate: '999', value: 'test-only' } },
        }));
        control.release = () => super.postMessage(request);
      }
      terminate() {
        control.terminated++;
        super.terminate();
      }
    };
  });
}

test('MC aborts a pending memory operation and late results cannot overwrite the next value', async ({ page }) => {
  await interceptNextWorkerRequest(page);
  await open(page);
  await memory(page, 'Store in memory', '100');
  await input(page).fill('sqrt(2)%');
  await page.evaluate(() => { window.darsTest.holdNext = 'combine'; });
  await button(page, 'Add to memory').click();
  await expect.poll(() => page.evaluate(() => window.darsTest.held)).toBe(1);
  await expect(button(page, 'Calculate')).toBeDisabled();
  await expect(button(page, 'Subtract from memory')).toBeDisabled();
  await button(page, 'Clear memory').click();
  await expect.poll(() => page.evaluate(() => window.darsTest.terminated)).toBe(1);

  await input(page).fill('23');
  await memory(page, 'Store in memory', '23');
  await page.evaluate(() => window.darsTest.lateReply?.());
  await button(page, 'Recall memory').click();
  await calculate(page);
  await expect(result(page)).toHaveText('23');

  await button(page, 'Clear memory').click();
  await input(page).fill('7');
  await page.evaluate(() => { window.darsTest.holdNext = 'evaluate'; });
  await button(page, 'Store in memory').click();
  await expect.poll(() => page.evaluate(() => window.darsTest.held)).toBe(2);
  await button(page, 'Clear memory').click();
  await page.evaluate(() => window.darsTest.lateReply?.());
  await expect(button(page, 'Recall memory')).toBeDisabled();
});

test('editing or explicitly cancelling rejects stale work and clearing history keeps it empty after an older result', async ({ page }) => {
  await interceptNextWorkerRequest(page);
  await open(page);
  await page.evaluate(() => { window.darsTest.holdNext = 'evaluate'; });
  await calculate(page, '6+6');
  await expect.poll(() => page.evaluate(() => window.darsTest.held)).toBe(1);
  await input(page).fill('4+4');
  await page.evaluate(() => window.darsTest.lateReply?.());
  await calculate(page);
  await expect(result(page)).toHaveText('8');
  await expect(button(page, 'Use history expression: 6+6')).toHaveCount(0);

  await page.evaluate(() => { window.darsTest.holdNext = 'evaluate'; });
  await calculate(page, '3+3');
  await expect.poll(() => page.evaluate(() => window.darsTest.held)).toBe(2);
  await button(page, 'Cancel calculation').click();
  await page.evaluate(() => window.darsTest.lateReply?.());
  await expect(button(page, 'Calculate')).toBeEnabled();
  await expect(button(page, 'Use history expression: 3+3')).toHaveCount(0);

  await page.evaluate(() => { window.darsTest.holdNext = 'evaluate'; });
  await calculate(page, '2+2');
  await expect.poll(() => page.evaluate(() => window.darsTest.held)).toBe(3);
  await button(page, 'Clear history').click();
  await page.evaluate(() => window.darsTest.release?.());
  await expect(result(page)).toHaveText('4');
  await expect(page.getByText('No calculations yet', { exact: true })).toBeVisible();
});
