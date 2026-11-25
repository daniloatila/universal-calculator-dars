import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const require = createRequire(join(root, 'apps/web/package.json'));
const { chromium, expect } = require('@playwright/test');
assert(process.argv[2] && process.argv[3], 'Pass the Windows executable and JSON output path. Add --baseline for the archived 0.3.0.');
const executable = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const archived = process.argv.includes('--baseline');
const digest = createHash('sha256').update(await readFile(executable)).digest('hex');
if (archived) assert.equal(digest, '8c2da09e07fa9e5a95bf3e068105b63a2e1e860582fb371dcc0bd4ace4db3d88');
await mkdir(resolve('artifacts/objective-03/revision-01'), { recursive: true });
const profile = await mkdtemp(resolve('artifacts/objective-03/revision-01/webview-'));
const app = spawn(executable, [], { stdio: 'ignore', env: {
  ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0 --lang=en-US',
} });
let browser;
try {
  const deadline = performance.now() + 15000;
  let port;
  while (!port && app.exitCode === null && performance.now() < deadline) {
    try {
      const [value] = (await readFile(join(profile, 'EBWebView/DevToolsActivePort'), 'utf8')).split(/\s+/u);
      if (/^\d{1,5}$/u.test(value) && Number(value) > 0 && Number(value) <= 65535) port = value;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EBUSY') throw error;
    }
    if (!port) await delay(35);
  }
  assert(port, 'WebView2 CDP port missing');
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const [context] = browser.contexts();
  const page = context.pages()[0] ?? await context.waitForEvent('page');
  const settings = page.locator('details.settings');
  async function language(locale) {
    await settings.locator('summary').click();
    await settings.locator('select').first().selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await settings.locator('summary').click();
  }
  await language('en');
  await page.getByRole('combobox', { name: 'Module', exact: true }).selectOption('scientific');
  const workspace = page.locator('.scientific-workspace');
  const input = workspace.locator('textarea');
  const result = page.getByTestId('scientific-result');
  const decimalLogarithm = '0.91381385238371668972315074469267';
  const cases = [];
  for (const [from, to, expression, before, baselineAfter] of [
    ['en', 'pt-BR', 'log(8,2)', '3', decimalLogarithm],
    ['pt-BR', 'en', 'log(8;2)', '3', '3'],
    ['pt-BR', 'en', 'log(8,2)', decimalLogarithm, '3'],
  ]) {
    await language(from);
    await input.fill('');
    await input.fill(expression);
    async function calculate() {
      const worker = page.waitForEvent('worker');
      await input.press('Enter');
      await worker;
      await expect(page.locator('main')).toHaveAttribute('data-workers', '0');
      await expect(result).toHaveAttribute('data-canonical', /\S/);
      const proof = workspace.locator('details.calculation-proof');
      if (!(await proof.evaluate((node) => node.open))) await proof.locator('summary').click();
      const fields = await proof.locator('.calculation-proof-fields > div').evaluateAll((rows) => rows.map((row) =>
        [row.querySelector('dt')?.textContent, row.querySelector('dd')?.textContent]));
      const values = Object.fromEntries(fields);
      return {
        canonical: await result.getAttribute('data-canonical'),
        original: values['Original expression'] ?? values['Expressão original'],
        normalized: values['Normalized expression'] ?? values['Expressão normalizada'],
        expressionLocale: values['Original expression locale'] ?? values['Idioma da expressão original'] ?? null,
        engineVersion: values['Engine version'] ?? values['Versão do motor'],
      };
    }
    const old = await calculate();
    await language(to);
    await expect(input).toHaveValue(expression);
    const repeated = await calculate();
    assert.equal(old.canonical, before);
    assert.equal(repeated.canonical, archived ? baselineAfter : before);
    assert.equal(old.original, expression);
    assert.equal(repeated.original, expression);
    assert.equal(old.engineVersion, archived ? '0.3.0' : '0.3.1');
    if (!archived) assert.deepEqual(repeated, old);
    cases.push({ from, to, expression, old, repeated });
  }
  await writeFile(output, JSON.stringify({ version: archived ? '0.3.0' : '0.3.1', executable_sha256: digest,
    webview2: browser.version(), cases }, null, 2) + '\n');
  console.log(JSON.stringify(cases.map(({ from, to, expression, old, repeated }) => ({ from, to, expression, before: old.canonical, after: repeated.canonical }))));
} finally {
  await browser?.close().catch(() => {});
  if (app.exitCode === null) {
    const exited = new Promise((done) => app.once('exit', done));
    app.kill();
    await exited;
  }
}
