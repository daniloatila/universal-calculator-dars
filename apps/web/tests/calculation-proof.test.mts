import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_CALCULATION_PROOF_BYTES, parseCalculationProof, parseCalculationProofFile,
  serializeCalculationProof, withExpressionLocale,
} from '../src/calculation-proof.ts';
import { localizeProofText, proofLabels } from '../src/calculation-proof-labels.ts';
import { scientificRecord } from './fixtures/calculation-proof.ts';

test('a valid local record round-trips through the published JSON fields', () => {
  assert.deepEqual(parseCalculationProof(scientificRecord), scientificRecord);
  assert.deepEqual(parseCalculationProofFile(serializeCalculationProof(scientificRecord)), scientificRecord);
  const approximate = {
    ...scientificRecord, exactness: 'approximate', precision: 34, error_bound: '1e-33',
    result: '0.8414709848078965066525023216302990',
  } as const;
  assert.deepEqual(parseCalculationProofFile(serializeCalculationProof(approximate)), approximate);
});

test('optional source-locale metadata preserves the original and normalized proof fields', () => {
  const proof = withExpressionLocale(scientificRecord, 'pt-BR');
  assert.deepEqual(parseCalculationProofFile(serializeCalculationProof(proof)), {
    ...scientificRecord, expression_locale: 'pt-BR',
  });
  assert.equal(parseCalculationProof({ ...scientificRecord, expression_locale: 'pt-PT' }), null);
  assert.equal(parseCalculationProof({ ...scientificRecord, expression_locale: ['en'] }), null);
  assert.equal(parseCalculationProofFile(JSON.stringify(proof).replace('"expression_locale":"pt-BR"',
    '"expression_locale":"pt-BR","expression_locale":"en"')), null);
});

test('schema, fields, module and operation use bounded exact shapes', () => {
  const { result: _omitted, ...missing } = scientificRecord;
  for (const invalid of [
    missing,
    { ...scientificRecord, extra: 'value' },
    { ...scientificRecord, schema: 2 },
    { ...scientificRecord, module: 'arbitrary' },
    { ...scientificRecord, operation: '../standard' },
    { ...scientificRecord, operation: 'sin\n' },
    { ...scientificRecord, operation: 's'.repeat(65) },
    { ...scientificRecord, exactness: 'verified' },
    { ...scientificRecord, precision: 0 },
    { ...scientificRecord, precision: 1.5 },
    { ...scientificRecord, formula: false },
    { ...scientificRecord, constraints: 'x≠0' },
  ]) assert.equal(parseCalculationProof(invalid), null);
});

test('options and maps contain bounded scalar values and exclude reserved keys', () => {
  for (const invalid of [
    { ...scientificRecord, options: { angle: { value: 'deg' } } },
    { ...scientificRecord, options: { precision: 9007199254740992 } },
    { ...scientificRecord, options: { 'not valid': 1 } },
    { ...scientificRecord, options: { note: 'α'.repeat(129) } },
    { ...scientificRecord, options: { ['p'.repeat(33)]: 1 } },
    { ...scientificRecord, options: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [String(i), i])) },
    { ...scientificRecord, variables: { x: 10 } },
    { ...scientificRecord, units: { constructor: 'deg' } },
    { ...scientificRecord, options: { ['__proto__']: 1 } },
  ]) assert.equal(parseCalculationProof(invalid), null);
});

test('duplicate names in uploaded JSON are rejected even when escapes hide the duplication', () => {
  const json = JSON.stringify(scientificRecord);
  assert.equal(parseCalculationProofFile(json.replace('"schema":1', '"schema":1,"\\u0073chema":1')), null);
  assert.equal(parseCalculationProofFile(json.replace('"angle":"deg"', '"angle":"deg","angle":"deg"')), null);
  assert.deepEqual(parseCalculationProofFile(json), scientificRecord);
});

test('nested or invalid raw JSON cannot produce a record', () => {
  const json = JSON.stringify(scientificRecord);
  const nested = json.replace('"complex":false', '"complex":{"nested":false}');
  for (const invalid of [nested, json.slice(0, -1), 'null', '[]', '{ "x": "invalid\\z" }']) {
    assert.equal(parseCalculationProofFile(invalid), null);
  }
});

test('expression sizes and the total file cap use UTF-8 bytes', () => {
  const boundary = { ...scientificRecord, expression: 'π'.repeat(2048) };
  assert.deepEqual(parseCalculationProof(boundary), boundary);
  assert.equal(parseCalculationProof({ ...scientificRecord, expression: 'π'.repeat(2049) }), null);
  const longFields = Array<string>(32).fill('∞'.repeat(640));
  const tooLarge = { ...scientificRecord, assumptions: longFields, constraints: longFields, references: longFields };
  assert.ok(JSON.stringify(tooLarge).length < MAX_CALCULATION_PROOF_BYTES);
  assert.equal(parseCalculationProof(tooLarge), null);
  assert.equal(parseCalculationProofFile(JSON.stringify(tooLarge)), null);
  assert.equal(parseCalculationProofFile(JSON.stringify(scientificRecord).padEnd(MAX_CALCULATION_PROOF_BYTES + 1)), null);
});

test('a record preserves literal labels without interpreting markup or URLs', () => {
  const record = {
    ...scientificRecord, normalized: '{"value":"<b>x</b>"}',
    references: ['javascript:external("audit")', 'https://example.invalid/#expression'],
  };
  assert.deepEqual(parseCalculationProofFile(serializeCalculationProof(record)), record);
  assert.equal(parseCalculationProof({ ...scientificRecord, result: '1\u0000' }), null);
  assert.equal(parseCalculationProof({ ...scientificRecord, result: '\u2067' + '1' + '\u2069' }), null);
  assert.equal(parseCalculationProof({ ...scientificRecord, result: '\u202E' + '1' }), null);
  assert.equal(parseCalculationProof({ ...scientificRecord, result: '\u000B1' }), null);
  assert.equal(parseCalculationProof({ ...scientificRecord, result: '\uD800' }), null);
});

test('only Standard evaluation can carry bounded opaque value bindings', () => {
  const standard = {
    ...scientificRecord, module: 'standard', operation: 'evaluate',
    expression: '(@1)×2', normalized: '(@1)*2', standard_bindings: { '1': '{"value":"opaque"}' },
  } as const;
  const json = serializeCalculationProof(standard);
  assert.deepEqual(parseCalculationProofFile(json), standard);
  assert.equal(parseCalculationProof({ ...standard, module: 'scientific' }), null);
  assert.equal(parseCalculationProof({ ...standard, operation: 'combine' }), null);
  const opaque = standard.standard_bindings['1'];
  for (const bindings of [
    {}, { '00': opaque }, { '01': opaque }, { '4294967296': opaque }, { '0': opaque },
    { '1': {} }, { '1': '' }, { '1': 'π' }, { '1': 'a\nb' }, { '1': 'x'.repeat(10_001) },
    { ['__proto__']: opaque },
    Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, 'x'.repeat(10_000)])),
    Object.fromEntries(Array.from({ length: 257 }, (_, index) => [index + 1, 'x'])),
  ]) assert.equal(parseCalculationProof({ ...standard, standard_bindings: bindings }), null);
  assert.equal(parseCalculationProofFile(json.replace('"1":', '"1":"opaque", "\\u0031":')), null);
});

test('all seven locales include labels for the full record and exactness', () => {
  assert.equal(Object.keys(proofLabels).length, 7);
  for (const locale of Object.values(proofLabels)) {
    for (const field of Object.keys(scientificRecord) as (keyof typeof scientificRecord)[]) {
      assert.ok(locale.fields[field].trim(), field);
    }
    assert.ok(Object.values(locale.exactness).every((value) => value.trim().length > 0));
  }
  const method = 'multiple-precision numerical evaluation';
  assert.equal(localizeProofText('en', 'scientific', 'method', method), method);
  const localized = (Object.keys(proofLabels) as Array<keyof typeof proofLabels>)
    .filter((locale) => locale !== 'en')
    .map((locale) => localizeProofText(locale, 'scientific', 'method', method));
  assert.ok(localized.every((text) => text !== method && text.length > 0));
  assert.equal(localizeProofText('pt-BR', 'scientific', 'result', method), method);
  assert.equal(localizeProofText('pt-BR', 'scientific', 'method', 'constructor'), 'constructor');
});
