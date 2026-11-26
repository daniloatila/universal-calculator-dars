import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { isAdaptiveSelection } from './adaptive';
import type { AdaptiveSelection, AdaptiveSnapshot } from './adaptive';
import { startAdaptive } from './adaptive-browser';
import { Icon } from './icons';
import { isLocale, loadMessages, LOCALES, preferredLocale } from './i18n';
import type { Locale, Messages } from './i18n';
import { createModuleManager } from './module-manager';
import type { ModuleManagerOptions } from './module-manager';
import ModuleNavigation from './module-navigation';
import { primaryModules } from './module-registry';
import type { RegisteredModule } from './module-registry';
import { getAssetMode, observeAssetMode, packagedAssets } from './offline';
import type { AssetMode } from './offline';
import { clearPreferences, readPreference, storedTheme, THEMES, writePreference } from './preferences';
import type { Theme } from './preferences';

type Language = { locale: Locale; messages: Messages };

const OperationsPanel = lazy(() => import('./operations-panel'));

class WorkspaceBoundary extends Component<{ children: ReactNode; onFailure(): void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function applyLanguage(language: Language, title?: string) {
  document.documentElement.lang = language.locale;
  document.documentElement.dir = LOCALES[language.locale].direction;
  document.title = title ? 'DARS · ' + title : 'DARS';
}

interface AppProps {
  initialLanguage: Language;
  modules?: readonly RegisteredModule[];
  moduleOptions?: ModuleManagerOptions;
}

export default function App({ initialLanguage, modules = primaryModules, moduleOptions }: AppProps) {
  const [language, setLanguage] = useState(initialLanguage);
  const [theme, setTheme] = useState(storedTheme);
  const [manager] = useState(() => createModuleManager(modules, moduleOptions));
  const [selectedId, setSelectedId] = useState(() => modules[0]?.id ?? null);
  const [pausedId, setPausedId] = useState<string | null>(null);
  const selectedModule = useRef(selectedId);
  const [adaptive, setAdaptive] = useState<AdaptiveSnapshot>();
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [nativeOffline,setNativeOffline]=useState(true);
  const [sessionGeneration,setSessionGeneration]=useState(0);
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
  const current = manager.getActive();
  const active = current?.id === selectedId ? current.instance : undefined;
  const Workspace = active?.Workspace;
  const description = modules.find(({ id }) => id === selectedId)?.describe(m);
  const pageTitle = description?.pageTitle ?? description?.title;
  const resources = operationsOpen ? active?.getResources?.() : undefined;
  const phase = module.modules.find(({ id }) => id === selectedId)?.phase ?? 'unloaded';
  const visible = adaptive?.signals.visible;
  const suspendWhenHidden = adaptive?.policy.suspendWhenHidden;
  const recordInteraction = useCallback((ms: number) => adaptiveController.current?.recordInteraction(ms), []);

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
    if (visible === undefined || selectedId === null) return;
    if (!visible && suspendWhenHidden) void manager.suspend();
    else if (pausedId !== selectedId) void manager.activate(selectedId);
  }, [manager, selectedId, pausedId, visible, suspendWhenHidden]);

  useLayoutEffect(() => {
    if (adaptive) active?.setPolicy?.(adaptive.policy);
    document.documentElement.dataset.resourceEffects = adaptive?.policy.reducedEffects ? 'reduced' : 'full';
  }, [active, adaptive?.policy]);

  useEffect(() => observeAssetMode(setAssetMode), []);
  useEffect(() => {
    if (!operationsOpen) adaptiveController.current?.setDiagnostics(false);
  }, [operationsOpen]);

  useEffect(() => applyLanguage(language, pageTitle), [language, pageTitle]);
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
    setSessionGeneration(n=>n+1);
    window.dispatchEvent(new Event('dars-clear-session'));
    const result = await manager.clearSession();
    const id = selectedModule.current;
    setPausedId(null);
    if (id !== null && adaptiveController.current?.getSnapshot().signals.visible) void manager.activate(id);
    setAnnouncement(result === 'terminated' ? m.operations.sessionCleared : m.operations.moduleUnavailable);
  }

  function chooseModule(id: string) {
    if (!modules.some((module) => module.id === id)) return;
    selectedModule.current = id;
    setSelectedId(id);
    setPausedId(null);
  }

  function stopModule(action: 'suspend' | 'terminate') {
    if (selectedId === null) return;
    setPausedId(selectedId);
    void manager[action](selectedId);
  }

  function resumeModule() {
    if (selectedId === null || !visible) return;
    setPausedId(null);
    void manager.activate(selectedId);
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

      <main className="main-container" data-module-id={selectedId ?? undefined} data-module-phase={phase}
        data-workers={module.resources.worker} data-profile={adaptive?.profile}>
        <div className="intro">
          <h1>{description?.title ?? 'DARS'}</h1>
          {description?.description && <p>{description.description}</p>}
        </div>
        {modules.length > 1 && <ModuleNavigation modules={modules} selectedId={selectedId}
          locale={locale} messages={m} select={chooseModule}>
          {phase === 'active' && <button type="button" className="quiet-action"
            onClick={() => stopModule('suspend')}>{m.operations.moduleSuspend}</button>}
          {['active', 'suspended', 'recoverable_failure'].includes(phase) &&
            <button type="button" className="quiet-action" onClick={() => stopModule('terminate')}>{m.operations.moduleEnd}</button>}
        </ModuleNavigation>}
        {Workspace && active && selectedId !== null
          ? <WorkspaceBoundary key={selectedId} onFailure={() => manager.failWorkspace(selectedId, active)}>
            <Workspace locale={locale} messages={m} recordInteraction={recordInteraction} />
          </WorkspaceBoundary>
          : phase === 'recoverable_failure' ? <div role="status" className="feedback feedback-error">
            {m.operations.moduleUnavailable}{' '}
            <button type="button" className="quiet-action" onClick={resumeModule}>{m.operations.retryModule}</button>
          </div>
          : phase === 'suspended' || phase === 'terminated' ? <p role="status">
            {m.operations[phase]}{' '}
            {visible && pausedId === selectedId &&
              <button type="button" className="quiet-action" onClick={resumeModule}>{m.operations.moduleResume}</button>}
          </p>
          : <p role="status">{description ? m.operations.moduleStarting : m.operations.moduleUnavailable}</p>}
        <details className="operations" onToggle={(event) => setOperationsOpen(event.currentTarget.open)}>
          <summary>{m.operations.operations}</summary>
          {operationsOpen && adaptive && <Suspense fallback={<p role="status">{m.operations.loading}</p>}>
            <OperationsPanel key={selectedId+'-'+sessionGeneration+'-'+phase} nativeOffline={nativeOffline} setNativeOffline={setNativeOffline}
              locale={locale} messages={m} adaptive={adaptive} phase={phase}
              moduleName={description?.title ?? m.operations.unavailable} workers={module.resources.worker}
              pending={active ? resources?.pending : 0} wasmBytes={resources?.wasmBytes} mode={assetMode} changingMode={changingMode}
              select={selectProfile} setOffline={(value) => void changeOffline(value)}
              setDiagnostics={(open) => adaptiveController.current?.setDiagnostics(open)}
              clearSession={() => void resetSession()} clearPreferences={() => void resetPreferences()} />
          </Suspense>}
        </details>
        <footer className="site-footer">
          <p lang="en">Compute anything. Anywhere.</p>
          {description?.keyboardHint && <p className="keyboard-hint">{description.keyboardHint}</p>}
        </footer>
      </main>
      <span className="visually-hidden" role="status">{announcement}</span>
    </>
  );
}
