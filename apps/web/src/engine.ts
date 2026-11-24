export type Evaluation =
  | { ok: true; exact: string | null; approximate: string }
  | { ok: false; code: string };

export type EvaluationRequest = { id: number; input: string };

export type EvaluationResponse =
  | { type: 'ready' }
  | { type: 'unavailable' }
  | { type: 'result'; id: number; result: Evaluation };

export type Evaluate = (expression: string) => Promise<Evaluation>;

const UNAVAILABLE: Evaluation = { ok: false, code: 'engine_unavailable' };

export function startEngine(setStatus: (status: 'loading' | 'ready' | 'unavailable') => void) {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./wasm-worker.ts', import.meta.url), { type: 'module' });
  } catch {
    setStatus('unavailable');
    return { evaluate: async () => UNAVAILABLE, close() {} };
  }

  let nextId = 0;
  let state: 'loading' | 'ready' | 'unavailable' = 'loading';
  const pending = new Map<number, (result: Evaluation) => void>();

  function close() {
    window.clearTimeout(startupTimeout);
    state = 'unavailable';
    worker.terminate();
    for (const resolve of pending.values()) resolve(UNAVAILABLE);
    pending.clear();
  }

  function fail() {
    close();
    setStatus('unavailable');
  }

  const startupTimeout = window.setTimeout(fail, 15_000);
  worker.onerror = fail;
  worker.onmessageerror = fail;
  worker.onmessage = ({ data }: MessageEvent<EvaluationResponse>) => {
    if (data.type === 'unavailable') {
      fail();
    } else if (data.type === 'ready') {
      window.clearTimeout(startupTimeout);
      state = 'ready';
      setStatus('ready');
    } else {
      const resolve = pending.get(data.id);
      pending.delete(data.id);
      resolve?.(data.result);
    }
  };

  const evaluate: Evaluate = (input) => {
    if (state !== 'ready') return Promise.resolve(UNAVAILABLE);
    return new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      const request: EvaluationRequest = { id, input };
      worker.postMessage(request);
    });
  };

  return { evaluate, close };
}
