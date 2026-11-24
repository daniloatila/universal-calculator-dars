const digitSets = ['٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹', '०१२३४५६७८९', '０１２３４５６７８９'];
const digits = new Map(
  digitSets.flatMap((set) => Array.from(set, (character, index) => [character, String(index)] as const)),
);

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

export function normalizeExpression(expression: string, decimalSeparator: string): string {
  return Array.from(expression, (character) => {
    if (character === decimalSeparator || character === '٫') return '.';
    if (character === ';' || character === '؛') return ',';
    return digits.get(character) ?? operatorReplacements[character] ?? character;
  }).join('');
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
