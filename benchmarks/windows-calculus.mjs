import { runWindowsToolBenchmark } from './windows-tool.mjs';

const derivative = { operation: 'Derivative', expression: 'x^3', expected: '3*x^2' };
const constant = { operation: 'Derivative', expression: '7', expected: '0' };
const integral = { operation: 'Definite integral', expression: 'x^2', expected: '1/3' };
const limit = { operation: 'Limit', expression: 'sin(x)/x', expected: '1' };
await runWindowsToolBenchmark({
  module: 'calculus', title: 'Calculus', selectionKey: 'selectionToCalculusMs', workersKey: 'calculusWorkers',
  examples: [derivative, constant, integral, limit],
  workload: [derivative, integral, limit],
  resume: integral,
  recovery: limit,
});
