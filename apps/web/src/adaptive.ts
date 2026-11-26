export const ADAPTIVE_PROFILES = ['ultra_light', 'efficiency', 'balanced', 'performance', 'maximum'] as const;

export type AdaptiveProfile = typeof ADAPTIVE_PROFILES[number];
export type AdaptiveSelection = 'auto' | AdaptiveProfile;
export type AdaptiveReason =
  | 'default' | 'manual' | 'hidden' | 'memory_pressure' | 'thermal_pressure'
  | 'low_battery' | 'limited_device' | 'cpu_contention' | 'gpu_unavailable'
  | 'workload_demand';

export interface AdaptiveNativeSignals {
  nativeMemoryPressure?: number;
  nativeLowMemory?: boolean;
  nativeCpuLoad?: number;
  nativeCpuIntervalMs?: number;
  nativeHostCpuOneCore?: number;
  nativePhysicalTotalBytes?: number;
  nativePhysicalAvailableBytes?: number;
  nativeHostPrivateBytes?: number;
  nativeHostWorkingSetBytes?: number;
  powerSource?: 'ac' | 'battery';
  batteryPresent?: boolean;
  batterySaver?: boolean;
  nativeWindowState?: 'visible' | 'minimized' | 'hidden';
  nativeSensorSource?: 'windows' | 'desktop';
  nativeMonitorCostUs?: number;
  nativeRoundTripMs?: number;
  nativeSampleCount?: number;
  nativeSampleAgeMs?: number;
  thermalState?: 'nominal' | 'warm' | 'severe';
  gpuAvailable?: boolean;
  platform?: string;
  architecture?: string;
}

export interface AdaptiveSignals extends AdaptiveNativeSignals {
  visible: boolean;
  runtime: 'web' | 'desktop';
  hardwareThreads?: number;
  deviceMemoryGiB?: number;
  graphicsApi: 'exposed' | 'unavailable';
  batteryApi: 'exposed' | 'unavailable';
  batteryLevel?: number;
  charging?: boolean;
  mainThreadDelayMs?: number;
  interactionLatencyMs?: number;
  jsHeapUsedBytes?: number;
  jsHeapLimitBytes?: number;
  jsHeapPressure?: number;
}

export interface AdaptivePolicy {
  workerIdleMs: number;
  pendingJobs: number;
  cacheEntries: number;
  dataLabResourceBudgetBytes: number;
  graphicsFrameIntervalMs: number | null;
  reducedEffects: boolean;
  sampleIntervalMs: number;
  suspendWhenHidden: boolean;
}

const MiB = 1024 * 1024;

interface Target {
  profile: AdaptiveProfile;
  reason: AdaptiveReason;
}

export interface AdaptiveSnapshot extends Target {
  selection: AdaptiveSelection;
  signals: AdaptiveSignals;
  policy: AdaptivePolicy;
  changedAt: number;
  pending?: Target & { observedAt: number; readyAt: number; sampleCount?: number };
}

const policies: Record<AdaptiveProfile, AdaptivePolicy> = {
  ultra_light: {
    workerIdleMs: 1000, pendingJobs: 1, cacheEntries: 0, graphicsFrameIntervalMs: null,
    dataLabResourceBudgetBytes: 32 * MiB,
    reducedEffects: true, sampleIntervalMs: 60_000, suspendWhenHidden: true,
  },
  efficiency: {
    workerIdleMs: 4000, pendingJobs: 2, cacheEntries: 4, graphicsFrameIntervalMs: 100,
    dataLabResourceBudgetBytes: 64 * MiB,
    reducedEffects: true, sampleIntervalMs: 45_000, suspendWhenHidden: true,
  },
  balanced: {
    workerIdleMs: 12_000, pendingJobs: 4, cacheEntries: 8, graphicsFrameIntervalMs: 50,
    dataLabResourceBudgetBytes: 128 * MiB,
    reducedEffects: false, sampleIntervalMs: 30_000, suspendWhenHidden: true,
  },
  performance: {
    workerIdleMs: 45_000, pendingJobs: 6, cacheEntries: 16, graphicsFrameIntervalMs: 34,
    dataLabResourceBudgetBytes: 192 * MiB,
    reducedEffects: false, sampleIntervalMs: 20_000, suspendWhenHidden: true,
  },
  maximum: {
    workerIdleMs: 120_000, pendingJobs: 8, cacheEntries: 32, graphicsFrameIntervalMs: 17,
    dataLabResourceBudgetBytes: 256 * MiB,
    reducedEffects: false, sampleIntervalMs: 15_000, suspendWhenHidden: true,
  },
};

export function isAdaptiveSelection(value: unknown): value is AdaptiveSelection {
  return value === 'auto' || ADAPTIVE_PROFILES.some((profile) => profile === value);
}

function chooseTarget(
  selection: AdaptiveSelection,
  signals: AdaptiveSignals,
  previous: AdaptiveSnapshot | undefined,
): Target {
  if (!signals.visible) return { profile: 'ultra_light', reason: 'hidden' };

  const observedPressure = [signals.nativeMemoryPressure, signals.jsHeapPressure]
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const memoryPressure = Math.max(0, ...observedPressure);
  const memoryLimited = previous?.reason === 'memory_pressure';
  const criticalMemory = memoryLimited && previous.profile === 'ultra_light' ? 0.92 : 0.95;
  if (signals.nativeLowMemory === true || memoryPressure >= criticalMemory) return { profile: 'ultra_light', reason: 'memory_pressure' };
  if (signals.thermalState === 'severe') return { profile: 'ultra_light', reason: 'thermal_pressure' };
  if (selection !== 'auto') return { profile: selection, reason: 'manual' };

  if (memoryPressure >= (memoryLimited ? 0.75 : 0.85)) return { profile: 'efficiency', reason: 'memory_pressure' };
  if (signals.thermalState === 'warm') return { profile: 'efficiency', reason: 'thermal_pressure' };
  const batteryLimited = previous?.reason === 'low_battery';
  const onBattery = signals.powerSource === undefined ? signals.charging === false : signals.powerSource === 'battery';
  if (onBattery && signals.batteryLevel !== undefined &&
      signals.batteryLevel <= (batteryLimited ? 0.25 : 0.2)) {
    const criticalBattery = batteryLimited && previous.profile === 'ultra_light' ? 0.15 : 0.1;
    return { profile: signals.batteryLevel <= criticalBattery ? 'ultra_light' : 'efficiency', reason: 'low_battery' };
  }

  const threads = signals.hardwareThreads ?? Infinity;
  const memoryGiB = signals.nativePhysicalTotalBytes === undefined
    ? signals.deviceMemoryGiB : signals.nativePhysicalTotalBytes / 2 ** 30;
  if (threads <= 2 || (memoryGiB ?? Infinity) <= 2) return { profile: 'ultra_light', reason: 'limited_device' };

  const nativeCpuLoad = signals.nativeCpuLoad ?? 0;
  const schedulingDelay = signals.mainThreadDelayMs ?? 0;
  const cpuLimited = previous?.reason === 'cpu_contention' && previous.profile === 'efficiency';
  const cpuThreshold = signals.batterySaver ? (cpuLimited ? 0.63 : 0.75) : (cpuLimited ? 0.7 : 0.85);
  if (nativeCpuLoad >= cpuThreshold || schedulingDelay >= (cpuLimited ? 66 : 100)) {
    return { profile: 'efficiency', reason: 'cpu_contention' };
  }
  if (threads <= 4 || (memoryGiB ?? Infinity) <= 4) return { profile: 'efficiency', reason: 'limited_device' };
  if (nativeCpuLoad >= 0.75 || schedulingDelay >= 50) return { profile: 'balanced', reason: 'cpu_contention' };

  if (signals.gpuAvailable === false || signals.graphicsApi === 'unavailable') {
    return { profile: 'balanced', reason: 'gpu_unavailable' };
  }

  const latency = signals.interactionLatencyMs ?? 0;
  if (latency >= 120 && (signals.hardwareThreads ?? 0) >= 12 && (memoryGiB ?? 0) >= 8 &&
      (signals.powerSource === 'ac' || signals.charging === true || (signals.batteryLevel ?? 0) > 0.5)) {
    return { profile: 'maximum', reason: 'workload_demand' };
  }
  if (latency >= 65 && (signals.hardwareThreads ?? 0) >= 8 && (memoryGiB ?? 0) >= 6) {
    return { profile: 'performance', reason: 'workload_demand' };
  }
  return { profile: 'balanced', reason: 'default' };
}

function effectivePolicy(profile: AdaptiveProfile, signals: AdaptiveSignals): AdaptivePolicy {
  const policy = policies[profile];
  const graphicsSupported = signals.graphicsApi === 'exposed' && signals.gpuAvailable !== false;
  return { ...policy, graphicsFrameIntervalMs: graphicsSupported ? policy.graphicsFrameIntervalMs : null };
}

export function updateAdaptive(
  previous: AdaptiveSnapshot | undefined,
  selection: AdaptiveSelection,
  signals: AdaptiveSignals,
  now: number,
): AdaptiveSnapshot {
  const target = chooseTarget(selection, signals, previous?.selection === selection ? previous : undefined);
  const urgent = target.profile === 'ultra_light' &&
    (target.reason === 'hidden' || target.reason === 'memory_pressure' || target.reason === 'thermal_pressure');
  if (!previous || selection !== previous.selection || urgent || previous.reason === 'hidden' ||
      target.profile === previous.profile) {
    const changedAt = previous?.profile === target.profile ? previous.changedAt : now;
    return { ...target, selection, signals, changedAt, policy: effectivePolicy(target.profile, signals) };
  }

  const recovering = ADAPTIVE_PROFILES.indexOf(target.profile) > ADAPTIVE_PROFILES.indexOf(previous.profile);
  const hold = recovering ? 20_000 : 8000;
  const pending = previous.pending?.profile === target.profile && previous.pending.reason === target.reason
    ? previous.pending : undefined;
  const observedAt = pending?.observedAt ?? now;
  const needsFreshNativeSample = signals.nativeSampleCount !== undefined &&
    ((signals.nativeCpuLoad !== undefined && (target.reason === 'cpu_contention' || previous.reason === 'cpu_contention')) ||
      (signals.nativeMemoryPressure !== undefined && (target.reason === 'memory_pressure' || previous.reason === 'memory_pressure')));
  const sampleCount = pending?.sampleCount ?? (needsFreshNativeSample ? signals.nativeSampleCount : undefined);
  const observedAgain = sampleCount === undefined || (signals.nativeSampleCount ?? sampleCount) > sampleCount;
  const readyAt = Math.max(previous.changedAt + 15_000, observedAt + hold);
  if (now >= readyAt && observedAgain) {
    return { ...target, selection, signals, changedAt: now, policy: effectivePolicy(target.profile, signals) };
  }

  return {
    ...previous, signals, policy: effectivePolicy(previous.profile, signals),
    pending: { ...target, observedAt, readyAt: observedAgain ? readyAt : Math.max(readyAt, now + 2000), sampleCount },
  };
}
