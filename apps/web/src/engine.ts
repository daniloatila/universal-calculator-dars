export type Evaluation =
  | { ok: true; exact: string | null; approximate: string; value: string }
  | { ok: false; code: string };

export type EngineStatus = 'loading' | 'ready' | 'unavailable';
export type Bindings = Record<string, string>;

type Operation =
  | { type: 'evaluate'; input: string; bindings: Bindings }
  | { type: 'combine'; left: string; right: string; subtract: boolean };

export type EvaluationRequest = Operation & { id: number };

export type EvaluationResponse =
  | { type: 'ready' }
  | { type: 'unavailable' }
  | { type: 'result'; id: number; result: Evaluation };

export type Evaluate = (expression: string, bindings?: Bindings, signal?: AbortSignal) => Promise<Evaluation>;
export type Combine = (left: string, right: string, subtract: boolean, signal?: AbortSignal) => Promise<Evaluation>;

export const ENGINE_LIMITS = {
  startupMs: 15_000,
  jobMs: 5_000,
  recoveryDelayMs: 250,
  recoveryAttempts: 2,
  pendingJobs: 8,
} as const;

export type EngineWorker = Pick<Worker, 'onmessage' | 'onmessageerror' | 'onerror' | 'postMessage' | 'terminate'>;
type ScheduledAction = (action: () => void, delayMs: number) => () => void;
type EngineDependencies = { createWorker: () => EngineWorker; schedule: ScheduledAction };

type WorkerGeneration = { worker: EngineWorker; cancelStartup?: () => void };
type Job = {
  request: EvaluationRequest;
  resolve: (result: Evaluation) => void;
  cancelDeadline?: () => void;
  removeAbortListener?: () => void;
};

const UNAVAILABLE: Evaluation = { ok: false, code: 'engine_unavailable' };
const TIMEOUT: Evaluation = { ok: false, code: 'engine_timeout' };
const CANCELLED: Evaluation = { ok: false, code: 'engine_cancelled' };
const BUSY: Evaluation = { ok: false, code: 'engine_busy' };

function isEvaluation(value: unknown): value is Evaluation {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<{ ok: boolean; code: string; exact: string | null; approximate: string; value: string }>;
  if (result.ok === false) return typeof result.code === 'string' && result.code.length > 0;
  return result.ok === true && (result.exact === null || typeof result.exact === 'string') &&
    typeof result.approximate === 'string' && typeof result.value === 'string' && result.value.length > 0;
}

function createBrowserWorker(): EngineWorker {
  return new Worker(new URL('./wasm-worker.ts', import.meta.url), { type: 'module' });
}

const scheduleTimer: ScheduledAction = (action, delayMs) => {
  const timer = globalThis.setTimeout(action, delayMs);
  return () => globalThis.clearTimeout(timer);
};

export function startEngine(setStatus: (status: EngineStatus) => void, dependencies: Partial<EngineDependencies> = {}) {
  const { createWorker = createBrowserWorker, schedule = scheduleTimer } = dependencies;
  const queue: Job[] = [];
  let workerGeneration: WorkerGeneration | undefined;
  let active: Job | undefined;
  let cancelRecovery: (() => void) | undefined;
  let nextId = 0;
  let restarts = 0;
  let closed = false;
  let status: EngineStatus = 'loading';

  function publishStatus(next: EngineStatus) {
    if (!closed && status !== next) {
      status = next;
      setStatus(next);
    }
  }

  function disposeWorker() {
    const previous = workerGeneration;
    workerGeneration = undefined;
    if (!previous) return;

    previous.cancelStartup?.();
    previous.worker.onmessage = null;
    previous.worker.onerror = null;
    previous.worker.onmessageerror = null;
    previous.worker.terminate();
  }

  function settle(job: Job, result: Evaluation) {
    job.cancelDeadline?.();
    job.removeAbortListener?.();
    job.resolve(result);
  }

  function settleActive(result: Evaluation) {
    const job = active;
    active = undefined;
    if (job) settle(job, result);
  }

  function recover(failure: Evaluation) {
    disposeWorker();
    settleActive(failure);
    if (restarts >= ENGINE_LIMITS.recoveryAttempts) {
      publishStatus('unavailable');
      for (const job of queue.splice(0)) settle(job, UNAVAILABLE);
      return;
    }

    restarts++;
    publishStatus('loading');
    cancelRecovery = schedule(() => {
      cancelRecovery = undefined;
      spawnWorker();
    }, ENGINE_LIMITS.recoveryDelayMs);
  }

  function pump() {
    if (closed || status !== 'ready' || !workerGeneration || active) return;
    const generation = workerGeneration;
    const job = queue.shift();
    if (!job) return;

    active = job;
    job.cancelDeadline = schedule(() => {
      if (workerGeneration === generation && active === job) recover(TIMEOUT);
    }, ENGINE_LIMITS.jobMs);
    try {
      generation.worker.postMessage(job.request);
    } catch {
      recover(UNAVAILABLE);
    }
  }

  function spawnWorker() {
    if (closed) return;

    let worker: EngineWorker;
    try {
      worker = createWorker();
    } catch {
      recover(UNAVAILABLE);
      return;
    }

    const generation: WorkerGeneration = { worker };
    workerGeneration = generation;
    function fail() {
      if (workerGeneration === generation) recover(UNAVAILABLE);
    }

    worker.onerror = (event) => {
      event.preventDefault();
      fail();
    };
    worker.onmessageerror = fail;
    worker.onmessage = (event) => {
      if (workerGeneration !== generation) return;
      const data = event.data as EvaluationResponse | null;
      if (data?.type === 'ready') {
        if (status !== 'loading') return;
        generation.cancelStartup?.();
        publishStatus('ready');
        pump();
      } else if (data?.type === 'result') {
        if (!active || active.request.id !== data.id) return;
        if (!isEvaluation(data.result)) {
          fail();
          return;
        }
        // A protocol-valid response (including a mathematical error) proves that the worker recovered.
        restarts = 0;
        settleActive(data.result);
        pump();
      } else {
        fail();
      }
    };
    generation.cancelStartup = schedule(fail, ENGINE_LIMITS.startupMs);
  }

  function submit(operation: Operation, signal?: AbortSignal): Promise<Evaluation> {
    if (signal?.aborted) return Promise.resolve(CANCELLED);
    if (closed || status === 'unavailable') return Promise.resolve(UNAVAILABLE);
    if (queue.length + Number(Boolean(active)) >= ENGINE_LIMITS.pendingJobs) return Promise.resolve(BUSY);

    return new Promise((resolve) => {
      const job: Job = { request: { ...operation, id: ++nextId }, resolve };
      if (signal) {
        const abort = () => {
          if (active === job) {
            // The WASM call is synchronous. A message cannot interrupt it; terminate its worker instead.
            disposeWorker();
            settleActive(CANCELLED);
            publishStatus('loading');
            spawnWorker();
            return;
          }

          const position = queue.indexOf(job);
          if (position !== -1) {
            queue.splice(position, 1);
            settle(job, CANCELLED);
          }
        };
        signal.addEventListener('abort', abort, { once: true });
        job.removeAbortListener = () => signal.removeEventListener('abort', abort);
      }
      queue.push(job);
      pump();
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    cancelRecovery?.();
    disposeWorker();
    settleActive(UNAVAILABLE);
    for (const job of queue.splice(0)) settle(job, UNAVAILABLE);
  }

  const evaluate: Evaluate = (input, bindings = {}, signal) => submit({ type: 'evaluate', input, bindings: { ...bindings } }, signal);
  const combine: Combine = (left, right, subtract, signal) => submit({ type: 'combine', left, right, subtract }, signal);

  spawnWorker();
  return { evaluate, combine, close };
}
