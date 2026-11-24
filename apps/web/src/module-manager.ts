export type ModulePhase = 'unloaded' | 'loading' | 'active' | 'suspending' | 'suspended' | 'terminated' | 'recoverable_failure';
export type ModuleFailure = 'load_failed' | 'activation_failed' | 'snapshot_failed' | 'disposal_failed' | 'runtime_failed';
export type ResourceKind = 'task' | 'worker' | 'cache' | 'graphics' | 'other';
export type ResourceCounts = Readonly<Record<ResourceKind, number>>;

export interface ModuleStatus {
  readonly id: string;
  readonly phase: ModulePhase;
  readonly failure?: ModuleFailure;
}

export interface ModuleManagerSnapshot {
  readonly activeId: string | null;
  readonly modules: readonly ModuleStatus[];
  readonly resources: ResourceCounts;
  readonly closed: boolean;
}

export interface ModuleActivation<TState> {
  readonly signal: AbortSignal;
  readonly previousState: TState | undefined;
  readonly resources: {
    /** Register a resource as soon as it is created. Release is synchronous and idempotent. */
    own(kind: ResourceKind, dispose: () => void): () => void;
  };
  reportFailure(): void;
}

export interface ModuleRuntime<TState> {
  /** Return the temporary data needed to resume. Never return live resources. */
  snapshot?(): TState;
  dispose?(): void;
}

export interface ModuleDescriptor<TInstance, TState> {
  readonly id: string;
  /** Loading imports code only. Allocate operational resources inside activate. */
  load(): Promise<{ activate(context: ModuleActivation<TState>): TInstance | Promise<TInstance> }>;
}

type TransitionResult = 'active' | 'suspended' | 'terminated' | 'recoverable_failure' | 'superseded';
type TransitionKind = 'activate' | 'suspend' | 'terminate' | 'close';
type Transition = { kind: TransitionKind; id: string | null; controller: AbortController; result: Promise<TransitionResult> };
type Entry<TInstance, TState> = {
  descriptor: ModuleDescriptor<TInstance, TState>;
  status: ModuleStatus;
  saved: TState | undefined;
};
type Session<TInstance, TState> = {
  entry: Entry<TInstance, TState>;
  controller: AbortController;
  instance: TInstance | undefined;
  releases: Map<() => void, ResourceKind>;
  failed: boolean;
  retiring: boolean;
};

function emptyResourceCounts(): Record<ResourceKind, number> {
  return { task: 0, worker: 0, cache: 0, graphics: 0, other: 0 };
}

function waitForModule<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    // Observe the original promise even after abort so a late rejection stays isolated.
    void work.then((value) => {
      signal.removeEventListener('abort', abort);
      resolve(value);
    }, (error: unknown) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

export function createModuleManager<TInstance extends ModuleRuntime<TState>, TState>(
  descriptors: readonly ModuleDescriptor<TInstance, TState>[],
) {
  const entries = new Map<string, Entry<TInstance, TState>>();
  for (const descriptor of descriptors) {
    if (!descriptor.id || entries.has(descriptor.id)) throw new RangeError('Duplicate or empty module ID');
    entries.set(descriptor.id, { descriptor, status: { id: descriptor.id, phase: 'unloaded' }, saved: undefined });
  }

  const listeners = new Set<() => void>();
  let session: Session<TInstance, TState> | undefined;
  let pending: Transition | undefined;
  let tail = Promise.resolve();
  let closing: Promise<TransitionResult> | undefined;
  let closingRequested = false;
  let closed = false;
  let snapshot = readSnapshot();

  function readSnapshot(): ModuleManagerSnapshot {
    const resources = emptyResourceCounts();
    if (session) for (const kind of session.releases.values()) resources[kind]++;
    return {
      activeId: session?.entry.status.phase === 'active' ? session.entry.status.id : null,
      modules: [...entries.values()].map((entry) => entry.status),
      resources,
      closed,
    };
  }

  function publish() {
    snapshot = readSnapshot();
    for (const listener of [...listeners]) {
      try { listener(); }
      catch { /* An observer cannot interrupt resource ownership or a transition. */ }
    }
  }

  function setPhase(entry: Entry<TInstance, TState>, phase: ModulePhase, failure?: ModuleFailure) {
    entry.status = failure ? { id: entry.status.id, phase, failure } : { id: entry.status.id, phase };
    publish();
  }

  function own(current: Session<TInstance, TState>, kind: ResourceKind, dispose: () => void) {
    if (current.retiring || current.controller.signal.aborted || session !== current) {
      dispose();
      return () => {};
    }
    const release = () => {
      if (!current.releases.delete(release)) return;
      try { dispose(); }
      finally { if (session === current && !current.retiring) publish(); }
    };
    current.releases.set(release, kind);
    publish();
    return release;
  }

  function retire(
    current: Session<TInstance, TState>,
    target: 'suspended' | 'terminated' | 'recoverable_failure',
    failure?: ModuleFailure,
  ): TransitionResult {
    current.retiring = true;
    const { entry, instance } = current;
    if (entry.status.phase === 'active') setPhase(entry, 'suspending');
    if (target === 'terminated') entry.saved = undefined;
    else if (entry.status.phase === 'suspending' && instance?.snapshot) {
      try { entry.saved = instance.snapshot(); }
      catch { failure ??= 'snapshot_failed'; }
    }

    current.controller.abort();
    try { instance?.dispose?.(); }
    catch { failure ??= 'disposal_failed'; }
    for (const release of [...current.releases.keys()].reverse()) {
      try { release(); }
      catch { failure ??= 'disposal_failed'; }
    }
    current.instance = undefined;
    session = undefined;
    const phase = failure ? 'recoverable_failure' : target;
    setPhase(entry, phase, failure);
    return phase;
  }

  function reportFailure(current: Session<TInstance, TState>) {
    if (session !== current || current.retiring || current.failed || current.controller.signal.aborted) return;
    current.failed = true;
    if (current.entry.status.phase === 'active') retire(current, 'recoverable_failure', 'runtime_failed');
    else current.controller.abort();
  }

  async function open(entry: Entry<TInstance, TState>, signal: AbortSignal): Promise<TransitionResult> {
    if (session?.entry === entry && entry.status.phase === 'active') return 'active';
    if (session) retire(session, 'suspended');
    if (signal.aborted) return 'superseded';

    const current: Session<TInstance, TState> = {
      entry,
      controller: new AbortController(),
      instance: undefined,
      releases: new Map(),
      failed: false,
      retiring: false,
    };
    const moduleSignal = current.controller.signal;
    const cancel = () => current.controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    session = current;
    setPhase(entry, 'loading');

    let failure: ModuleFailure = 'load_failed';
    let activation: Promise<TInstance> | undefined;
    try {
      moduleSignal.throwIfAborted();
      const loaded = await waitForModule(entry.descriptor.load(), moduleSignal);
      moduleSignal.throwIfAborted();
      failure = 'activation_failed';
      activation = Promise.resolve(loaded.activate({
        signal: moduleSignal,
        previousState: entry.saved,
        resources: { own: (kind, dispose) => own(current, kind, dispose) },
        reportFailure: () => reportFailure(current),
      }));
      current.instance = await waitForModule(activation, moduleSignal);
      moduleSignal.throwIfAborted();
      entry.saved = undefined;
      setPhase(entry, 'active');
      return current.failed ? 'recoverable_failure' : 'active';
    } catch {
      if (activation && !current.instance) {
        // An uncooperative activation can settle after its scope has already closed.
        void activation.then((instance) => {
          try { instance.dispose?.(); }
          catch { /* The retired module's registered resources were already released. */ }
        }, () => {});
      }
      if (current.failed) return retire(current, 'recoverable_failure', 'runtime_failed');
      if (!signal.aborted) return retire(current, 'recoverable_failure', failure);
      retire(current, 'suspended');
      return 'superseded';
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  function lookup(id: string): Entry<TInstance, TState> {
    const entry = entries.get(id);
    if (!entry) throw new RangeError('Unknown module ID');
    return entry;
  }

  function stop(entry: Entry<TInstance, TState>, phase: 'suspended' | 'terminated'): TransitionResult {
    if (session?.entry === entry) return retire(session, phase);
    if (phase === 'terminated') entry.saved = undefined;
    if (entry.status.phase !== phase) setPhase(entry, phase);
    return phase;
  }

  function enqueue(kind: TransitionKind, id: string | null): Promise<TransitionResult> {
    const old = pending;
    if (old?.kind === kind && old.id === id) return old.result;
    const controller = new AbortController();
    const result = tail.then(async (): Promise<TransitionResult> => {
      if (controller.signal.aborted) return 'superseded';
      if (kind === 'close') {
        const closingEntry = session?.entry;
        const outcome = session ? retire(session, 'terminated') : 'terminated';
        for (const entry of entries.values()) {
          entry.saved = undefined;
          if (entry !== closingEntry || outcome !== 'recoverable_failure') {
            entry.status = { id: entry.status.id, phase: 'terminated' };
          }
        }
        closed = true;
        publish();
        return outcome;
      }
      if (kind === 'activate' && id !== null) return open(lookup(id), controller.signal);
      const phase = kind === 'terminate' ? 'terminated' : 'suspended';
      const selected = id === null ? undefined : lookup(id);
      const entry = kind === 'terminate' ? selected ?? session?.entry : session?.entry ?? selected;
      return entry ? stop(entry, phase) : phase;
    });
    const transition: Transition = { kind, id, controller, result };
    pending = transition;
    tail = result.then(() => {
      if (pending === transition) pending = undefined;
    }, () => {
      if (pending === transition) pending = undefined;
    });
    old?.controller.abort();
    return result;
  }

  function activate(id: string) {
    lookup(id);
    return closingRequested ? Promise.resolve('superseded' as const) : enqueue('activate', id);
  }

  function suspend() {
    if (closingRequested) return Promise.resolve('superseded' as const);
    return enqueue('suspend', session?.entry.status.id ?? pending?.id ?? null);
  }

  function terminate(id?: string) {
    const entry = id === undefined ? undefined : lookup(id);
    if (closingRequested) return Promise.resolve('superseded' as const);
    if (entry && entry !== session?.entry && id !== pending?.id) return Promise.resolve(stop(entry, 'terminated'));
    return enqueue('terminate', id ?? session?.entry.status.id ?? pending?.id ?? null);
  }

  function close() {
    closingRequested = true;
    closing ??= enqueue('close', null);
    return closing;
  }

  return {
    activate,
    suspend,
    terminate,
    close,
    getSnapshot: () => snapshot,
    getActive: () => session?.entry.status.phase === 'active' && session.instance
      ? { id: session.entry.status.id, instance: session.instance }
      : undefined,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
