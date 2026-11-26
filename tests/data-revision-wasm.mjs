// Line-oriented adapter for the independent Python test oracle. All fixtures are local.
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import initialize, { LocalDataset } from '../apps/web/src/tool-wasm/data-lab/dars_tool_wasm.js';

const wasm = new URL('../apps/web/src/tool-wasm/data-lab/dars_tool_wasm_bg.wasm', import.meta.url);
await initialize({ module_or_path: await readFile(wasm) });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  const { bytes, settings, op, replay } = JSON.parse(line);
  const source = Buffer.from(bytes, 'base64');
  let table;
  try {
    table = replay ? LocalDataset.replay(source, settings) : new LocalDataset(source, settings);
    let result;
    if (op === 'page') result = JSON.parse(table.page(0, 25));
    else if (op === 'proof') result = JSON.parse(table.proof());
    else if (op === 'resources') result = JSON.parse(table.resource_diagnostics());
    else if (op === 'protected' || op === 'literal') result = new TextDecoder().decode(table.export_csv(op === 'protected'));
    else throw new Error('Unknown verification operation');
    console.log(JSON.stringify({ value: result }));
  } catch (error) {
    console.log(JSON.stringify({ error: String(error) }));
  } finally {
    table?.free();
  }
}
