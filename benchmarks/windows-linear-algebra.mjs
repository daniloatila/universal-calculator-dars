import { runWindowsToolBenchmark } from './windows-tool.mjs';

const square = '1 2;3 4';
const determinant = { operation: 'Determinant', expression: square, expected: '-2' };
const rank = { operation: 'Rank', expression: square, expected: '2' };
const transpose = { operation: 'Transpose', expression: square, expected: '[[1,3],[2,4]]' };

function cells(page, expression) {
  return expression.split(';').flatMap((row, rowIndex) => row.split(' ').map((value, colIndex) => ({
    field: page.getByRole('textbox', { name: `A[${rowIndex + 1},${colIndex + 1}]`, exact: true }), value,
  })));
}

await runWindowsToolBenchmark({
  module: 'linear-algebra', title: 'Linear algebra',
  selectionKey: 'selectionToLinearAlgebraMs', workersKey: 'linearAlgebraWorkers',
  examples: [determinant, rank, transpose], workload: [determinant, transpose, rank],
  resume: transpose, recovery: determinant,
  async enter(page, expression) {
    for (const { field, value } of cells(page, expression)) await field.fill(value);
  },
  async verifyRetained(page, expression, expect) {
    for (const { field, value } of cells(page, expression)) await expect(field).toHaveValue(value);
  },
});
