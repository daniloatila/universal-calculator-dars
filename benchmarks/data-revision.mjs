// One bounded synthetic workload per process. The Python driver supplies fresh instances.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [gluePath, wasmPath, rowsArg, shape, mode, budgetArg] = process.argv.slice(2);
const rows = Number(rowsArg);
assert(Number.isInteger(rows) && rows >= 1 && rows <= 200000);
const { default: initialize, LocalDataset } = await import(pathToFileURL(resolve(gluePath)).href);
const bytes = await readFile(wasmPath);
const { memory } = await initialize({ module_or_path: bytes });
const extraColumns = { simple: 0, wide: 9, long: 1 }[shape];
assert(Number.isInteger(extraColumns));
const padding = shape === 'long' ? 'sample '.repeat(80) : 'abcd';
const header = ['id','group','amount', ...Array.from({length:extraColumns}, (_,i) => 'column'+i)];
const suffix = (','+padding).repeat(extraColumns);
const records = Array.from({length:rows}, (_,i) => String(i).padStart(7,'0')+','+(i%8)+',1.25'+suffix);
const input = Buffer.from(header.join(',')+'\n'+records.join('\n'));
records.length = 0;
const settings = { types: { amount: 'decimal' } };
assert(['import','transform'].includes(mode));
if (mode === 'transform') settings.steps = [{ op:'group', by:'group', column:'amount', aggregate:'sum', name:'subtotal' }];
if (budgetArg && budgetArg !== 'default') settings.resource_budget_bytes=Number(budgetArg);
const out = { rows, columns:header.length, max_field_bytes:Math.max(7,extraColumns?padding.length:0),
  types:header.map(name => name==='amount'?'decimal':'text'), source_bytes:input.length,
  fixture_sha256:createHash('sha256').update(input).digest('hex'), module_sha256:createHash('sha256').update(bytes).digest('hex'),
  mode, shape, requested_budget:budgetArg, node:process.version, rss_before:process.memoryUsage.rss() };
let table;
let stage='open';
const start=performance.now();
try {
  table=new LocalDataset(input, JSON.stringify(settings));
  out.open_ms=performance.now()-start;
  out.wasm_after_open=memory.buffer.byteLength;
  stage='profile';
  const profileStarted=performance.now();
  const proof=JSON.parse(table.proof()).proof;
  const summary=JSON.parse(proof.result);
  out.profile_ms=performance.now()-profileStarted;
  assert.equal(summary.rows, mode==='import'?rows:Math.min(8,rows));
  const expectedSum=String(5*rows/4);
  assert.equal(summary.profile.at(-1).column.name, mode==='transform'?'subtotal':header.at(-1));
  assert.equal(summary.profile.find(item => item.column.name===(mode==='transform'?'subtotal':'amount')).statistics.sum, expectedSum);
  out.exact_sum=expectedSum;
  out.estimated=table.resource_diagnostics ? JSON.parse(table.resource_diagnostics()) : null;
  out.status='verified';
} catch (err) {
  if (String(err)!=='resource_budget') throw err;
  out.status='resource_budget';
  out.rejected_stage=stage;
  out.elapsed_to_rejection_ms=performance.now()-start;
} finally {
  table?.free();
}
out.wasm_final_bytes=memory.buffer.byteLength;
out.rss_after=process.memoryUsage.rss();
out.heap_used=process.memoryUsage().heapUsed;
out.peak_rss=process.resourceUsage().maxRSS*1024;
console.log(JSON.stringify(out));
