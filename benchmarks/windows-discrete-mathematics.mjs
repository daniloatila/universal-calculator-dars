import { runWindowsToolBenchmark } from './windows-tool.mjs';

const permutations = { operation: 'Permutations', expression: '8', expected: '40320' };
const arrangements = { operation: 'Arrangements', expression: '5 3', expected: '60' };
const combinations = { operation: 'Combinations', expression: '10 3', expected: '120' };

function fields(expression) {
  const [n, k] = expression.split(' ');
  const first = ['Number of elements (n)', n];
  return k === undefined ? [first] : [first, ['Selected elements (k)', k]];
}

await runWindowsToolBenchmark({
  module: 'discrete-mathematics', title: 'Discrete Mathematics',
  selectionKey: 'selectionToDiscreteMathematicsMs', workersKey: 'discreteMathematicsWorkers',
  examples: [permutations, arrangements, combinations], workload: [combinations, permutations, arrangements],
  resume: combinations, recovery: permutations,
  async enter(page, expression) {
    for (const [name, value] of fields(expression)) {
      await page.getByRole('textbox', { name, exact: true }).fill(value);
    }
  },
  async verifyRetained(page, expression, expect) {
    for (const [name, value] of fields(expression)) {
      await expect(page.getByRole('textbox', { name, exact: true })).toHaveValue(value);
    }
  },
});
