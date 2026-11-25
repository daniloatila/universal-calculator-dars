import { verifyToolTargets } from './tool-targets.mjs';

const build = (operation, input, options = {}, extra = {}) =>
  ({ schema: 1, module: 'linear_algebra', operation, input, options, ...extra });
const cases = [
  build('add', '1/3 2;3 4|1/6 -2;5 6'), build('subtract', '1 2;3 4|1 2;4 5'),
  build('multiply', '1 2 3;4 5 6|3 2;1 4;0 -1'),
  build('transpose', '1 2 3\n4 5 6'), build('determinant', '1 2;3 4'),
  build('determinant', '0 1 4;2 3 5;6 7 8'), build('inverse', '1 2;3 4'),
  build('inverse', '1 2;2 4'), build('rank', '0 1 2;0 2 4'),
  build('rank', '0 0;0 0'), build('dot', '1 2 3|4;5;6'),
  build('cross', '1 2 3|4 5 6'), build('cross', '1 2|3 4'),
  build('solve', '1 2;3 4|5;6'), build('solve', '1 2;2 4|3;6'),
  build('solve', '1 2;2 4|3;7'), build('solve', '1 2 0;0 0 1|5;3'),
  build('eigenvalues', '4 1 1;1 3 0;1 0 2'),
  build('eigenvalues', '2 0 0;0 2 0;0 0 3'),
  build('eigenvectors', '2 1;1 2'), build('eigenvectors', '1 2;0 1'),
  build('lu', '0 1 4;2 3 5;6 7 8'), build('lu', '1 2;2 4'),
  build('qr', '1 0;1 1;1 2'), build('qr', '1 2;2 4'),
  build('add', '1 2;3 4|1 2'), build('transpose', '1 2;3'),
  build('determinant', '1/0 2;3 4'), build('determinant', 'globalThis.exit(0)'),
  build('determinant', '1.5 2;3 4', {}, { original_input: '1,5 2;3 4' }),
];
const workloads = [cases[2], cases[6], cases[13], cases[17], cases[23]];
await verifyToolTargets('linear_algebra', cases, workloads, [
  build('evaluate', 'sqrt(2)', {}, { module: 'scientific' }),
  build('simplify', 'x/x', {}, { module: 'algebra' }),
  build('derivative', 'x^2', {}, { module: 'calculus' }),
]);
