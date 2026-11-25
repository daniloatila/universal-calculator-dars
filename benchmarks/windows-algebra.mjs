import { runWindowsToolBenchmark } from './windows-tool.mjs';

const simplify = { operation: 'Simplify', expression: 'x/x', expected: '1' };
const expand = { operation: 'Expand', field: 'Expression to expand', expression: '(x+1)^2', expected: 'x^2+2*x+1' };
const factor = { operation: 'Factor', field: 'Polynomial to factor', expression: 'x^2-1', expected: '(x-1)*(x+1)' };
const system = { operation: 'Solve system', field: 'Linear equations', expression: 'x+y=3;x-y=1', expected: 'x=2; y=1' };
await runWindowsToolBenchmark({
  module: 'algebra', title: 'Algebra', selectionKey: 'selectionToAlgebraMs', workersKey: 'algebraWorkers',
  examples: [simplify, expand, factor, system],
  workload: [simplify, expand, system],
  resume: system,
  recovery: factor,
});
