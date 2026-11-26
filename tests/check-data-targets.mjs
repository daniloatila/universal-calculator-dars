import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import initialize, { LocalDataset } from '../apps/web/src/tool-wasm/data-lab/dars_tool_wasm.js';

const wasm = await readFile(
  new URL('../apps/web/src/tool-wasm/data-lab/dars_tool_wasm_bg.wasm', import.meta.url),
);
await initialize({ module_or_path: wasm });
const cli = process.argv[2];
assert(cli, 'Pass the built DARS CLI');
const python = process.env.DARS_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const generated = spawnSync(python, [
  '-B',
  fileURLToPath(new URL('./fixtures/scientific-workbook.py', import.meta.url)),
]);
assert.equal(generated.status, 0, generated.stderr?.toString());
let comparisons = 0;
function check(input, options, inspect) {
  const bytes = typeof input === 'string' ? Buffer.from(input) : input;
  const config = JSON.stringify(options);
  const local = new LocalDataset(bytes, config);
  try {
    const native = spawnSync(cli, ['dataset', config], { input: bytes, encoding: 'utf8' });
    assert.equal(native.status, 0, native.stdout || native.stderr);
    const proof = JSON.parse(local.proof()).proof;
    assert.deepEqual(JSON.parse(native.stdout).proof, proof);
    const result = JSON.parse(proof.result);
    assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
    const page = JSON.parse(local.page(0, 25));
    inspect(result, page, local);
    comparisons++;
  } finally {
    local.free();
  }
}
check(generated.stdout, { format: 'xlsx', types: { amount: 'decimal', cached: 'integer' } }, (r, p) => {
  assert.deepEqual(p.sheets, ['Records', 'Other']);
  assert.equal(p.rows[0][0].value, '0001');
  assert.equal(r.profile[1].statistics.sum, '45035996273704966/5');
  assert.deepEqual(
    p.rows[0].map((c) => c.origin),
    ['stored', 'stored', 'cached_formula', 'formula', 'date_serial1900', 'error', 'absent', 'stored'],
  );
  assert.equal(p.rows[0][2].formula, '1+1');
  assert.equal(p.rows[0][3].value, '');
  assert.equal(p.rows[0][4].value, '60');
  assert.equal(p.rows[0][7].value, 'true');
});
check(generated.stdout, { format: 'xlsx', sheet: 'Other' }, (_, p) =>
  assert.equal(p.rows[0][0].value, 'A & B'),
);
check('id,value\r\n"001","1.20"\r\n"00,2","2.70"\r\n', { types: { value: 'decimal' } }, (r, p) => {
  assert.equal(p.rows[1][0].value, '00,2');
  assert.equal(r.profile[1].statistics.mean, '39/20');
});
check(
  'id\tv\nA\t1,5\nB\t-2,5',
  { format: 'tsv', decimal: 'comma', types: { v: 'decimal' }, analysis: { x: 'v', y: 'v' } },
  (r) => {
    assert.equal(r.profile[1].statistics.sum, '-1');
    assert.equal(r.analysis.pearson.r_squared, '1');
    assert.equal(r.analysis.median, '-1/2');
  },
);
check(
  '[{"id":"0001","v":9007199254740995},{"id":"003","v":null},{"id":"002","v":""},{"id":"0001","v":"NaN"},{"id":"0005"}]',
  { format: 'json', types: { v: 'integer' } },
  (r) => {
    assert.equal(r.profile[1].statistics.sum, '9007199254740995');
    assert.deepEqual(r.profile[1].origins, { stored: 1, empty: 1, null: 1, absent: 1, invalid: 1 });
  },
);
for (const [aggregate, expected] of Object.entries({
  sum: '7',
  mean: '7/3',
  min: '1',
  max: '4',
  count: '3',
})) {
  check(
    'g,x\na,1\na,2\na,4',
    { types: { x: 'decimal' }, steps: [{ op: 'group', by: 'g', column: 'x', aggregate, name: 'measure' }] },
    (_, p) => assert.equal(p.rows[0][1].value, expected),
  );
}
for (const [operator, expected] of Object.entries({
  add: '13/4',
  subtract: '-3/4',
  multiply: '5/2',
  divide: '5/8',
})) {
  check(
    'id,x\n001,1.25',
    {
      types: { x: 'decimal' },
      steps: [{ op: 'calculate', left: { column: 'x' }, operator, right: { constant: '2' }, name: 'out' }],
    },
    (_, p) => assert.equal(p.rows[0][2].value, expected),
  );
}
for (const [compare, n] of Object.entries({ eq: 1, ne: 2, lt: 1, le: 2, gt: 1, ge: 2 })) {
  check(
    'v\n2\n10\n40',
    { types: { v: 'integer' }, steps: [{ op: 'filter', column: 'v', compare, value: '10' }] },
    (r) => assert.equal(r.rows, n),
  );
}
console.log(
  JSON.stringify({
    suite: 'local-tabular-scientific-oracle',
    passed: comparisons,
    failed: 0,
    wasm_sha256: createHash('sha256').update(wasm).digest('hex'),
    fixture_sha256: createHash('sha256').update(generated.stdout).digest('hex'),
  }),
);
