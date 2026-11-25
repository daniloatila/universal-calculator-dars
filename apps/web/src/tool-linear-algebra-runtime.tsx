import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import { localizeExpression, normalizeExpression, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { MatrixGrid, resizeMatrix } from './tool-linear-algebra-grid';
import type { Matrix } from './tool-linear-algebra-grid';
import { LinearResult } from './tool-linear-algebra-result';
import { activateTool } from './tool-runtime';
import './tool-linear-algebra.css';

const operations = [
  'add', 'subtract', 'multiply', 'transpose', 'determinant', 'inverse', 'rank',
  'dot', 'cross', 'solve', 'eigenvalues', 'eigenvectors', 'lu', 'qr',
] as const;
type Operation = typeof operations[number];
const pairs = new Set<Operation>(['add', 'subtract', 'multiply', 'solve', 'dot', 'cross']);
const vectors = new Set<Operation>(['dot', 'cross']);
const toleranceOperations = new Set<Operation>(['eigenvalues', 'eigenvectors', 'qr']);
const toleranceDefault = '1e-10';
const utf8 = new TextEncoder();
const maxInputBytes = 4096;
const matrixSeparators = /[\s;؛；|]/u;

type MatrixSlot = 'matrixA' | 'matrixB' | 'vectorA' | 'vectorB' | 'rightHand';
type LinearState = {
  operation: Operation;
  matrices: Record<MatrixSlot, Matrix>;
  tolerance: string;
  proof?: CalculationProof;
};

const basic: Matrix = [['1', '2'], ['3', '4']];
const identity: Matrix = [['1', '0'], ['0', '1']];
const exactSpectrum: Matrix = [['3', '0'], ['0', '2']];
const examples: Readonly<Record<Operation, readonly [Matrix, Matrix?]>> = {
  add: [basic, identity],
  subtract: [basic, identity],
  multiply: [basic, [['1'], ['2']]],
  transpose: [[['1', '2', '3'], ['4', '5', '6']]],
  determinant: [basic],
  inverse: [basic],
  rank: [[['1', '2'], ['2', '4']]],
  dot: [[['1'], ['2'], ['3']], [['4'], ['5'], ['6']]],
  cross: [[['1'], ['0'], ['0']], [['0'], ['1'], ['0']]],
  solve: [basic, [['5'], ['11']]],
  eigenvalues: [exactSpectrum],
  eigenvectors: [exactSpectrum],
  lu: [[['0', '2'], ['3', '4']]],
  qr: [[['1', '1'], ['1', '0'], ['0', '1']]],
};

const startState: LinearState = {
  operation: 'determinant',
  matrices: {
    matrixA: resizeMatrix([], 2, 2), matrixB: resizeMatrix([], 2, 2),
    vectorA: resizeMatrix([], 3, 1), vectorB: resizeMatrix([], 3, 1), rightHand: resizeMatrix([], 2, 1),
  },
  tolerance: toleranceDefault,
};

function matrixText(matrices: readonly Matrix[], normalize: (cell: string) => string): string {
  return matrices.map((matrix) => matrix.map((cells) => cells.map((cell) =>
    normalize(cell.trim() || '0')).join(' ')).join('\n')).join('|');
}

export function activate(scope: ModuleActivation<LinearState>): PrimaryModule<LinearState> {
  const runtime = activateTool(scope, () => new Worker(new URL('./tool-linear-algebra-worker.ts', import.meta.url), { type: 'module' }));
  let retained = scope.previousState ?? startState;

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const current = useRef<AbortController | null>(null);
    const presentation = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const c = m.linearAlgebra;
    const { operation, matrices, proof, tolerance } = state;
    const left = vectors.has(operation) ? 'vectorA' : 'matrixA';
    const right = vectors.has(operation) ? 'vectorB' : operation === 'solve' ? 'rightHand' : 'matrixB';
    const paired = pairs.has(operation);
    const activeMatrices = paired ? [matrices[left], matrices[right]] : [matrices[left]];

    function abandon() {
      const calculation = current.current;
      current.current = null;
      calculation?.abort();
    }

    useEffect(() => () => abandon(), []);

    function commit(next: LinearState) {
      retained = next;
      setState(next);
    }

    function update(changes: Partial<Omit<LinearState, 'proof'>>) {
      abandon();
      setPending(false);
      setNotice(undefined);
      commit({ ...state, ...changes, proof: undefined });
    }

    function updateMatrix(slot: MatrixSlot, matrix: Matrix) {
      update({ matrices: { ...matrices, [slot]: matrix } });
    }

    function setExample() {
      const [exampleA, exampleB] = examples[operation];
      const localize = (matrix: Matrix) => matrix.map((row) => row.map((cell) => localizeExpression(cell, presentation.decimal)));
      update({
        matrices: { ...matrices, [left]: localize(exampleA), ...(exampleB ? { [right]: localize(exampleB) } : {}) },
        tolerance: toleranceDefault,
      });
    }

    function clear() {
      const blank = (matrix: Matrix) => resizeMatrix([], matrix.length, matrix[0]!.length);
      update({ matrices: {
        ...matrices, [left]: blank(matrices[left]), ...(paired ? { [right]: blank(matrices[right]) } : {}),
      } });
    }

    async function calculate() {
      if (current.current) return;
      if (activeMatrices.some((matrix) => matrix.some((cells) => cells.some((cell) =>
        matrixSeparators.test(cell.trim()) || matrixSeparators.test(normalizeExpression(cell.trim(), presentation.decimal)))))) {
        update({});
        setNotice('invalid_cell');
        return;
      }
      const original = matrixText(activeMatrices, (cell) => cell);
      const value = matrixText(activeMatrices, (cell) => normalizeExpression(cell, presentation.decimal));
      if (utf8.encode(original).byteLength > maxInputBytes || utf8.encode(value).byteLength > maxInputBytes) {
        update({});
        setNotice('limit');
        return;
      }
      const controller = new AbortController();
      current.current = controller;
      setPending(true);
      setNotice(undefined);
      commit({ ...state, proof: undefined });
      const options: Record<string, string> = toleranceOperations.has(operation)
        ? { tolerance: normalizeExpression(tolerance, presentation.decimal).trim() } : {};
      const start = performance.now();
      const reply = await runtime.submit({
        schema: 1,
        module: 'linear_algebra',
        operation,
        input: value,
        original_input: original,
        options,
      }, controller.signal);
      if (scope.signal.aborted || current.current !== controller) return;
      current.current = null;
      setPending(false);
      if (reply.status === 'completed') {
        if (reply.value.ok) {
          recordInteraction(performance.now() - start);
          commit({ ...state, proof: reply.value.proof });
        } else setNotice(reply.value.code);
      } else setNotice(reply.status);
    }

    function cancel() {
      abandon();
      setPending(false);
      setNotice('cancelled');
    }

    const messages: Readonly<Record<string, string>> = {
      invalid_cell: c.invalidCell, invalid_block: c.invalidBlock, invalid_input: c.invalidMatrix, domain: m.domainError, singular: c.singular,
      limit: m.processingLimit, unsupported: m.tools.unsupported, no_convergence: m.tools.convergence,
      timed_out: m.engineTimeout, cancelled: m.engineCancelled, queue_full: m.engineBusy, deferred: m.engineBusy,
    };
    const formatCount = (count: number) => presentation.format(String(count));

    function presentProofText(field: keyof CalculationProof, value: string): string {
      if (field === 'operation' && Object.hasOwn(c.operations, value)) return c.operations[value as Operation];
      if (field === 'domain' && value === 'real') return c.proof.realDomain;
      if (field === 'method' && Object.hasOwn(c.proof.methods, value)) {
        return c.proof.methods[value as keyof typeof c.proof.methods];
      }
      if (field === 'assumptions' && value === 'Working precision is not a certified error bound.') return c.proof.workingPrecision;
      if (field === 'variables') {
        const shape = /^(\d+)×(\d+) matrix$/u.exec(value);
        if (shape?.[1] && shape[2]) return c.proof.matrixShape
          .replace('{rows}', presentation.format(shape[1])).replace('{columns}', presentation.format(shape[2]));
        const vector = /^Vector with (\d+) components$/u.exec(value);
        if (vector?.[1]) return c.proof.vectorShape.replace('{count}', presentation.format(vector[1]));
      }
      if (field === 'formula') {
        if (value === 'rank(A) = number of pivots') return c.proof.rankFormula;
        if (value === 'A = Q*R and Q^T*Q = I') return c.proof.qrFormula;
      }
      if (field === 'constraints') {
        const fixed: Readonly<Record<string, string>> = {
          'Ill-conditioned: small perturbations may change the factors or solutions': c.proof.illConditioned,
          'Clustered eigenvalues: individual eigenvectors may be sensitive': c.proof.clusteredEigenvalues,
          'Eigenvalue near zero relative to the matrix scale': c.proof.nearZeroEigenvalue,
          'Free parameters range over the reals': c.proof.realParameters,
          'Zero diagonal eigenvalue: the matrix is singular': c.proof.zeroEigenvalue,
          'Rank deficient: the matrix has dependent rows or columns': c.proof.rankDeficient,
          'Condition estimate unavailable within the iteration budget': c.proof.conditionUnavailable,
        };
        if (Object.hasOwn(fixed, value)) return fixed[value] ?? value;
        const rank = /^Exact rank: (\d+) of (\d+)$/u.exec(value);
        if (rank?.[1] && rank[2]) return c.proof.rank
          .replace('{rank}', presentation.format(rank[1])).replace('{total}', presentation.format(rank[2]));
        const measured: readonly [string, string][] = [
          ['Relative Frobenius residual (observed): ', c.proof.relativeResidual],
          ['Frobenius orthogonality error (observed): ', c.proof.orthogonality],
          ['Estimated reciprocal 2-norm condition: ', c.proof.condition],
        ];
        for (const [prefix, label] of measured) {
          if (value.startsWith(prefix)) return `${label} · ${presentation.format(value.slice(prefix.length))}`;
        }
      }
      return value;
    }

    return <section className="linear-workspace" aria-label={c.title} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && current.current) cancel();
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void calculate();
      }
    }}>
      <div className="linear-operation linear-card" role="group" aria-label={c.operation}>
        {operations.map((name) => <button key={name} type="button" aria-pressed={name === operation}
          onClick={() => { if (operation !== name) update({ operation: name }); }}>
          {c.operations[name]}
        </button>)}
      </div>
      <div className="linear-workbench">
        <form className="linear-card" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          <p className="linear-operation-hint">{c.hints[operation]}</p>
          <div className="linear-operands">
            <MatrixGrid key={left} name="A" matrix={matrices[left]} messages={c} formatCount={formatCount}
              update={(matrix) => updateMatrix(left, matrix)} onError={setNotice} />
            {paired && <MatrixGrid key={right} name="B" matrix={matrices[right]} messages={c} formatCount={formatCount}
              update={(matrix) => updateMatrix(right, matrix)} onError={setNotice} />}
          </div>
          <p className="linear-grid-hint">{c.gridHint}</p>
          {toleranceOperations.has(operation) && <label className="linear-tolerance">{c.tolerance}
            <input type="text" dir="ltr" value={tolerance} maxLength={256} autoComplete="off"
              onChange={(event) => update({ tolerance: event.currentTarget.value })} />
          </label>}
          <div className="linear-actions">
            <button type="submit" className="linear-primary" disabled={pending}>{m.calculate}</button>
            {pending && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
            <button type="button" className="quiet-action" onClick={setExample}>{c.useExample}</button>
            <button type="button" className="quiet-action" onClick={clear}>{c.clearCells}</button>
          </div>
          <p role="status" className="linear-notice" data-error={Boolean(notice && notice !== 'cancelled') || undefined}>
            {pending ? m.working : notice ? (Object.hasOwn(messages, notice) ? messages[notice] : m.tools.engineUnavailable) : ''}
          </p>
        </form>
        <div className="linear-card linear-results">
          <div className="linear-result-heading">
            <strong id="linear-result-label">{m.result}</strong>
            {proof && <span>{proof.exactness === 'symbolic' ? c.symbolic : proof.exactness === 'exact' ? m.exact : m.approximate}</span>}
          </div>
          <div role="status" aria-labelledby="linear-result-label" className="linear-result"
            data-testid="linear-algebra-result" data-canonical={proof?.result}>
            <LinearResult value={proof?.result} messages={c} format={presentation.format} label={m.result} />
          </div>
          {proof?.constraints.length ? <div className="linear-constraints">
            <strong>{c.constraints}</strong>
            <ul>{proof.constraints.map((value, index) => <li key={index}><bdi>{presentProofText('constraints', value)}</bdi></li>)}</ul>
          </div> : null}
          <CalculationProofPanel proof={proof} locale={locale} localizeText={presentProofText} />
        </div>
      </div>
    </section>;
  }

  return {
    Workspace,
    setPolicy: runtime.setPolicy,
    getResources: runtime.getResources,
    snapshot: () => retained,
    dispose: runtime.dispose,
  };
}
