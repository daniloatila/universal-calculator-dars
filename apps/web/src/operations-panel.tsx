import type { AdaptiveSelection, AdaptiveSnapshot } from './adaptive';
import { ADAPTIVE_PROFILES, isAdaptiveSelection } from './adaptive';
import type { Locale, Messages } from './i18n';
import { LOCALES } from './i18n';
import type { ModulePhase } from './module-manager';
import type { AssetMode } from './offline';
import { version } from '../package.json';

interface Props {
  locale: Locale;
  messages: Messages;
  adaptive: AdaptiveSnapshot;
  moduleName: string;
  phase: ModulePhase;
  workers: number;
  pending?: number;
  wasmBytes?: number;
  mode: AssetMode;
  changingMode: boolean;
  select(selection: AdaptiveSelection): void;
  setOffline(value: boolean): void;
  setDiagnostics(open: boolean): void;
  clearSession(): void;
  clearPreferences(): void;
}

export default function OperationsPanel({
  locale, messages, adaptive, moduleName, phase, workers, pending, wasmBytes, mode, changingMode,
  select, setOffline, setDiagnostics, clearSession, clearPreferences,
}: Props) {
  const m = messages.operations;
  const num = new Intl.NumberFormat(LOCALES[locale].format, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(LOCALES[locale].format, { style: 'percent', maximumFractionDigits: 2 });
  const value = (reading: number | undefined) => reading === undefined ? m.unavailable : num.format(reading);
  const ratio = (reading: number | undefined) => reading === undefined ? m.unavailable : percent.format(reading);
  const scaled = (reading: number | undefined, unit: number) => value(reading === undefined ? undefined : reading / unit);
  const { signals } = adaptive;
  const canChooseOffline = mode === 'online' || mode === 'offline';

  return (
    <div className="operations-content">
      <section className="operations-profile" aria-label={m.selection}>
        <label>
          {m.selection}
          <select value={adaptive.selection} onChange={(event) => {
            const next = event.target.value;
            if (isAdaptiveSelection(next)) select(next);
          }}>
            <option value="auto">{m.auto}</option>
            {ADAPTIVE_PROFILES.map((profile) => <option key={profile} value={profile}>{m[profile]}</option>)}
          </select>
        </label>
        <p>{m.policyNote}</p>
      </section>
      <section aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">{m.privacy}</h2>
        <div className="privacy-grid">
          <section>
            <h3>{m.offline}</h3>
            {canChooseOffline ? <>
              <label className="offline-control">
                <input type="checkbox" checked={mode === 'offline'} disabled={changingMode}
                  onChange={(event) => setOffline(event.target.checked)} />
                {m.offlineOn}
              </label>
              {mode === 'online' && <p>{m.offlineOff}</p>}
            </> : <p>{mode === 'packaged' ? m.packaged : m.offlineUnavailable}</p>}
          </section>
          <section>
            <h3>{m.storage}</h3>
            <p>{m.storageNote}</p>
            {mode !== 'packaged' && <p>{m.cachedAssetsNote}</p>}
            <div className="privacy-actions">
              <button className="quiet-action" type="button" onClick={clearSession}>{m.clearSession}</button>
              <button className="quiet-action" type="button" onClick={clearPreferences}>{m.clearPreferences}</button>
            </div>
          </section>
          <section>
            <h3>{m.permissions}</h3>
            <p>{m.permissionNote}</p>
          </section>
          <section>
            <h3>{m.connections}</h3>
            <p>{mode === 'packaged' ? m.packaged : m.networkNote}</p>
            {mode !== 'packaged' && <bdi className="operations-origin">{window.location.origin}</bdi>}
          </section>
        </div>
      </section>
      <details className="local-diagnostics" onToggle={(event) => setDiagnostics(event.currentTarget.open)}>
        <summary>{m.diagnostics}</summary>
        <p>{m.diagnosticNote}</p>
        {signals.runtime === 'desktop' && <p>{m.nativeSensorNote}</p>}
        <dl className="diagnostics-grid">
          <div><dt>{m.effectiveProfile}</dt><dd data-testid="effective-profile">{m[adaptive.profile]}</dd></div>
          <div><dt>{m.reason}</dt><dd>{m[adaptive.reason]}</dd></div>
          <div><dt>{m.module}</dt><dd data-testid="module-phase">{moduleName} · {m[phase]}</dd></div>
          <div><dt>{m.workers}</dt><dd data-testid="active-workers">{num.format(workers)}</dd></div>
          <div><dt>{m.pending}</dt><dd>{value(pending)}</dd></div>
          <div><dt>{m.version}</dt><dd dir="ltr">{version}</dd></div>
          <div><dt>{m.platform}</dt><dd><bdi>{signals.platform ?? m.unavailable}</bdi></dd></div>
          <div><dt>{m.threads}</dt><dd>{value(signals.hardwareThreads)}</dd></div>
          <div><dt>{m.deviceMemory}</dt><dd>{value(signals.deviceMemoryGiB)}</dd></div>
          <div><dt>{m.cpuDelay}</dt><dd>{value(signals.mainThreadDelayMs)}</dd></div>
          <div><dt>{m.latency}</dt><dd>{value(signals.interactionLatencyMs)}</dd></div>
          <div><dt>{m.heap}</dt><dd>{value(signals.jsHeapUsedBytes === undefined ? undefined : signals.jsHeapUsedBytes / 2 ** 20)}</dd></div>
          <div><dt>{m.wasmMemory}</dt><dd data-testid="wasm-memory" data-bytes={wasmBytes}>{value(wasmBytes === undefined ? undefined : wasmBytes / 2 ** 20)}</dd></div>
          <div><dt>{m.battery}</dt><dd>{signals.batteryLevel === undefined ? m.unavailable : percent.format(signals.batteryLevel)}</dd></div>
          <div><dt>{m.graphics}</dt><dd>{m[signals.graphicsApi]}</dd></div>
          <div><dt>{m.graphicsProbe}</dt><dd>{signals.gpuAvailable === undefined ? m.unavailable : signals.gpuAvailable ? m.probeAvailable : m.probeFailed}</dd></div>
          {signals.runtime === 'desktop' && <>
            <div><dt>{m.architecture}</dt><dd data-testid="native-architecture"><bdi>{signals.architecture ?? m.unavailable}</bdi></dd></div>
            <div><dt>{m.physicalTotal}</dt><dd data-testid="native-total-memory" data-bytes={signals.nativePhysicalTotalBytes}>{scaled(signals.nativePhysicalTotalBytes, 2 ** 30)}</dd></div>
            <div><dt>{m.physicalAvailable}</dt><dd data-testid="native-available-memory" data-bytes={signals.nativePhysicalAvailableBytes}>{scaled(signals.nativePhysicalAvailableBytes, 2 ** 30)}</dd></div>
            <div><dt>{m.memoryPressure}</dt><dd data-testid="native-memory-pressure" data-ratio={signals.nativeMemoryPressure}>{ratio(signals.nativeMemoryPressure)}</dd></div>
            <div><dt>{m.lowMemoryCondition}</dt><dd>{signals.nativeLowMemory === undefined ? m.unavailable : signals.nativeLowMemory ? m.observed : m.clearSignal}</dd></div>
            <div><dt>{m.systemCpu}</dt><dd data-testid="native-system-cpu" data-ratio={signals.nativeCpuLoad}>{ratio(signals.nativeCpuLoad)}</dd></div>
            <div><dt>{m.hostCpu}</dt><dd data-testid="native-host-cpu" data-ratio={signals.nativeHostCpuOneCore}>{ratio(signals.nativeHostCpuOneCore)}</dd></div>
            <div><dt>{m.hostWorkingSet}</dt><dd>{scaled(signals.nativeHostWorkingSetBytes, 2 ** 20)}</dd></div>
            <div><dt>{m.hostPrivateCommit}</dt><dd>{scaled(signals.nativeHostPrivateBytes, 2 ** 20)}</dd></div>
            <div><dt>{m.powerSource}</dt><dd>{signals.powerSource === 'ac' ? m.acSource : signals.powerSource === 'battery' ? m.batterySource : m.unavailable}</dd></div>
            <div><dt>{m.nativeWindow}</dt><dd data-testid="native-window-state" data-state={signals.nativeWindowState}>{signals.nativeWindowState === 'hidden' ? m.nativeHidden : signals.nativeWindowState ? m[signals.nativeWindowState] : m.unavailable}</dd></div>
            <div><dt>{m.thermal}</dt><dd>{signals.thermalState ? m[signals.thermalState] : m.unavailable}</dd></div>
            <div><dt>{m.nativeSampleCost}</dt><dd data-testid="native-sample-cost" data-us={signals.nativeMonitorCostUs}>{value(signals.nativeMonitorCostUs)}</dd></div>
            <div><dt>{m.nativeRoundTrip}</dt><dd data-testid="native-sample-round-trip" data-ms={signals.nativeRoundTripMs}>{value(signals.nativeRoundTripMs)}</dd></div>
          </>}
        </dl>
      </details>
    </div>
  );
}
