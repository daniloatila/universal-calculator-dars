import type { ModuleTaskClass, ModuleWorkResult } from '../../../src/module-work';

export type ChartJob = {
  id: string;
  behavior: 'hang' | 'complete';
  kind: ModuleTaskClass;
  timeoutMs: number;
  value: number;
};

type SchedulerSnapshot = { active: number; queued: number; concurrency: number; closed: boolean };
type SchedulerProbe = {
  submit(job: ChartJob): void;
  cancel(id: string): void;
  getSnapshot(): SchedulerSnapshot;
};

export const trace = {
  imported: [] as string[],
  chartWorkersStarted: 0,
  chartWorkersStopped: 0,
  chartDisposals: 0,
  chartCacheBudget: 0,
  hangNextChart: false,
  finishChart: undefined as (() => void) | undefined,
  scheduler: undefined as SchedulerProbe | undefined,
  schedulerGeneration: 0,
  schedulerWorkers: [] as { id: string; started: boolean; heartbeat: number; terminated: boolean }[],
  schedulerEvents: [] as { id: string; event: 'created' | 'terminated' }[],
  schedulerResults: {} as Record<string, ModuleWorkResult<number>>,
};
