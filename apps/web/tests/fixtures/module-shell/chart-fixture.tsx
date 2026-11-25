import { useState } from 'react';
import type { ModuleActivation } from '../../../src/module-manager';
import type { PrimaryModule } from '../../../src/module-registry';
import { activateChartWork } from './chart-scheduler';
import { trace } from './control';

type ChartState = { points: readonly number[] };
trace.imported.push('chart');

export async function activate(scope: ModuleActivation<ChartState>): Promise<PrimaryModule<ChartState>> {
  let points = scope.previousState?.points ?? [];
  const work = activateChartWork(scope.signal);
  const worker = new Worker(new URL('./chart-worker.ts', import.meta.url), { type: 'module' });
  trace.chartWorkersStarted++;
  scope.resources.own('worker', () => {
    worker.terminate();
    trace.chartWorkersStopped++;
  });
  const runtime: PrimaryModule<ChartState> = {
    Workspace() {
      const [count, setCount] = useState(points.length);
      const [broken, setBroken] = useState(false);
      if (broken) throw new Error('A test-only chart render failure.');
      return <section aria-label="Fixture chart">
        <output aria-label="Chart points">{count}</output>
        <button type="button" onClick={() => {
          points = [...points, points.length + 1];
          worker.postMessage(points.length);
          setCount(points.length);
        }}>Add chart point</button>
        <button type="button" onClick={() => setBroken(true)}>Interrupt chart fixture</button>
      </section>;
    },
    snapshot: () => ({ points }),
    setPolicy(policy) {
      trace.chartCacheBudget = policy.cacheEntries;
      work.setPolicy(policy);
    },
    getResources() { return { pending: work.getSnapshot().queued }; },
    dispose() { trace.chartDisposals++; },
  };
  if (trace.hangNextChart) {
    trace.hangNextChart = false;
    await new Promise<void>((resolve) => { trace.finishChart = resolve; });
    trace.finishChart = undefined;
  }
  return runtime;
}
