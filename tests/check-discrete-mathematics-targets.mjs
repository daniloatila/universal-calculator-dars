import { verifyToolTargets } from './tool-targets.mjs';

const build = (operation, input, options = {}, extra = {}) =>
  ({ schema: 1, module: 'discrete-mathematics', operation, input, options, ...extra });
const cases = [
  build('permutations', '0'), build('permutations', '18'),
  build('permutations', '3 2 2', { repetition: true }),
  build('arrangements', '7 3'), build('arrangements', '7 3', { repetition: true }),
  build('combinations', '100 42'), build('combinations', '5 3', { repetition: true }),
  build('combinations', '4 5'), build('combinations', '0 0', { repetition: true }),
  build('set_union', '3 1 a | 2 a'), build('set_intersection', 'a b 5 | b 5 6'),
  build('set_difference', 'a b 5 | b 5 6'), build('set_symmetric_difference', 'a b 5 | b 5 6'),
  build('set_subset', 'a b | b a c'), build('set_subset', 'a b | b c'),
  build('logic', 'A && !B | A=1 B=0'), build('logic', 'A && !B | A=1 B=1'),
  build('truth_table', 'A -> B'), build('truth_table', 'A && (B || !C)'),
  build('truth_table', 'globalThis.process.exit(0)'),
  build('prime', '97'), build('prime', '341550071728321'),
  build('prime', '170141183460469231731687303715884105727'),
  build('factor', '1000036000099'), build('factor', '-360'), build('factor', '0'),
  build('gcd', '-84 30 42'), build('lcm', '25 18 135'), build('lcm', '0 18 135'),
  build('modular', '-8 5'), build('modular', '3 -1 11', { mode: 'pow' }),
  build('modular', '-3 7', { mode: 'inverse' }), build('modular', '4 8', { mode: 'inverse' }),
  build('sequence', '100'), build('sequence', '5', { mode: 'lucas' }),
  build('sequence', '3 -2 5', { mode: 'arithmetic' }),
  build('sequence', '2 -3 4', { mode: 'geometric' }),
  build('permutations', '3', {}, { original_input: '٣' }),
];
const workloads = [cases[5], cases[18], cases[21], cases[30], cases[33]];
await verifyToolTargets('discrete-mathematics', cases, workloads, [
  build('evaluate', 'sqrt(2)', {}, { module: 'scientific' }),
  build('simplify', 'x/x', {}, { module: 'algebra' }),
  build('derivative', 'x^2', {}, { module: 'calculus' }),
  build('determinant', '1 2;3 4', {}, { module: 'linear_algebra' }),
  build('rectangle', '1 2', {}, { module: 'geometry' }),
]);
