import { createRoot } from 'react-dom/client';
import App from './app';
import { isLocale, loadMessages, LOCALES, preferredLocale } from './i18n';
import { readPreference, storedTheme } from './preferences';
import { registerOffline } from './offline';
import './styles.css';

const container = document.getElementById('app');

async function start() {
  if (!container) return;
  document.documentElement.dataset.theme = storedTheme();
  const saved = readPreference('language');
  const selected = isLocale(saved) ? saved : preferredLocale(navigator.languages);
  const initialLanguage = await loadMessages(selected);
  document.documentElement.lang = initialLanguage.locale;
  document.documentElement.dir = LOCALES[initialLanguage.locale].direction;
  createRoot(container).render(<App initialLanguage={initialLanguage}/>);
  registerOffline(initialLanguage.locale);
}

void start().catch(() => {
  if (container) {
    container.setAttribute('role', 'alert');
    container.textContent = 'DARS could not load. Reload the application to try again.';
  }
});
