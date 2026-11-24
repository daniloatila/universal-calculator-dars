import type { AdaptivePolicy } from './adaptive';
import type { ModuleActivation } from './module-manager';

type FramePolicy = Pick<AdaptivePolicy, 'graphicsFrameIntervalMs'>;
type FrameScope = Pick<ModuleActivation<unknown>, 'signal' | 'reportFailure'>;

function intervalFrom(policy: FramePolicy): number | null {
  const value = policy.graphicsFrameIntervalMs;
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

/** Optional display scheduling for a graphics module. It never schedules idle redraws. */
export function createModuleFrames(
  scope: FrameScope,
  initialPolicy: FramePolicy,
  draw: (timestamp: number) => void,
) {
  let interval = intervalFrom(initialPolicy);
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
    if (closed || !dirty || interval === null || cancelScheduled) return;
    const untilEligible = lastDrawAt + interval - performance.now();
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
      if (closed || !dirty || interval === null) return;
      const now = performance.now();
      if (now - lastDrawAt < interval) {
        schedule();
        return;
      }
      dirty = false;
      lastDrawAt = now;
      try { draw(timestamp); }
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
      const next = intervalFrom(policy);
      if (closed || interval === next) return;
      interval = next;
      clearScheduled();
      schedule();
    },
    close,
  };
}
