import { runWindowsToolBenchmark } from './windows-tool.mjs';

const rectangle = { operation: 'Rectangle', expression: '3 4', expected: /(?:^|; )area=12(?:; |$)/u };
const square = { operation: 'Rectangle', expression: '2 2', expected: /(?:^|; )area=4(?:; |$)/u };
const distance = { operation: 'Distance', expression: '0 0;3 4', expected: /(?:^|; )distance=5(?:; |$)/u };

function fields(expression) {
  if (expression.includes(';')) {
    return [['Coordinates', expression]];
  }
  const [width, length] = expression.split(' ');
  return [['Width', width], ['Length', length]];
}

await runWindowsToolBenchmark({
  module: 'geometry', title: 'Geometry', selectionKey: 'selectionToGeometryMs', workersKey: 'geometryWorkers',
  examples: [rectangle, square, distance], workload: [rectangle, distance, square],
  resume: rectangle, recovery: distance,
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
