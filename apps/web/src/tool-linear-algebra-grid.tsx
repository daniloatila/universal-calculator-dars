import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import type { Messages } from './i18n';

export const maxDimension = 12;
const dimensions = Array.from({ length: maxDimension }, (_, index) => index + 1);
const maxCellLength = 256;

export type Matrix = readonly (readonly string[])[];

export function resizeMatrix(matrix: Matrix, rows: number, columns: number): Matrix {
  return Array.from({ length: rows }, (_, row) => Array.from(
    { length: columns }, (_, column) => matrix[row]?.[column] ?? '',
  ));
}

function pastedRows(text: string) {
  return text.replace(/\r\n?/gu, '\n').replace(/[\n;؛；]$/u, '').split(/[\n;؛；]/u).map((line) =>
    (line.includes('\t') ? line.split('\t') : line.trim().split(/\s+/u)).map((cell) => cell.trim()));
}

export function MatrixGrid({ name, matrix, messages, formatCount, update, onError }: {
  name: 'A' | 'B';
  matrix: Matrix;
  messages: Messages['linearAlgebra'];
  formatCount: (value: number) => string;
  update: (matrix: Matrix) => void;
  onError: (code: 'limit' | 'invalid_block') => void;
}) {
  const rows = matrix.length;
  const columns = matrix[0]!.length;
  const grid = useRef<HTMLTableElement>(null);

  function focus(row: number, column: number) {
    const target = grid.current?.rows[row + 1]?.cells[column + 1]?.querySelector('input');
    target?.focus();
    target?.select();
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>, row: number, column: number) {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.shiftKey && event.key !== 'Enter') return;
    const input = event.currentTarget;
    let nextRow = row;
    let nextColumn = column;
    if (event.key === 'ArrowUp' || event.key === 'Enter' && event.shiftKey) nextRow--;
    else if (event.key === 'ArrowDown' || event.key === 'Enter') nextRow++;
    else if (event.key === 'ArrowLeft' && (event.altKey || input.selectionEnd === 0)) nextColumn--;
    else if (event.key === 'ArrowRight' && (event.altKey || input.selectionStart === input.value.length)) nextColumn++;
    else return;
    event.preventDefault();
    if (nextRow >= 0 && nextRow < rows && nextColumn >= 0 && nextColumn < columns) focus(nextRow, nextColumn);
  }

  function paste(event: ClipboardEvent<HTMLInputElement>, row: number, column: number) {
    const text = event.clipboardData.getData('text/plain');
    if (text.length > 4096) {
      event.preventDefault();
      onError('limit');
      return;
    }
    const values = pastedRows(text);
    if (values.length === 1 && values[0]?.length === 1) return;
    event.preventDefault();
    const width = values[0]!.length;
    if (values.some((cells) => cells.length !== width)) {
      onError('invalid_block');
      return;
    }
    const nextRows = Math.max(rows, row + values.length);
    const nextColumns = Math.max(columns, column + width);
    if (nextRows > maxDimension || nextColumns > maxDimension ||
        values.some((cells) => cells.some((cell) => cell.length > maxCellLength))) {
      onError('limit');
      return;
    }
    const next = resizeMatrix(matrix, nextRows, nextColumns).map((cells, index) => {
      const pasted = values[index - row];
      return pasted ? cells.map((cell, offset) => pasted[offset - column] ?? cell) : cells;
    });
    update(next);
  }

  return <fieldset className="linear-matrix">
    <legend>{messages.matrix[name]}</legend>
    <div className="linear-dimensions">
      <label>{messages.rows[name]}
        <select value={rows} onChange={(event) => update(resizeMatrix(matrix, Number(event.currentTarget.value), columns))}>
          {dimensions.map((dimension) => <option key={dimension} value={dimension}>{formatCount(dimension)}</option>)}
        </select>
      </label>
      <label>{messages.columns[name]}
        <select value={columns} onChange={(event) => update(resizeMatrix(matrix, rows, Number(event.currentTarget.value)))}>
          {dimensions.map((dimension) => <option key={dimension} value={dimension}>{formatCount(dimension)}</option>)}
        </select>
      </label>
    </div>
    <div className="linear-grid-scroll" dir="ltr" role="region" tabIndex={0} aria-label={messages.grid[name]}>
      <table ref={grid} dir="ltr">
        <thead><tr><td aria-hidden="true" />
          {matrix[0]!.map((_, column) => <th key={column} scope="col">{formatCount(column + 1)}</th>)}
        </tr></thead>
        <tbody>{matrix.map((cells, row) => <tr key={row}>
          <th scope="row">{formatCount(row + 1)}</th>
          {cells.map((value, column) => <td key={column}>
            <input type="text" value={value} placeholder="0" maxLength={maxCellLength} dir="ltr"
              aria-label={`${name}[${formatCount(row + 1)},${formatCount(column + 1)}]`}
              spellCheck={false} autoComplete="off" autoCapitalize="off"
              onChange={(event) => {
                const next = event.currentTarget.value;
                update(matrix.map((entries, index) => index === row
                  ? entries.map((cell, offset) => offset === column ? next : cell) : entries));
              }}
              onPaste={(event) => paste(event, row, column)}
              onKeyDown={(event) => navigate(event, row, column)} />
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </fieldset>;
}
