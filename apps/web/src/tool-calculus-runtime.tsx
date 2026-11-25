import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import { withExpressionLocale } from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import InputNotation from './input-notation';
import { draftDecimal, editLocalizedDraft, localizeExpression, normalizeMathText, numberPresentation } from './locale-format';
import type { LocalizedDraft } from './locale-format';
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
const choices = { variable: variables, order: orders, side: sides, terms: termCounts } as const;
type ChoiceOption = keyof typeof choices;
type NumericOption = Exclude<Option, ChoiceOption>;
type ChoiceValues = Partial<Pick<typeof defaults, ChoiceOption>>;
type Draft = { expression?: LocalizedDraft; selected: ChoiceValues; numeric: Partial<Record<NumericOption, LocalizedDraft>> };
type Example = { expression: string; selected?: ChoiceValues; numeric?: Partial<Record<NumericOption, string>> };
type CalculusState = { operation: Operation; drafts: Partial<Record<Operation, Draft>>; proof?: CalculationProof };

const fields: Readonly<Record<Operation, readonly Option[]>> = {
  derivative: ['variable', 'order'],
  antiderivative: ['variable'],
  integral: ['variable', 'lower', 'upper'],
  limit: ['variable', 'point', 'side'],
  series: ['variable', 'point', 'terms'],
  numerical_integral: ['variable', 'lower', 'upper', 'tolerance'],
};
const examples: Readonly<Record<Operation, Example>> = {
  derivative: { expression: 'x^3*y+2*y^2', selected: { variable: 'y', order: 2 } },
  antiderivative: { expression: '3*x^2+2*x' },
  integral: { expression: '3*x^2', numeric: { upper: '2' } },
  limit: { expression: 'sin(x)/x' },
  series: { expression: 'exp(x)' },
  numerical_integral: { expression: 'exp(-x^2)' },
};
const emptyDraft: Draft = { selected: {}, numeric: {} };
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

function isChoice(option: Option): option is ChoiceOption {
  return Object.hasOwn(choices, option);
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
    const expression = draft.expression?.text ?? '';
    const expressionOrigin = expression.trim() ? draft.expression?.locale : undefined;
    const retainedExpressionNotation = expressionOrigin && expressionOrigin !== locale;
    const example = localizeExpression(examples[operation].expression, presentation.decimal);
    const infinitePoint = operation === 'limit' && /^[+-]?inf$/iu.test(normalizeParameter('point'));

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
      const text = next.expression?.text ?? '';
      if (text.length > maxBytes || utf8.encode(text).byteLength > maxBytes) {
        setNotice('limit');
        return;
      }
      update({ drafts: { ...drafts, [operation]: next } });
    }

    function changeExpression(text: string) {
      updateDraft({ ...draft, expression: editLocalizedDraft(draft.expression, text, locale) });
    }

    function normalizeParameter(option: NumericOption) {
      const value = draft.numeric[option];
      return value ? normalizeMathText(value.text, draftDecimal(value)).trim().replace(/^([+-]?)∞$/u, '$1inf')
        : defaults[option];
    }

    function parameterOrigin(option: NumericOption) {
      const value = draft.numeric[option];
      return value?.text.trim() ? value.locale : undefined;
    }

    async function calculate() {
      const entered = draft.expression;
      if (current.current || !entered?.text.trim()) return;
      const controller = new AbortController();
      current.current = controller;
      setPending(true);
      setNotice(undefined);
      commit({ ...state, proof: undefined });
      const options = Object.fromEntries(fields[operation].map((option) => {
        if (!isChoice(option)) return [option, normalizeParameter(option)];
        return [option, option === 'side' && infinitePoint ? 'both' : draft.selected[option] ?? defaults[option]];
      }));
      const start = performance.now();
      const reply = await runtime.submit({
        schema: 1,
        module: 'calculus',
        operation,
        input: normalizeMathText(entered.text, draftDecimal(entered)),
        original_input: entered.text,
        options,
      }, controller.signal);
      if (scope.signal.aborted || current.current !== controller) return;
      current.current = null;
      setPending(false);
      if (reply.status === 'completed') {
        if (reply.value.ok) {
          recordInteraction(performance.now() - start);
          commit({ ...state, proof: withExpressionLocale(reply.value.proof, entered.locale) });
        } else setNotice(reply.value.code);
      } else setNotice(reply.status);
    }

    function cancel() {
      abandon();
      setPending(false);
      setNotice('cancelled');
    }

    function useExample() {
      const { selected, numeric } = examples[operation];
      const numberDrafts = Object.fromEntries(Object.entries(numeric ?? {}).map(([option, value]) =>
        [option, editLocalizedDraft(undefined, localizeExpression(value, presentation.decimal), locale)]));
      updateDraft({ expression: editLocalizedDraft(undefined, example, locale), selected: selected ?? {}, numeric: numberDrafts });
      input.current?.focus();
    }

    function parameter(option: Option) {
      if (isChoice(option)) {
        const value = draft.selected[option] ?? defaults[option];
        const disabled = option === 'side' && infinitePoint;
        return <select value={disabled ? 'both' : value} disabled={disabled} onChange={(event) => {
          const next = event.currentTarget.value;
          const selected = { ...draft.selected, [option]: option === 'order' || option === 'terms' ? Number(next) : next };
          updateDraft({ ...draft, selected });
        }}>
          {choices[option].map((choice) => <option key={choice} value={choice}>
            {option === 'side' ? c.sides[choice as typeof sides[number]]
              : typeof choice === 'number' ? presentation.format(String(choice)) : choice}
          </option>)}
        </select>;
      }
      const value = draft.numeric[option];
      const origin = parameterOrigin(option);
      return <input type="text" dir="ltr" maxLength={256} spellCheck={false} autoComplete="off"
        value={value?.text ?? defaults[option]}
        aria-describedby={origin && origin !== locale ? `calculus-${option}-notation` : undefined}
        onChange={(event) => updateDraft({ ...draft, numeric: { ...draft.numeric,
          [option]: editLocalizedDraft(value, event.currentTarget.value, locale) } })} />;
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
            value={expression}
            aria-describedby={retainedExpressionNotation ? 'calculus-input-help calculus-input-notation' : 'calculus-input-help'}
            onChange={(event) => changeExpression(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void calculate();
              }
            }} />
        </label>
        <p className="calculus-hint" id="calculus-input-help">{c.hints[operation]}</p>
        <InputNotation origin={expressionOrigin} locale={locale} messages={m} id="calculus-input-notation" />
        <div role="group" className="calculus-parameters" aria-label={c.parameters}>
          {fields[operation].map((option) => <div key={option}>
            <label>{option === 'point' && operation === 'series' ? c.expansionPoint : c.fields[option]}{parameter(option)}</label>
            {!isChoice(option) && <InputNotation origin={parameterOrigin(option)} locale={locale} messages={m}
              id={`calculus-${option}-notation`} />}
          </div>)}
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
            onClick={() => { changeExpression(''); input.current?.focus(); }}>{m.clear}</button>
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
