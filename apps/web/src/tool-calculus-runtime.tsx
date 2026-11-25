import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import { localizeExpression, normalizeExpression, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { activateTool } from './tool-runtime';
import './tool-calculus.css';

const operations = ['derivative', 'antiderivative', 'integral', 'limit', 'series', 'numerical_integral'] as const;
type Operation = typeof operations[number];
const variables = ['x', 'y', 'z'] as const;
const sides = ['both', 'left', 'right'] as const;
const orders = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const termCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const defaults = {
  variable: 'x', order: 1, lower: '0', upper: '1', point: '0', side: 'both', terms: 6, tolerance: '1e-8',
} satisfies Readonly<Record<string, string | number>>;
type Option = keyof typeof defaults;
type Options = { [K in Option]: (typeof defaults)[K] };
type Draft = { expression: string; options: Partial<Options> };
type CalculusState = { operation: Operation; drafts: Partial<Record<Operation, Draft>>; proof?: CalculationProof };

const fields: Readonly<Record<Operation, readonly Option[]>> = {
  derivative: ['variable', 'order'],
  antiderivative: ['variable'],
  integral: ['variable', 'lower', 'upper'],
  limit: ['variable', 'point', 'side'],
  series: ['variable', 'point', 'terms'],
  numerical_integral: ['variable', 'lower', 'upper', 'tolerance'],
};
const examples: Readonly<Record<Operation, Draft>> = {
  derivative: { expression: 'x^3*y+2*y^2', options: { variable: 'y', order: 2 } },
  antiderivative: { expression: '3*x^2+2*x', options: {} },
  integral: { expression: '3*x^2', options: { upper: '2' } },
  limit: { expression: 'sin(x)/x', options: {} },
  series: { expression: 'exp(x)', options: {} },
  numerical_integral: { expression: 'exp(-x^2)', options: {} },
};
const emptyDraft: Draft = { expression: '', options: {} };
const choices = { variable: variables, order: orders, side: sides, terms: termCounts } as const;
const maxBytes = 4096;
const utf8 = new TextEncoder();
const estimatePrefix = 'Estimated absolute quadrature error (uncertified): ';
const convergencePrefix = 'Taylor convergence for ';
const methodOperations: Readonly<Record<string, Operation>> = {
  symbolic_differentiation: 'derivative',
  bounded_symbolic_antiderivative: 'antiderivative',
  fundamental_theorem_of_calculus: 'integral',
  directional_leading_terms: 'limit',
  truncated_taylor_coefficients: 'series',
  adaptive_simpson_quadrature: 'numerical_integral',
};

function normalizeOption(value: string, decimal: string) {
  return normalizeExpression(value, decimal).trim().replace(/^([+-]?)∞$/u, '$1inf');
}

export function activate(scope: ModuleActivation<CalculusState>): PrimaryModule<CalculusState> {
  const runtime = activateTool(scope, () => new Worker(new URL('./tool-calculus-worker.ts', import.meta.url), { type: 'module' }));
  let retained: CalculusState = scope.previousState ?? { operation: 'derivative', drafts: {} };

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const current = useRef<AbortController | null>(null);
    const input = useRef<HTMLTextAreaElement>(null);
    const presentation = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const c = m.calculus;
    const { operation, drafts, proof } = state;
    const draft = drafts[operation] ?? emptyDraft;
    const { expression } = draft;
    const example = localizeExpression(examples[operation].expression, presentation.decimal);
    const point = normalizeOption(String(draft.options.point ?? defaults.point), presentation.decimal);
    const infinitePoint = operation === 'limit' && /^[+-]?inf$/iu.test(point);

    function abandon() {
      const calculation = current.current;
      current.current = null;
      calculation?.abort();
    }

    useEffect(() => () => abandon(), []);

    function commit(next: CalculusState) {
      retained = next;
      setState(next);
    }

    function update(changes: Partial<Omit<CalculusState, 'proof'>>) {
      abandon();
      setPending(false);
      setNotice(undefined);
      commit({ ...state, ...changes, proof: undefined });
    }

    function updateDraft(next: Draft) {
      if (next.expression.length > maxBytes || utf8.encode(next.expression).byteLength > maxBytes) {
        setNotice('limit');
        return;
      }
      update({ drafts: { ...drafts, [operation]: next } });
    }

    function fieldValue(option: Option) {
      return draft.options[option] ?? defaults[option];
    }

    function changeOption(option: Option, value: string | number) {
      updateDraft({ ...draft, options: { ...draft.options, [option]: value } });
    }

    async function calculate() {
      if (current.current || !expression.trim()) return;
      const controller = new AbortController();
      current.current = controller;
      setPending(true);
      setNotice(undefined);
      commit({ ...state, proof: undefined });
      const options = Object.fromEntries(fields[operation].map((option) => {
        const value = option === 'side' && infinitePoint ? 'both' : fieldValue(option);
        return [option, typeof value === 'string' ? normalizeOption(value, presentation.decimal) : value];
      }));
      const start = performance.now();
      const reply = await runtime.submit({
        schema: 1,
        module: 'calculus',
        operation,
        input: normalizeExpression(expression, presentation.decimal),
        original_input: expression,
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

    function useExample() {
      const options = { ...examples[operation].options };
      for (const option of fields[operation]) {
        const value = options[option] ?? defaults[option];
        if (option === 'lower' || option === 'upper' || option === 'point' || option === 'tolerance') {
          options[option] = localizeExpression(String(value), presentation.decimal);
        }
      }
      updateDraft({ expression: example, options });
      input.current?.focus();
    }

    function parameter(option: Option) {
      const value = fieldValue(option);
      if (option === 'variable' || option === 'side' || option === 'order' || option === 'terms') {
        const disabled = option === 'side' && infinitePoint;
        return <select value={disabled ? 'both' : value} disabled={disabled} onChange={(event) => {
          const next = event.currentTarget.value;
          changeOption(option, option === 'order' || option === 'terms' ? Number(next) : next);
        }}>
          {choices[option].map((choice) => <option key={choice} value={choice}>
            {option === 'side' ? c.sides[choice as typeof sides[number]]
              : typeof choice === 'number' ? presentation.format(String(choice)) : choice}
          </option>)}
        </select>;
      }
      return <input type="text" dir="ltr" maxLength={256} spellCheck={false} autoComplete="off" value={value}
        onChange={(event) => changeOption(option, event.currentTarget.value)} />;
    }

    const messages: Readonly<Record<string, string>> = {
      invalid_input: m.invalidExpression, domain: m.domainError, limit: m.processingLimit,
      unsupported: m.tools.unsupported, no_convergence: m.tools.convergence, timed_out: m.engineTimeout,
      cancelled: m.engineCancelled, queue_full: m.engineBusy, deferred: m.engineBusy,
    };
    const resultText = proof?.result === 'does_not_exist' ? c.noLimit
      : proof ? presentation.format(proof.result).replace(/\binf\b/gu, '∞') : '—';
    const estimate = proof?.constraints.find((value) => value.startsWith(estimatePrefix))?.slice(estimatePrefix.length);
    const constraints = proof?.constraints.filter((value) => !value.startsWith(estimatePrefix)) ?? [];

    function presentProofText(field: keyof CalculationProof, value: string): string {
      const method = field === 'method' && Object.hasOwn(methodOperations, value) ? methodOperations[value] : undefined;
      if (method) return c.proof.methods[method];
      if (field === 'operation' && Object.hasOwn(c.operations, value)) return c.operations[value as Operation];
      if (field === 'domain' && value === 'real') return c.proof.realDomain;
      if (field === 'variables' && value === 'real variable') return c.proof.realVariable;
      if (field === 'assumptions' && value === 'Working precision is not a certified error bound.') return c.proof.workingPrecision;
      if (field === 'result' && value === 'does_not_exist') return c.noLimit;
      if (field === 'formula' && value === 'lim f(x) from each requested side') return c.proof.limitFormula;
      if (field === 'constraints') {
        if (value.startsWith(estimatePrefix)) return `${c.estimatedError} · ${presentation.format(value.slice(estimatePrefix.length))}`;
        if (value === 'Taylor convergence for all real inputs') return c.proof.entireSeries;
        if (value === 'Taylor convergence on a neighborhood of the expansion point') return c.proof.localSeries;
        if (value.startsWith(`${convergencePrefix}|`)) {
          const condition = value.slice(convergencePrefix.length);
          return c.proof.radiusSeries.replace('{condition}', () => LOCALES[locale].direction === 'rtl' ? `\u2066${condition}\u2069` : condition);
        }
      }
      return value;
    }

    return <section className="calculus-workspace" aria-label={c.title} onKeyDown={(event) => {
      if (!event.nativeEvent.isComposing && event.key === 'Escape' && current.current) cancel();
    }}>
      <form className="calculus-card" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
        <div role="group" className="calculus-operations" aria-label={c.operation}>
          {operations.map((name) => <button key={name} type="button" aria-pressed={name === operation}
            onClick={() => { if (name !== operation) update({ operation: name }); }}>
            {c.operations[name]}
          </button>)}
        </div>
        <label className="calculus-expression">{m.expression}
          <textarea ref={input} rows={3} dir="ltr" spellCheck={false} autoComplete="off" autoCapitalize="off"
            value={expression} aria-describedby="calculus-input-help"
            onChange={(event) => updateDraft({ ...draft, expression: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void calculate();
              }
            }} />
        </label>
        <p className="calculus-hint" id="calculus-input-help">{c.hints[operation]}</p>
        <div role="group" className="calculus-parameters" aria-label={c.parameters}>
          {fields[operation].map((option) => <label key={option}>{option === 'point' && operation === 'series'
            ? c.expansionPoint : c.fields[option]}{parameter(option)}</label>)}
        </div>
        <div className="calculus-example">
          <button type="button" className="quiet-action" onClick={useExample}>
            {c.useExample} <bdi dir="ltr">{example}</bdi>
          </button>
        </div>
        <div className="calculus-actions">
          <button type="submit" className="calculus-primary" disabled={pending || !expression.trim()}>{m.calculate}</button>
          {pending && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
          <button type="button" className="quiet-action" disabled={!expression}
            onClick={() => { updateDraft({ ...draft, expression: '' }); input.current?.focus(); }}>{m.clear}</button>
        </div>
        <p role="status" className="calculus-status" data-error={Boolean(notice && notice !== 'cancelled') || undefined}>
          {pending ? m.working : notice ? (Object.hasOwn(messages, notice) ? messages[notice] : m.tools.engineUnavailable) : ''}
        </p>
      </form>

      <div className="calculus-card">
        <div className="calculus-result-label">
          <strong id="calculus-result-label">{m.result}</strong>
          {proof && <span>{proof.exactness === 'symbolic' ? c.symbolic : proof.exactness === 'exact' ? m.exact : m.approximate}</span>}
        </div>
        <output aria-labelledby="calculus-result-label" aria-live="polite" data-testid="calculus-result" data-canonical={proof?.result}
          className="calculus-result"><bdi dir={proof?.result === 'does_not_exist' ? 'auto' : 'ltr'}>{resultText}</bdi></output>
        {proof && estimate && <dl className="calculus-error-estimate">
          <div><dt>{c.estimatedError}</dt><dd dir="ltr"><bdi>{presentation.format(estimate)}</bdi></dd></div>
          {proof.tolerance && <div><dt>{c.fields.tolerance}</dt><dd dir="ltr"><bdi>{presentation.format(proof.tolerance)}</bdi></dd></div>}
        </dl>}
        {constraints.length ? <div className="calculus-constraints">
          <strong>{c.restrictions}</strong>
          <ul>{constraints.map((value, index) => <li key={index}><bdi>{presentProofText('constraints', value)}</bdi></li>)}</ul>
        </div> : null}
        <CalculationProofPanel proof={proof} locale={locale} localizeText={presentProofText} />
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
