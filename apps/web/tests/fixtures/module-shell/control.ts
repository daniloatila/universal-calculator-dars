export const trace = {
  imported: [] as string[],
  chartWorkersStarted: 0,
  chartWorkersStopped: 0,
  chartDisposals: 0,
  chartCacheBudget: 0,
  hangNextChart: false,
  finishChart: undefined as (() => void) | undefined,
};
