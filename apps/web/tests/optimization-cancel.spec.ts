import { expect, test } from '@playwright/test';

const constraints = [
  '214 298 181 = 1353', '148 591 742 = 3556', '126 174 278 = 1308',
  '438 213 578 = 2598', '749 787 306 = 3241', '631 480 36 = 1699',
  '878 146 613 = 3009', '52 923 514 = 3440', '469 60 125 = 964',
  '709 887 144 = 2915', '104 350 628 = 2688', '627 837 901 = 5004',
].join('\n');

type Probe = { sent: number; replies: number; terminated: number };

test('cancels a dispatched exact LP worker and solves a successor optimization', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const probe: Probe = { sent: 0, replies: 0, terminated: 0 };
    Object.assign(window, { darsOptimizationProbe: probe });
    window.Worker = class extends NativeWorker {
      private isLinearProgram = false;

      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', () => {
          if (this.isLinearProgram) probe.replies++;
        });
      }

      postMessage(message: { module?: string; operation?: string }, transfer?: Transferable[] | StructuredSerializeOptions) {
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
        if (message?.module === 'optimization' && message.operation === 'linear_program') {
          this.isLinearProgram = true;
          probe.sent++;
        }
      }

      terminate() {
        if (this.isLinearProgram) probe.terminated++;
        super.terminate();
      }
    };
  });
  const probe = () => page.evaluate(() => (window as unknown as { darsOptimizationProbe: Probe }).darsOptimizationProbe);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Module', exact: true }).selectOption('optimization');
  const operation = page.getByTestId('science-operation');
  await operation.selectOption('linear_program');
  await page.locator('[data-science-field="objective"]').fill('1 2 3');
  await page.locator('[data-science-field="constraints"]').fill(constraints);

  const run = page.getByTestId('science-run');
  const cancel = page.getByTestId('science-cancel');
  const output = page.getByTestId('science-result');
  await run.click();
  await page.waitForFunction(() => (window as unknown as { darsOptimizationProbe: Probe }).darsOptimizationProbe.sent === 1);
  await cancel.click({ force: true });
  expect(await probe()).toEqual({ sent: 1, replies: 0, terminated: 1 });
  await expect(output).not.toHaveAttribute('data-canonical', /.+/u);

  await operation.selectOption('bisection');
  await page.getByTestId('science-example').click();
  await run.click();
  await expect(output).toHaveAttribute('data-canonical', /"status":"converged"/u);
  const answer = JSON.parse((await output.getAttribute('data-canonical'))!);
  expect(answer.point[0]).toBeCloseTo(Math.sqrt(2), 7);
  expect(await probe()).toEqual({ sent: 1, replies: 0, terminated: 1 });
});
