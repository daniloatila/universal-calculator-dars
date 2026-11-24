import type { ComponentType } from 'react';
import type { AdaptivePolicy } from './adaptive';
import type { Locale, Messages } from './i18n';
import type { ModuleDescriptor, ModuleRuntime } from './module-manager';

export interface ModuleWorkspaceProps {
  locale: Locale;
  messages: Messages;
  recordInteraction(durationMs: number): void;
}

export interface ModuleReadings {
  pending?: number;
  wasmBytes?: number;
}

export interface PrimaryModule<TState> extends ModuleRuntime<TState> {
  Workspace: ComponentType<ModuleWorkspaceProps>;
  setPolicy?(policy: AdaptivePolicy): void;
  getResources?(): ModuleReadings;
}

interface ModuleDescription {
  title: string;
  description: string;
  pageTitle?: string;
}

type Presentation = { describe(messages: Messages): ModuleDescription };
export type RegisteredModule = ModuleDescriptor<PrimaryModule<unknown>, unknown> & Presentation;

/** The manager retains a snapshot only under the same immutable registration ID. */
export function registerModule<TState>(
  descriptor: ModuleDescriptor<PrimaryModule<TState>, TState> & Presentation,
): RegisteredModule {
  return {
    id: descriptor.id,
    describe: descriptor.describe,
    async load() {
      const module = await descriptor.load();
      return {
        activate: (context) => module.activate({
          ...context,
          previousState: context.previousState as TState | undefined,
        }),
      };
    },
  };
}

export const primaryModules: readonly RegisteredModule[] = [
  registerModule({
    id: 'standard',
    describe: (messages) => ({
      title: messages.standard, description: messages.description, pageTitle: messages.pageTitle,
    }),
    load: () => import('./standard-runtime'),
  }),
];
