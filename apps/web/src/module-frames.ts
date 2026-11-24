import type { AdaptivePolicy } from './adaptive';
import type { ModuleActivation } from './module-manager';

type FramePolicy = Pick<AdaptivePolicy, 'graphicsFrameIntervalMs'>;
type FrameScope = Pick<ModuleActivation<unknown>, 'signal' | 'reportFailure'>;
export type FrameDetail = 'reduced' | 'full';
const REDUCED_INTERVAL_MS = 250;

function frameSettings(policy: FramePolicy): { interval: number; detail: FrameDetail } {
  const value = policy.graphicsFrameIntervalMs;
  if (value === null || !Number.isFinite(value) || value <= 0) return { interval: REDUCED_INTERVAL_MS, detail: 'reduced' };
  return { interval: value, detail: 'full' };
}

/** Optional display scheduling for a graphics module. It never schedules idle redraws. */
export function createModuleFrames(
  scope: FrameScope,
  initialPolicy: FramePolicy,
  draw: (timestamp: number, detail: FrameDetail) => void,
) {
  let settings = frameSettings(initialPolicy);
  let lastDrawAt = -Infinity;
  let dirty = false;
  let closed = scope.signal.aborted;
  let cancelScheduled: (() => void) | undefined;

  function clearScheduled() {
    cancelScheduled?.();
    cancelScheduled = undefined;
  }

  function close() {
    if (closed) return;
    closed = true;
    dirty = false;
    clearScheduled();
    scope.signal.removeEventListener('abort', close);
  }

  function schedule() {
    if (closed || !dirty || cancelScheduled) return;
    const untilEligible = lastDrawAt + settings.interval - performance.now();
    if (untilEligible > 0) {
      const timer = globalThis.setTimeout(() => {
        cancelScheduled = undefined;
        schedule();
      }, Math.ceil(untilEligible));
      cancelScheduled = () => globalThis.clearTimeout(timer);
      return;
    }

    const frame = requestAnimationFrame((timestamp) => {
      cancelScheduled = undefined;
      if (closed || !dirty) return;
      const now = performance.now();
      if (now - lastDrawAt < settings.interval) {
        schedule();
        return;
      }
      dirty = false;
      lastDrawAt = now;
      try { draw(timestamp, settings.detail); }
      catch {
        close();
        scope.reportFailure();
      }
    });
    cancelScheduled = () => cancelAnimationFrame(frame);
  }

  if (!closed) scope.signal.addEventListener('abort', close, { once: true });

  return {
    invalidate() {
      if (closed) return;
      dirty = true;
      schedule();
    },
    setPolicy(policy: FramePolicy) {
      const next = frameSettings(policy);
      if (closed || (settings.interval === next.interval && settings.detail === next.detail)) return;
      settings = next;
      clearScheduled();
      schedule();
    },
    close,
  };
}
