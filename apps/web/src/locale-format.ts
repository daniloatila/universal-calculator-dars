import { LOCALES } from './i18n.ts';
import type { Locale } from './i18n.ts';

const digitSets = ['٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹', '०१२३४५६७८९', '０１２３４５６７８９'];
const digits = new Map(
  digitSets.flatMap((set) => Array.from(set, (character, index) => [character, String(index)] as const)),
);

export type LocalizedDraft = { text: string; locale: Locale };

const decimalByLocale = new Map<Locale, string>();

export function localizedDecimal(locale: Locale): string {
  let decimal = decimalByLocale.get(locale);
  if (decimal === undefined) {
    decimal = new Intl.NumberFormat(LOCALES[locale].format).formatToParts(1.5)
      .find((part) => part.type === 'decimal')?.value ?? '.';
    decimalByLocale.set(locale, decimal);
  }
  return decimal;
}

// A nonempty draft keeps its interpretation until explicitly cleared or replaced by an example.
export function editLocalizedDraft(previous: LocalizedDraft | undefined, text: string, locale: Locale): LocalizedDraft {
  return { text, locale: text.trim() && previous?.text.trim() ? previous.locale : locale };
}

export function draftDecimal(draft: LocalizedDraft): string {
  return localizedDecimal(draft.locale);
}

export function normalizeDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (character) => digits.get(character) ?? character);
}

export function normalizeSignedDigits(text: string): string {
  return normalizeDigits(text).replace(/[−－]/gu, '-').replaceAll('＋', '+');
}

const operatorReplacements: Readonly<Record<string, string>> = {
  '−': '-',
  '×': '*',
  '÷': '/',
  '٪': '%',
  '（': '(',
  '）': ')',
  '＋': '+',
  '－': '-',
  '／': '/',
  '＊': '*',
  '＾': '^',
  '％': '%',
  '．': '.',
};

export function normalizeMathText(expression: string, decimalSeparator: string): string {
  const tokens = /(?:\p{Nd}+(?:[.,٫．]\p{Nd}*)?|[.,٫．]\p{Nd}+)(?:[eE][+＋\-−－]?\p{Nd}+)?|[\p{L}_][\p{L}\p{Nd}_]*|./gsu;
  return expression.replace(tokens, (token) => {
    if (/^[\p{L}_]/u.test(token)) return token;
    return Array.from(token, (character) => {
      if (character === decimalSeparator || character === '٫') return '.';
      return digits.get(character) ?? operatorReplacements[character] ?? character;
    }).join('');
  });
}

export function normalizeExpression(expression: string, decimalSeparator: string): string {
  return normalizeMathText(expression, decimalSeparator).replace(/[;؛]/gu, ',');
}

export function localizeExpression(expression: string, decimalSeparator: string): string {
  return expression.replace(/[.,]/g, (character) =>
    character === '.' ? decimalSeparator : (decimalSeparator === ',' ? ';' : ','),
  );
}

export function isExactDecimal(exact: string | null, decimal: string): boolean {
  if (exact === null) return false;
  if (exact === decimal) return true;

  const exactParts = exact.match(/^(-?\d+)(?:\/(\d+))?$/);
  const decimalParts = decimal.match(/^(-?\d+)(?:\.(\d+))?$/);
  if (!exactParts?.[1] || !decimalParts?.[1]) return false;
  const fraction = decimalParts[2] ?? '';
  const represented = BigInt(decimalParts[1] + fraction);
  const scale = 10n ** BigInt(fraction.length);
  const denominator = BigInt(exactParts[2] ?? '1');
  // Compare the engine's two output representations without changing either one.
  return represented * denominator === BigInt(exactParts[1]) * scale;
}

export function numberPresentation(locale: string) {
  const integerFormat = new Intl.NumberFormat(locale);
  const plainFormat = new Intl.NumberFormat(locale, { useGrouping: false });
  const decimal = plainFormat.formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';
  const localizedDigits = Array.from('0123456789', (digit) => plainFormat.format(BigInt(digit)));

  function translateDigits(value: string): string {
    return value.replace(/[0-9]/g, (digit) => localizedDigits[Number(digit)] ?? digit);
  }

  function format(value: string): string {
    const components = value.match(/^(-?\d+)(?:\.(\d+))?([Ee][+-]?\d+)?$/);
    if (!components?.[1]) {
      const fraction = value.match(/^(-?\d+)\/(\d+)$/);
      if (fraction?.[1] && fraction[2]) return `${format(fraction[1])}/${format(fraction[2])}`;
      return value;
    }

    const integer = components[1];
    const magnitude = BigInt(integer);
    // BigInt normalizes negative zero. Preserve the sign of a fractional value between -1 and 0.
    const formatted = magnitude === 0n && integer.startsWith('-')
      ? `−${integerFormat.format(0n)}`
      : integerFormat.format(magnitude);
    const fraction = components[2] ? `${decimal}${translateDigits(components[2])}` : '';
    const exponent = components[3] ? translateDigits(components[3]) : '';
    return formatted + fraction + exponent;
  }

  return { decimal, digits: localizedDigits, format };
}
