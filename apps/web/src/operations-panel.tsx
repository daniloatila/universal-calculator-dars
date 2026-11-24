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
  phase: ModulePhase;
  workers: number;
  pending: number;
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
  locale, messages, adaptive, phase, workers, pending, wasmBytes, mode, changingMode,
  select, setOffline, setDiagnostics, clearSession, clearPreferences,
}: Props) {
  const m = messages.operations;
  const num = new Intl.NumberFormat(LOCALES[locale].format, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(LOCALES[locale].format, { style: 'percent' });
  const value = (reading: number | undefined) => reading === undefined ? m.unavailable : num.format(reading);
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
        <dl className="diagnostics-grid">
          <div><dt>{m.effectiveProfile}</dt><dd data-testid="effective-profile">{m[adaptive.profile]}</dd></div>
          <div><dt>{m.reason}</dt><dd>{m[adaptive.reason]}</dd></div>
          <div><dt>{m.module}</dt><dd data-testid="module-phase">{messages.standard} · {m[phase]}</dd></div>
          <div><dt>{m.workers}</dt><dd data-testid="active-workers">{num.format(workers)}</dd></div>
          <div><dt>{m.pending}</dt><dd>{num.format(pending)}</dd></div>
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
        </dl>
      </details>
    </div>
  );
}
