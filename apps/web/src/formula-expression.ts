/** A bounded compiler for named numeric expressions. Arithmetic is executed only by Rust. */
export class FormulaError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function fail(code: string): never { throw new FormulaError(code); }
export const formulaName = (text: unknown): text is string => typeof text === 'string' &&
  /^[a-z][a-z0-9_]{0,31}$/u.test(text) && !['constructor', 'prototype', 'sqrt', 'cbrt'].includes(text);
export const scalar = (value: unknown): value is string => typeof value === 'string' && value.length <= 160 &&
  /^-?(?:\d+(?:\.\d+)?|\d+\/[1-9]\d*)$/u.test(value);

type Dimensions = Map<string, number>;
function merge(left: Dimensions, right: Dimensions, factor: number): Dimensions {
  const result = new Map(left);
  for (const [unit, exponent] of right) {
    const power = (result.get(unit) ?? 0) + factor * exponent;
    if (!Number.isInteger(power) || Math.abs(power) > 24 || result.size > 16) fail('unit');
    if (power) result.set(unit, power); else result.delete(unit);
  }
  return result;
}
function powerUnit(units: Dimensions, factor: number) { return merge(new Map(), units, factor); }
function same(left: Dimensions, right: Dimensions) {
  return left.size === right.size && [...left].every(([key, power]) => right.get(key) === power);
}
function unitDimensions(unit: string): Dimensions {
  if (unit === '1') return new Map();
  if (typeof unit !== 'string' || unit.length > 64 || !/^(?:1|[A-Za-z][A-Za-z0-9]{0,11})(?:\^-?\d{1,2})?(?:[*/][A-Za-z][A-Za-z0-9]{0,11}(?:\^-?\d{1,2})?)*$/u.test(unit)) fail('unit');
  let value: Dimensions = new Map();
  for (const m of unit.matchAll(/([*/]?)([A-Za-z][A-Za-z0-9]*|1)(?:\^(-?\d+))?/gu)) {
    const name = m[2]!;
    if (name !== '1') value = merge(value, new Map([[name, Number(m[3] ?? 1)]]), m[1] === '/' ? -1 : 1);
  }
  return value;
}
export function compatibleUnits(left: string, right: string) { return same(unitDimensions(left), unitDimensions(right)); }
type Node = { code: string; units: Dimensions; literal?: number };
type Binding = { value: string; unit: string };

export function compileFormula(expression: string, bindings: ReadonlyMap<string, Binding>, outputUnit: string) {
  if (typeof expression !== 'string' || expression.length > 768 || !expression.trim()) fail('expression');
  const input = expression.trim();
  const lexer = /\s*(\d+(?:\.\d+)?|[a-z][a-z0-9_]*|[()+*/^\-])/gyu;
  const tokens: string[] = [];
  while (lexer.lastIndex < input.length) {
    const token = lexer.exec(input);
    if (!token) fail('expression');
    if (tokens.length >= 128) fail('complexity');
    tokens.push(token[1]!);
  }
  let position = 0;
  function operand(depth: number): Node {
    if (depth > 32) fail('complexity');
    const token = tokens[position++];
    if (token === '+' || token === '-') {
      const part = binary(3, depth + 1);
      return { code: '(' + token + part.code + ')', units: part.units,
        literal: part.literal === undefined ? undefined : (token === '-' ? -part.literal : part.literal) };
    }
    if (token === '(' || token === 'sqrt' || token === 'cbrt') {
      if (token !== '(' && tokens[position++] !== '(') fail('expression');
      const nested = binary(0, depth + 1);
      if (tokens[position++] !== ')') fail('expression');
      if (token === '(') return nested;
      return { code: token + '(' + nested.code + ')', units: powerUnit(nested.units, 1 / (token === 'sqrt' ? 2 : 3)) };
    }
    if (!token) fail('expression');
    if (/^\d/u.test(token)) {
      if (token.length > 128) fail('complexity');
      return { code: token, units: new Map(), literal: /^\d{1,2}$/u.test(token) ? Number(token) : undefined };
    }
    if (!formulaName(token)) fail('expression');
    const bound = bindings.get(token);
    if (!bound) fail('reference');
    if (!scalar(bound.value)) fail('input');
    return { code: '(' + bound.value + ')', units: unitDimensions(bound.unit) };
  }
  const precedences: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
  function binary(min: number, depth: number): Node {
    if (depth > 32) fail('complexity');
    let left = operand(depth);
    while (position < tokens.length) {
      const op = tokens[position]!;
      const priority = Object.hasOwn(precedences, op) ? precedences[op]! : -1;
      if (priority < min) break;
      position++;
      const right = binary(priority + (op === '^' ? 0 : 1), depth + 1);
      let units: Dimensions;
      if (op === '+' || op === '-') {
        if (!same(left.units, right.units)) fail('unit');
        units = left.units;
      } else if (op === '^') {
        if (right.units.size || (left.units.size && right.literal === undefined)) fail('unit');
        units = left.units.size ? powerUnit(left.units, right.literal!) : new Map();
      } else units = merge(left.units, right.units, op === '*' ? 1 : -1);
      const code = '(' + left.code + op + right.code + ')';
      if (code.length > 2048) fail('complexity');
      left = { code, units };
    }
    return left;
  }
  const compiled = binary(0, 0);
  if (position !== tokens.length) fail('expression');
  if (!same(compiled.units, unitDimensions(outputUnit))) fail('unit');
  return compiled.code;
}
