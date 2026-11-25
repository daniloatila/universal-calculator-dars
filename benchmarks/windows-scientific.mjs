import { runWindowsToolBenchmark } from './windows-tool.mjs';

const sine = { expression: 'sin(90°)', expected: '1' };
const cosine = { expression: 'cos(180°)', expected: '-1' };
const logarithm = { expression: 'log(1024,2)', expected: '10' };
await runWindowsToolBenchmark({
  module: 'scientific', title: 'Scientific', selectionKey: 'selectionToScientificMs', workersKey: 'scientificWorkers',
  examples: [sine, { expression: '20!', expected: '2432902008176640000' }, { expression: 'ln(1)', expected: '0' }, logarithm],
  workload: [sine, logarithm, cosine],
  resume: logarithm,
  recovery: cosine,
});
