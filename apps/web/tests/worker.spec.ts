import { expect, test } from '@playwright/test';

test('a hung production worker hits its deadline, terminates and restores calculation without reload', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const trace = { created: 0, terminated: 0, requests: 0 };
    Object.assign(window, { darsWorkerTrace: trace });

    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        trace.created++;
      }

      postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        trace.requests++;
        // Let the original worker initialize, but hold the first job indefinitely.
        if (trace.requests === 1) return;
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }

      terminate() {
        trace.terminated++;
        super.terminate();
      }
    };
  });

  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Expression', exact: true });
  const calculate = page.getByRole('button', { name: 'Calculate', exact: true });
  await input.fill('1+2');
  await calculate.click();
  await expect(page.getByText('Working…', { exact: true })).toBeVisible();
  await expect(page.getByText('The calculation took too long. Try a simpler expression.', { exact: true }))
    .toBeVisible({ timeout: 8_000 });

  await input.fill('2+3');
  await calculate.click();
  await expect(page.getByTestId('result')).toHaveText('5');
  const trace = await page.evaluate(() => Reflect.get(window, 'darsWorkerTrace'));
  expect(trace).toEqual({ created: 2, terminated: 1, requests: 2 });
});
