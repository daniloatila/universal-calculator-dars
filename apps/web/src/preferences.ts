export const THEMES = ['system', 'light', 'dark', 'oled'] as const;
export type Theme = typeof THEMES[number];

const preferencePrefix = 'dars.preference.';
const preferenceKeys = ['language', 'theme', 'profile'] as const;
type PreferenceKey = typeof preferenceKeys[number];

export function readPreference(key: PreferenceKey): string | null {
  try {
    return window.localStorage.getItem(preferencePrefix + key);
  } catch {
    return null;
  }
}

export function writePreference(key: PreferenceKey, value: string) {
  try {
    window.localStorage.setItem(preferencePrefix + key, value);
  } catch {
    // The preference still works for the current view when storage is unavailable.
  }
}

export function clearPreferences(): boolean {
  try {
    for (const key of preferenceKeys) window.localStorage.removeItem(preferencePrefix + key);
    return true;
  } catch {
    return false;
  }
}

export function storedTheme(): Theme {
  const saved = readPreference('theme');
  return THEMES.find((theme) => theme === saved) ?? 'dark';
}
