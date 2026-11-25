import type { Messages } from './i18n';
import type { Matrix } from './tool-linear-algebra-grid';

function decodeResult(text: string): unknown {
  // Preserve the Rust number tokens as text, including exact fractions and large integers.
  const token = /"(?:[^"\\]|\\.)*"|[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?:\/[+-]?\d+)?/gu;
  try {
    return JSON.parse(text.replace(token, (value) => value.startsWith('"') ? value : JSON.stringify(value)));
  } catch {
    return null;
  }
}

function isVector(input: unknown): input is readonly string[] {
  return Array.isArray(input) && input.length > 0 && input.every((value) => typeof value === 'string');
}

function isMatrix(input: unknown): input is Matrix {
  return Array.isArray(input) && input.length > 0 && input.every(isVector);
}

function MatrixTable({ matrix, label, labelled = false, format }: {
  matrix: Matrix;
  label: string;
  labelled?: boolean;
  format: (value: string) => string;
}) {
  return <div className="linear-output-matrix">
    {labelled && <strong>{label}</strong>}
    <div className="linear-output-scroll" dir="ltr" role="region" tabIndex={0} aria-label={label}>
      <table dir="ltr" aria-label={label}><tbody>
        {matrix.map((row, index) => <tr key={index}>
          {row.map((value, column) => <td key={column}><bdi dir="ltr">{format(value)}</bdi></td>)}
        </tr>)}
      </tbody></table>
    </div>
  </div>;
}

export function LinearResult({ value, messages, format, label }: {
  value?: string;
  messages: Messages['linearAlgebra'];
  format: (value: string) => string;
  label: string;
}) {
  if (!value) return '—';
  const data = decodeResult(value);
  if (isMatrix(data) || isVector(data)) {
    return <MatrixTable matrix={isMatrix(data) ? data : [data]} label={label} format={format} />;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const values = data as Record<string, unknown>;
    const { status } = values;
    if (status === 'inconsistent') return <p className="linear-solution-status">{messages.inconsistent}</p>;
    if (status === 'unique' && isVector(values.solution)) return <>
      <p className="linear-solution-status">{messages.unique}</p>
      <MatrixTable matrix={[values.solution]} label={messages.solution} format={format} />
    </>;
    if (status === 'infinite' && isVector(values.particular) && isMatrix(values.basis) && isVector(values.parameters)) {
      return <>
        <p className="linear-solution-status">{messages.infinite}</p>
        <MatrixTable matrix={[values.particular]} label={messages.particular} labelled format={format} />
        <MatrixTable matrix={values.basis} label={messages.basis} labelled format={format} />
        <p className="linear-solution-status">{messages.parameters} <bdi>{values.parameters.join(', ')}</bdi></p>
      </>;
    }
    const matrixKeys = ['P', 'L', 'U', 'Q', 'R'] as const;
    const matrices = matrixKeys.flatMap((key) => {
      const matrix = values[key];
      return isMatrix(matrix) ? [{ key, matrix }] : [];
    });
    if (matrices.length) return matrices.map(({ key, matrix }) =>
      <MatrixTable key={key} matrix={matrix} label={key} labelled format={format} />);
    if (isVector(values.values) && isMatrix(values.vectors)) return <>
      <MatrixTable matrix={[values.values]} label={messages.operations.eigenvalues} labelled format={format} />
      <MatrixTable matrix={values.vectors} label={messages.eigenvectorList} labelled format={format} />
    </>;
  }
  return <bdi dir={typeof data === 'string' ? 'ltr' : 'auto'}>{typeof data === 'string' ? format(data) : value}</bdi>;
}
