import { runWindowsToolBenchmark } from './windows-tool.mjs';

const difference = {
  operation: 'Date difference',
  expression: '2024-02-28|2024-03-01',
  expected: 'days=2; weeks=0; remaining_days=2',
};
const reverse = {
  operation: 'Date difference',
  expression: '2024-01-09|2024-01-01',
  expected: 'days=-8; weeks=-1; remaining_days=-1',
};
const period = {
  operation: 'Add or subtract a period',
  expression: '2024-01-31|1',
  expected: 'date=2024-02-29',
};
const timezone = {
  operation: 'Time zone conversion',
  expression: '2026-07-01T12:00:00.000000001|America/Sao_Paulo|Asia/Kathmandu',
  expected: 'local=2026-07-01T20:45:00.000000001; utc=2026-07-01T15:00:00.000000001Z; from_offset=-03:00; to_offset=+05:45; from_dst=false; to_dst=false; resolution=unambiguous',
};

const controlLabels = {
  'Date difference': ['Start date', 'End date'],
  'Add or subtract a period': ['Date', 'Months'],
  'Time zone conversion': ['Local date and time', 'From time zone', 'To time zone'],
};

function controls(page, expression, operation) {
  const values = expression.split('|');
  return controlLabels[operation].map((label, index) => [page.getByLabel(label, { exact: true }), values[index]]);
}

await runWindowsToolBenchmark({
  module: 'date-time', title: 'Date & Time', selectionKey: 'selectionToDateTimeMs', workersKey: 'dateTimeWorkers',
  examples: [difference, reverse, period, timezone], workload: [difference, period, timezone],
  resume: difference, recovery: reverse,
  async enter(page, expression, operation) {
    for (const [field, value] of controls(page, expression, operation)) await field.fill(value);
  },
  async verifyRetained(page, expression, expect, operation) {
    for (const [field, value] of controls(page, expression, operation)) await expect(field).toHaveValue(value);
  },
});
