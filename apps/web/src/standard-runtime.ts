import { createElement, useSyncExternalStore } from 'react';
import { startEngine } from './engine';
import type { EngineStatus } from './engine';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import Standard from './standard';
import type { StandardSession } from './standard';

export function activate(context: ModuleActivation<StandardSession>): PrimaryModule<StandardSession> {
  const session = context.previousState ?? {};
  const listeners = new Set<() => void>();
  let view: { engineStatus: EngineStatus; cacheEntries: number } = { engineStatus: 'loading', cacheEntries: 0 };
  function publish(next: typeof view) {
    if (view.engineStatus === next.engineStatus && view.cacheEntries === next.cacheEntries) return;
    view = next;
    for (const listener of listeners) listener();
  }
  const engine = startEngine((next) => {
    publish({ ...view, engineStatus: next });
    if (next === 'unavailable') context.reportFailure();
  }, {
    ownWorker: (worker) => context.resources.own('worker', () => worker.terminate()),
  });

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  const getView = () => view;

  return {
    Workspace({ locale, messages, recordInteraction }: ModuleWorkspaceProps) {
      const current = useSyncExternalStore(subscribe, getView);
      return createElement(Standard, {
        ...current, locale, messages, session, combine: engine.combine,
        evaluate: async (...args) => {
          const started = performance.now();
          const result = await engine.evaluate(...args);
          if (result.ok) recordInteraction(performance.now() - started);
          return result;
        },
      });
    },
    setPolicy(policy) {
      engine.setPolicy(policy);
      publish({ ...view, cacheEntries: policy.cacheEntries });
    },
    getResources: engine.getResources,
    snapshot: () => session,
    dispose() {
      listeners.clear();
      engine.close();
    },
  };
}
