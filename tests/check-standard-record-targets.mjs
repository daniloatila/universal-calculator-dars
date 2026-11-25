import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import initialize, {
  evaluate_json, evaluate_value_json, evaluate_value_record_json,
} from '../apps/web/src/wasm/dars_wasm.js';

assert(process.argv[2], 'Pass the native DARS CLI executable.');
const cli = resolve(process.argv[2]);
const wasm = new URL('../apps/web/src/wasm/dars_wasm_bg.wasm', import.meta.url);
await initialize({ module_or_path: await readFile(wasm) });

function native(args, status) {
  const run = spawnSync(cli, args, { encoding: 'utf8', timeout: 8000 });
  if (run.error) throw run.error;
  assert.equal(run.status, status, run.stderr);
  return run.stdout.trimEnd();
}

const oldResult = '{"ok":true,"exact":"3/10","approximate":"0.3"}';
assert.equal(native(['0.1+0.2'], 0), oldResult);
assert.equal(evaluate_json('0.1+0.2'), oldResult);

const root = JSON.parse(evaluate_value_json('sqrt(2)', '{}'));
const cases = [
  { input: '  −1 ÷ 2 + 1/3  ', result: '-1/6', kind: 'exact' },
  { input: '200 + (10%)', result: '220', kind: 'exact' },
  { input: '√(2)', result: '1.41421356237309504880169', kind: 'approximate', bound: '5e-24' },
  { input: '@1^2', bindings: { 1: 'q:-7/3', 2: 'unused' }, used: { 1: 'q:-7/3' }, result: '49/9', kind: 'exact' },
  { input: '(@7-@7)+@4294967295', bindings: { 7: 'q:2/3', 4294967295: root.value },
    used: { 7: 'q:2/3', 4294967295: root.value }, result: '1.41421356237309504880169', kind: 'approximate', bound: '5e-24' },
  { input: '@1+2', error: 'missing_binding' },
  { input: '@1', bindings: { 1: 'q:2/2' }, error: 'invalid_value' },
  { input: '1/0', error: 'division_by_zero' },
  { input: 'sqrt(-1)', error: 'domain_error' },
];

let replays = 0;
for (const sample of cases) {
  const bindings = JSON.stringify(sample.bindings ?? {});
  const output = evaluate_value_record_json(sample.input, bindings);
  const args = ['standard-record', sample.input];
  if (sample.bindings) args.push(bindings);
  assert.equal(output, native(args, sample.error ? 1 : 0), sample.input);

  const { proof, ...value } = JSON.parse(output);
  assert.deepEqual(value, JSON.parse(evaluate_value_json(sample.input, bindings)));
  if (sample.error) {
    assert.deepEqual(value, { ok: false, code: sample.error });
    assert.equal(proof, undefined);
    continue;
  }

  assert.equal(proof.result, sample.result);
  assert.equal(proof.exactness, sample.kind);
  assert.equal(proof.error_bound, sample.bound ?? null);
  assert.deepEqual(proof.standard_bindings, sample.used);
  const replayBindings = JSON.stringify(proof.standard_bindings ?? {});
  const replay = evaluate_value_record_json(proof.normalized, replayBindings);
  assert.equal(replay, native(['standard-record', proof.normalized, replayBindings], 0));
  assert.deepEqual(JSON.parse(replay), { ...value, proof: { ...proof, expression: proof.normalized } });
  replays++;
}

console.log(JSON.stringify({ suite: 'standard-record-cli-wasm', passed: cases.length, replays, failed: 0 }));
