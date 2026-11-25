import type { ToolRequest } from './tool-runtime';

/** One request per dedicated worker. The module scheduler owns termination. */
export function serveTool(initialize: () => Promise<unknown>, evaluate: (request: string) => string) {
  self.addEventListener('message', ({ data }: MessageEvent<ToolRequest>) => {
    void initialize().then(() => {
      const reply: unknown = JSON.parse(evaluate(JSON.stringify(data)));
      self.postMessage(reply);
    }).catch(() => self.postMessage({ ok: false, code: 'engine_unavailable' }));
  }, { once: true });
}
