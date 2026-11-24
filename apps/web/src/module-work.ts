import type { AdaptivePolicy } from './adaptive';

type WorkPolicy = Pick<AdaptivePolicy, 'pendingJobs'>;
type ModuleTask<T> = (signal: AbortSignal) => Promise<T>;

export type ModuleTaskClass = 'essential' | 'interactive' | 'secondary' | 'optional' | 'maintenance' | 'rendering';
export type ModuleWorkResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' | 'deferred' | 'queue_full' | 'failed' | 'timed_out' };

type Refusal = Exclude<ModuleWorkResult<never>['status'], 'completed'>;
type TaskOptions = { kind?: ModuleTaskClass; timeoutMs?: number; signal?: AbortSignal };
type Job = {
  kind: ModuleTaskClass;
  admittedAt: number;
  start(): Promise<void>;
  settle(status: Refusal): void;
};

export const MODULE_WORK_QUEUE_LIMIT = 8;
const MAX_CONCURRENT = 4;
const MAX_TIMEOUT_MS = 30_000;
const AGING_INTERVAL_MS = 1000;
const POLICY = {
  essential: { priority: 0, deadlineMs: 10_000, foreground: true },
  interactive: { priority: 1, deadlineMs: 5000, foreground: true },
  rendering: { priority: 2, deadlineMs: 3000, foreground: true },
  secondary: { priority: 3, deadlineMs: 8000, foreground: false },
  maintenance: { priority: 4, deadlineMs: 6000, foreground: false },
  optional: { priority: 5, deadlineMs: 3000, foreground: false },
} satisfies Record<ModuleTaskClass, { priority: number; deadlineMs: number; foreground: boolean }>;

function backgroundCapacity(policy: WorkPolicy): number {
  if (!Number.isFinite(policy.pendingJobs)) return 0;
  return Math.max(0, Math.min(MAX_CONCURRENT, Math.floor(policy.pendingJobs / 2)));
}

/** Admission for optional modules. Expensive tasks must use abortable, module-owned workers. */
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
      void job.start().finally(() => {
        if (foreground === job) foreground = undefined;
        background.delete(job);
        schedule();
      });
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
    foreground = undefined;
    for (const job of background) job.settle('cancelled');
    background.clear();
  }

  if (signal.aborted) close();
  else signal.addEventListener('abort', close, { once: true });

  return {
    submit<T>(task: ModuleTask<T>, options: TaskOptions = {}): Promise<ModuleWorkResult<T>> {
      if (closed || options.signal?.aborted) return Promise.resolve({ status: 'cancelled' });
      const kind = options.kind ?? 'secondary';
      const rule = POLICY[kind];
      if (kind === 'optional' && concurrency === 0) return Promise.resolve({ status: 'deferred' });
      if (waiting.filter((job) => POLICY[job.kind].foreground === rule.foreground).length >= MODULE_WORK_QUEUE_LIMIT) {
        return Promise.resolve({ status: 'queue_full' });
      }

      const maxWait = options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs)
        ? Math.min(MAX_TIMEOUT_MS, Math.max(1, options.timeoutMs)) : rule.deadlineMs;

      return new Promise((resolve) => {
        const controller = new AbortController();
        let finished = false;
        function finish(result: ModuleWorkResult<T>) {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          options.signal?.removeEventListener('abort', cancel);
          resolve(result);
        }

        function reject(status: Refusal) {
          if (finished) return;
          const index = waiting.indexOf(job);
          if (index >= 0) waiting.splice(index, 1);
          finish({ status });
          controller.abort();
          schedule();
        }
        function cancel() { reject('cancelled'); }

        const job: Job = {
          kind,
          admittedAt: performance.now(),
          async start() {
            try { finish({ status: 'completed', value: await task(controller.signal) }); }
            catch { finish({ status: 'failed' }); }
          },
          settle: reject,
        };
        const timer = setTimeout(() => {
          reject(!rule.foreground && waiting.includes(job) ? 'deferred' : 'timed_out');
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
