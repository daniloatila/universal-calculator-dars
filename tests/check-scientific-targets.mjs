import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import initialize, { evaluate_tool_json } from '../apps/web/src/tool-wasm/scientific/dars_tool_wasm.js';

const cli = process.argv[2];
assert(cli, 'Pass the native DARS CLI executable.');
const wasm = await readFile(new URL('../apps/web/src/tool-wasm/scientific/dars_tool_wasm_bg.wasm', import.meta.url));
const initStarted = performance.now();
const { memory } = await initialize({ module_or_path: wasm });
const initMs = performance.now() - initStarted;
const build = (input, options = {}, extra = {}) =>
  JSON.stringify({ schema: 1, module: 'scientific', operation: 'evaluate', input, options, ...extra });
const cases = [
  build('sin(90°)'), build('cos(180°)'), build('ln(1)'), build('log₂(1024)'), build('20!'),
  build('sqrt(-1)', { complex: true }), build('exp(i*pi)+1', { complex: true }), build('sin(100)', { angle: 'grad' }),
  build('sinh(0.35)', { precision: 80 }), build('atanh(0.99999999)', { precision: 60 }),
  build('sin(1e-30)', { precision: 64 }), build('sqrt(2)', { notation: 'engineering' }),
  build('tan(90°)'), build('ln(0)'), build('sqrt(-1)'), build('1e99999'),
  build('0.3 + 0.2', {}, { original_input: '0,3 + 0,2' }),
  build('1', {}, { module: 'algebra' }), build('1', { precision: '8' }),
];
for (const input of cases) {
  let wasmResult;
  try { wasmResult = JSON.parse(evaluate_tool_json(input)); }
  catch (cause) { throw new Error('WASM failed to execute ' + input, { cause }); }
  let native;
  try {
    native = JSON.parse(execFileSync(cli, ['tool', input], { encoding: 'utf8', timeout: 8000 }));
  } catch (error) {
    if (error.status !== 1) throw error;
    native = JSON.parse(error.stdout);
  }
  assert.deepEqual(wasmResult, native, input);
}

const workloads = [build('20!'), build('sqrt(2)', { precision: 64 }), build('atanh(0.999999)', { precision: 40 })];
for (const input of workloads) {
  for (let index = 0; index < 10; index++) evaluate_tool_json(input);
}
const timings = [];
for (let index = 0; index < 120; index++) {
  const input = workloads[index % workloads.length];
  const started = performance.now();
  const output = evaluate_tool_json(input);
  timings.push(performance.now() - started);
  assert.equal(JSON.parse(output).ok, true);
}
timings.sort((a, b) => a - b);
const quantile = (percent) => timings[Math.ceil(timings.length * percent) - 1];
console.log(JSON.stringify({
  suite: 'scientific-cli-wasm',
  passed: cases.length,
  failed: 0,
  measurement: {
    scope: 'Node, initialized WASM, Rust request decoding and proof serialization',
    wasmBytes: wasm.length,
    wasmSha256: createHash('sha256').update(wasm).digest('hex'),
    observedWasmLinearBytes: memory.buffer.byteLength,
    wasmInitializationMs: initMs,
    interactions: timings.length,
    warmupPerExpression: 10,
    milliseconds: { p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99) },
  },
}));
