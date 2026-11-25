import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MAX_CALCULATION_PROOF_BYTES, parseCalculationProofFile,
} from '../src/calculation-proof';
import { scientificRecord } from './fixtures/calculation-proof';

async function enterScientific(page: Page) {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Module', exact: true }).selectOption('scientific');
  const panel = page.locator('.calculation-proof');
  await panel.locator('summary').click();
  return panel;
}

test('a real Scientific result exports a versioned local calculation record and reopens it as an import', async ({ page }) => {
  const panel = await enterScientific(page);
  await page.getByRole('textbox', { name: 'Expression', exact: true }).fill('sin(90°)');
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(page.getByTestId('scientific-result')).toHaveAttribute('data-canonical', '1');
  await expect(panel.getByText('This calculation', { exact: true })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download JSON', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('dars-calculation-record.json');
  const bytes = await readFile(await download.path());
  const record = parseCalculationProofFile(bytes.toString('utf8'));
  expect(record).toMatchObject({
    schema: 1, module: 'scientific', expression: 'sin(90°)', result: '1', exactness: 'exact',
  });

  await panel.getByTestId('proof-import-file').setInputFiles({
    name: 'record.json', mimeType: 'application/json', buffer: bytes,
  });
  await expect(panel.getByText('Imported record', { exact: true })).toBeVisible();
  await expect(panel).toContainText('Imported values have not been verified.');
  await panel.getByRole('button', { name: 'Close imported record' }).click();
  await expect(panel.getByText('This calculation', { exact: true })).toBeVisible();
  await expect(page.getByTestId('scientific-result')).toHaveAttribute('data-canonical', '1');
});

test('the local proof viewer rejects malformed or oversized bytes and treats imported markup as text', async ({ page }) => {
  const panel = await enterScientific(page);
  const badDestination = 'https://example.invalid/proof-resource';
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(badDestination)) external.push(request.url());
  });
  const chooser = panel.getByTestId('proof-import-file');
  await chooser.setInputFiles({
    name: 'oversized.json', mimeType: 'application/json',
    buffer: Buffer.alloc(MAX_CALCULATION_PROOF_BYTES + 1, 0x20),
  });
  await expect(panel.getByRole('alert')).toHaveText('The file exceeds 128 KiB.');
  await chooser.setInputFiles({
    name: 'invalid-utf8.json', mimeType: 'application/json', buffer: Buffer.from([0xc0, 0xaf]),
  });
  await expect(panel.getByRole('alert')).toHaveText('The file does not match calculation record schema 1.');

  const markup = `<img src="${badDestination}">`;
  await chooser.setInputFiles({
    name: 'literal.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...scientificRecord, result: markup, references: [badDestination] })),
  });
  await expect(panel.getByText(markup, { exact: true })).toBeVisible();
  await expect(panel.getByText('Imported record', { exact: true })).toBeVisible();
  await expect(panel.locator('img, a')).toHaveCount(0);
  expect(external).toEqual([]);
});
