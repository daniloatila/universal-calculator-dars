import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import { localizeExpression, normalizeExpression, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { activateTool } from './tool-runtime';
import './tool-algebra.css';

const operations = ['simplify', 'expand', 'factor', 'polynomial', 'solve', 'inequality', 'system', 'substitute', 'verify'] as const;
type Operation = typeof operations[number];
type Domain = 'real' | 'complex';
type AlgebraState = {
  operation: Operation;
  domain: Domain;
  drafts: Partial<Record<Operation, string>>;
  proof?: CalculationProof;
};

const examples: Readonly<Record<Operation, string>> = {
  simplify: 'x/x',
  expand: '(x+1)^2',
  factor: 'x^2-1',
  polynomial: 'x^2-3x+2',
  solve: '(x-2)^2=0',
  inequality: 'x^2>1',
  system: 'x+y=3; x-y=1',
  substitute: 'x^2+y; x=2; y=3',
  verify: 'x^2=4; x=2',
};
const byteCount = new TextEncoder();
const maxBytes = 4096;

function normalizedInput(original: string, decimal: string) {
  return original.split(/[;؛；]/u).map((statement) => normalizeExpression(statement, decimal)).join(';')
    .replaceAll('≤', '<=').replaceAll('≥', '>=').replaceAll('＝', '=');
}

export function activate(scope: ModuleActivation<AlgebraState>): PrimaryModule<AlgebraState> {
  const runtime = activateTool(scope, () => new Worker(new URL('./tool-algebra-worker.ts', import.meta.url), { type: 'module' }));
  let retained: AlgebraState = scope.previousState ?? { operation: 'simplify', domain: 'real', drafts: {} };

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const current = useRef<AbortController | null>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const presentation = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const a = m.algebra;
    const { operation, domain, drafts, proof } = state;
    const expression = drafts[operation] ?? '';
    const example = localizeExpression(examples[operation], presentation.decimal);

    function abandon() {
      const calculation = current.current;
      current.current = null;
      calculation?.abort();
    }

    useEffect(() => () => abandon(), []);

    function commit(next: AlgebraState) {
      retained = next;
      setState(next);
    }

    function update(changes: Partial<Omit<AlgebraState, 'proof'>>) {
      abandon();
      setPending(false);
      setNotice(undefined);
      commit({ ...state, ...changes, proof: undefined });
    }

    function changeExpression(value: string) {
      if (value.length > maxBytes || byteCount.encode(value).byteLength > maxBytes) {
        setNotice('limit');
        return;
      }
      update({ drafts: { ...drafts, [operation]: value } });
    }

    async function calculate() {
      if (current.current || !expression.trim()) return;
      const controller = new AbortController();
      current.current = controller;
      setPending(true);
      setNotice(undefined);
      commit({ ...state, proof: undefined });
      const start = performance.now();
      const reply = await runtime.submit({
        schema: 1,
        module: 'algebra',
        operation,
        input: normalizedInput(expression, presentation.decimal),
        original_input: expression,
        options: { domain },
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
      invalid_input: m.invalidExpression, domain: m.domainError, limit: m.processingLimit,
      unsupported: m.tools.unsupported, no_convergence: m.tools.convergence, timed_out: m.engineTimeout,
      cancelled: m.engineCancelled, queue_full: m.engineBusy, deferred: m.engineBusy,
    };
    const resultText = proof?.result === 'true' ? a.verified
      : proof?.result === 'false' ? a.rejected
      : proof?.result === 'none' || proof?.result === '{}' ? a.noSolution
      : proof?.result === 'all real x' ? a.allReal
      : proof?.result === 'all complex x' ? a.allComplex
      : proof?.result.replaceAll(' union ', ' ∪ ').replace(/\binf\b/gu, '∞') ?? '—';

    return <section className="algebra-workspace" aria-label={a.title} onKeyDown={(event) => {
      if (!event.nativeEvent.isComposing && event.key === 'Escape' && current.current) cancel();
    }}>
      <form className="algebra-sheet" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
        <div role="group" className="algebra-operation" aria-label={a.operation}>
          {operations.map((name) => <button key={name} type="button" aria-pressed={name === operation}
            onClick={() => { if (name !== operation) update({ operation: name }); }}>
            {a.operations[name]}
          </button>)}
        </div>
        <div className="algebra-controls">
          <label>{a.domain}
            <select value={domain} onChange={(event) => update({ domain: event.currentTarget.value === 'complex' ? 'complex' : 'real' })}>
              <option value="real">{a.real}</option>
              <option value="complex">{a.complex}</option>
            </select>
          </label>
          <button type="button" className="quiet-action algebra-example" onClick={() => {
            changeExpression(example);
            input.current?.focus();
          }}>
            {m.tools.examples} <bdi dir="ltr">{example}</bdi>
          </button>
        </div>
        <label className="algebra-expression">{a.inputs[operation]}
          <textarea ref={input} rows={operation === 'system' || operation === 'substitute' ? 6 : 4}
            dir="ltr" spellCheck={false} autoComplete="off" autoCapitalize="off" value={expression}
            aria-describedby="algebra-input-help" onChange={(event) => changeExpression(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void calculate();
              }
            }} />
        </label>
        <p id="algebra-input-help" className="algebra-hint">{a.hints[operation]}</p>
        <div className="algebra-actions">
          <button type="submit" className="algebra-primary" disabled={pending || !expression.trim()}>{m.calculate}</button>
          {pending && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
          <button type="button" className="quiet-action" disabled={!expression}
            onClick={() => { changeExpression(''); input.current?.focus(); }}>{m.clear}</button>
        </div>
        <p role="status" className="algebra-notice" data-error={Boolean(notice && notice !== 'cancelled') || undefined}>
          {pending ? m.working : notice ? (Object.hasOwn(messages, notice) ? messages[notice] : m.tools.engineUnavailable) : ''}
        </p>
      </form>

      <div className="algebra-sheet algebra-solution">
        <div className="algebra-result-label">
          <strong id="algebra-result-label">{m.result}</strong>
          {proof && <span>{proof.exactness === 'symbolic' ? a.symbolic : proof.exactness === 'exact' ? m.exact : m.approximate}</span>}
        </div>
        <output aria-labelledby="algebra-result-label" aria-live="polite" data-testid="algebra-result" data-canonical={proof?.result}
          className="algebra-result"><bdi>{resultText}</bdi></output>
        {proof?.constraints.length ? <div className="algebra-constraints">
          <strong>{a.restrictions}</strong>
          <ul>{proof.constraints.map((value, index) => <li key={index}><bdi>{value}</bdi></li>)}</ul>
        </div> : null}
        {proof?.result.includes('[m=') && <p className="algebra-hint">{a.multiplicity}</p>}
        <CalculationProofPanel proof={proof} locale={locale} />
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
