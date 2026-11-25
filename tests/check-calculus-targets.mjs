import { verifyToolTargets } from './tool-targets.mjs';

const build = (operation, input, options = {}, extra = {}) =>
  ({ schema: 1, module: 'calculus', operation, input, options, ...extra });
const cases = [
  build('derivative', 'x^3'), build('derivative', 'x^8', { order: 8 }),
  build('derivative', '(x+y)^3', { variable: 'y', order: 2 }),
  build('derivative', 'sin(x^2)'), build('derivative', 'ln(x)'),
  build('antiderivative', 'x^2+2*x+1'), build('antiderivative', 'cos(2*x)'),
  build('antiderivative', 'exp(-x^2)'),
  build('integral', 'x^2', { lower: '0', upper: '1' }),
  build('integral', 'x^2', { lower: '1', upper: '0' }),
  build('integral', '1/x', { lower: '-1', upper: '1' }),
  build('limit', 'sin(x)/x', { point: '0', side: 'both' }),
  build('limit', '1/x', { point: '0', side: 'left' }),
  build('limit', '1/x', { point: '0', side: 'right' }),
  build('limit', '1/x', { point: '0', side: 'both' }),
  build('limit', '(2*x^2+1)/(x^2-3)', { point: 'inf' }),
  build('series', 'exp(x)', { point: '0', terms: 5 }),
  build('series', 'sin(x)', { point: '0', terms: 6 }),
  build('series', '1/(1-x)', { point: '0', terms: 5 }),
  build('numerical_integral', 'x^4', { lower: '0', upper: '1', tolerance: '1e-8' }),
  build('numerical_integral', '1/(x-1/3)', { lower: '0', upper: '1', tolerance: '1e-8' }),
  build('derivative', 'x^２−0.1', { order: 1 }, { original_input: 'x^２−0,1' }),
  build('derivative', 'x', { order: 9 }), build('derivative', 'x', { variable: 'w' }),
  build('limit', 'sin(x)', { point: 'inf', side: 'left' }),
  build('series', 'x', { point: '0', terms: 0 }),
  build('derivative', 'globalThis.process.exit(0)'),
];
const workloads = [cases[0], cases[8], cases[11], cases[16], cases[19]];
await verifyToolTargets('calculus', cases, workloads, [
  build('evaluate', 'sqrt(2)', {}, { module: 'scientific' }),
  build('simplify', 'x/x', {}, { module: 'algebra' }),
]);
