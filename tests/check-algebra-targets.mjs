import { verifyToolTargets } from './tool-targets.mjs';

const build = (operation, input, options = {}, extra = {}) =>
  ({ schema: 1, module: 'algebra', operation, input, options, ...extra });
const cases = [
  build('simplify', 'x/x'), build('simplify', '(x^2-1)/(x-1)'),
  build('expand', '(x+y)^4'), build('expand', '(x+1)^2'),
  build('factor', 'x^2-1'), build('factor', '2*x^2-8'),
  build('polynomial', 'x^2-3*x+2'), build('polynomial', 'x^12-1'),
  build('solve', '(x-2)^3=0'), build('solve', 'x^2=2'),
  build('solve', 'x^2+1=0'), build('solve', 'x^2+1=0', { domain: 'complex' }),
  build('solve', 'x/x=1'), build('solve', '(x-1)^2/(x-1)=0'),
  build('inequality', 'x^2>1'), build('inequality', '1/x<=2'),
  build('system', 'x+y=3;x-y=1'), build('system', 'x+y=3;2*x+2*y=6'),
  build('system', 'x+y=3;x+y=2'),
  build('substitute', 'x^2+y;x=2'), build('verify', 'x^2=4;x=-2'),
  build('verify', 'x/x=1;x=0'), build('verify', 'x^2=3;x=2'),
  build('solve', 'x² − 1 = 0', {}, { original_input: 'x² − 1 = 0' }),
  build('expand', 'x^9000'), build('solve', 'x=1', { domain: 'other' }),
  build('simplify', 'globalThis.process.exit(0)'), build('evaluate', 'x'),
];
const workloads = [build('expand', '(x+1)^8'), build('solve', 'x^2+1=0', { domain: 'complex' }), build('system', 'x+y=3;x-y=1')];
await verifyToolTargets('algebra', cases, workloads, [build('evaluate', 'sqrt(2)', {}, { module: 'scientific' })]);
