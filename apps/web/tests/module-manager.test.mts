import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { setImmediate as tick } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import { ADAPTIVE_PROFILES, updateAdaptive } from '../src/adaptive.ts';
import type { AdaptiveProfile } from '../src/adaptive.ts';
import { createModuleManager } from '../src/module-manager.ts';
import type { ModuleActivation, ModuleDescriptor, ModuleRuntime, ResourceCounts } from '../src/module-manager.ts';
import { createModuleWork, MODULE_WORK_QUEUE_LIMIT } from '../src/module-work.ts';

type State = { value: number };
type Runtime = ModuleRuntime<State> & { value?: number };
type Descriptor = ModuleDescriptor<Runtime, State>;
const empty: ResourceCounts = { task: 0, worker: 0, cache: 0, graphics: 0, other: 0 };

function module(id: string, activate: (context: ModuleActivation<State>) => Runtime | Promise<Runtime>): Descriptor {
  return { id, async load() { return { activate }; } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function manager(...descriptors: Descriptor[]) {
  return createModuleManager<Runtime, State>(descriptors);
}

test('module code is lazy and only one primary module is active at each lifecycle snapshot', async () => {
  const imports: string[] = [];
  const live = new Set<string>();
  const descriptor = (id: string): Descriptor => ({
    id,
    async load() {
      imports.push(id);
      return {
        activate({ resources }) {
          assert.equal(live.size, 0);
          live.add(id);
          resources.own('other', () => { live.delete(id); });
          return {};
        },
      };
    },
  });
  const runtime = manager(descriptor('standard'), descriptor('light-fixture'), descriptor('heavy-fixture'));
  const snapshots = [runtime.getSnapshot()];
  const unsubscribe = runtime.subscribe(() => snapshots.push(runtime.getSnapshot()));
  try {
    assert.deepEqual(imports, []);
    assert.equal(await runtime.activate('standard'), 'active');
    assert.deepEqual(imports, ['standard']);
    assert.equal(runtime.getActive()?.id, 'standard');
    assert.equal(await runtime.activate('light-fixture'), 'active');
    assert.deepEqual(imports, ['standard', 'light-fixture']);
    assert.equal(runtime.getActive()?.id, 'light-fixture');
    assert.deepEqual([...live], ['light-fixture']);
    assert.ok(snapshots.some((snapshot) => snapshot.modules[0]?.phase === 'suspending'));
    assert.equal(runtime.getSnapshot().modules[0]?.phase, 'suspended');
    assert.equal(runtime.getSnapshot().modules[2]?.phase, 'unloaded');
    for (const snapshot of snapshots) {
      const active = snapshot.modules.filter((entry) => entry.phase === 'active');
      assert.ok(active.length <= 1);
      assert.equal(snapshot.activeId, active[0]?.id ?? null);
    }
    const count = snapshots.length;
    unsubscribe();
    await runtime.suspend();
    assert.equal(snapshots.length, count);
    assert.equal(live.size, 0);
    assert.deepEqual(runtime.getSnapshot().resources, empty);
  } finally {
    await runtime.close();
  }
});

test('suspension restores compact state, termination discards it, and repeated activation is idempotent', async () => {
  const activations: Array<State | undefined> = [];
  const runtime = manager(module('standard', ({ previousState }) => {
    activations.push(previousState);
    const instance: Runtime = {
      value: previousState?.value ?? 0,
      snapshot() { return { value: instance.value ?? 0 }; },
    };
    return instance;
  }), module('fixture', () => ({})));

  try {
    const startup = runtime.activate('standard');
    assert.equal(runtime.activate('standard'), startup);
    assert.equal(await startup, 'active');
    const standard = runtime.getActive()?.instance;
    assert.ok(standard);
    standard.value = 21;
    assert.equal(await runtime.activate('fixture'), 'active');
    assert.equal(await runtime.activate('standard'), 'active');
    assert.equal(runtime.getActive()?.instance.value, 21);
    assert.deepEqual(activations, [undefined, { value: 21 }]);
    assert.equal(await runtime.terminate('standard'), 'terminated');
    assert.equal(runtime.getActive(), undefined);
    assert.equal(await runtime.activate('standard'), 'active');
    assert.equal(runtime.getActive()?.instance.value, 0);
    assert.equal(await runtime.suspend(), 'suspended');
    assert.equal(runtime.getSnapshot().modules[0]?.phase, 'suspended');
  } finally {
    await runtime.close();
  }
});

test('a lazy import abandoned by a newer selection never activates', { timeout: 4_000 }, async () => {
  const started = deferred<void>();
  const abandoned = deferred<Awaited<ReturnType<Descriptor['load']>>>();
  let staleActivations = 0;
  const runtime = manager({
    id: 'slow',
    load() {
      started.resolve();
      return abandoned.promise;
    },
  }, module('standard', () => ({})));
  try {
    const first = runtime.activate('slow');
    await started.promise;
    const latest = runtime.activate('standard');
    assert.deepEqual(await Promise.all([first, latest]), ['superseded', 'active']);
    abandoned.resolve({ activate() { staleActivations++; return {}; } });
    await tick();
    assert.equal(staleActivations, 0);
    assert.equal(runtime.getActive()?.id, 'standard');
    assert.equal(runtime.getSnapshot().modules[0]?.phase, 'suspended');
  } finally {
    await runtime.close();
  }
});

test('a loader deadline recovers without activating late imports or retaining a timer', { timeout: 4_000 }, async () => {
  const late = deferred<Awaited<ReturnType<Descriptor['load']>>>();
  let staleStarts = 0;
  const runtime = createModuleManager<Runtime, State>([
    { id: 'silent-loader', load: () => late.promise },
    module('fallback', () => ({})),
  ], { startupMs: 40 });
  try {
    assert.equal(await runtime.activate('silent-loader'), 'recoverable_failure');
    assert.equal(runtime.getSnapshot().modules[0]?.failure, 'startup_timeout');
    assert.equal(await runtime.activate('fallback'), 'active');
    late.resolve({ activate() { staleStarts++; return {}; } });
    await tick();
    assert.equal(staleStarts, 0);
    assert.equal(runtime.getActive()?.id, 'fallback');
  } finally {
    await runtime.close();
  }
});

test('an activation deadline aborts resources and disposes the old completion after retry', { timeout: 4_000 }, async () => {
  const late = deferred<Runtime>();
  let activationCount = 0;
  let exits = 0;
  let lateDisposals = 0;
  let oldScope: AbortSignal | undefined;
  const runtime = createModuleManager<Runtime, State>([module('silent-activation', ({ signal, resources }) => {
    activationCount++;
    resources.own('worker', () => { exits++; });
    if (activationCount > 1) return { value: 42 };
    oldScope = signal;
    return late.promise;
  })], { startupMs: 40 });
  try {
    assert.equal(await runtime.activate('silent-activation'), 'recoverable_failure');
    assert.equal(runtime.getSnapshot().modules[0]?.failure, 'startup_timeout');
    assert.equal(oldScope?.aborted, true);
    assert.equal(exits, 1);
    assert.equal(await runtime.activate('silent-activation'), 'active');
    late.resolve({ dispose() { lateDisposals++; } });
    await tick();
    assert.equal(lateDisposals, 1);
    assert.equal(runtime.getActive()?.instance.value, 42);
    assert.deepEqual(runtime.getSnapshot().resources, { ...empty, worker: 1 });
  } finally {
    await runtime.close();
  }
});

test('global clear remains a barrier when a new selection arrives and removes all retained values', async () => {
  const editable = (id: string) => module(id, ({ previousState }) => {
    const instance: Runtime = { value: previousState?.value ?? 0, snapshot: () => ({ value: instance.value ?? 0 }) };
    return instance;
  });
  const runtime = manager(editable('existing'), editable('second'), editable('unused'));
  try {
    await runtime.activate('existing');
    const first = runtime.getActive()?.instance;
    assert.ok(first);
    first.value = 8;
    await runtime.activate('second');
    const active = runtime.getActive()?.instance;
    assert.ok(active);
    active.value = 21;
    const cleared = runtime.clearSession();
    const selectedDuringClear = runtime.activate('existing');
    assert.equal(await cleared, 'terminated');
    assert.equal(await selectedDuringClear, 'active');
    assert.equal(runtime.getActive()?.instance.value, 0);
    assert.equal(runtime.getSnapshot().modules[2]?.phase, 'unloaded');
    await runtime.activate('second');
    assert.equal(runtime.getActive()?.instance.value, 0);
  } finally {
    await runtime.close();
  }
});

test('switching cancels a pending activation and retires resources acquired by a late generation', { timeout: 4_000 }, async () => {
  const started = deferred<ModuleActivation<State>>();
  const late = deferred<Runtime>();
  const trace: string[] = [];
  const runtime = manager(module('slow', (context) => {
    context.signal.addEventListener('abort', () => trace.push('cancelled'), { once: true });
    context.resources.own('worker', () => trace.push('worker-closed'));
    context.resources.own('graphics', () => trace.push('graphics-released'));
    started.resolve(context);
    return late.promise;
  }), module('standard', () => {
    trace.push('replacement-active');
    return {};
  }));
  try {
    const first = runtime.activate('slow');
    const context = await started.promise;
    assert.deepEqual(runtime.getSnapshot().resources, { ...empty, worker: 1, graphics: 1 });
    assert.equal(await runtime.activate('standard'), 'active');
    assert.equal(await first, 'superseded');
    assert.equal(context.signal.aborted, true);
    assert.deepEqual(trace, ['cancelled', 'graphics-released', 'worker-closed', 'replacement-active']);
    context.resources.own('cache', () => trace.push('late-cache-released'))();
    late.resolve({ dispose() { trace.push('late-runtime-closed'); } });
    await tick();
    assert.deepEqual(trace.slice(-2), ['late-cache-released', 'late-runtime-closed']);
    assert.deepEqual(runtime.getSnapshot().resources, empty);
    assert.equal(runtime.getActive()?.id, 'standard');
  } finally {
    await runtime.close();
  }
});

test('load, activation, runtime, snapshot and disposal failures stay local and recoverable', async () => {
  let failingLoad = true;
  let reportFailure: () => void = () => {};
  let disposed = 0;
  let cleanupResumed = 0;
  const runtime = manager({
    id: 'retry',
    async load() {
      if (failingLoad) throw new Error('private failure text');
      return {
        activate(context) {
          reportFailure = context.reportFailure;
          context.resources.own('worker', () => { disposed++; });
          const instance: Runtime = {
            value: context.previousState?.value ?? 48,
            snapshot() { return { value: instance.value ?? 0 }; },
          };
          return instance;
        },
      };
    },
  }, module('setup-failure', ({ resources }) => {
    resources.own('worker', () => { disposed++; });
    throw new Error('setup');
  }), module('snapshot-failure', () => ({
    snapshot() { throw new Error('snapshot'); },
  })), module('cleanup-failure', ({ resources }) => {
    resources.own('cache', () => { cleanupResumed++; });
    resources.own('other', () => { throw new Error('cleanup'); });
    return {};
  }));
  try {
    assert.equal(await runtime.activate('retry'), 'recoverable_failure');
    assert.equal(runtime.getSnapshot().modules[0]?.failure, 'load_failed');
    assert.equal(JSON.stringify(runtime.getSnapshot()).includes('private failure text'), false);
    failingLoad = false;
    assert.equal(await runtime.activate('retry'), 'active');
    const staleFailure = reportFailure;
    staleFailure();
    assert.equal(runtime.getSnapshot().modules[0]?.failure, 'runtime_failed');
    assert.equal(disposed, 1);
    assert.equal(await runtime.activate('retry'), 'active');
    assert.equal(runtime.getActive()?.instance.value, 48);
    staleFailure();
    assert.equal(runtime.getActive()?.id, 'retry');
    assert.equal(await runtime.activate('setup-failure'), 'recoverable_failure');
    assert.equal(runtime.getSnapshot().modules[1]?.failure, 'activation_failed');
    assert.equal(disposed, 3);
    assert.equal(await runtime.activate('snapshot-failure'), 'active');
    assert.equal(await runtime.suspend(), 'recoverable_failure');
    assert.equal(runtime.getSnapshot().modules[2]?.failure, 'snapshot_failed');
    assert.equal(await runtime.activate('cleanup-failure'), 'active');
    assert.equal(await runtime.suspend(), 'recoverable_failure');
    assert.equal(runtime.getSnapshot().modules[3]?.failure, 'disposal_failed');
    assert.equal(cleanupResumed, 1);
    assert.deepEqual(runtime.getSnapshot().resources, empty);
  } finally {
    await runtime.close();
  }
});

test('terminating an inactive or queued module preserves the unrelated active session', async () => {
  const runtime = manager(module('standard', () => ({})), module('other', () => ({})));
  try {
    assert.equal(await runtime.activate('standard'), 'active');
    const queued = runtime.activate('other');
    assert.equal(await runtime.terminate('other'), 'terminated');
    assert.equal(await queued, 'superseded');
    assert.equal(runtime.getActive()?.id, 'standard');
    assert.equal(runtime.getSnapshot().modules[1]?.phase, 'terminated');
    assert.equal(await runtime.terminate('other'), 'terminated');
    assert.equal(runtime.getActive()?.id, 'standard');
  } finally {
    await runtime.close();
  }
});

test('closing is idempotent, supersedes a stalled load, and blocks future allocations', { timeout: 4_000 }, async () => {
  const started = deferred<void>();
  const failed = deferred<Awaited<ReturnType<Descriptor['load']>>>();
  const runtime = manager({
    id: 'slow',
    load() {
      started.resolve();
      return failed.promise;
    },
  }, module('standard', () => ({})));
  const first = runtime.activate('slow');
  await started.promise;
  const closing = runtime.close();
  assert.equal(runtime.close(), closing);
  assert.equal(await runtime.activate('standard'), 'superseded');
  assert.deepEqual(await Promise.all([first, closing]), ['superseded', 'terminated']);
  failed.reject(new Error('late import failure'));
  await tick();
  assert.deepEqual(runtime.getSnapshot(), {
    activeId: null,
    modules: [{ id: 'slow', phase: 'terminated' }, { id: 'standard', phase: 'terminated' }],
    resources: empty,
    closed: true,
  });
});

test('aborting activation cannot reopen a manager during shutdown', { timeout: 4_000 }, async () => {
  const started = deferred<void>();
  const late = deferred<Runtime>();
  let reopened: Promise<unknown> | undefined;
  let fallbackOpened = false;
  const runtime = manager(module('slow', (context) => {
    context.signal.addEventListener('abort', () => {
      context.reportFailure();
      reopened = runtime.activate('fallback');
    }, { once: true });
    started.resolve();
    return late.promise;
  }), module('fallback', () => {
    fallbackOpened = true;
    return {};
  }));
  const first = runtime.activate('slow');
  await started.promise;
  assert.equal(await runtime.close(), 'terminated');
  assert.equal(await first, 'superseded');
  assert.equal(await reopened, 'superseded');
  assert.equal(runtime.getSnapshot().closed, true);
  assert.equal(fallbackOpened, false);
  late.resolve({});
});

test('switching interrupts an actual worker thread with long work and releases all fixture resources', { timeout: 8_000 }, async () => {
  let worker: Worker | undefined;
  let cache: Map<string, Uint8Array> | undefined;
  let vertices: Float32Array | undefined;
  let exits: Promise<unknown[]> | undefined;
  let flushed = 0;
  const runtime = manager(module('heavy-fixture', ({ resources }) => {
    worker = new Worker(new URL('./fixtures/lifecycle-worker.mjs', import.meta.url));
    exits = once(worker, 'exit');
    const ownedWorker = worker;
    resources.own('worker', () => { void ownedWorker.terminate(); });
    cache = new Map([['fixture', new Uint8Array(8 * 1024 * 1024).fill(1)]]);
    resources.own('cache', () => { cache?.clear(); cache = undefined; });
    vertices = new Float32Array(512 * 1024);
    vertices.fill(1);
    resources.own('graphics', () => { vertices = undefined; });
    const task = setTimeout(() => { flushed++; }, 30_000);
    resources.own('task', () => { clearTimeout(task); });
    return {};
  }), module('light-fixture', () => ({})));
  try {
    assert.equal(await runtime.activate('heavy-fixture'), 'active');
    assert.ok(worker && exits);
    assert.equal(cache?.get('fixture')?.byteLength, 8 * 1024 * 1024);
    assert.equal(vertices?.byteLength, 2 * 1024 * 1024);
    assert.deepEqual(runtime.getSnapshot().resources, { task: 1, worker: 1, cache: 1, graphics: 1, other: 0 });
    const result = once(worker, 'message');
    worker.postMessage('long-task');
    assert.deepEqual(await result, ['started']);
    assert.equal(await runtime.activate('light-fixture'), 'active');
    assert.notDeepEqual(await exits, [0]);
    assert.equal(worker.threadId, -1);
    assert.equal(cache, undefined);
    assert.equal(vertices, undefined);
    assert.equal(flushed, 0);
    assert.deepEqual(runtime.getSnapshot().resources, empty);
  } finally {
    await runtime.close();
    await exits;
  }
});

test('repeated light and heavy cycles do not carry worker, cache or graphics ownership into idle', async () => {
  const live = new Set<string>();
  let registrations = 0;
  let releases = 0;
  const runtime = manager(module('standard', () => ({})), module('fixture', ({ resources }) => {
    for (const kind of ['worker', 'cache', 'graphics'] as const) {
      live.add(kind);
      registrations++;
      resources.own(kind, () => {
        live.delete(kind);
        releases++;
      });
    }
    const release = resources.own('other', () => { releases++; });
    registrations++;
    release();
    release();
    return {};
  }));

  try {
    for (let i = 0; i < 32; i++) {
      assert.equal(await runtime.activate('fixture'), 'active');
      assert.equal(live.size, 3);
      assert.equal(await runtime.activate('standard'), 'active');
      assert.equal(live.size, 0);
      await runtime.suspend();
      assert.deepEqual(runtime.getSnapshot().resources, empty);
    }
    assert.equal(registrations, 128);
    assert.equal(releases, registrations);
  } finally {
    await runtime.close();
  }
});

function secondaryPolicy(profile: AdaptiveProfile) {
  return updateAdaptive(undefined, profile, {
    visible: true, runtime: 'web', graphicsApi: 'unavailable', batteryApi: 'unavailable',
  }, 0).policy;
}

test('background work defers in Ultra Light, admits configured parallelism, and cancels on suspension', { timeout: 4_000 }, async () => {
  const capacities: number[] = [];
  const discovery = new AbortController();
  for (const profile of ADAPTIVE_PROFILES) {
    const work = createModuleWork(discovery.signal, secondaryPolicy(profile));
    capacities.push(work.getSnapshot().concurrency);
    work.close();
  }
  assert.deepEqual(capacities, [0, 1, 2, 3, 4]);

  const gates = Array.from({ length: 6 }, () => deferred<number>());
  const admitted = Array.from({ length: 6 }, () => deferred<void>());
  const starts: number[] = [];
  const aborted: number[] = [];
  let background: ReturnType<typeof createModuleWork> | undefined;
  const runtime = manager(module('test-secondary', ({ signal }) => {
    background = createModuleWork(signal, secondaryPolicy('ultra_light'));
    return {};
  }));

  try {
    await runtime.activate('test-secondary');
    assert.ok(background);
    const work = background;
    const results = gates.map(({ promise }, index) => work.submit(async (signal) => {
      starts.push(index);
      const abort = () => aborted.push(index);
      signal.addEventListener('abort', abort, { once: true });
      admitted[index]?.resolve();
      try { return await promise; }
      finally { signal.removeEventListener('abort', abort); }
    }));
    await tick();
    assert.deepEqual(starts, []);
    assert.deepEqual(work.getSnapshot(), { active: 0, queued: 6, concurrency: 0, closed: false });

    work.setPolicy(secondaryPolicy('efficiency'));
    await admitted[0]?.promise;
    assert.deepEqual(starts, [0]);
    assert.deepEqual(work.getSnapshot(), { active: 1, queued: 5, concurrency: 1, closed: false });

    work.setPolicy(secondaryPolicy('maximum'));
    await admitted[3]?.promise;
    assert.deepEqual(starts, [0, 1, 2, 3]);
    assert.deepEqual(work.getSnapshot(), { active: 4, queued: 2, concurrency: 4, closed: false });

    work.setPolicy(secondaryPolicy('efficiency'));
    for (let index = 0; index < 3; index++) {
      gates[index]?.resolve(index);
      assert.deepEqual(await results[index], { status: 'completed', value: index });
    }
    await tick();
    assert.deepEqual(starts, [0, 1, 2, 3]);
    assert.deepEqual(work.getSnapshot(), { active: 1, queued: 2, concurrency: 1, closed: false });
    gates[3]?.resolve(3);
    assert.deepEqual(await results[3], { status: 'completed', value: 3 });
    await admitted[4]?.promise;
    assert.deepEqual(starts, [0, 1, 2, 3, 4]);

    assert.equal(await runtime.suspend(), 'suspended');
    assert.deepEqual(await Promise.all(results.slice(4)), [{ status: 'cancelled' }, { status: 'cancelled' }]);
    assert.deepEqual(aborted, [4]);
    assert.deepEqual(work.getSnapshot(), { active: 0, queued: 0, concurrency: 1, closed: true });
    gates[4]?.reject(new Error('late task failure'));
    await tick();
    assert.deepEqual(starts, [0, 1, 2, 3, 4]);
  } finally {
    await runtime.close();
  }
});

test('background work has a bounded queue, isolates failures, and never launches after close', { timeout: 4_000 }, async () => {
  const scope = new AbortController();
  const work = createModuleWork(scope.signal, secondaryPolicy('ultra_light'));
  let ran = 0;
  const queued = Array.from({ length: MODULE_WORK_QUEUE_LIMIT }, () => work.submit(async () => { ran++; }));
  assert.deepEqual(await work.submit(async () => { ran++; }), { status: 'queue_full' });
  assert.equal(work.getSnapshot().queued, MODULE_WORK_QUEUE_LIMIT);
  scope.abort();
  assert.deepEqual(await Promise.all(queued), queued.map(() => ({ status: 'cancelled' })));
  assert.deepEqual(await work.submit(async () => { ran++; }), { status: 'cancelled' });
  assert.equal(ran, 0);

  const fresh = createModuleWork(new AbortController().signal, secondaryPolicy('maximum'));
  try {
    assert.deepEqual(await fresh.submit(async () => { throw new Error('fixture failure'); }), { status: 'failed' });
    assert.deepEqual(await fresh.submit(async () => 21), { status: 'completed', value: 21 });
  } finally {
    fresh.close();
  }
});
