import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGINE_LIMITS, startEngine } from '../src/engine.ts';
import type { EngineStatus, EngineWorker, Evaluation, EvaluationRequest, EvaluationResponse } from '../src/engine.ts';

const success: Evaluation = { ok: true, exact: '5', approximate: '5', value: 'test-opaque' };

class TestClock {
  now = 0;
  nextId = 0;
  tasks = new Map<number, { at: number; action: () => void }>();

  schedule = (action: () => void, delayMs: number) => {
    const id = ++this.nextId;
    this.tasks.set(id, { at: this.now + delayMs, action });
    return () => { this.tasks.delete(id); };
  };

  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.tasks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.at;
      task.action();
    }
    this.now = end;
  }
}

class TestWorker implements EngineWorker {
  onmessage: EngineWorker['onmessage'] = null;
  onmessageerror: EngineWorker['onmessageerror'] = null;
  onerror: EngineWorker['onerror'] = null;
  requests: EvaluationRequest[] = [];
  terminations = 0;
  rejectPost = false;

  postMessage(request: EvaluationRequest) {
    if (this.rejectPost) throw new DOMException('test', 'DataCloneError');
    this.requests.push(request);
  }

  terminate() { this.terminations++; }

  message(data: EvaluationResponse) {
    if (this.onmessage) Reflect.apply(this.onmessage, this, [new MessageEvent('message', { data })]);
  }

  result(result = success) {
    const last = this.requests.at(-1);
    assert.ok(last, 'worker did not receive an operation');
    this.message({ type: 'result', id: last.id, result });
  }
}

function setup() {
  const clock = new TestClock();
  const statuses: EngineStatus[] = [];
  const workers: TestWorker[] = [];
  const engine = startEngine((status) => statuses.push(status), {
    schedule: clock.schedule,
    createWorker: () => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker;
    },
  });
  function worker() {
    const current = workers.at(-1);
    assert.ok(current);
    return current;
  }
  return { clock, statuses, workers, worker, engine };
}

test('operations are serialized and pending value bindings are snapshotted', async () => {
  const { engine, worker } = setup();
  try {
    const first = engine.combine('left-opaque', 'right-opaque', true);
    const bindings = { '12': 'then-current' };
    const second = engine.evaluate('2+@12', bindings);
    bindings['12'] = 'mutated';
    assert.deepEqual(worker().requests, []);
    worker().message({ type: 'ready' });
    assert.deepEqual(worker().requests, [{ id: 1, type: 'combine', left: 'left-opaque', right: 'right-opaque', subtract: true }]);
    worker().result();
    assert.deepEqual(await first, success);
    assert.deepEqual(worker().requests[1], { id: 2, type: 'evaluate', input: '2+@12', bindings: { '12': 'then-current' } });
    worker().result();
    assert.deepEqual(await second, success);
  } finally {
    engine.close();
  }
});

test('deadline terminates the active worker, rejects its late result and dispatches queued work after recovery', async () => {
  const { engine, clock, statuses, workers, worker } = setup();
  try {
    const firstWorker = worker();
    firstWorker.message({ type: 'ready' });
    const timedOut = engine.evaluate('1+2');
    const next = engine.evaluate('2+3');
    const oldMessage = firstWorker.onmessage;
    assert.ok(oldMessage);
    let nextSettlements = 0;
    void next.then(() => nextSettlements++);
    clock.advance(ENGINE_LIMITS.jobMs - 1);
    assert.equal(firstWorker.terminations, 0);
    clock.advance(1);
    assert.equal(firstWorker.terminations, 1);
    assert.deepEqual(await timedOut, { ok: false, code: 'engine_timeout' });
    clock.advance(ENGINE_LIMITS.recoveryDelayMs);
    assert.equal(workers.length, 2);
    worker().message({ type: 'ready' });
    Reflect.apply(oldMessage, firstWorker, [new MessageEvent('message', { data: { type: 'result', id: 2, result: success } })]);
    await Promise.resolve();
    assert.equal(nextSettlements, 0);
    worker().result();
    assert.deepEqual(await next, success);
    assert.equal(nextSettlements, 1);
    assert.deepEqual(statuses, ['ready', 'loading', 'ready']);
  } finally {
    engine.close();
  }
});

test('pre-aborted, queued, and active signals release resources without returning stale work', async () => {
  const { engine, clock, workers, worker } = setup();
  try {
    const firstWorker = worker();
    firstWorker.message({ type: 'ready' });
    const preAborted = AbortSignal.abort();
    assert.deepEqual(await engine.evaluate('0', {}, preAborted), { ok: false, code: 'engine_cancelled' });
    const activeSignal = new AbortController();
    const queueSignal = new AbortController();
    const active = engine.evaluate('1+2', {}, activeSignal.signal);
    const queued = engine.combine('value', 'value', false, queueSignal.signal);
    queueSignal.abort();
    assert.deepEqual(await queued, { ok: false, code: 'engine_cancelled' });
    assert.equal(firstWorker.terminations, 0);
    assert.equal(firstWorker.requests.length, 1);
    activeSignal.abort();
    assert.deepEqual(await active, { ok: false, code: 'engine_cancelled' });
    assert.equal(firstWorker.terminations, 1);
    assert.equal(workers.length, 2);
    const next = engine.evaluate('2+3');
    worker().message({ type: 'ready' });
    worker().result();
    assert.deepEqual(await next, success);
    clock.advance(2 * ENGINE_LIMITS.startupMs);
    assert.equal(workers.length, 2);
  } finally {
    engine.close();
  }
});

test('startup constructor errors, initialization failures, and hangs exhaust a bounded recovery budget', async () => {
  const clock = new TestClock();
  const statuses: EngineStatus[] = [];
  const failed = new TestWorker();
  const hangs = new TestWorker();
  let attempts = 0;
  const engine = startEngine((status) => statuses.push(status), {
    schedule: clock.schedule,
    createWorker: () => {
      attempts++;
      if (attempts === 1) throw new Error('constructor failure');
      return attempts === 2 ? failed : hangs;
    },
  });
  try {
    const pending = engine.evaluate('2+3');
    clock.advance(ENGINE_LIMITS.recoveryDelayMs);
    failed.message({ type: 'unavailable' });
    clock.advance(ENGINE_LIMITS.recoveryDelayMs + ENGINE_LIMITS.startupMs);
    assert.deepEqual(await pending, { ok: false, code: 'engine_unavailable' });
    assert.deepEqual(await engine.evaluate('2+3'), { ok: false, code: 'engine_unavailable' });
    assert.equal(attempts, ENGINE_LIMITS.recoveryAttempts + 1);
    assert.equal(failed.terminations, 1);
    assert.equal(hangs.terminations, 1);
    assert.deepEqual(statuses, ['unavailable']);
    assert.equal(clock.tasks.size, 0);
  } finally {
    engine.close();
  }
});

test('transport and malformed result faults recover, and healthy responses reset the consecutive retry budget', async () => {
  const { engine, clock, workers, worker } = setup();
  try {
    for (const fault of ['postMessage', 'malformed', 'messageError', 'error']) {
      worker().message({ type: 'ready' });
      worker().rejectPost = fault === 'postMessage';
      const current = engine.evaluate('2+3');
      if (fault === 'malformed') {
        const id = worker().requests.at(-1)?.id;
        assert.ok(id);
        worker().message({ type: 'result', id, result: { ok: true, exact: '5', approximate: '5' } as Evaluation });
      }
      if (fault === 'messageError') {
        const callback = worker().onmessageerror;
        assert.ok(callback);
        Reflect.apply(callback, worker(), [new MessageEvent('messageerror')]);
      }
      if (fault === 'error') {
        const callback = worker().onerror;
        assert.ok(callback);
        const event = new Event('error', { cancelable: true });
        Reflect.apply(callback, worker(), [event]);
        assert.equal(event.defaultPrevented, true);
      }
      assert.deepEqual(await current, { ok: false, code: 'engine_unavailable' });
      clock.advance(ENGINE_LIMITS.recoveryDelayMs);
      worker().message({ type: 'ready' });
      const next = engine.evaluate('2+3');
      worker().result();
      assert.deepEqual(await next, success);
    }
    assert.equal(workers.length, 5);
  } finally {
    engine.close();
  }
});

test('repeated runtime hangs exhaust the recovery budget when handshakes never yield a valid calculation', async () => {
  const { engine, clock, worker, workers, statuses } = setup();
  try {
    for (let index = 0; index <= ENGINE_LIMITS.recoveryAttempts; index++) {
      worker().message({ type: 'ready' });
      const request = engine.evaluate('1+1');
      clock.advance(ENGINE_LIMITS.jobMs + ENGINE_LIMITS.recoveryDelayMs);
      assert.deepEqual(await request, { ok: false, code: 'engine_timeout' });
    }
    assert.deepEqual(await engine.evaluate('1+1'), { ok: false, code: 'engine_unavailable' });
    assert.equal(workers.length, ENGINE_LIMITS.recoveryAttempts + 1);
    assert.equal(statuses.at(-1), 'unavailable');
    assert.equal(clock.tasks.size, 0);
  } finally {
    engine.close();
  }
});

test('queue cap and closing prevent orphaned timers and settle every pending operation', async () => {
  const { engine, clock, worker, workers } = setup();
  const pending = Array.from({ length: ENGINE_LIMITS.pendingJobs }, () => engine.evaluate('2+3'));
  assert.deepEqual(await engine.evaluate('2+3'), { ok: false, code: 'engine_busy' });
  worker().message({ type: 'ready' });
  assert.equal(worker().requests.length, 1);
  engine.close();
  engine.close();
  assert.deepEqual(await Promise.all(pending), pending.map(() => ({ ok: false, code: 'engine_unavailable' })));
  assert.equal(worker().terminations, 1);
  assert.equal(clock.tasks.size, 0);
  clock.advance(2 * ENGINE_LIMITS.startupMs);
  assert.equal(workers.length, 1);
});

test('closing during retry backoff cancels delayed worker creation', async () => {
  const { engine, clock, worker, workers } = setup();
  const pending = engine.evaluate('1+1');
  worker().message({ type: 'unavailable' });
  engine.close();
  assert.deepEqual(await pending, { ok: false, code: 'engine_unavailable' });
  clock.advance(ENGINE_LIMITS.recoveryDelayMs + ENGINE_LIMITS.startupMs);
  assert.equal(workers.length, 1);
  assert.equal(clock.tasks.size, 0);
});
