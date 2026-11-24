export const THEMES = ['system', 'light', 'dark', 'oled'] as const;
export type Theme = typeof THEMES[number];

const preferencePrefix = 'dars.preference.';

export function readPreference(key: 'language' | 'theme'): string | null {
  try {
    return window.localStorage.getItem(preferencePrefix + key);
  } catch {
    return null;
  }
}

export function writePreference(key: 'language' | 'theme', value: string) {
  try {
    window.localStorage.setItem(preferencePrefix + key, value);
  } catch {
    // The preference still works for the current view when storage is unavailable.
  }
}

export function storedTheme(): Theme {
  const saved = readPreference('theme');
  return THEMES.find((theme) => theme === saved) ?? 'dark';
}
