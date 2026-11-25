import type { Locator, Page } from '@playwright/test';
import ar from '../../src/locales/ar.json' with { type: 'json' };
import en from '../../src/locales/en.json' with { type: 'json' };
import es from '../../src/locales/es.json' with { type: 'json' };
import fr from '../../src/locales/fr.json' with { type: 'json' };
import hi from '../../src/locales/hi.json' with { type: 'json' };
import pt from '../../src/locales/pt-BR.json' with { type: 'json' };
import zh from '../../src/locales/zh-CN.json' with { type: 'json' };

export const catalogs = { en, 'pt-BR': pt, 'zh-CN': zh, hi, es, ar, fr };
export type Language = keyof typeof catalogs;
export const languages = Object.keys(catalogs) as Language[];

const notation: Record<Language, { decimal: string; arguments: string; digits?: string }> = {
  en: { decimal: '.', arguments: ',' },
  'pt-BR': { decimal: ',', arguments: ';' },
  'zh-CN': { decimal: '．', arguments: ',', digits: '０１２３４５６７８９' },
  hi: { decimal: '.', arguments: ',', digits: '०१२३४५६७८९' },
  es: { decimal: ',', arguments: ';' },
  ar: { decimal: '٫', arguments: '؛', digits: '٠١٢٣٤٥٦٧٨٩' },
  fr: { decimal: ',', arguments: ';' },
};

export function digitsIn(value: string, language: Language) {
  const digits = notation[language].digits;
  return digits ? value.replace(/[0-9]/gu, (digit) => digits[Number(digit)]!) : value;
}

export function decimalIn(value: string, language: Language) {
  return digitsIn(value.replaceAll('.', notation[language].decimal), language);
}

export function argumentsIn(language: Language) {
  return notation[language].arguments;
}

export function button(page: Page, label: string) {
  return page.getByRole('button', { name: label, exact: true });
}

export function textbox(page: Page, label: string) {
  return page.getByRole('textbox', { name: label, exact: true });
}

export function select(page: Page | Locator, label: string) {
  return page.getByRole('combobox', { name: label, exact: true });
}

type Fixture = {
  module: string;
  operation: string;
  input: string;
  result: string;
  options?: Record<string, unknown>;
  fill(page: Page, language: Language): Promise<void>;
};

type MatrixIndex = Readonly<Record<Language, readonly [string, string]>>;
// Cell labels are UI numbering, independent of deliberately pasted full-width/presentation digits.
const matrixIndices: MatrixIndex = {
  en: ['1','2'], 'pt-BR': ['1','2'], 'zh-CN': ['1','2'], hi: ['१','२'],
  es: ['1','2'], ar: ['١','٢'], fr: ['1','2'],
};

export const currencySource = 'Desk १.٥; source';
export const fixtures: readonly Fixture[] = [
  {
    module: 'standard', operation: 'evaluate', input: '9007199254740993.125+0.125', result: '36028797018963973/4',
    fill: (page, language) => textbox(page, catalogs[language].expression).fill(decimalIn('9007199254740993.125+0.125', language)),
  },
  {
    module: 'scientific', operation: 'evaluate', input: 'log(8,2)', result: '3', options: { precision: 40 },
    async fill(page, language) {
      const messages = catalogs[language];
      const precision = textbox(page, messages.scientific.precision);
      await precision.clear();
      await precision.fill(digitsIn('40', language));
      await textbox(page, messages.expression).fill(digitsIn(`log(8${argumentsIn(language)}2)`, language));
    },
  },
  {
    module: 'algebra', operation: 'system', input: 'x+y=1.5; x-y=0.5', result: 'x=1; y=1/2', options: { domain: 'real' },
    async fill(page, language) {
      const algebra = catalogs[language].algebra;
      await button(page, algebra.operations.system).click();
      await textbox(page, algebra.inputs.system).fill(decimalIn('x+y=1.5; x-y=0.5', language));
    },
  },
  {
    module: 'calculus', operation: 'numerical_integral', input: 'x', result: '0.125',
    options: { lower: '0', upper: '0.5', tolerance: '0.000000001' },
    async fill(page, language) {
      const messages = catalogs[language];
      const c = messages.calculus;
      await button(page, c.operations.numerical_integral).click();
      await textbox(page, messages.expression).fill('x');
      for (const [field, value] of [[c.fields.upper, '0.5'], [c.fields.tolerance, '0.000000001']]) {
        const input = textbox(page, field!);
        await input.clear();
        await input.fill(decimalIn(value!, language));
      }
    },
  },
  {
    module: 'linear-algebra', operation: 'determinant', input: '0.5 0\n0 1', result: '1/2',
    async fill(page, language) {
      const [one, two] = matrixIndices[language];
      await textbox(page, `A[${one},${one}]`).fill(decimalIn('0.5', language));
      await textbox(page, `A[${two},${two}]`).fill(digitsIn('1', language));
    },
  },
  {
    module: 'geometry', operation: 'distance', input: '0 0;1.5 2', result: 'distance=5/2', options: { unit: 'cm' },
    async fill(page, language) {
      const g = catalogs[language].geometry;
      await button(page, g.operations.distance).click();
      await select(page.getByRole('region', { name: g.title, exact: true }), g.unit).selectOption('cm');
      await textbox(page, g.coordinates).fill(decimalIn('0 0;1.5 2', language));
    },
  },
  {
    module: 'discrete-mathematics', operation: 'set_union', input: '9007199254740993 alpha-1|9007199254740992',
    result: '[9007199254740992,9007199254740993,"alpha-1"]',
    async fill(page, language) {
      const d = catalogs[language].discrete;
      await button(page, d.groups.sets).click();
      await button(page, d.operations.set_union).click();
      await textbox(page, d.fields.leftSet).fill(`${digitsIn('9007199254740993', language)} alpha-1`);
      await textbox(page, d.fields.rightSet).fill(digitsIn('9007199254740992', language));
    },
  },
  {
    module: 'programmer', operation: 'convert', input: 'F0',
    result: 'binary=000011110000; octal=0360; decimal=240; hexadecimal=0F0', options: { base: 16, width: 12 },
    async fill(page, language) {
      const p = catalogs[language].programmer;
      await select(page, p.inputBase).selectOption('16');
      const width = textbox(page, p.bitWidth);
      await width.clear();
      await width.fill(digitsIn('12', language));
      await textbox(page, p.fields.value).fill(digitsIn('F0', language));
    },
  },
  {
    module: 'converter', operation: 'currency', input: '1.25', result: 'amount=25/8; status=within_validity',
    options: { from: 'USD', to: 'BRL', rate: '2.5', source: currencySource, as_of: '2024-01-10',
      valid_until: '2024-01-31', reference_date: '2024-01-31' },
    async fill(page, language) {
      const c = catalogs[language].converter;
      await button(page, c.currency).click();
      await button(page, c.useExample).click();
      for (const [label, value] of [[c.amount, '1.25'], [c.exchangeRate, '2.5']]) {
        const field = textbox(page, label!);
        await field.clear();
        await field.fill(decimalIn(value!, language));
      }
      await textbox(page, c.rateSource).fill(currencySource);
      await page.getByLabel(c.referenceDate, { exact: true }).fill('2024-01-31');
    },
  },
  {
    module: 'date-time', operation: 'timezone', input: '2024-11-03T01:30:00',
    result: 'local=2024-11-03T05:30:00; utc=2024-11-03T05:30:00Z; from_offset=-04:00; to_offset=+00:00; from_dst=true; to_dst=false; resolution=earlier',
    options: { from: 'America/New_York', to: 'UTC', disambiguation: 'earlier' },
    async fill(page, language) {
      const d = catalogs[language].dateTime;
      await button(page, d.operations.timezone).click();
      await textbox(page, d.fields.local).fill(digitsIn('2024-11-03T01:30:00', language));
      await select(page, d.disambiguation).selectOption('earlier');
    },
  },
];

export function resultFor(page: Page, module: string): Locator {
  return page.getByTestId(module === 'standard' ? 'result' : `${module}-result`);
}
