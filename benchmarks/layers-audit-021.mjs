import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directories = process.argv.slice(2);
assert.equal(directories.length, 3, 'Pass generated wasm-bindgen directories from 0.1.1, 0.2.0, and 0.2.1');
const versions = ['0.1.1', '0.2.0', '0.2.1'];
const slots = [
  ['0.1+0.2', '0.3'],
  ['200+10%', '220'],
  ['sqrt(2)', '1.41421356237309504880169'],
  ['(110+7)*3-2', '349'],
  ['1/3', '0.333333333333333333333333'],
];
function summarize(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const q = (p) => sorted[Math.ceil(sorted.length * p) - 1];
  return { count: sorted.length, p50: q(.50), p95: q(.95), p99: q(.99) };
}
const loaded = [];
for (let index = 0; index < directories.length; index++) {
  const path = directories[index];
  const wrapper = await import(pathToFileURL(resolve(path, 'dars_wasm.js')).href);
  const bytes = await readFile(resolve(path, 'dars_wasm_bg.wasm'));
  const start = performance.now();
  await wrapper.default({ module_or_path: bytes });
  const setupMs = performance.now() - start;
  for (const [expression, expected] of slots) {
    const checked = JSON.parse(wrapper.evaluate_value_json(expression, '{}'));
    assert(checked.ok);
    assert.equal(checked.approximate, expected);
  }
  loaded.push({ wrapper, version: versions[index], setupMs, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const runs = [];
for (const index of [0, 1, 2, 2, 1, 0]) {
  const { wrapper, ...artifact } = loaded[index];
  const boundary = [];
  const deserialize = [];
  for (let iteration = 0; iteration < 3600; iteration++) {
    const [expression, expected] = slots[iteration % slots.length];
    const start = performance.now();
    const text = wrapper.evaluate_value_json(expression, '{}');
    const returned = performance.now();
    const value = JSON.parse(text);
    const checked = performance.now();
    assert.equal(value.approximate, expected);
    if (iteration >= 600) {
      boundary.push(returned - start);
      deserialize.push(checked - returned);
    }
  }
  runs.push({ ...artifact, evaluations: summarize(boundary), jsonParse: summarize(deserialize) });
}
console.log(JSON.stringify({ unit: 'milliseconds', warmupPerRun: 600, pureWasmStructuredCallIncludesRustJson: true, runs }, null, 2));
