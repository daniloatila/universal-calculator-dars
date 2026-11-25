import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

/** Compare the full engine envelope across isolated binaries and time initialized WASM requests. */
export async function verifyToolTargets(module, cases, workloads, isolatedRequests = []) {
  assert(process.argv[2], 'Pass the native DARS CLI executable.');
  const cli = resolve(process.argv[2]);
  const target = new URL(`../apps/web/src/tool-wasm/${module}/`, import.meta.url);
  const { default: initialize, evaluate_tool_json: evaluate } = await import(new URL('dars_tool_wasm.js', target));
  const wasm = await readFile(new URL('dars_tool_wasm_bg.wasm', target));
  const initStarted = performance.now();
  const { memory } = await initialize({ module_or_path: wasm });
  const initMs = performance.now() - initStarted;

  for (const request of cases) {
    const input = JSON.stringify(request);
    let wasmResult;
    try {
      wasmResult = JSON.parse(evaluate(input));
    } catch (cause) {
      throw new Error(`WASM failed to execute ${input}`, { cause });
    }
    let nativeResult;
    try {
      nativeResult = JSON.parse(execFileSync(cli, ['tool', input], { encoding: 'utf8', timeout: 8000 }));
    } catch (error) {
      if (error.status !== 1) throw error;
      nativeResult = JSON.parse(error.stdout);
    }
    assert.deepEqual(wasmResult, nativeResult, input);
  }
  for (const request of isolatedRequests) {
    assert.deepEqual(JSON.parse(evaluate(JSON.stringify(request))), { ok: false, code: 'unsupported' });
  }

  const workloadInputs = workloads.map(request => JSON.stringify(request));
  const warmupPerExpression = 10;
  for (const input of workloadInputs) {
    for (let index = 0; index < warmupPerExpression; index++) evaluate(input);
  }
  const timings = [];
  for (let index = 0; index < 120; index++) {
    const input = workloadInputs[index % workloadInputs.length];
    const started = performance.now();
    const output = evaluate(input);
    timings.push(performance.now() - started);
    assert.equal(JSON.parse(output).ok, true);
  }
  timings.sort((a, b) => a - b);
  const quantile = (percent) => timings[Math.ceil(timings.length * percent) - 1];
  console.log(JSON.stringify({
    suite: `${module}-cli-wasm`,
    passed: cases.length,
    isolationChecks: isolatedRequests.length,
    failed: 0,
    measurement: {
      scope: 'Node, initialized WASM, Rust request decoding and proof serialization',
      wasmBytes: wasm.length,
      wasmSha256: createHash('sha256').update(wasm).digest('hex'),
      observedWasmLinearBytes: memory.buffer.byteLength,
      wasmInitializationMs: initMs,
      interactions: timings.length,
      warmupPerExpression,
      milliseconds: { p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99) },
    },
  }));
}
