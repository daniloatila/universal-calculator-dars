import initialize, { LocalDataset } from './tool-wasm/data-lab/dars_tool_wasm.js';
import { DATA_LAB_PAGE_SIZE, validateDataLabInput } from './data-lab-contract';
import type { DataJob } from './data-lab-contract';

const failures = new Set(['limit', 'invalid_input', 'unsupported', 'domain', 'resource_budget', 'source_mismatch']);
self.addEventListener(
  'message',
  ({ data }: MessageEvent<DataJob>) => {
    void process(data).catch((error: unknown) => {
      const code = error instanceof Error ? error.message : String(error);
      self.postMessage({
        ok: false,
        code: failures.has(code) ? code : 'engine_unavailable',
      });
    });
  },
  { once: true },
);

async function process(job: DataJob) {
  validateDataLabInput(job.file.size, job.settings, job.budget, job.descriptor);
  const progress = (completed: number) => self.postMessage({ type: 'progress', completed, total: 4 });
  progress(0);
  await initialize();
  progress(1);
  const buffer = await job.file.arrayBuffer();
  progress(2);
  if (job.expectedSha256) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hex !== job.expectedSha256) throw new Error('source_mismatch');
  }
  const table = job.descriptor
    ? LocalDataset.replay(new Uint8Array(buffer), job.descriptor)
    : new LocalDataset(new Uint8Array(buffer), job.settings);
  let page: string;
  let proof: string;
  let csv: Uint8Array | undefined;
  let estimatedPeak: number | undefined;
  try {
    progress(3);
    // Conservatively charge UTF-16 transport, cloning and the eventual JSON materialization.
    // Each prior payload stays charged to the Rust resident budget before the next stage.
    proof = table.proof();
    table.reserve_browser_response(8 * proof.length);
    page = table.page(job.offset, DATA_LAB_PAGE_SIZE);
    const responseReserve = 8 * (proof.length + page.length);
    table.reserve_browser_response(responseReserve);
    csv = job.exportMode ? table.export_csv(job.exportMode === 'protected') : undefined;
    if (csv) table.reserve_browser_response(responseReserve + 2 * csv.byteLength);
    if (job.includeResourceReceipt) estimatedPeak=JSON.parse(table.resource_diagnostics()).estimated_high_water_bytes;
  } finally {
    table.free();
  }
  progress(4);
  if (csv?.buffer instanceof ArrayBuffer) self.postMessage({ ok: true, page, proof, csv }, { transfer: [csv.buffer] });
  else self.postMessage({ ok: true, page, proof, estimatedPeak });
}
