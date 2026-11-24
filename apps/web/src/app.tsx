import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import { isAdaptiveSelection } from './adaptive';
import type { AdaptiveSelection, AdaptiveSnapshot } from './adaptive';
import { startAdaptive } from './adaptive-browser';
import { Icon } from './icons';
import { isLocale, loadMessages, LOCALES, preferredLocale } from './i18n';
import type { Locale, Messages } from './i18n';
import { createModuleManager } from './module-manager';
import { primaryModules } from './module-registry';
import type { PrimaryModule } from './module-registry';
import { getAssetMode, observeAssetMode, packagedAssets } from './offline';
import type { AssetMode } from './offline';
import { clearPreferences, readPreference, storedTheme, THEMES, writePreference } from './preferences';
import type { Theme } from './preferences';

type Language = { locale: Locale; messages: Messages };

const OperationsPanel = lazy(() => import('./operations-panel'));

function ActiveWorkspace({ runtime, language, adaptive, cacheEntries }: {
  runtime: PrimaryModule;
  language: Language;
  adaptive: ReturnType<typeof startAdaptive> | null;
  cacheEntries: number;
}) {
  const status = useSyncExternalStore(runtime.subscribe, runtime.getStatus);
  const { Workspace } = runtime;
  return <Workspace locale={language.locale} messages={language.messages} engineStatus={status}
    session={runtime.session} cacheEntries={cacheEntries}
    evaluate={async (...args) => {
      const started = performance.now();
      const result = await runtime.evaluate(...args);
      if (result.ok) adaptive?.recordInteraction(performance.now() - started);
      return result;
    }} combine={runtime.combine} />;
}

function applyLanguage(language: Language) {
  document.documentElement.lang = language.locale;
  document.documentElement.dir = LOCALES[language.locale].direction;
  document.title = `DARS · ${language.messages.pageTitle}`;
}

export default function App({ initialLanguage }: { initialLanguage: Language }) {
  const [language, setLanguage] = useState(initialLanguage);
  const [theme, setTheme] = useState(storedTheme);
  const [manager] = useState(() => createModuleManager(primaryModules));
  const [adaptive, setAdaptive] = useState<AdaptiveSnapshot>();
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [assetMode, setAssetMode] = useState<AssetMode>(() => packagedAssets() ? 'packaged' : 'unavailable');
  const [changingMode, setChangingMode] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const adaptiveController = useRef<ReturnType<typeof startAdaptive> | null>(null);
  const assetChange = useRef(false);
  const languageRequest = useRef(0);
  const settings = useRef<HTMLDetailsElement>(null);
  const settingsLabel = useRef<HTMLElement>(null);
  const { locale, messages: m } = language;
  const module = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const active = manager.getActive()?.instance;
  const resources = operationsOpen ? active?.getResources() : undefined;
  const phase = module.modules[0]?.phase ?? 'unloaded';
  const visible = adaptive?.signals.visible;
  const suspendWhenHidden = adaptive?.policy.suspendWhenHidden;

  useEffect(() => {
    const saved = readPreference('profile');
    const controller = startAdaptive(setAdaptive, isAdaptiveSelection(saved) ? saved : 'auto');
    adaptiveController.current = controller;
    return () => {
      controller.dispose();
      adaptiveController.current = null;
      void manager.close();
    };
  }, [manager]);

  useEffect(() => {
    if (visible === undefined) return;
    if (!visible && suspendWhenHidden) void manager.suspend();
    else void manager.activate('standard');
  }, [manager, visible, suspendWhenHidden]);

  useLayoutEffect(() => {
    if (adaptive) active?.setPolicy(adaptive.policy);
    document.documentElement.dataset.resourceEffects = adaptive?.policy.reducedEffects ? 'reduced' : 'full';
  }, [active, adaptive?.policy]);

  useEffect(() => observeAssetMode(setAssetMode), []);
  useEffect(() => {
    if (!operationsOpen) adaptiveController.current?.setDiagnostics(false);
  }, [operationsOpen]);

  useEffect(() => applyLanguage(language), [language]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  async function chooseLanguage(value: string) {
    if (!isLocale(value)) return;
    const serial = ++languageRequest.current;
    try {
      const loaded = await loadMessages(value);
      if (serial !== languageRequest.current) return;
      if (loaded.locale !== value) {
        setAnnouncement(m.operations.localeUnavailable);
        return;
      }
      setLanguage(loaded);
      writePreference('language', loaded.locale);
      setAnnouncement(loaded.messages.languageChanged);
    } catch {
      if (serial === languageRequest.current) setAnnouncement(m.unknownError);
    }
  }

  function chooseTheme(value: string) {
    const selected = THEMES.find((option) => option === value);
    if (!selected) return;
    setTheme(selected);
    writePreference('theme', selected);
  }

  function selectProfile(value: AdaptiveSelection) {
    adaptiveController.current?.select(value);
    writePreference('profile', value);
  }

  async function changeOffline(value: boolean) {
    if (assetChange.current) return;
    assetChange.current = true;
    setChangingMode(true);
    const result = await getAssetMode(value);
    setAssetMode(result);
    if (result !== (value ? 'offline' : 'online')) setAnnouncement(m.operations.offlineError);
    assetChange.current = false;
    setChangingMode(false);
  }

  async function resetSession() {
    await manager.terminate('standard');
    if (adaptiveController.current?.getSnapshot().signals.visible) void manager.activate('standard');
    setAnnouncement(m.operations.sessionCleared);
  }

  async function resetPreferences() {
    if (!clearPreferences()) {
      setAnnouncement(m.unknownError);
      return;
    }
    const serial = ++languageRequest.current;
    setTheme('dark');
    adaptiveController.current?.select('auto');
    const next = await loadMessages(preferredLocale(navigator.languages));
    if (serial !== languageRequest.current) return;
    setLanguage(next);
    setAnnouncement(next.messages.operations.preferencesCleared);
  }

  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !settings.current?.open) return;
    event.preventDefault();
    settings.current.open = false;
    settingsLabel.current?.focus();
  }

  const themeLabels: Record<Theme, string> = {
    system: m.system, light: m.light, dark: m.dark, oled: m.oled,
  };

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <svg className="brand-mark" width="38" height="38" viewBox="0 0 48 48" aria-hidden="true">
              <rect width="48" height="48" rx="12" fill="var(--accent-key)" />
              <path d="M13 13h8a11 11 0 0 1 0 22h-8V13Zm5 15 10-9" fill="none" stroke="var(--accent-ink)"
                strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="28" cy="19" r="2.4" fill="var(--accent-ink)" />
            </svg>
            <span>DARS</span>
          </div>
          <div className="header-actions">
            <span className="local-indicator"><span aria-hidden="true" />{m.onDevice}</span>
            <details ref={settings} className="settings" onKeyDown={closeOnEscape}>
              <summary ref={settingsLabel} className="settings-label">
                <Icon name="gear" size={17} /><span>{m.settings}</span>
              </summary>
              <div className="settings-popover">
                <label>
                  {m.language}
                  <select value={locale} onChange={(event) => void chooseLanguage(event.target.value)}>
                    {Object.entries(LOCALES).map(([code, data]) => <option key={code} value={code} lang={code}>{data.name}</option>)}
                  </select>
                </label>
                <label>
                  {m.appearance}
                  <select value={theme} onChange={(event) => chooseTheme(event.target.value)}>
                    {THEMES.map((option) => <option key={option} value={option}>{themeLabels[option]}</option>)}
                  </select>
                </label>
                <p>{m.savedPreferences}</p>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="main-container" data-module-phase={phase} data-workers={module.resources.worker} data-profile={adaptive?.profile}>
        <div className="intro">
          <h1>{m.standard}</h1>
          <p>{m.description}</p>
        </div>
        {active ? <ActiveWorkspace runtime={active} language={language} adaptive={adaptiveController.current}
          cacheEntries={adaptive?.policy.cacheEntries ?? 0} />
          : phase === 'recoverable_failure' ? <div role="status" className="feedback feedback-error">
            {m.engineUnavailable}{' '}
            <button type="button" className="quiet-action" onClick={() => void manager.activate('standard')}>{m.operations.retryModule}</button>
          </div>
          : <p role="status">{phase === 'suspended' ? m.operations.suspended : m.engineLoading}</p>}
        <details className="operations" onToggle={(event) => setOperationsOpen(event.currentTarget.open)}>
          <summary>{m.operations.operations}</summary>
          {operationsOpen && adaptive && <Suspense fallback={<p role="status">{m.operations.loading}</p>}>
            <OperationsPanel locale={locale} messages={m} adaptive={adaptive} phase={phase} workers={module.resources.worker}
              pending={resources?.pending ?? 0} wasmBytes={resources?.wasmBytes} mode={assetMode} changingMode={changingMode}
              select={selectProfile} setOffline={(value) => void changeOffline(value)}
              setDiagnostics={(open) => adaptiveController.current?.setDiagnostics(open)}
              clearSession={() => void resetSession()} clearPreferences={() => void resetPreferences()} />
          </Suspense>}
        </details>
        <footer className="site-footer">
          <p lang="en">Compute anything. Anywhere.</p>
          <p className="keyboard-hint">{m.keyboardHint}</p>
        </footer>
      </main>
      <span className="visually-hidden" role="status">{announcement}</span>
    </>
  );
}
