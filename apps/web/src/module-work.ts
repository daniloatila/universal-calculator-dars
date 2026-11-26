import type { AdaptivePolicy } from './adaptive';

type WorkPolicy = Pick<AdaptivePolicy, 'pendingJobs'>;

export type ModuleWorker = Pick<Worker, 'onmessage' | 'onmessageerror' | 'onerror' | 'postMessage' | 'terminate'>;
export type ModuleProgress = { completed: number; total: number };
export type ModuleTask<TRequest, TResult> = {
  /** Create a fresh dedicated worker from the module's bundled code. */
  createWorker: () => ModuleWorker;
  request: TRequest;
  transfer?: Transferable[];
  progress?: { update(value: ModuleProgress): void; watchdogMs: number };
  /** Validate the worker's single result synchronously. */
  decode: (reply: unknown) => TResult;
};

export type ModuleTaskClass = 'essential' | 'interactive' | 'secondary' | 'optional' | 'maintenance' | 'rendering' | 'scientific' | 'batch' | 'import';
export type ModuleWorkResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' | 'deferred' | 'queue_full' | 'failed' | 'timed_out' };

type Refusal = Exclude<ModuleWorkResult<never>['status'], 'completed'>;
type TaskOptions = { kind?: ModuleTaskClass; timeoutMs?: number; signal?: AbortSignal };
type Job = {
  kind: ModuleTaskClass;
  admittedAt: number;
  start(): void;
  settle(status: Refusal): void;
};

export const MODULE_WORK_QUEUE_LIMIT = 8;
const MAX_CONCURRENT = 4;
const AGING_INTERVAL_MS = 1000;
const POLICY = {
  essential: { priority: 0, deadlineMs: 10_000, limitMs: 30_000, foreground: true },
  interactive: { priority: 1, deadlineMs: 5000, limitMs: 30_000, foreground: true },
  rendering: { priority: 2, deadlineMs: 3000, limitMs: 30_000, foreground: true },
  secondary: { priority: 3, deadlineMs: 8000, limitMs: 30_000, foreground: false },
  maintenance: { priority: 4, deadlineMs: 6000, limitMs: 30_000, foreground: false },
  optional: { priority: 5, deadlineMs: 3000, limitMs: 30_000, foreground: false },
  scientific: { priority: 2, deadlineMs: 20_000, limitMs: 30_000, foreground: true },
  batch: { priority: 3, deadlineMs: 45_000, limitMs: 60_000, foreground: true },
  import: { priority: 2, deadlineMs: 30_000, limitMs: 45_000, foreground: true },
} satisfies Record<ModuleTaskClass, { priority: number; deadlineMs: number; limitMs: number; foreground: boolean }>;

function backgroundCapacity(policy: WorkPolicy): number {
  if (!Number.isFinite(policy.pendingJobs)) return 0;
  return Math.max(0, Math.min(MAX_CONCURRENT, Math.floor(policy.pendingJobs / 2)));
}

/** Each admitted job owns a dedicated worker until the scheduler terminates it. */
export function createModuleWork(signal: AbortSignal, initialPolicy: WorkPolicy) {
  const waiting: Job[] = [];
  const background = new Set<Job>();
  let foreground: Job | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let concurrency = backgroundCapacity(initialPolicy);
  let closed = false;

  function canStart(job: Job) {
    return POLICY[job.kind].foreground ? !foreground : background.size < concurrency;
  }

  function schedule() {
    if (!closed && scheduled === undefined && waiting.some(canStart)) scheduled = setTimeout(admit, 0);
  }

  function admit() {
    scheduled = undefined;
    const now = performance.now();
    while (!closed) {
      let index = -1;
      let best = Infinity;
      for (let candidate = 0; candidate < waiting.length; candidate++) {
        const job = waiting[candidate];
        if (!job || !canStart(job)) continue;
        const priority = POLICY[job.kind].priority - Math.floor((now - job.admittedAt) / AGING_INTERVAL_MS);
        if (priority < best) {
          index = candidate;
          best = priority;
        }
      }
      if (index < 0) return;
      const [job] = waiting.splice(index, 1);
      if (!job) return;
      if (POLICY[job.kind].foreground) foreground = job;
      else background.add(job);
      job.start();
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    if (scheduled !== undefined) clearTimeout(scheduled);
    scheduled = undefined;
    signal.removeEventListener('abort', close);
    for (const job of waiting.splice(0)) job.settle('cancelled');
    if (foreground) foreground.settle('cancelled');
    for (const job of [...background]) job.settle('cancelled');
  }

  if (signal.aborted) close();
  else signal.addEventListener('abort', close, { once: true });

  return {
    submit<TRequest, TResult>(task: ModuleTask<TRequest, TResult>, options: TaskOptions = {}): Promise<ModuleWorkResult<TResult>> {
      if (closed || options.signal?.aborted) return Promise.resolve({ status: 'cancelled' });
      const kind = options.kind ?? 'secondary';
      const rule = POLICY[kind];
      if (kind === 'optional' && concurrency === 0) return Promise.resolve({ status: 'deferred' });
      if (waiting.filter((job) => POLICY[job.kind].foreground === rule.foreground).length >= MODULE_WORK_QUEUE_LIMIT) {
        return Promise.resolve({ status: 'queue_full' });
      }

      const maxWait = options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs)
        ? Math.min(rule.limitMs, Math.max(1, options.timeoutMs)) : rule.deadlineMs;

      return new Promise((resolve) => {
        let finished = false;
        let worker: ModuleWorker | undefined;
        let creating = false;
        let duringCreation: ModuleWorkResult<TResult> | undefined;
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        let lastProgress: ModuleProgress | undefined;

        function armWatchdog() {
          if (task.progress && Number.isFinite(task.progress.watchdogMs)) {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => finish({ status: 'timed_out' }), Math.max(1, task.progress.watchdogMs));
          }
        }

        function release(result: ModuleWorkResult<TResult>) {
          try {
            if (worker) {
              worker.onmessage = null;
              worker.onmessageerror = null;
              worker.onerror = null;
              worker.terminate();
              worker = undefined;
            }
          } catch {
            // A failed stop cannot certify that this execution slot is safe to reuse.
            close();
            resolve({ status: 'failed' });
            return;
          }
          const index = waiting.indexOf(job);
          if (index >= 0) waiting.splice(index, 1);
          if (foreground === job) foreground = undefined;
          background.delete(job);
          resolve(result);
          schedule();
        }

        function finish(result: ModuleWorkResult<TResult>) {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          clearTimeout(watchdog);
          options.signal?.removeEventListener('abort', cancel);
          if (creating) duringCreation = result;
          else release(result);
        }

        function fail() { finish({ status: 'failed' }); }
        function cancel() { finish({ status: 'cancelled' }); }

        const job: Job = {
          kind,
          admittedAt: performance.now(),
          start() {
            creating = true;
            try { worker = task.createWorker(); }
            catch { fail(); }
            finally { creating = false; }
            if (duringCreation) {
              release(duringCreation);
              return;
            }
            if (!worker) {
              fail();
              return;
            }
            try {
              worker.onmessage = ({ data }) => {
                if (finished) return;
                try {
                  if (task.progress && data && typeof data === 'object' && data.type === 'progress') {
                    const { completed, total } = data;
                    if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || total < 1 ||
                        completed < 0 || completed > total ||
                        (lastProgress && (lastProgress.total !== total || lastProgress.completed >= completed))) {
                      throw new TypeError('Invalid worker progress');
                    }
                    lastProgress = { completed, total };
                    armWatchdog();
                    task.progress.update(lastProgress);
                    return;
                  }
                  finish({ status: 'completed', value: task.decode(data) });
                }
                catch { fail(); }
              };
              worker.onmessageerror = fail;
              worker.onerror = (event) => {
                event.preventDefault();
                fail();
              };
              armWatchdog();
              if (task.transfer) worker.postMessage(task.request, task.transfer);
              else worker.postMessage(task.request);
            } catch {
              fail();
            }
          },
          settle: (status) => finish({ status }),
        };
        const timer = setTimeout(() => {
          finish({ status: !rule.foreground && waiting.includes(job) ? 'deferred' : 'timed_out' });
        }, maxWait);
        options.signal?.addEventListener('abort', cancel, { once: true });
        waiting.push(job);
        schedule();
      });
    },
    setPolicy(policy: WorkPolicy) {
      if (closed) return;
      concurrency = backgroundCapacity(policy);
      schedule();
    },
    getSnapshot: () => ({ active: background.size + Number(Boolean(foreground)), queued: waiting.length, concurrency, closed }),
    close,
  };
}
