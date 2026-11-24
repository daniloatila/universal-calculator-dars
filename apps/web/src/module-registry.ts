import { lazy } from 'react';
import type { Evaluate } from './engine';
import type { Locale, Messages } from './i18n';

export interface ModuleContext {
  locale: Locale;
  messages: Messages;
  evaluate: Evaluate;
  engineStatus: 'loading' | 'ready' | 'unavailable';
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
