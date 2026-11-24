import { lazy } from 'react';
import type { Combine, EngineStatus, Evaluate } from './engine';
import type { Locale, Messages } from './i18n';

export interface ModuleContext {
  locale: Locale;
  messages: Messages;
  evaluate: Evaluate;
  combine: Combine;
  engineStatus: EngineStatus;
}

const modules = {
  standard: {
    title: 'standard',
    Workspace: lazy(() => import('./standard')),
  },
} as const;

export type ModuleId = keyof typeof modules;

export function resolveModule(id: ModuleId) {
  return modules[id];
}
