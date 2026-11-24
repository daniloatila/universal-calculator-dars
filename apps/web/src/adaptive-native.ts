import type { AdaptiveNativeSignals } from './adaptive.ts';

export interface NativeReading extends AdaptiveNativeSignals {
  hardwareThreads?: number;
  batteryLevel?: number;
  charging?: boolean;
}

const architectures = ['x86_64', 'aarch64', 'x86', 'arm'] as const;
const platforms = ['Windows', 'macOS', 'Linux', 'Android', 'iOS'] as const;
const windowStates = ['visible', 'minimized', 'hidden'] as const;
const powerSources = ['ac', 'battery'] as const;
const thermalStates = ['nominal', 'warm', 'severe'] as const;

function listed<T>(values: readonly T[], value: unknown): T | undefined {
  return values.find((candidate) => candidate === value);
}

function numberIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function integerIn(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function decodeNativeReading(reply: unknown): NativeReading | undefined {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) return;
  const value = reply as Record<string, unknown>;
  const platform = listed(platforms, value.platform);
  const source = listed(['windows', 'desktop'] as const, value.source);
  const count = integerIn(value.nativeSampleCount, 1, 0xffffffff);
  const age = integerIn(value.nativeSampleAgeMs, 0, 2000);
  const cost = integerIn(value.nativeMonitorCostUs, 0, 1_500_000);

  if (value.schema !== 1 || !platform || !source || (source === 'windows') !== (platform === 'Windows') ||
      count === undefined || age === undefined || cost === undefined) return;

  const nativePhysicalTotalBytes = integerIn(value.nativePhysicalTotalBytes, 1);
  const nativePhysicalAvailableBytes = nativePhysicalTotalBytes === undefined
    ? undefined : integerIn(value.nativePhysicalAvailableBytes, 0, nativePhysicalTotalBytes);
  const batteryPresent = boolean(value.batteryPresent);
  const nativeCpuIntervalMs = integerIn(value.nativeCpuIntervalMs, 100, 120_000);

  return {
    platform,
    architecture: listed(architectures, value.architecture),
    hardwareThreads: integerIn(value.hardwareThreads, 1, 65535),
    nativePhysicalTotalBytes,
    nativePhysicalAvailableBytes,
    nativeMemoryPressure: nativePhysicalAvailableBytes === undefined ? undefined : numberIn(value.nativeMemoryPressure, 0, 1),
    nativeLowMemory: boolean(value.nativeLowMemory),
    nativeCpuLoad: nativeCpuIntervalMs === undefined ? undefined : numberIn(value.nativeCpuLoad, 0, 1),
    nativeHostCpuOneCore: nativeCpuIntervalMs === undefined ? undefined : numberIn(value.nativeHostCpuOneCore, 0, 65535),
    nativeHostPrivateBytes: integerIn(value.nativeHostPrivateBytes, 0),
    nativeHostWorkingSetBytes: integerIn(value.nativeHostWorkingSetBytes, 0),
    nativeCpuIntervalMs,
    nativeWindowState: listed(windowStates, value.nativeWindowState),
    batteryPresent,
    batteryLevel: batteryPresent === true ? numberIn(value.batteryLevel, 0, 1) : undefined,
    charging: batteryPresent === true ? boolean(value.charging) : undefined,
    powerSource: listed(powerSources, value.powerSource),
    batterySaver: boolean(value.batterySaver),
    thermalState: listed(thermalStates, value.thermalState),
    gpuAvailable: boolean(value.gpuAvailable),
    nativeSensorSource: source,
    nativeMonitorCostUs: cost,
    nativeSampleCount: count,
    nativeSampleAgeMs: age,
  };
}
