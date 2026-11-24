import type en from './locales/en.json';

export type Messages = typeof en;

export const LOCALES = {
  en: { name: 'English', format: 'en', direction: 'ltr' },
  'pt-BR': { name: 'Português (Brasil)', format: 'pt-BR', direction: 'ltr' },
  'zh-CN': { name: '简体中文', format: 'zh-CN', direction: 'ltr' },
  hi: { name: 'हिन्दी', format: 'hi-IN-u-nu-deva', direction: 'ltr' },
  es: { name: 'Español', format: 'es', direction: 'ltr' },
  ar: { name: 'العربية', format: 'ar-EG', direction: 'rtl' },
  fr: { name: 'Français', format: 'fr', direction: 'ltr' },
} as const;

export type Locale = keyof typeof LOCALES;

const loaders: { [K in Locale]: () => Promise<Messages> } = {
  en: () => import('./locales/en.json').then((module) => module.default),
  'pt-BR': () => import('./locales/pt-BR.json').then((module) => module.default),
  'zh-CN': () => import('./locales/zh-CN.json').then((module) => module.default),
  hi: () => import('./locales/hi.json').then((module) => module.default),
  es: () => import('./locales/es.json').then((module) => module.default),
  ar: () => import('./locales/ar.json').then((module) => module.default),
  fr: () => import('./locales/fr.json').then((module) => module.default),
};

export function preferredLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.toLowerCase();
    const exact = (Object.keys(LOCALES) as Locale[]).find((candidate) => candidate.toLowerCase() === tag);
    if (exact) return exact;
    const baseTag = tag.split('-')[0];
    const base = (Object.keys(LOCALES) as Locale[]).find((candidate) => candidate.split('-')[0] === baseTag);
    if (base) return base;
  }
  return 'en';
}

export function isLocale(value: string | null): value is Locale {
  return value !== null && Object.hasOwn(LOCALES, value);
}

export async function loadMessages(locale: Locale): Promise<{ locale: Locale; messages: Messages }> {
  try {
    return { locale, messages: await loaders[locale]() };
  } catch {
    return { locale: 'en', messages: await loaders.en() };
  }
}
