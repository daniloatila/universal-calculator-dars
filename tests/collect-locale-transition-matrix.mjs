import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const [reportName, outputName, ...extra] = process.argv.slice(2);
assert(reportName && outputName && extra.length === 0, 'Pass the Playwright JSON report and the matrix output path.');
const input = await readFile(reportName);
const report = JSON.parse(input);
const languages = ['en', 'pt-BR', 'zh-CN', 'hi', 'es', 'ar', 'fr'];
const moduleIds = ['standard', 'scientific', 'algebra', 'calculus', 'linear-algebra', 'geometry',
  'discrete-mathematics', 'programmer', 'converter', 'date-time'];
const expectedPairs = languages.flatMap((source) => languages.filter((target) => target !== source)
  .map((target) => `${source} → ${target}`));

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function* specs(suite) {
  yield* suite.specs ?? [];
  for (const child of suite.suites ?? []) yield* specs(child);
}

function successfulResult(spec) {
  assert(spec.ok && spec.tests.length === 1, `Missing or failed test: ${spec.title}`);
  const result = spec.tests[0].results.at(-1);
  assert.equal(result?.status, 'passed', spec.title);
  return result;
}

const transitionFile = /(?:^|[\\/])locale-transitions\.spec\.ts$/u;
const relevantSpecs = report.suites.flatMap((suite) => [...specs(suite)])
  .filter((spec) => transitionFile.test(spec.file));
const pairs = new Map();
const lifecycle = [];

for (const spec of relevantSpecs) {
  const result = successfulResult(spec);
  if (!spec.title.startsWith('locale matrix ')) {
    lifecycle.push({ title: spec.title, status: result.status, duration_ms: result.duration });
    continue;
  }
  const attachments = result.attachments.filter((attachment) => attachment.name === 'locale-transition-pair');
  assert.equal(attachments.length, 1, spec.title);
  const { pairSha256, ...observed } = JSON.parse(Buffer.from(attachments[0].body, 'base64'));
  const key = `${observed.source} → ${observed.target}`;
  assert(spec.title.startsWith(`locale matrix ${key}:`), key);
  assert(expectedPairs.includes(key) && !pairs.has(key), key);
  assert.equal(digest(JSON.stringify(observed)), pairSha256, key);
  assert.deepEqual(observed.modules.map(({ module }) => module), moduleIds, key);
  for (const row of observed.modules) {
    assert(row.operation && row.normalized && row.result, `${key}: ${row.module}`);
    assert.match(row.requestSha256, /^[a-f0-9]{64}$/u);
    assert.match(row.proofSha256, /^[a-f0-9]{64}$/u);
  }
  pairs.set(key, { ...observed, pairSha256, duration_ms: result.duration });
}

assert.equal(pairs.size, expectedPairs.length, `Incomplete directed matrix: ${expectedPairs.filter((pair) => !pairs.has(pair)).join(', ')}`);
assert(lifecycle.length >= 3, 'Missing separate lifecycle tests.');

const ledger = {
  schema: 1,
  scope: 'Representative grammar fixtures, submitted to the actual browser Web Workers. One pre-change and one post-change computation per module and directed pair. No expressions edited between those computations.',
  languages, workspaces: moduleIds,
  browser_report_sha256: digest(input),
  directed_pairs_passed: pairs.size,
  module_pairs_passed: [...pairs.values()].reduce((total, pair) => total + pair.modules.length, 0),
  pairs: expectedPairs.map((key) => pairs.get(key)), lifecycle,
};

await writeFile(outputName, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`Verified ${ledger.directed_pairs_passed} directed pairs, ${ledger.module_pairs_passed} module pairs, and ${lifecycle.length} lifecycle tests.`);
