import { updateAdaptive } from './adaptive.ts';
import { decodeNativeReading } from './adaptive-native.ts';
import type { NativeReading } from './adaptive-native.ts';
import type { AdaptiveSelection, AdaptiveSignals, AdaptiveSnapshot } from './adaptive.ts';

export interface AdaptiveHost {
  read: (diagnostics: boolean) => AdaptiveSignals;
  now: () => number;
  schedule: (delayMs: number, task: () => void) => () => void;
  listen: (refresh: () => void) => () => void;
  pollNative?: () => boolean;
}

interface BatteryStatus extends EventTarget {
  level: number;
  charging: boolean;
}

interface BrowserNavigator extends Navigator {
  deviceMemory?: number;
  getBattery?: () => Promise<BatteryStatus>;
  userAgentData?: { platform?: string };
}

interface BrowserPerformance extends Performance {
  memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
}

const DIAGNOSTIC_SAMPLE_MS = 10_000;
const INTERACTION_WINDOW_MS = 45_000;
const INTERACTION_REFRESH_MS = 10_000;
const NATIVE_MINIMUM_MS = 2100;
const NATIVE_TIMEOUT_MS = 1500;
const NATIVE_STALE_MS = 100_000;

function positive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function browserPlatform(navigator: BrowserNavigator): string | undefined {
  const platform = navigator.userAgentData?.platform || navigator.platform;
  if (/^(windows|win32|win64)$/i.test(platform)) return 'Windows';
  if (/^(macos|macintel|macppc|mac68k)$/i.test(platform)) return 'macOS';
  if (/^android/i.test(platform)) return 'Android';
  if (/^(iphone|ipad|ipod|ios)$/i.test(platform)) return 'iOS';
  if (/^chrome os$/i.test(platform)) return 'ChromeOS';
  if (/^linux/i.test(platform)) return 'Linux';
  return undefined;
}

function probeWebGl(): boolean | undefined {
  if (!('WebGLRenderingContext' in window || 'WebGL2RenderingContext' in window)) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const options: WebGLContextAttributes = {
    alpha: false, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true,
  };
  try {
    const context = (canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options)) as
      WebGL2RenderingContext | WebGLRenderingContext | null;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  } catch {
    return undefined;
  }
}

function browserHost(): AdaptiveHost {
  const desktopWindow = window as Window & {
    __DARS_WINDOW_MINIMIZED__?: boolean;
    __TAURI_INTERNALS__?: {
      invoke(command: 'dars_native_capabilities', payload: Record<string, never>): Promise<unknown>;
    };
  };
  const navigator = window.navigator as BrowserNavigator;
  const performance = window.performance as BrowserPerformance;
  const location = window.location;
  const desktop = (location.protocol === 'tauri:' && location.hostname === 'localhost') ||
    ((location.protocol === 'http:' || location.protocol === 'https:') && location.hostname === 'tauri.localhost' && !location.port);
  const visible = () => document.visibilityState === 'visible' && (!desktop || desktopWindow.__DARS_WINDOW_MINIMIZED__ !== true);
  let battery: BatteryStatus | undefined;
  let refreshListener: (() => void) | undefined;
  let observed: { collectedAt: number; reading: NativeReading } | undefined;
  let lastRequest = -Infinity;
  let pendingTimeout: number | undefined;
  let gpuProbeDone = false;
  let gpuAvailable: boolean | undefined;

  function pollNative(): boolean {
    const bridge = desktop ? desktopWindow.__TAURI_INTERNALS__ : undefined;
    const started = performance.now();
    if (!bridge?.invoke || !visible() || !refreshListener || pendingTimeout !== undefined ||
        started - lastRequest < NATIVE_MINIMUM_MS) return false;
    lastRequest = started;
    const finish = (reply: unknown) => {
      if (pendingTimeout !== ticket) return;
      window.clearTimeout(ticket);
      pendingTimeout = undefined;
      const completed = performance.now();
      const reading = decodeNativeReading(reply);
      if (reading) {
        reading.nativeRoundTripMs = completed - started;
        observed = { collectedAt: completed - (reading.nativeSampleAgeMs ?? 0), reading };
      }
      refreshListener?.();
    };
    const ticket = window.setTimeout(() => finish(undefined), NATIVE_TIMEOUT_MS);
    pendingTimeout = ticket;
    // Tauri's bundled core delegates to this exact transport. This app registers one scoped command.
    void Promise.resolve().then(() => bridge.invoke('dars_native_capabilities', {})).then(finish, () => finish(undefined));
    return true;
  }

  return {
    now: () => performance.now(),
    schedule(delayMs, task) {
      const id = window.setTimeout(task, delayMs);
      return () => window.clearTimeout(id);
    },
    pollNative,
    read(diagnostics) {
      const present = visible();
      if (desktop && diagnostics && present && !gpuProbeDone) {
        gpuProbeDone = true;
        gpuAvailable = probeWebGl();
      }
      const heap = performance.memory;
      const limit = positive(heap?.jsHeapSizeLimit);
      const used = positive(heap?.usedJSHeapSize);
      const localHeapPressure = limit && used ? Math.min(1, used / limit) : undefined;
      const level = battery?.level;
      const native = observed && performance.now() - observed.collectedAt <= NATIVE_STALE_MS ? observed.reading : undefined;
      const nativePower = native?.nativeSensorSource === 'windows';
      const nativeWindowState = desktopWindow.__DARS_WINDOW_MINIMIZED__ === true && desktop
        ? 'minimized' : desktopWindow.__DARS_WINDOW_MINIMIZED__ === false && native?.nativeWindowState === 'minimized'
          ? undefined : native?.nativeWindowState;
      return {
        ...native,
        visible: present,
        runtime: desktop ? 'desktop' : 'web',
        platform: native?.platform ?? browserPlatform(navigator),
        hardwareThreads: native?.hardwareThreads ?? positive(navigator.hardwareConcurrency),
        deviceMemoryGiB: positive(navigator.deviceMemory),
        graphicsApi: 'WebGLRenderingContext' in window || 'WebGL2RenderingContext' in window || 'gpu' in navigator
          ? 'exposed' : 'unavailable',
        gpuAvailable: gpuAvailable ?? native?.gpuAvailable,
        batteryApi: typeof navigator.getBattery === 'function' ? 'exposed' : 'unavailable',
        batteryLevel: nativePower ? native?.batteryLevel : level !== undefined && level >= 0 && level <= 1 ? level : undefined,
        charging: nativePower ? native?.charging : battery?.charging,
        nativeWindowState,
        jsHeapUsedBytes: diagnostics ? used : undefined,
        jsHeapLimitBytes: diagnostics ? limit : undefined,
        jsHeapPressure: localHeapPressure,
      };
    },
    listen(refresh) {
      refreshListener = refresh;
      let disposed = false;
      const refreshWindow = () => {
        refresh();
        pollNative();
      };
      document.addEventListener('visibilitychange', refreshWindow);
      window.addEventListener('pageshow', refreshWindow);
      window.addEventListener('dars-window-visibility', refreshWindow);

      if (typeof navigator.getBattery === 'function' && (!desktop || browserPlatform(navigator) !== 'Windows')) {
        // Browser battery status is optional. Windows uses the native power reading.
        void Promise.resolve().then(() => navigator.getBattery?.()).then((reading) => {
          if (!reading || disposed) return;
          battery = reading;
          battery.addEventListener('chargingchange', refresh);
          battery.addEventListener('levelchange', refresh);
          refresh();
        }).catch(() => {});
      }
      pollNative();

      return () => {
        disposed = true;
        refreshListener = undefined;
        if (pendingTimeout !== undefined) window.clearTimeout(pendingTimeout);
        pendingTimeout = undefined;
        battery?.removeEventListener('chargingchange', refresh);
        battery?.removeEventListener('levelchange', refresh);
        battery = undefined;
        document.removeEventListener('visibilitychange', refreshWindow);
        window.removeEventListener('pageshow', refreshWindow);
        window.removeEventListener('dars-window-visibility', refreshWindow);
      };
    },
  };
}

function changed(previous: AdaptiveSnapshot, next: AdaptiveSnapshot): boolean {
  return previous.selection !== next.selection || previous.profile !== next.profile ||
    previous.reason !== next.reason || previous.signals.visible !== next.signals.visible ||
    previous.policy.graphicsFrameIntervalMs !== next.policy.graphicsFrameIntervalMs;
}

export function startAdaptive(
  onChange: (snapshot: AdaptiveSnapshot) => void,
  selection: AdaptiveSelection = 'auto',
  host: AdaptiveHost = browserHost(),
) {
  let state = updateAdaptive(undefined, selection, host.read(false), host.now());
  let published = state;
  let diagnostics = false;
  let disposed = false;
  let timerDeadline = Infinity;
  let timerGeneration = 0;
  let cancelTimer: (() => void) | undefined;
  let schedulingDelay: { at: number; ms: number } | undefined;
  let lastInteractionRefresh = -Infinity;
  const recentInteractions: { at: number; ms: number }[] = [];

  function stopTimer() {
    cancelTimer?.();
    cancelTimer = undefined;
    timerDeadline = Infinity;
    timerGeneration++;
  }

  function planTimer() {
    if (!state.signals.visible) {
      stopTimer();
      return;
    }
    const period = diagnostics ? DIAGNOSTIC_SAMPLE_MS : state.policy.sampleIntervalMs;
    const next = Math.min(host.now() + period, state.pending?.readyAt ?? Infinity);
    if (timerDeadline <= next) return;
    stopTimer();
    timerDeadline = next;
    const generation = timerGeneration;
    cancelTimer = host.schedule(Math.max(0, next - host.now()), () => {
      if (disposed || generation !== timerGeneration) return;
      stopTimer();
      const at = host.now();
      // This is scheduling delay, including browser throttling and system stalls.
      schedulingDelay = { at, ms: Math.max(0, at - next) };
      // Use a current native reading before deciding if a pressure reading persisted.
      if (!host.pollNative?.()) refresh();
    });
  }

  function refresh(force = false) {
    if (disposed) return;
    const now = host.now();
    const signals = { ...host.read(diagnostics) };
    if (!signals.visible) {
      schedulingDelay = undefined;
      recentInteractions.length = 0;
      lastInteractionRefresh = -Infinity;
    }
    if (schedulingDelay && now - schedulingDelay.at <= state.policy.sampleIntervalMs) {
      signals.mainThreadDelayMs ??= schedulingDelay.ms;
    }
    const recent = recentInteractions
      .filter((interaction) => now - interaction.at <= INTERACTION_WINDOW_MS)
      .map((interaction) => interaction.ms)
      .sort((left, right) => left - right);
    if (recent.length >= 3) signals.interactionLatencyMs ??= recent[Math.floor(recent.length / 2)];

    state = updateAdaptive(state, selection, signals, now);
    if (force || diagnostics || changed(published, state)) {
      published = state;
      onChange(published);
    }
    planTimer();
  }

  const stopEvents = host.listen(() => refresh());
  onChange(published);
  planTimer();

  return {
    getSnapshot: () => published,
    select(value: AdaptiveSelection) {
      if (disposed || value === selection) return;
      selection = value;
      refresh();
    },
    setDiagnostics(open: boolean) {
      if (disposed || diagnostics === open) return;
      diagnostics = open;
      stopTimer();
      refresh(true);
      if (open) host.pollNative?.();
    },
    recordInteraction(ms: number) {
      if (disposed || !state.signals.visible || !Number.isFinite(ms) || ms < 0) return;
      const now = host.now();
      if (recentInteractions.length === 6) recentInteractions.shift();
      recentInteractions.push({ at: now, ms });
      if (ms >= 65 && recentInteractions.length >= 3 && now - lastInteractionRefresh >= INTERACTION_REFRESH_MS) {
        lastInteractionRefresh = now;
        refresh();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopTimer();
      stopEvents();
    },
  };
}
