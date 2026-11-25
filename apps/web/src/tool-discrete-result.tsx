import { useState } from 'react';
import type { Messages } from './i18n';
import type { Group, Operation } from './tool-discrete-input';

type TruthTable = { variables: string[]; rows: (0 | 1)[][] };
const pageSize = 16;

function decodeTable(value: string): TruthTable | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const { variables, rows } = parsed as Record<string, unknown>;
    if (!Array.isArray(variables) || variables.length > 8 ||
        !variables.every((name) => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,31}$/u.test(name))) return null;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 256 ||
        !rows.every((row) => Array.isArray(row) && row.length === variables.length + 1 &&
          row.every((entry) => entry === 0 || entry === 1))) return null;
    return { variables, rows };
  } catch {
    return null;
  }
}

function Table({ table, messages, format }: {
  table: TruthTable;
  messages: Messages;
  format: (value: string) => string;
}) {
  const [page, setPage] = useState(0);
  const d = messages.discrete;
  const start = page * pageSize;
  const end = Math.min(start + pageSize, table.rows.length);
  const visible = table.rows.slice(start, end);
  const number = (value: number) => format(String(value));
  return <div>
    <div className="discrete-table-scroll" role="region" dir="ltr" tabIndex={0} aria-label={d.operations.truth_table}>
      <table className="discrete-table" aria-label={d.operations.truth_table}>
        <thead><tr>{table.variables.map((variable, index) => <th scope="col" key={index}>{variable}</th>)}
          <th scope="col"><bdi>{messages.result}</bdi></th></tr></thead>
        <tbody>{visible.map((values, index) => <tr key={start + index}>
          {values.map((entry, column) => <td key={column} data-value={entry}>{number(entry)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="discrete-pages">
      {table.rows.length > pageSize && <button type="button" className="quiet-action" disabled={page === 0}
        onClick={() => setPage(page - 1)}>{d.table.previous}</button>}
      <span>{d.table.rows.replace('{start}', number(start + 1)).replace('{end}', number(end)).replace('{total}', number(table.rows.length))}</span>
      {table.rows.length > pageSize && <button type="button" className="quiet-action" disabled={end === table.rows.length}
        onClick={() => setPage(page + 1)}>{d.table.next}</button>}
    </div>
  </div>;
}

export function DiscreteResult({ value, group, operation, messages, format }: {
  value?: string;
  group: Group;
  operation: Operation;
  messages: Messages;
  format: (value: string) => string;
}) {
  if (!value) return '—';
  const d = messages.discrete;
  if (operation === 'truth_table') {
    const data = decodeTable(value);
    if (data) return <Table table={data} messages={messages} format={format} />;
  }
  if (operation === 'prime' && Object.hasOwn(d.primeStatus, value)) {
    const status = value as keyof typeof d.primeStatus;
    return <>
      <strong className="discrete-value">{d.primeStatus[status]}</strong>
      <div className="discrete-certainty">{status === 'probable_prime' ? d.probableExplanation : d.deterministicExplanation}</div>
    </>;
  }
  if (value === 'true' || value === 'false') return <strong className="discrete-value">{d.boolean[value]}</strong>;
  if (group === 'sets' && value.startsWith('[') && value.endsWith(']')) {
    const items = value.slice(1, -1).replaceAll('"', '').replaceAll(',', ', ');
    return <bdi className="discrete-value" dir="ltr">{items ? `{${items}}` : '∅'}</bdi>;
  }
  if (operation === 'factor' && value.startsWith('[') && value.endsWith(']')) {
    return <bdi className="discrete-value" dir="ltr">{value.slice(1, -1).replaceAll(',', ' × ') || format('1')}</bdi>;
  }
  return <bdi className="discrete-value" dir="ltr">{value.length <= 256 ? format(value) : value}</bdi>;
}
