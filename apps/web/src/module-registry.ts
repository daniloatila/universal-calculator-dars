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
  keyboardHint?: string;
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
      keyboardHint: messages.keyboardHint,
    }),
    load: () => import('./standard-runtime'),
  }),
  registerModule({
    id: 'scientific',
    describe: (messages) => ({
      title: messages.scientific.title, description: messages.scientific.description,
      keyboardHint: messages.scientific.keyboardHint,
    }),
    load: () => import('./tool-scientific-runtime'),
  }),
  registerModule({
    id: 'algebra',
    describe: (messages) => ({
      title: messages.algebra.title, description: messages.algebra.description,
      keyboardHint: messages.algebra.keyboardHint,
    }),
    load: () => import('./tool-algebra-runtime'),
  }),
  registerModule({
    id: 'calculus',
    describe: (messages) => ({
      title: messages.calculus.title, description: messages.calculus.description,
      keyboardHint: messages.calculus.keyboardHint,
    }),
    load: () => import('./tool-calculus-runtime'),
  }),
  registerModule({
    id: 'linear-algebra',
    describe: (messages) => ({
      title: messages.linearAlgebra.title, description: messages.linearAlgebra.description,
      keyboardHint: messages.linearAlgebra.keyboardHint,
    }),
    load: () => import('./tool-linear-algebra-runtime'),
  }),
  registerModule({
    id: 'geometry',
    describe: (messages) => ({
      title: messages.geometry.title, description: messages.geometry.description,
      keyboardHint: messages.geometry.keyboardHint,
    }),
    load: () => import('./tool-geometry-runtime'),
  }),
];
