import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { setImmediate as tick } from 'node:timers/promises';
import { ADAPTIVE_PROFILES, updateAdaptive } from '../src/adaptive.ts';
import { createModuleWork, MODULE_WORK_QUEUE_LIMIT } from '../src/module-work.ts';
import type { ModuleWorker } from '../src/module-work.ts';

interface Plan {
  reply?: unknown;
  postError?: boolean;
  terminationError?: boolean;
}

class TestWorker implements ModuleWorker {
  onmessage: ModuleWorker['onmessage'] = null;
  onmessageerror: ModuleWorker['onmessageerror'] = null;
  onerror: ModuleWorker['onerror'] = null;
  terminations = 0;
  posts = 0;
  readonly plan: Plan;
  readonly posted: (worker: TestWorker, request: unknown) => void;
  readonly released: (worker: TestWorker) => void;

  constructor(
    plan: Plan,
    posted: (worker: TestWorker, request: unknown) => void,
    released: (worker: TestWorker) => void,
  ) {
    this.plan = plan;
    this.posted = posted;
    this.released = released;
  }

  postMessage(request: unknown) {
    this.posts++;
    if (this.plan.postError) throw new DOMException('test clone error', 'DataCloneError');
    this.posted(this, request);
    if (Object.hasOwn(this.plan, 'reply')) {
      queueMicrotask(() => this.reply(this.plan.reply));
    }
  }

  terminate() {
    this.terminations++;
    if (this.plan.terminationError) throw new Error('fixture termination failed');
    this.released(this);
  }

  reply(value: unknown) {
    this.onmessage?.call(this as unknown as Worker, new MessageEvent('message', { data: value }));
  }

  capturedReply(value: unknown) {
    const handler = this.onmessage;
    assert.ok(handler);
    return () => handler.call(this as unknown as Worker, new MessageEvent('message', { data: value }));
  }

  error() {
    this.onerror?.call(this as unknown as AbstractWorker, new Event('error') as ErrorEvent);
  }

  messageError() {
    this.onmessageerror?.call(this as unknown as Worker, new MessageEvent('messageerror'));
  }
}

class Fleet {
  readonly workers: TestWorker[] = [];
  readonly live = new Set<TestWorker>();
  readonly order: unknown[] = [];
  peak = 0;

  task(request: string, plan: Plan = {}) {
    let recordStart!: (worker: TestWorker) => void;
    const started = new Promise<TestWorker>((resolve) => { recordStart = resolve; });
    const effects = { decodes: 0 };
    return {
      descriptor: {
        request,
        createWorker: () => {
          const worker = new TestWorker(plan, (instance, received) => {
            this.order.push(received);
            recordStart(instance);
          }, (instance) => { this.live.delete(instance); });
          this.workers.push(worker);
          this.live.add(worker);
          this.peak = Math.max(this.peak, this.live.size);
          return worker;
        },
        decode: (reply: unknown) => {
          effects.decodes++;
          if (typeof reply !== 'number') throw new TypeError('Expected a number from fixture.');
          return reply;
        },
      },
      started,
      effects,
    };
  }
}

test('Ultra Light admits essential, interactive and rendering workers while optional work defers', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  const fleet = new Fleet();
  try {
    const secondary = queue.submit(fleet.task('secondary', { reply: 0 }).descriptor, { kind: 'secondary', timeoutMs: 35 });
    assert.deepEqual(await queue.submit(fleet.task('optional', { reply: 0 }).descriptor, { kind: 'optional' }), { status: 'deferred' });
    for (const kind of ['essential', 'interactive', 'rendering'] as const) {
      assert.deepEqual(await queue.submit(fleet.task(kind, { reply: 11 }).descriptor, { kind }), { status: 'completed', value: 11 });
    }
    assert.deepEqual(await secondary, { status: 'deferred' });
    assert.deepEqual(fleet.order, ['essential', 'interactive', 'rendering']);
    assert.equal(fleet.peak, 1);
    assert.equal(fleet.live.size, 0);
    assert.equal(queue.getSnapshot().queued, 0);
  } finally {
    controller.abort();
  }
});

test('an essential timeout terminates an unresponsive worker and a queued essential request returns a valid result', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  const fleet = new Fleet();
  try {
    const unresponsive = fleet.task('first');
    const valid = fleet.task('next', { reply: 41 });
    const stuck = queue.submit(unresponsive.descriptor, { kind: 'essential', timeoutMs: 90 });
    const firstWorker = await unresponsive.started;
    const deliverStale = firstWorker.capturedReply(999);
    const next = queue.submit(valid.descriptor, { kind: 'essential', timeoutMs: 1200 });
    assert.deepEqual(await stuck, { status: 'timed_out' });
    assert.equal(firstWorker.terminations, 1);
    assert.equal(firstWorker.onmessage, null);
    assert.equal(firstWorker.onerror, null);
    assert.equal(firstWorker.onmessageerror, null);
    deliverStale();
    assert.equal(unresponsive.effects.decodes, 0);
    assert.deepEqual(await next, { status: 'completed', value: 41 });
    assert.deepEqual(fleet.order, ['first', 'next']);
    assert.equal(fleet.peak, 1);
    assert.equal(fleet.live.size, 0);
    assert.equal(queue.getSnapshot().active, 0);
    assert.equal(queue.getSnapshot().queued, 0);
    assert.equal(valid.effects.decodes, 1);
  } finally {
    controller.abort();
  }
});

test('a stalled secondary worker times out and the next secondary uses its recovered lane', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 2 });
  const fleet = new Fleet();
  try {
    const stuckTask = fleet.task('secondary-stuck');
    const stuck = queue.submit(stuckTask.descriptor, { kind: 'secondary', timeoutMs: 90 });
    const stuckWorker = await stuckTask.started;
    const successor = queue.submit(fleet.task('secondary-next', { reply: 4 }).descriptor, { kind: 'secondary' });
    const foreground = queue.submit(fleet.task('essential', { reply: 8 }).descriptor, { kind: 'essential' });
    assert.deepEqual(await foreground, { status: 'completed', value: 8 });
    assert.deepEqual(fleet.order, ['secondary-stuck', 'essential']);
    assert.deepEqual(await stuck, { status: 'timed_out' });
    assert.equal(stuckWorker.terminations, 1);
    assert.deepEqual(await successor, { status: 'completed', value: 4 });
    assert.deepEqual(fleet.order, ['secondary-stuck', 'essential', 'secondary-next']);
    assert.equal(fleet.peak, 2);
    assert.equal(fleet.live.size, 0);
  } finally {
    controller.abort();
  }
});

test('background saturation reserves admission and essentials outrank queued rendering work', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  const fleet = new Fleet();
  try {
    const ignored = Array.from({ length: MODULE_WORK_QUEUE_LIMIT }, (_, n) => queue.submit(fleet.task('background-' + n).descriptor));
    assert.deepEqual(await queue.submit(fleet.task('overflow').descriptor), { status: 'queue_full' });
    const blocking = fleet.task('foreground-active');
    const holding = queue.submit(blocking.descriptor, { kind: 'essential' });
    const current = await blocking.started;
    const frames = queue.submit(fleet.task('rendering', { reply: 2 }).descriptor, { kind: 'rendering' });
    const essential = queue.submit(fleet.task('essential', { reply: 1 }).descriptor, { kind: 'essential' });
    current.reply(0);
    assert.deepEqual(await Promise.all([holding, frames, essential]), [
      { status: 'completed', value: 0 },
      { status: 'completed', value: 2 },
      { status: 'completed', value: 1 },
    ]);
    assert.deepEqual(fleet.order, ['foreground-active', 'essential', 'rendering']);
    controller.abort();
    assert.ok((await Promise.all(ignored)).every((value) => value.status === 'cancelled'));
    assert.equal(fleet.live.size, 0);
    assert.equal(fleet.workers.length, 3);
  } finally {
    controller.abort();
  }
});

test('request cancellation frees a queued slot, invalidates old replies and permits a new task', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  const fleet = new Fleet();
  const queuedSignal = new AbortController();
  const activeSignal = new AbortController();
  try {
    const waiting = queue.submit(fleet.task('never-admitted').descriptor, { signal: queuedSignal.signal });
    queuedSignal.abort();
    assert.deepEqual(await waiting, { status: 'cancelled' });
    assert.equal(queue.getSnapshot().queued, 0);
    assert.equal(fleet.workers.length, 0);

    const hung = fleet.task('cancelled');
    const ongoing = queue.submit(hung.descriptor, { kind: 'essential', signal: activeSignal.signal });
    const oldWorker = await hung.started;
    const late = oldWorker.capturedReply(999);
    activeSignal.abort();
    assert.deepEqual(await ongoing, { status: 'cancelled' });
    assert.equal(oldWorker.terminations, 1);
    const following = fleet.task('valid');
    const successor = queue.submit(following.descriptor, { kind: 'essential' });
    const newWorker = await following.started;
    late();
    assert.equal(hung.effects.decodes, 0);
    assert.equal(newWorker.terminations, 0);
    newWorker.reply(2);
    assert.deepEqual(await successor, { status: 'completed', value: 2 });
    assert.equal(fleet.live.size, 0);
    assert.equal(fleet.peak, 1);
  } finally {
    controller.abort();
  }
});

test('cancellation during worker creation terminates the returned worker before the successor is admitted', async () => {
  const controller = new AbortController();
  const activeSignal = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  const fleet = new Fleet();
  try {
    const task = fleet.task('cancel-during-creation');
    const cancelled = queue.submit({
      ...task.descriptor,
      createWorker() {
        const worker = task.descriptor.createWorker();
        activeSignal.abort();
        return worker;
      },
    }, { kind: 'essential', signal: activeSignal.signal });
    const successor = queue.submit(fleet.task('successor', { reply: 6 }).descriptor, { kind: 'essential' });
    assert.deepEqual(await cancelled, { status: 'cancelled' });
    assert.deepEqual(await successor, { status: 'completed', value: 6 });
    assert.deepEqual(fleet.order, ['successor']);
    assert.deepEqual(fleet.workers.map(({ posts, terminations }) => ({ posts, terminations })), [
      { posts: 0, terminations: 1 },
      { posts: 1, terminations: 1 },
    ]);
    assert.equal(fleet.peak, 1);
    assert.equal(fleet.live.size, 0);
  } finally {
    controller.abort();
  }
});

test('timeout and cancellation recover essential admission under all five adaptive profiles', { timeout: 5_000 }, async () => {
  const signals = { visible: true, runtime: 'web', graphicsApi: 'unavailable', batteryApi: 'unavailable' } as const;
  for (const profile of ADAPTIVE_PROFILES) {
    const controller = new AbortController();
    const scope = createModuleWork(controller.signal, updateAdaptive(undefined, profile, signals, 0).policy);
    const fleet = new Fleet();
    try {
      const timedTask = fleet.task(profile + '-timeout');
      const timed = scope.submit(timedTask.descriptor, { kind: 'essential', timeoutMs: 75 });
      const timedWorker = await timedTask.started;
      assert.deepEqual(await timed, { status: 'timed_out' }, profile);
      assert.equal(timedWorker.terminations, 1);
      const activeSignal = new AbortController();
      const abortTask = fleet.task(profile + '-cancel');
      const aborted = scope.submit(abortTask.descriptor, { kind: 'essential', signal: activeSignal.signal });
      const abortedWorker = await abortTask.started;
      activeSignal.abort();
      assert.deepEqual(await aborted, { status: 'cancelled' }, profile);
      assert.equal(abortedWorker.terminations, 1);
      const valid = scope.submit(fleet.task(profile + '-valid', { reply: 22 }).descriptor, { kind: 'essential' });
      assert.deepEqual(await valid, { status: 'completed', value: 22 }, profile);
      assert.equal(scope.getSnapshot().active, 0);
      assert.equal(fleet.live.size, 0);
      assert.equal(fleet.peak, 1);
      assert.ok(fleet.workers.every((worker) => worker.terminations === 1 && worker.posts === 1));
    } finally {
      controller.abort();
    }
  }
});

test('foreground saturation rejects overflow without allocating extra workers', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 8 });
  const fleet = new Fleet();
  try {
    const stuck = fleet.task('active');
    const running = queue.submit(stuck.descriptor, { kind: 'essential' });
    await stuck.started;
    const waiting = Array.from({ length: MODULE_WORK_QUEUE_LIMIT }, (_, n) => (
      queue.submit(fleet.task('waiting-' + n).descriptor, { kind: 'essential' })
    ));
    assert.deepEqual(await queue.submit(fleet.task('overflow').descriptor, { kind: 'essential' }), { status: 'queue_full' });
    assert.equal(queue.getSnapshot().queued, MODULE_WORK_QUEUE_LIMIT);
    assert.equal(queue.getSnapshot().active, 1);
    controller.abort();
    assert.ok((await Promise.all([running, ...waiting])).every((value) => value.status === 'cancelled'));
    assert.equal(fleet.workers.length, 1);
    assert.equal(fleet.live.size, 0);
  } finally {
    controller.abort();
  }
});

test('repeated transport, decode, creation and post failures dispose workers without growing active ownership', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 2 });
  const fleet = new Fleet();
  try {
    for (let n = 0; n < 3; n++) {
      for (const mode of ['error', 'messageError'] as const) {
        const plan = fleet.task(mode);
        const failed = queue.submit(plan.descriptor, { kind: 'secondary' });
        const worker = await plan.started;
        worker[mode]();
        assert.deepEqual(await failed, { status: 'failed' });
        assert.equal(worker.terminations, 1);
      }
      const cloneFailure = fleet.task('post-fails', { postError: true });
      assert.deepEqual(await queue.submit(cloneFailure.descriptor), { status: 'failed' });
      const malformed = fleet.task('malformed', { reply: 'invalid' });
      assert.deepEqual(await queue.submit(malformed.descriptor), { status: 'failed' });
      const badFactory = { ...fleet.task('factory').descriptor, createWorker() { throw new Error('test creation failure'); } };
      assert.deepEqual(await queue.submit(badFactory), { status: 'failed' });
      assert.deepEqual(await queue.submit(fleet.task('recovered', { reply: n }).descriptor), { status: 'completed', value: n });
      assert.equal(queue.getSnapshot().active, 0);
      assert.equal(fleet.live.size, 0);
    }
    assert.equal(fleet.workers.length, 15);
    assert.equal(fleet.peak, 1);
    assert.ok(fleet.workers.every((worker) => worker.terminations === 1));
  } finally {
    controller.abort();
  }
});

test('a termination failure retains physical ownership and stops admission rather than overcommitting', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  const fleet = new Fleet();
  try {
    const broken = fleet.task('kill-fails', { terminationError: true });
    const ongoing = queue.submit(broken.descriptor, { kind: 'essential', timeoutMs: 75 });
    const worker = await broken.started;
    const next = queue.submit(fleet.task('must-not-start', { reply: 1 }).descriptor, { kind: 'essential', timeoutMs: 140 });
    assert.notEqual((await ongoing).status, 'completed');
    assert.notEqual((await next).status, 'completed');
    await tick();
    assert.equal(worker.terminations, 1);
    assert.equal(worker.onmessage, null);
    assert.equal(queue.getSnapshot().active, 1);
    assert.equal(fleet.live.size, 1);
    assert.equal(fleet.workers.length, 1);
  } finally {
    controller.abort();
  }
});
