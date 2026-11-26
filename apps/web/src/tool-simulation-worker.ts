import initialize, { SimulationTask } from './tool-wasm/simulation/dars_tool_wasm.js';
import type { ToolRequest } from './tool-runtime';

self.addEventListener('message', ({ data }: MessageEvent<ToolRequest>) => {
  void simulate(data);
}, { once: true });

async function simulate(request: ToolRequest) {
  let task: SimulationTask | undefined;
  try {
    await initialize();
    task = new SimulationTask(JSON.stringify(request));
    const size = JSON.parse(request.input).model === 'distribution' ? 2048 : 256;
    while (true) {
      const { completed, total, done } = JSON.parse(task.step(size));
      self.postMessage({ type: 'progress', completed, total });
      if (done) break;
      await new Promise<void>((resume) => setTimeout(resume, 0));
    }
    self.postMessage(JSON.parse(task.finish()));
  } catch (reason) {
    const code = reason instanceof Error ? reason.message : reason;
    self.postMessage({ ok: false, code: typeof code === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(code) ? code : 'engine_unavailable' });
  } finally {
    task?.free();
  }
}
