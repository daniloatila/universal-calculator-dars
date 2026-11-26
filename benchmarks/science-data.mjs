import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
const workloads = [1000, 10000, 100000, 200000];
const rows = Number(process.argv[2]);
if (!rows) {
  const measurements = workloads.map((n) => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), String(n)], {
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  });
  console.log(
    JSON.stringify(
      {
        suite: 'data-lab-volume',
        runtime: process.version,
        platform: process.platform,
        cpu: cpus()[0]?.model,
        method:
          'Independent Node processes, warm WASM initialization excluded, one synthetic CSV import and full exact profile per size. RSS includes host allocator and input. Peak RSS is the process lifetime high-water mark.',
        measurements,
      },
      null,
      2,
    ),
  );
} else {
  assert(workloads.includes(rows));
  const { default: init, LocalDataset } = await import(
    '../apps/web/src/tool-wasm/data-lab/dars_tool_wasm.js'
  );
  const { memory } = await init({
    module_or_path: await readFile(
      new URL('../apps/web/src/tool-wasm/data-lab/dars_tool_wasm_bg.wasm', import.meta.url),
    ),
  });
  const input = Buffer.from(
    'id,group,amount\n' +
      Array.from({ length: rows }, (_, i) => String(i).padStart(7, '0') + ',' + (i % 8) + ',1.25').join('\n'),
  );
  const before = process.memoryUsage();
  const start = performance.now();
  const table = new LocalDataset(input, JSON.stringify({ types: { amount: 'decimal' } }));
  const parsed = performance.now();
  const proof = JSON.parse(table.proof()).proof;
  const p = JSON.parse(proof.result);
  assert.equal(p.rows, rows);
  assert.equal(p.profile[2].statistics.sum, String((rows * 5) / 4));
  assert.equal(p.sha256, createHash('sha256').update(input).digest('hex'));
  const end = performance.now();
  const after = process.memoryUsage();
  table.free();
  console.log(
    JSON.stringify({
      rows,
      columns: 3,
      types: ['text', 'text', 'decimal'],
      bytes: input.byteLength,
      import_ms: parsed - start,
      profile_ms: end - parsed,
      wasm_bytes: memory.buffer.byteLength,
      rss_before: before.rss,
      rss_after: after.rss,
      js_heap_used: after.heapUsed,
      process_peak_rss_bytes: process.resourceUsage().maxRSS * 1024,
    }),
  );
}
