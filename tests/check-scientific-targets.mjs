import { verifyToolTargets } from './tool-targets.mjs';

const build = (input, options = {}, extra = {}) =>
  ({ schema: 1, module: 'scientific', operation: 'evaluate', input, options, ...extra });
const cases = [
  build('sin(90°)'), build('cos(180°)'), build('ln(1)'), build('log₂(1024)'), build('20!'),
  build('sqrt(-1)', { complex: true }), build('exp(i*pi)+1', { complex: true }), build('sin(100)', { angle: 'grad' }),
  build('sinh(0.35)', { precision: 80 }), build('atanh(0.99999999)', { precision: 60 }),
  build('sin(1e-30)', { precision: 64 }), build('sqrt(2)', { notation: 'engineering' }),
  build('tan(90°)'), build('ln(0)'), build('sqrt(-1)'), build('1e99999'),
  build('0.3 + 0.2', {}, { original_input: '0,3 + 0,2' }),
  build('1', {}, { module: 'absent_tool' }), build('1', { precision: '8' }),
];
const workloads = [build('20!'), build('sqrt(2)', { precision: 64 }), build('atanh(0.999999)', { precision: 40 })];
await verifyToolTargets('scientific', cases, workloads, [build('x/x', {}, { module: 'algebra', operation: 'simplify' })]);
