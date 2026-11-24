import { Suspense, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { startEngine } from './engine';
import type { Evaluate } from './engine';
import { Icon } from './icons';
import { isLocale, loadMessages, LOCALES } from './i18n';
import type { Locale, Messages } from './i18n';
import { resolveModule } from './module-registry';
import { storedTheme, THEMES, writePreference } from './preferences';
import type { Theme } from './preferences';

type Language = { locale: Locale; messages: Messages };

const unavailable: Evaluate = async () => ({ ok: false, code: 'engine_unavailable' });
const activeModule = resolveModule('standard');

function applyLanguage(language: Language) {
  document.documentElement.lang = language.locale;
  document.documentElement.dir = LOCALES[language.locale].direction;
  document.title = `DARS · ${language.messages.pageTitle}`;
}

export default function App({ initialLanguage }: { initialLanguage: Language }) {
  const [language, setLanguage] = useState(initialLanguage);
  const [theme, setTheme] = useState(storedTheme);
  const [engineStatus, setEngineStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [announcement, setAnnouncement] = useState('');
  const evaluation = useRef<Evaluate>(unavailable);
  const languageRequest = useRef(0);
  const settings = useRef<HTMLDetailsElement>(null);
  const settingsLabel = useRef<HTMLElement>(null);
  const { locale, messages: m } = language;

  useEffect(() => {
    const engine = startEngine(setEngineStatus);
    evaluation.current = engine.evaluate;
    return () => engine.close();
  }, []);

  useEffect(() => applyLanguage(language), [language]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  async function chooseLanguage(value: string) {
    if (!isLocale(value)) return;
    const serial = ++languageRequest.current;
    try {
      const loaded = await loadMessages(value);
      if (serial !== languageRequest.current) return;
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

  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !settings.current?.open) return;
    event.preventDefault();
    settings.current.open = false;
    settingsLabel.current?.focus();
  }

  const themeLabels: Record<Theme, string> = {
    system: m.system, light: m.light, dark: m.dark, oled: m.oled,
  };
  const Workspace = activeModule.Workspace;

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand">
            <img src={`${import.meta.env.BASE_URL}dars.svg`} alt="" width="38" height="38"/>
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

      <main className="main-container">
        <div className="intro">
          <h1>{m[activeModule.title]}</h1>
          <p>{m.description}</p>
        </div>
        <Suspense fallback={<p role="status">{m.engineLoading}</p>}>
          <Workspace locale={locale} messages={m} engineStatus={engineStatus} evaluate={(input) => evaluation.current(input)} />
        </Suspense>
        <footer className="site-footer">
          <p lang="en">Compute anything. Anywhere.</p>
          <p className="keyboard-hint">{m.keyboardHint}</p>
        </footer>
      </main>
      <span className="visually-hidden" role="status">{announcement}</span>
    </>
  );
}
