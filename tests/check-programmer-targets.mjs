import { verifyToolTargets } from './tool-targets.mjs';

const build = (operation, input, options = {}, extra = {}) =>
  ({ schema: 1, module: 'programmer', operation, input, options, ...extra });
const cases = [
  build('convert', '42', { width: 8 }), build('convert', '0o52', { base: 8, width: 8 }),
  build('convert', '0b00101010', { base: 2, width: 8 }), build('convert', '0x2A', { base: 16, width: 8 }),
  build('convert', 'FF', { base: 16, width: 8, signed: true }),
  build('convert', '-128', { width: 8, signed: true }),
  build('convert', '128', { width: 8, signed: true }), build('convert', '-1', { width: 8 }),
  build('convert', '18446744073709551615', { width: 64 }),
  build('convert', 'ffffffffffffffffffffffffffffffff', { base: 16, width: 128, signed: true }),
  build('convert', '1'.repeat(1024), { base: 2, width: 1024 }),
  build('convert', '1', { width: 0 }), build('convert', '1', { width: 1025 }),
  build('convert', '42', { width: 8 }, { original_input: '٤٢' }),
  build('and', '170 85', { width: 8 }), build('or', '170 85', { width: 8 }),
  build('xor', '170 85', { width: 8 }), build('not', '0', { width: 16 }),
  build('not', '1', { width: 1, base: 2, signed: true }),
  build('shift_left', '3 2', { width: 8 }), build('shift_left', '129 1', { width: 8 }),
  build('shift_left', '129 8', { width: 8 }), build('shift_left', '129 1000000000000000000', { width: 8 }),
  build('shift_right_logical', '81 1', { base: 16, width: 8, signed: true }),
  build('shift_right_arithmetic', '81 1', { base: 16, width: 8, signed: true }),
  build('shift_right_arithmetic', '81 8', { base: 16, width: 8 }),
  build('rotate_left', '129 9', { width: 8 }), build('rotate_right', '129 9', { width: 8 }),
  build('rotate_right', '1 1', { width: 17 }), build('rotate_left', '1 340282366920938463463374607431768211457', { width: 128 }),
  build('twos_complement', '-128', { width: 8, signed: true }), build('twos_complement', '0', { width: 32 }),
  build('shift_left', '1 -1', { width: 8 }), build('and', '1 1 1'),
  build('convert', '1/0'), build('convert', 'globalThis.exit(0)'),
];
const workloads = [cases[0], cases[10], cases[16], cases[24], cases[28]];
await verifyToolTargets('programmer', cases, workloads, [
  build('evaluate', 'sqrt(2)', {}, { module: 'scientific' }),
  build('simplify', 'x/x', {}, { module: 'algebra' }),
  build('derivative', 'x^2', {}, { module: 'calculus' }),
  build('determinant', '1 2;3 4', {}, { module: 'linear_algebra' }),
  build('rectangle', '1 2', {}, { module: 'geometry' }),
  build('prime', '97', {}, { module: 'discrete-mathematics' }),
]);
