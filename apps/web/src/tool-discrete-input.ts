export const groups = {
  combinatorics: ['permutations', 'arrangements', 'combinations'],
  sets: ['set_union', 'set_intersection', 'set_difference', 'set_symmetric_difference', 'set_subset'],
  logic: ['logic', 'truth_table'],
  integers: ['prime', 'factor', 'gcd', 'lcm', 'modular'],
  sequences: ['sequence'],
} as const;
export type Group = keyof typeof groups;
export type Operation = (typeof groups)[Group][number];
export const modularModes = ['remainder', 'add', 'mul', 'pow', 'inverse'] as const;
export const sequenceModes = ['fibonacci', 'lucas', 'arithmetic', 'geometric'] as const;
export type ModularMode = typeof modularModes[number];
export type SequenceMode = typeof sequenceModes[number];
export type Field = 'n' | 'k' | 'multiplicities' | 'leftSet' | 'rightSet' | 'proposition' | 'assignments'
  | 'integer' | 'integers' | 'value' | 'secondValue' | 'exponent' | 'modulus'
  | 'index' | 'firstTerm' | 'step' | 'ratio';
export type Draft = {
  values: Partial<Record<Field, string>>;
  repetition?: boolean;
  modular?: ModularMode;
  sequence?: SequenceMode;
};

export const groupList = Object.keys(groups) as Group[];
export const combinatorics = ['permutations', 'arrangements', 'combinations'] as readonly Operation[];
export const exampleValues: Readonly<Record<Field, string>> = {
  n: '10', k: '3', multiplicities: '3 2 1', leftSet: '1 2 3 alpha', rightSet: '2 3 4 beta',
  proposition: 'A -> B', assignments: 'A=1 B=0', integer: '97', integers: '84 30',
  value: '-7', secondValue: '3', exponent: '5', modulus: '13', index: '12', firstTerm: '3', step: '2', ratio: '-2',
};

export function fieldsFor(operation: Operation, draft: Draft): readonly Field[] {
  switch (operation) {
    case 'permutations': return draft.repetition ? ['multiplicities'] : ['n'];
    case 'arrangements':
    case 'combinations': return ['n', 'k'];
    case 'set_union':
    case 'set_intersection':
    case 'set_difference':
    case 'set_symmetric_difference':
    case 'set_subset': return ['leftSet', 'rightSet'];
    case 'logic': return ['proposition', 'assignments'];
    case 'truth_table': return ['proposition'];
    case 'prime':
    case 'factor': return ['integer'];
    case 'gcd':
    case 'lcm': return ['integers'];
    case 'modular':
      if (draft.modular === 'pow') return ['value', 'exponent', 'modulus'];
      if (draft.modular === 'add' || draft.modular === 'mul') return ['value', 'secondValue', 'modulus'];
      return ['value', 'modulus'];
    case 'sequence':
      if (draft.sequence === 'arithmetic') return ['firstTerm', 'step', 'index'];
      if (draft.sequence === 'geometric') return ['firstTerm', 'ratio', 'index'];
      return ['index'];
  }
}

export function encodeExpression(group: Group, operation: Operation, values: readonly string[]) {
  if (group === 'sets' || operation === 'logic' && values[1]) return values.join('|');
  return values.join(' ').trim();
}
import { normalizeDigits, normalizeSignedDigits } from './locale-format';


export function normalizeDiscreteField(field: Field, value: string): string {
  switch (field) {
    case 'leftSet':
    case 'rightSet':
      return value.replace(/\S+/gu, (atom) => /^[+＋\-−－]?\p{Nd}+$/u.test(atom) ? normalizeSignedDigits(atom) : atom);
    case 'proposition':
      return value.replace(/[\p{L}_][\p{L}\p{Nd}_]*|\p{Nd}+|[（）＾－]/gu, (token) => {
        switch (token) {
          case '（': return '(';
          case '）': return ')';
          case '＾': return '^';
          case '－': return '-';
          default: return /^\p{Nd}/u.test(token) ? normalizeDigits(token) : token;
        }
      });
    case 'assignments':
      return value.replace(/=(\p{Nd}+)(?=\s|$)/gu, (_, digits: string) => '=' + normalizeDigits(digits));
    default:
      return normalizeSignedDigits(value);
  }
}
