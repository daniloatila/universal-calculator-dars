import { startEngine } from './engine';
import type { EngineStatus } from './engine';
import type { ModuleActivation } from './module-manager';
import type { PrimaryModule } from './module-registry';
import Standard from './standard';
import type { StandardSession } from './standard';

export function activate(context: ModuleActivation<StandardSession>): PrimaryModule {
  const session = context.previousState ?? {};
  const listeners = new Set<() => void>();
  let status: EngineStatus = 'loading';
  const engine = startEngine((next) => {
    status = next;
    for (const listener of listeners) listener();
    if (status === 'unavailable') context.reportFailure();
  }, {
    ownWorker: (worker) => context.resources.own('worker', () => worker.terminate()),
  });

  return {
    Workspace: Standard,
    session,
    evaluate: engine.evaluate,
    combine: engine.combine,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getStatus: () => status,
    setPolicy: engine.setPolicy,
    getResources: engine.getResources,
    snapshot: () => session,
    dispose() {
      listeners.clear();
      engine.close();
    },
  };
}
