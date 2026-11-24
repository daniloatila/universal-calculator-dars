import assert from 'node:assert/strict';
import test from 'node:test';

import { ADAPTIVE_PROFILES, isAdaptiveSelection, updateAdaptive } from '../src/adaptive.ts';
import type { AdaptiveSignals, AdaptiveSnapshot } from '../src/adaptive.ts';
import { startAdaptive } from '../src/adaptive-browser.ts';
import type { AdaptiveHost } from '../src/adaptive-browser.ts';
import { decodeNativeReading } from '../src/adaptive-native.ts';

const standard: AdaptiveSignals = {
  visible: true, runtime: 'web', graphicsApi: 'exposed', batteryApi: 'unavailable',
};
const workstation: AdaptiveSignals = { ...standard, hardwareThreads: 16, deviceMemoryGiB: 8 };

test('missing capability data leads to a conservative default and stays unknown', () => {
  const state = updateAdaptive(undefined, 'auto', standard, 0);
  assert.equal(state.profile, 'balanced');
  assert.equal(state.reason, 'default');
  assert.equal(state.signals.deviceMemoryGiB, undefined);
  assert.equal(state.signals.gpuAvailable, undefined);
  assert.equal(state.signals.batteryLevel, undefined);
  assert.ok(isAdaptiveSelection('auto'));
  assert.ok(ADAPTIVE_PROFILES.every(isAdaptiveSelection));
  assert.equal(isAdaptiveSelection('invented'), false);
});

test('manual profiles impose distinct operational budgets and never modify arithmetic', () => {
  const policies = ADAPTIVE_PROFILES.map((profile) => updateAdaptive(undefined, profile, standard, 0).policy);
  assert.deepEqual(policies.map((policy) => policy.workerIdleMs), [1000, 4000, 12000, 45000, 120000]);
  assert.deepEqual(policies.map((policy) => policy.pendingJobs), [1, 2, 4, 6, 8]);
  assert.deepEqual(policies.map((policy) => policy.cacheEntries), [0, 4, 8, 16, 32]);
  assert.deepEqual(policies.map((policy) => policy.graphicsFrameIntervalMs), [null, 100, 50, 34, 17]);
  assert.deepEqual(policies.map((policy) => policy.reducedEffects), [true, true, false, false, false]);
  assert.ok(policies.every((policy) => !('mathPrecision' in policy) && policy.suspendWhenHidden));
});

test('pressure bands and sustained readings avoid rapid profile oscillation', () => {
  const read = (pressure: number) => ({ ...workstation, nativeMemoryPressure: pressure });
  let state = updateAdaptive(undefined, 'auto', read(0.5), 0);
  state = updateAdaptive(state, 'auto', read(0.86), 1000);
  assert.equal(state.pending?.readyAt, 15000);
  state = updateAdaptive(state, 'auto', read(0.83), 9000);
  assert.equal(state.pending, undefined);
  state = updateAdaptive(state, 'auto', read(0.87), 10000);
  assert.equal(state.pending?.readyAt, 18000);
  state = updateAdaptive(state, 'auto', read(0.88), 18000);
  assert.equal(state.profile, 'efficiency');
  assert.equal(state.reason, 'memory_pressure');
  state = updateAdaptive(state, 'auto', read(0.81), 30000);
  assert.equal(state.profile, 'efficiency');
  assert.equal(state.pending, undefined);
  state = updateAdaptive(state, 'auto', read(0.7), 31000);
  state = updateAdaptive(state, 'auto', read(0.7), 50999);
  assert.equal(state.profile, 'efficiency');
  state = updateAdaptive(state, 'auto', read(0.7), 51000);
  assert.equal(state.profile, 'balanced');
});

test('critical memory or temperature reduces operational demand even under manual Maximum', () => {
  let state = updateAdaptive(undefined, 'maximum', standard, 0);
  state = updateAdaptive(state, 'maximum', { ...standard, jsHeapPressure: 0.96 }, 100);
  assert.equal(state.profile, 'ultra_light');
  assert.equal(state.reason, 'memory_pressure');
  state = updateAdaptive(state, 'maximum', { ...standard, jsHeapPressure: 0.93 }, 200);
  assert.equal(state.profile, 'ultra_light');
  state = updateAdaptive(state, 'maximum', standard, 500);
  assert.equal(state.pending?.readyAt, 20_500);
  state = updateAdaptive(state, 'maximum', standard, 20_500);
  assert.equal(state.profile, 'maximum');
  state = updateAdaptive(state, 'maximum', { ...standard, thermalState: 'severe' }, 20_600);
  assert.equal(state.profile, 'ultra_light');
  assert.equal(state.reason, 'thermal_pressure');
});

test('limited devices, charged and depleted batteries, and contention use the observed inputs', () => {
  for (const [signals, profile, reason] of [
    [{ hardwareThreads: 2 }, 'ultra_light', 'limited_device'],
    [{ deviceMemoryGiB: 4 }, 'efficiency', 'limited_device'],
    [{ charging: false, batteryLevel: 0.08 }, 'ultra_light', 'low_battery'],
    [{ charging: false, batteryLevel: 0.18 }, 'efficiency', 'low_battery'],
    [{ charging: true, batteryLevel: 0.08 }, 'balanced', 'default'],
    [{ nativeCpuLoad: 0.9 }, 'efficiency', 'cpu_contention'],
    [{ mainThreadDelayMs: 110 }, 'efficiency', 'cpu_contention'],
    [{ mainThreadDelayMs: 58 }, 'balanced', 'cpu_contention'],
  ] as const) {
    const state = updateAdaptive(undefined, 'auto', { ...workstation, ...signals }, 0);
    assert.equal(state.profile, profile);
    assert.equal(state.reason, reason);
  }
});

test('automatic high profiles require demand and known headroom for meaningful gains', () => {
  const demand = { ...workstation, interactionLatencyMs: 130 };
  assert.equal(updateAdaptive(undefined, 'auto', workstation, 0).profile, 'balanced');
  assert.equal(updateAdaptive(undefined, 'auto', { ...standard, interactionLatencyMs: 130 }, 0).profile, 'balanced');
  assert.equal(updateAdaptive(undefined, 'auto', demand, 0).profile, 'performance');
  assert.equal(updateAdaptive(undefined, 'auto', { ...demand, charging: true }, 0).profile, 'maximum');
  assert.equal(updateAdaptive(undefined, 'auto', { ...demand, graphicsApi: 'unavailable' }, 0).profile, 'balanced');
  const constrained = updateAdaptive(undefined, 'maximum', { ...demand, gpuAvailable: false }, 0);
  assert.equal(constrained.profile, 'maximum');
  assert.equal(constrained.policy.graphicsFrameIntervalMs, null);
});

test('a hidden window has immediate protection and restores the selected mode when shown', () => {
  let state = updateAdaptive(undefined, 'performance', standard, 0);
  state = updateAdaptive(state, 'performance', { ...standard, visible: false }, 1);
  assert.equal(state.selection, 'performance');
  assert.equal(state.profile, 'ultra_light');
  assert.equal(state.reason, 'hidden');
  state = updateAdaptive(state, 'performance', standard, 2);
  assert.equal(state.profile, 'performance');
  assert.equal(state.reason, 'manual');
});

function controlledHost(initial: AdaptiveSignals = standard) {
  let now = 0;
  let signals = initial;
  let listener: (() => void) | undefined;
  let sequence = 0;
  const polls: boolean[] = [];
  const tasks = new Map<number, { at: number; callback: () => void }>();
  const host: AdaptiveHost = {
    read(diagnostics) {
      polls.push(diagnostics);
      return {
        ...signals, jsHeapUsedBytes: diagnostics ? 10_000 : undefined,
        jsHeapLimitBytes: diagnostics ? 10_000_000 : undefined,
      };
    },
    now: () => now,
    schedule(delay, callback) {
      const id = ++sequence;
      tasks.set(id, { at: now + delay, callback });
      return () => { tasks.delete(id); };
    },
    listen(refresh) {
      listener = refresh;
      return () => { listener = undefined; };
    },
  };
  return {
    host, polls,
    setTime(time: number) {
      now = time;
      for (const [id, task] of [...tasks]) {
        if (task.at > time) continue;
        tasks.delete(id);
        task.callback();
      }
    },
    setSignals(patch: Partial<AdaptiveSignals>) {
      signals = { ...signals, ...patch };
      listener?.();
    },
    activeTimers: () => tasks.size,
  };
}

test('sensor polling is sparse and only detailed while diagnostics is open', () => {
  const clock = controlledHost();
  const notifications: AdaptiveSnapshot[] = [];
  const runtime = startAdaptive((state) => notifications.push(state), 'auto', clock.host);
  const original = runtime.getSnapshot();
  assert.deepEqual(clock.polls, [false]);
  assert.equal(clock.activeTimers(), 1);
  clock.setTime(29999);
  assert.equal(clock.polls.length, 1);
  clock.setTime(30000);
  assert.deepEqual(clock.polls, [false, false]);
  assert.equal(runtime.getSnapshot(), original);
  assert.equal(notifications.length, 1);

  runtime.setDiagnostics(true);
  assert.equal(runtime.getSnapshot().signals.jsHeapUsedBytes, 10_000);
  clock.setTime(39999);
  assert.deepEqual(clock.polls, [false, false, true]);
  clock.setTime(40000);
  assert.deepEqual(clock.polls, [false, false, true, true]);
  runtime.setDiagnostics(false);
  assert.equal(runtime.getSnapshot().signals.jsHeapUsedBytes, undefined);
  assert.deepEqual(clock.polls, [false, false, true, true, false]);

  runtime.dispose();
  assert.equal(clock.activeTimers(), 0);
  clock.setSignals({ visible: false });
  assert.equal(runtime.getSnapshot().signals.visible, true);
  clock.setTime(120000);
  assert.equal(clock.polls.length, 5);
});

test('visibility turns scheduled polling off and waking the page restores it', () => {
  const clock = controlledHost();
  const runtime = startAdaptive(() => {}, 'balanced', clock.host);
  clock.setSignals({ visible: false });
  assert.equal(runtime.getSnapshot().reason, 'hidden');
  assert.equal(clock.activeTimers(), 0);
  clock.setTime(70000);
  assert.deepEqual(clock.polls, [false, false]);
  clock.setSignals({ visible: true });
  assert.equal(runtime.getSnapshot().profile, 'balanced');
  assert.equal(clock.activeTimers(), 1);
  runtime.dispose();
});

test('a delayed scheduler indicates observed contention without reporting CPU utilization', () => {
  const clock = controlledHost(workstation);
  const runtime = startAdaptive(() => {}, 'auto', clock.host);
  clock.setTime(30110);
  assert.equal(runtime.getSnapshot().profile, 'balanced');
  clock.setTime(38220);
  const state = runtime.getSnapshot();
  assert.equal(state.profile, 'efficiency');
  assert.equal(state.reason, 'cpu_contention');
  assert.equal(state.signals.mainThreadDelayMs, 110);
  assert.equal(state.signals.nativeCpuLoad, undefined);
  runtime.dispose();
});

test('recent measurement requires repeated slow interactions and ages out', () => {
  const clock = controlledHost(workstation);
  const runtime = startAdaptive(() => {}, 'auto', clock.host);
  runtime.recordInteraction(80);
  runtime.recordInteraction(90);
  runtime.recordInteraction(100);
  assert.deepEqual(clock.polls, [false, false]);
  assert.equal(runtime.getSnapshot().profile, 'balanced');
  clock.setTime(20000);
  assert.equal(runtime.getSnapshot().profile, 'performance');
  assert.equal(runtime.getSnapshot().signals.interactionLatencyMs, 90);
  clock.setTime(40000);
  clock.setTime(60000);
  clock.setTime(68000);
  assert.equal(runtime.getSnapshot().profile, 'balanced');
  assert.equal(runtime.getSnapshot().signals.interactionLatencyMs, undefined);
  runtime.dispose();
});


const windowsReply = {
  schema: 1, source: 'windows', platform: 'Windows', architecture: 'aarch64',
  hardwareThreads: 20, nativePhysicalTotalBytes: 32 * 2 ** 30, nativePhysicalAvailableBytes: 24 * 2 ** 30,
  nativeMemoryPressure: 0.25, nativeLowMemory: false, nativeCpuIntervalMs: 2200,
  nativeCpuLoad: 0.41, nativeHostCpuOneCore: 0.003, nativeSampleAgeMs: 0,
  nativeMonitorCostUs: 38, nativeSampleCount: 2, batteryPresent: true, batteryLevel: 0.74,
  powerSource: 'battery', charging: false, batterySaver: false, nativeWindowState: 'visible',
};

test('decodes real native fields separately from browser capability hints', () => {
  const reading = decodeNativeReading(windowsReply);
  assert.ok(reading);
  assert.equal(reading.platform, 'Windows');
  assert.equal(reading.architecture, 'aarch64');
  assert.equal(reading.hardwareThreads, 20);
  assert.equal(reading.nativePhysicalAvailableBytes, 24 * 2 ** 30);
  assert.equal(reading.nativeMemoryPressure, 0.25);
  assert.equal(reading.nativeLowMemory, false);
  assert.equal(reading.nativeCpuLoad, 0.41);
  assert.equal(reading.nativeHostCpuOneCore, 0.003);
  assert.equal(reading.nativeCpuIntervalMs, 2200);
  assert.equal(reading.nativeMonitorCostUs, 38);
  assert.equal(reading.batteryLevel, 0.74);
  assert.equal(reading.charging, false);
  assert.equal(reading.powerSource, 'battery');
});

test('unknown native sensors and malformed metrics never become synthetic readings', () => {
  assert.equal(decodeNativeReading({ ...windowsReply, schema: 5 }), undefined);
  assert.equal(decodeNativeReading({ ...windowsReply, platform: 'arbitrary device name' }), undefined);
  assert.equal(decodeNativeReading({ ...windowsReply, source: 'desktop' }), undefined);
  assert.equal(decodeNativeReading({ ...windowsReply, nativeSampleAgeMs: 9000 }), undefined);
  const unknown = decodeNativeReading({
    ...windowsReply, nativeCpuIntervalMs: null, nativeCpuLoad: 0.8, nativeHostCpuOneCore: 2,
    nativePhysicalAvailableBytes: Number.POSITIVE_INFINITY, nativeMemoryPressure: 0.8, batteryPresent: false,
    architecture: 'vendor-specific', thermalState: 101, nativeWindowState: 'not a state', gpuAvailable: 'true',
  });
  assert.ok(unknown);
  assert.equal(unknown.nativeCpuLoad, undefined);
  assert.equal(unknown.nativeHostCpuOneCore, undefined);
  assert.equal(unknown.nativePhysicalAvailableBytes, undefined);
  assert.equal(unknown.nativeMemoryPressure, undefined);
  assert.equal(unknown.batteryPresent, false);
  assert.equal(unknown.batteryLevel, undefined);
  assert.equal(unknown.charging, undefined);
  assert.equal(unknown.architecture, undefined);
  assert.equal(unknown.thermalState, undefined);
  assert.equal(unknown.gpuAvailable, undefined);
  assert.equal(unknown.nativeWindowState, undefined);
  const mac = decodeNativeReading({
    schema: 1, source: 'desktop', platform: 'macOS', nativeMonitorCostUs: 0, nativeSampleCount: 1, nativeSampleAgeMs: 0,
  });
  assert.equal(mac?.platform, 'macOS');
  assert.equal(mac?.nativeCpuLoad, undefined);
});

test('actual physical memory and AC power outrank limited browser hints', () => {
  const signals = {
    ...standard, deviceMemoryGiB: 2, hardwareThreads: 12,
    nativePhysicalTotalBytes: 16 * 2 ** 30, powerSource: 'ac' as const, batteryLevel: 0.19, charging: false,
  };
  const ready = updateAdaptive(undefined, 'auto', signals, 0);
  assert.equal(ready.profile, 'balanced');
  assert.equal(ready.reason, 'default');
  const pressure = updateAdaptive(ready, 'auto', { ...signals, nativeLowMemory: true }, 10);
  assert.equal(pressure.profile, 'ultra_light');
  assert.equal(pressure.reason, 'memory_pressure');
});

test('sustained native CPU pressure requires independent samples and a dwell period', () => {
  let state = updateAdaptive(undefined, 'auto', { ...workstation, nativeCpuLoad: 0.2, nativeSampleCount: 1 }, 0);
  const pressure = { ...workstation, nativeCpuLoad: 0.93, nativeSampleCount: 2 };
  state = updateAdaptive(state, 'auto', pressure, 16_000);
  assert.equal(state.pending?.readyAt, 24_000);
  state = updateAdaptive(state, 'auto', pressure, 24_000);
  assert.equal(state.profile, 'balanced');
  assert.equal(state.pending?.readyAt, 26_000);
  state = updateAdaptive(state, 'auto', { ...workstation, nativeCpuLoad: 0.4, nativeSampleCount: 3 }, 26_000);
  assert.equal(state.pending, undefined);
  state = updateAdaptive(state, 'auto', { ...pressure, nativeSampleCount: 4 }, 32_000);
  state = updateAdaptive(state, 'auto', { ...pressure, nativeSampleCount: 5 }, 40_000);
  assert.equal(state.profile, 'efficiency');
  assert.equal(state.reason, 'cpu_contention');
  state = updateAdaptive(state, 'auto', { ...workstation, nativeCpuLoad: 0.2, nativeSampleCount: 6 }, 41_000);
  state = updateAdaptive(state, 'auto', { ...workstation, nativeCpuLoad: 0.2, nativeSampleCount: 7 }, 61_000);
  assert.equal(state.profile, 'balanced');
});
