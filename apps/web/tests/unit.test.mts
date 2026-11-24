import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { changeSign, edit, EMPTY_EDITOR, redo, spliceExpression, undo } from '../src/editor.ts';
import { isLocale, LOCALES, preferredLocale } from '../src/i18n.ts';
import { isExactDecimal, localizeExpression, normalizeExpression, numberPresentation } from '../src/locale-format.ts';

test('localized expressions retain mathematical symbols and function separators', () => {
  assert.equal(normalizeExpression('√(٠,٤٩)−root(８;३)×۲', ','), '√(0.49)-root(8,3)*2');
  assert.equal(normalizeExpression('٠٫٢٪÷١٠', '٫'), '0.2%/10');
  assert.equal(localizeExpression('root(0.125,3)', ','), 'root(0,125;3)');
  assert.equal(localizeExpression('root(0.125,3)', '.'), 'root(0.125,3)');
});

test('localized display preserves values far beyond Number precision', () => {
  assert.equal(numberPresentation('en').format('123456789012345678901234567890.0000123456789'),
    '123,456,789,012,345,678,901,234,567,890.0000123456789');
  assert.equal(numberPresentation('pt-BR').format('1234567890123456789.125'), '1.234.567.890.123.456.789,125');
  assert.equal(numberPresentation('pt-BR').format('1/3'), '1/3');
  assert.equal(numberPresentation('pt-BR').format('-0.01'), '−0,01');
  assert.equal(numberPresentation('ar-EG').format('0.125'), '٠٫١٢٥');
  assert.equal(numberPresentation('hi-IN-u-nu-deva').format('123456.05'), '१,२३,४५६.०५');
});

test('an exact decimal is distinguished from a rounded or undefined expansion', () => {
  assert.equal(isExactDecimal('3/10', '0.3'), true);
  assert.equal(isExactDecimal('-1/4', '-0.25'), true);
  assert.equal(isExactDecimal('9007199254740993', '9007199254740992'), false);
  assert.equal(isExactDecimal('1/3', '0.333333333333333333333333'), false);
  assert.equal(isExactDecimal(null, '1.41421356237309504880169'), false);
});

test('browser language resolution has explicit regional fallback and rejects unknown saved tags', () => {
  assert.equal(preferredLocale(['de-DE', 'pt-PT']), 'pt-BR');
  assert.equal(preferredLocale(['zh-cn', 'en']), 'zh-CN');
  assert.equal(preferredLocale(['ar-SA']), 'ar');
  assert.equal(preferredLocale(['de-DE']), 'en');
  assert.equal(isLocale('__proto__'), false);
  assert.equal(isLocale('fr'), true);
});

test('the seven locale catalogs provide each Standard and operational message', () => {
  function messageKeys(messages: Record<string, unknown>, parent = ''): string[] {
    return Object.entries(messages).flatMap(([key, value]) => {
      const path = parent ? `${parent}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return messageKeys(value as Record<string, unknown>, path);
      }
      assert.equal(typeof value, 'string', path);
      assert.ok((value as string).trim(), path);
      return [path];
    }).sort();
  }
  function catalog(locale: string): string[] {
    return messageKeys(JSON.parse(readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8')));
  }
  const keys = catalog('en');
  for (const locale of Object.keys(LOCALES)) {
    assert.deepEqual(catalog(locale), keys);
  }
});

test('undo, redo and a subsequent edit preserve the history branch', () => {
  let editor = edit(edit(EMPTY_EDITOR, '1'), '1+2');
  editor = undo(editor);
  assert.equal(editor.expression, '1');
  assert.equal(redo(editor).expression, '1+2');
  editor = edit(editor, '1×2');
  assert.equal(redo(editor), editor);
  assert.equal(undo(editor).expression, '1');
});

test('editing history has a hard limit and an empty history is stable', () => {
  let editor = EMPTY_EDITOR;
  for (let count = 1; count <= 100; count++) editor = edit(editor, String(count));
  assert.equal(editor.before.length, 80);
  assert.equal(redo(EMPTY_EDITOR), EMPTY_EDITOR);
  assert.equal(undo(EMPTY_EDITOR), EMPTY_EDITOR);
});

test('sign toggle respects expression boundaries and unary wrappers', () => {
  assert.equal(changeSign(''), '-');
  assert.equal(changeSign('-'), '');
  assert.equal(changeSign('-1.23'), '1.23');
  assert.equal(changeSign('1+2'), '-(1+2)');
  assert.equal(changeSign('-(1+2)'), '1+2');
  assert.equal(changeSign('-(1)+(2)'), '-(-(1)+(2))');
});

test('an edit at the caret can replace a selection or insert a function', () => {
  assert.deepEqual(spliceExpression('2+99', 2, 4, 'sqrt(9)'), { expression: '2+sqrt(9)', caret: 9 });
  assert.deepEqual(spliceExpression('23', 1, 1, '*'), { expression: '2*3', caret: 2 });
});
