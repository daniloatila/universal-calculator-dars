import type { ComponentType } from 'react';
import type { Combine, EngineResources, EngineStatus, Evaluate } from './engine';
import type { AdaptivePolicy } from './adaptive';
import type { Locale, Messages } from './i18n';
import type { ModuleDescriptor, ModuleRuntime } from './module-manager';
import type { StandardSession } from './standard';

export interface ModuleContext {
  locale: Locale;
  messages: Messages;
  evaluate: Evaluate;
  combine: Combine;
  engineStatus: EngineStatus;
  session: StandardSession;
  cacheEntries: number;
}

export interface PrimaryModule extends ModuleRuntime<StandardSession> {
  Workspace: ComponentType<ModuleContext>;
  session: StandardSession;
  evaluate: Evaluate;
  combine: Combine;
  subscribe(listener: () => void): () => void;
  getStatus(): EngineStatus;
  setPolicy(policy: AdaptivePolicy): void;
  getResources(): EngineResources;
}

export const primaryModules: readonly ModuleDescriptor<PrimaryModule, StandardSession>[] = [
  { id: 'standard', load: () => import('./standard-runtime') },
];
