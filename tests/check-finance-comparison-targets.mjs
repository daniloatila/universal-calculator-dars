import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

assert(process.argv[2], 'Pass the native DARS CLI executable.');
const executable = resolve(process.argv[2]);
const python = process.env.DARS_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const oracle = fileURLToPath(new URL('verify-finance-comparison.py', import.meta.url));
const requests = JSON.parse(execFileSync(python, ['-B', oracle, '--requests'], { encoding: 'utf8' }));
const bindings = new Map();
let replayed = 0;
for (const request of requests) {
  if (!bindings.has(request.module)) {
    const directory = new URL(`../apps/web/src/tool-wasm/${request.module}/`, import.meta.url);
    const { default: initialize, evaluate_tool_json: evaluate } = await import(new URL('dars_tool_wasm.js', directory));
    await initialize({ module_or_path: await readFile(new URL('dars_tool_wasm_bg.wasm', directory)) });
    bindings.set(request.module, evaluate);
  }
  const evaluate = bindings.get(request.module);
  const input = JSON.stringify(request);
  let native;
  try { native = JSON.parse(execFileSync(executable, ['tool', input], { encoding: 'utf8', timeout: 12000 })); }
  catch (error) {
    if (error.status !== 1) throw error;
    native = JSON.parse(error.stdout);
  }
  const wasm = JSON.parse(evaluate(input));
  assert.deepEqual(wasm, native, input);
  if (wasm.ok) {
    const replay = JSON.parse(evaluate(JSON.stringify({ ...request, input: wasm.proof.normalized })));
    assert.equal(replay.proof.result, wasm.proof.result, input);
    replayed++;
  }
}
console.log(JSON.stringify({ suite: 'semantic-comparison-cli-wasm', cases: requests.length, proof_replays: replayed, failed: 0 }));
