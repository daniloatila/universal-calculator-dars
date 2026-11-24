import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createModuleWork, MODULE_WORK_QUEUE_LIMIT } from '../src/module-work.ts';

test('Ultra Light admits essential, interactive and rendering tasks while optional work settles explicitly', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  try {
    const secondary = queue.submit(async () => 0, { kind: 'secondary', timeoutMs: 35 });
    assert.deepEqual(await queue.submit(async () => 0, { kind: 'optional' }), { status: 'deferred' });
    for (const kind of ['essential', 'interactive', 'rendering'] as const) {
      assert.deepEqual(await queue.submit(async () => 'done', { kind }), { status: 'completed', value: 'done' });
    }
    assert.deepEqual(await secondary, { status: 'deferred' });
    assert.equal(queue.getSnapshot().queued, 0);
  } finally {
    controller.abort();
  }
});

test('an essential request settles at its deadline even if the task hangs', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  let observedAbort = false;
  try {
    const stuck = queue.submit((signal) => {
      signal.addEventListener('abort', () => { observedAbort = true; }, { once: true });
      return new Promise<never>(() => {});
    }, { kind: 'essential', timeoutMs: 45 });
    const next = queue.submit(async () => 1, { kind: 'essential', timeoutMs: 65 });
    assert.deepEqual(await stuck, { status: 'timed_out' });
    assert.equal(observedAbort, true);
    assert.deepEqual(await next, { status: 'timed_out' });
    assert.equal(queue.getSnapshot().active, 1);
    assert.equal(queue.getSnapshot().queued, 0);
  } finally {
    controller.abort();
  }
});

test('background saturation reserves admission, and essential requests lead queued rendering work', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  const order: string[] = [];
  let release!: () => void;
  try {
    const ignored = Array.from({ length: MODULE_WORK_QUEUE_LIMIT }, () => queue.submit(async () => 0));
    assert.deepEqual(await queue.submit(async () => 0), { status: 'queue_full' });
    const running = queue.submit(async () => new Promise<void>((resolve) => { release = resolve; }), { kind: 'essential' });
    await delay(15);
    assert.equal(typeof release, 'function');
    const frames = queue.submit(async () => { order.push('rendering'); }, { kind: 'rendering' });
    const essential = queue.submit(async () => { order.push('essential'); }, { kind: 'essential' });
    release();
    await Promise.all([running, frames, essential]);
    assert.deepEqual(order, ['essential', 'rendering']);
    controller.abort();
    assert.ok((await Promise.all(ignored)).every((value) => value.status === 'cancelled'));
  } finally {
    controller.abort();
  }
});

test('request cancellation frees a queued slot and ignores active late completion', async () => {
  const controller = new AbortController();
  const queue = createModuleWork(controller.signal, { pendingJobs: 1 });
  const user = new AbortController();
  try {
    const queued = queue.submit(async () => 0, { signal: user.signal });
    user.abort();
    assert.deepEqual(await queued, { status: 'cancelled' });
    assert.equal(queue.getSnapshot().queued, 0);

    const active = new AbortController();
    let ready!: () => void;
    const started = new Promise<void>((resolve) => { ready = resolve; });
    let late!: () => void;
    const ongoing = queue.submit(async () => new Promise<void>((resolve) => {
      late = resolve;
      ready();
    }), { kind: 'essential', signal: active.signal });
    await started;
    active.abort();
    assert.deepEqual(await ongoing, { status: 'cancelled' });
    late();
    assert.deepEqual(await queue.submit(async () => 2, { kind: 'essential' }), { status: 'completed', value: 2 });
  } finally {
    controller.abort();
  }
});
