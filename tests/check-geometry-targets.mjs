import { verifyToolTargets } from './tool-targets.mjs';

const build = (operation, input, options = {}, extra = {}) =>
  ({ schema: 1, module: 'geometry', operation, input, options, ...extra });
const cases = [
  build('rectangle', '3 4', { unit: 'm' }), build('rectangle', '1/2 3.5', { unit: 'cm' }),
  build('rectangle', '0 2'), build('circle', '2', { unit: 'ft' }), build('circle', '3/2'),
  build('triangle', '3 4 5'), build('triangle', '2 2 2'), build('triangle', '2 3 4'),
  build('triangle', '1 2 3'), build('polygon', '0 0;4 0;0 3'),
  build('polygon', '0 0\n0 3\n4 0'), build('polygon', '0 0;2 2;0 2;2 0'),
  build('polygon', '0 0;2 0;2 1;1 1;1 2;0 2'),
  build('sphere', '2'), build('cylinder', '2 3', { unit: 'mm' }),
  build('cone', '3 4'), build('cone', '1 1'), build('prism', '0 0;4 0;0 3|5', { unit: 'in' }),
  build('prism', '0 0;4 0;0 3|0'), build('distance', '0 0;3 4'),
  build('distance', '0 0 0;1 2 2', { unit: 'km' }), build('distance', '1 2;1 2'),
  build('angle', '0 0;1 0;1 1', { angle: 'deg' }), build('angle', '1 0;0 0;1 1', { angle: 'rad' }),
  build('angle', '1 0;0 0;-1 0'), build('angle', '0 0;0 0;1 1'),
  build('segments', '0 0;4 4;0 4;4 0'), build('segments', '0 0;3 0;2 0;5 0'),
  build('segments', '0 0;3 0;0 1;3 1'),
  build('rectangle', '0.5 2', { unit: 'm' }, { original_input: '0,5 2' }),
  build('rectangle', '1 2', { unit: 's' }), build('polygon', 'globalThis.exit(0)'),
];
const workloads = [cases[0], cases[6], cases[12], cases[17], cases[26]];
await verifyToolTargets('geometry', cases, workloads, [
  build('evaluate', 'sqrt(2)', {}, { module: 'scientific' }),
  build('simplify', 'x/x', {}, { module: 'algebra' }),
  build('derivative', 'x^2', {}, { module: 'calculus' }),
  build('determinant', '1 2;3 4', {}, { module: 'linear_algebra' }),
]);
