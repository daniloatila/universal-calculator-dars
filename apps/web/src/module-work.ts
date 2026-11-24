import type { AdaptivePolicy } from './adaptive';

type WorkPolicy = Pick<AdaptivePolicy, 'pendingJobs'>;
type SecondaryTask<T> = (signal: AbortSignal) => Promise<T>;

export type ModuleWorkResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' | 'queue_full' | 'failed' };

export const MODULE_WORK_QUEUE_LIMIT = 8;
const MAX_CONCURRENT = 4;

type Job = { start(): Promise<() => void>; cancel(): void };

function concurrencyFor(policy: WorkPolicy): number {
  if (!Number.isFinite(policy.pendingJobs)) return 0;
  return Math.max(0, Math.min(MAX_CONCURRENT, Math.floor(policy.pendingJobs / 2)));
}

/**
 * Optional admission for a module's secondary work. Submit asynchronous tasks
 * and use module-owned workers for expensive computation. Math has its own queue.
 */
export function createModuleWork(signal: AbortSignal, initialPolicy: WorkPolicy) {
  const work = new AbortController();
  const queued: Job[] = [];
  const active = new Set<Job>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let concurrency = concurrencyFor(initialPolicy);
  let closed = false;

  function cancelScheduledAdmission() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    if (closed || timer !== undefined || !queued.length || active.size >= concurrency) return;
    // Yield before invoking module tasks, even when capacity is available immediately.
    timer = setTimeout(admit, 0);
  }

  function admit() {
    timer = undefined;
    while (!closed && active.size < concurrency) {
      const job = queued.shift();
      if (!job) return;
      active.add(job);
      void job.start().then((settle) => {
        active.delete(job);
        if (!closed) settle();
        schedule();
      });
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    cancelScheduledAdmission();
    signal.removeEventListener('abort', close);
    work.abort();
    for (const job of queued.splice(0)) job.cancel();
    for (const job of active) job.cancel();
    active.clear();
  }

  if (signal.aborted) close();
  else signal.addEventListener('abort', close, { once: true });

  return {
    submit<T>(task: SecondaryTask<T>): Promise<ModuleWorkResult<T>> {
      if (closed) return Promise.resolve({ status: 'cancelled' });
      if (queued.length >= MODULE_WORK_QUEUE_LIMIT) return Promise.resolve({ status: 'queue_full' });
      return new Promise((resolve) => {
        queued.push({
          async start() {
            try {
              const value = await task(work.signal);
              return () => resolve({ status: 'completed', value });
            } catch {
              return () => resolve({ status: 'failed' });
            }
          },
          cancel: () => resolve({ status: 'cancelled' }),
        });
        schedule();
      });
    },
    setPolicy(policy: WorkPolicy) {
      if (closed) return;
      concurrency = concurrencyFor(policy);
      // Capacity reductions defer new admissions. Active tasks keep their turn.
      if (active.size >= concurrency) cancelScheduledAdmission();
      else schedule();
    },
    getSnapshot: () => ({ active: active.size, queued: queued.length, concurrency, closed }),
    close,
  };
}
