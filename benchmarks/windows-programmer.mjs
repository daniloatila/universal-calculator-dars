import { runWindowsToolBenchmark } from './windows-tool.mjs';

const convert = { operation: 'Convert', expression: '42', expected: 'binary=00101010; octal=052; decimal=42; hexadecimal=2A' };
const xor = { operation: 'XOR', expression: '170 85', expected: 'binary=11111111; octal=377; decimal=255; hexadecimal=FF' };
const left = { operation: 'Left shift', expression: '3 2', expected: 'binary=00001100; octal=014; decimal=12; hexadecimal=0C' };

function fields(expression, operation) {
  const [first, second] = expression.split(' ');
  const values = [['Value', first]];
  if (second !== undefined) {
    values.push([operation === 'Left shift' ? 'Shift count' : 'Second value', second]);
  }
  return values;
}

await runWindowsToolBenchmark({
  module: 'programmer', title: 'Programmer', selectionKey: 'selectionToProgrammerMs', workersKey: 'programmerWorkers',
  examples: [convert, xor, left], workload: [convert, xor, left], resume: xor, recovery: convert,
  async enter(page, expression, operation) {
    for (const [name, value] of fields(expression, operation)) {
      await page.getByRole('textbox', { name, exact: true }).fill(value);
    }
  },
  async verifyRetained(page, expression, expect, operation) {
    for (const [name, value] of fields(expression, operation)) {
      await expect(page.getByRole('textbox', { name, exact: true })).toHaveValue(value);
    }
  },
});
