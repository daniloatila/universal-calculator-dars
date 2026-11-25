import { runWindowsToolBenchmark } from './windows-tool.mjs';

const length = { expression: 'length|m|cm|1.25', expected: '125' };
const inverseLength = { expression: 'length|cm|m|200', expected: '2' };
const temperature = { expression: 'temperature|degC|degF|0', expected: '32' };

function controls(page, expression) {
  const [category, from, to, amount] = expression.split('|');
  const selectors = [['Category', category], ['From unit', from], ['To unit', to]];
  return {
    selectors: selectors.map(([name, value]) => [page.getByRole('combobox', { name, exact: true }), value]),
    amount: [page.getByRole('textbox', { name: 'Amount', exact: true }), amount],
  };
}

await runWindowsToolBenchmark({
  module: 'converter', title: 'Converter', selectionKey: 'selectionToConverterMs', workersKey: 'converterWorkers',
  examples: [length, inverseLength, temperature], workload: [length, inverseLength, temperature],
  resume: length, recovery: temperature,
  async enter(page, expression) {
    const { selectors, amount } = controls(page, expression);
    for (const [field, value] of selectors) await field.selectOption(value);
    await amount[0].fill(amount[1]);
  },
  async verifyRetained(page, expression, expect) {
    const { selectors, amount } = controls(page, expression);
    for (const [field, value] of [...selectors, amount]) await expect(field).toHaveValue(value);
  },
});
