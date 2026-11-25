import { createModuleWork } from '../../../src/module-work';
import type { ChartJob } from './control';
import { trace } from './control';

function instrumentedWorker(id: string) {
  const worker = new Worker(new URL('./chart-scheduler-worker.ts', import.meta.url), { type: 'module' });
  const channel = new MessageChannel();
  const record = { id, started: false, heartbeat: 0, terminated: false };
  trace.schedulerWorkers.push(record);
  trace.schedulerEvents.push({ id, event: 'created' });
  channel.port1.onmessage = ({ data }) => {
    if (data === 'started') record.started = true;
    else if (data === 'heartbeat') record.heartbeat++;
  };

  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    terminate();
    channel.port1.close();
    record.terminated = true;
    trace.schedulerEvents.push({ id, event: 'terminated' });
  };

  try {
    // A separate port proves that jobs reach the worker without spoofing a scheduler result.
    worker.postMessage({ diagnostics: channel.port2 }, [channel.port2]);
  } catch (error) {
    channel.port2.close();
    worker.terminate();
    throw error;
  }
  return worker;
}

export function activateChartWork(signal: AbortSignal) {
  const work = createModuleWork(signal, { pendingJobs: 1 });
  const controllers = new Map<string, AbortController>();
  trace.schedulerGeneration++;
  trace.scheduler = {
    submit(job: ChartJob) {
      const controller = new AbortController();
      controllers.set(job.id, controller);
      void work.submit({
        createWorker: () => instrumentedWorker(job.id),
        request: job,
        decode(reply: unknown) {
          if (typeof reply !== 'number') throw new Error('Expected a numeric chart fixture response.');
          return reply;
        },
      }, {
        kind: job.kind, timeoutMs: job.timeoutMs, signal: controller.signal,
      }).then((result) => {
        trace.schedulerResults[job.id] = result;
        controllers.delete(job.id);
      });
    },
    cancel(id: string) { controllers.get(id)?.abort(); },
    getSnapshot: work.getSnapshot,
  };
  return work;
}
