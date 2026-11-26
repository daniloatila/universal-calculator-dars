import initialize, { LocalDataset } from './tool-wasm/data-lab/dars_tool_wasm.js';

export interface DataJob {
  file: Blob;
  settings: string;
  offset: number;
  exportMode?: 'protected' | 'literal';
}
self.addEventListener(
  'message',
  ({ data }: MessageEvent<DataJob>) => {
    void process(data).catch((error: unknown) => {
      const code = String(error);
      self.postMessage({
        ok: false,
        code: ['limit', 'invalid_input', 'unsupported', 'domain'].includes(code)
          ? code
          : 'engine_unavailable',
      });
    });
  },
  { once: true },
);

async function process(job: DataJob) {
  if (job.file.size > 16 * 1024 * 1024) throw 'limit';
  const progress = (completed: number) => self.postMessage({ type: 'progress', completed, total: 4 });
  progress(0);
  await initialize();
  progress(1);
  const buffer = await job.file.arrayBuffer();
  progress(2);
  const table = new LocalDataset(new Uint8Array(buffer), job.settings);
  try {
    progress(3);
    const page: unknown = JSON.parse(table.page(job.offset, 25));
    const record = JSON.parse(table.proof());
    const csv = job.exportMode ? table.export_csv(job.exportMode === 'protected') : undefined;
    progress(4);
    self.postMessage({ ...record, page, csv });
  } finally {
    table.free();
  }
}
