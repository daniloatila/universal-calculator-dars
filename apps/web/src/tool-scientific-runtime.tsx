import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import type { CalculationProof } from './calculation-proof';
import { spliceExpression } from './editor';
import { LOCALES } from './i18n';
import { localizeExpression, normalizeExpression, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { activateTool } from './tool-runtime';
import './tool-scientific.css';

type Angle = 'rad' | 'deg' | 'grad';
type Notation = 'auto' | 'scientific' | 'engineering';
type ScientificInput = {
  expression: string;
  angle: Angle;
  notation: Notation;
  precision: string;
  complex: boolean;
};
type ScientificState = { input: ScientificInput; proof?: CalculationProof };
type Notice = 'domain' | 'limit' | 'invalid' | 'unsupported' | 'convergence' | 'precision' |
  'unavailable' | 'timeout' | 'cancelled' | 'busy';

const INPUT_LIMIT = 4096;
const utf8 = new TextEncoder();
const initialInput: ScientificInput = {
  expression: '', angle: 'rad', notation: 'auto', precision: '32', complex: false,
};
const functions = {
  trigonometry: ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'],
  hyperbolic: ['sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh'],
  functions: ['ln', 'log', 'exp', 'sqrt', 'root', 'abs', 'cbrt', 'pow', 'approx'],
} as const;
const examples = ['sin(90°)', 'log(1024,2)', '20!'];

function classifyError(code: string): Notice {
  switch (code) {
    case 'invalid_input':
    case 'invalid_expression': return 'invalid';
    case 'domain':
    case 'domain_error': return 'domain';
    case 'limit':
    case 'processing_limit': return 'limit';
    case 'unsupported':
    case 'unsupported_operation': return 'unsupported';
    case 'no_convergence': return 'convergence';
    default: return 'unavailable';
  }
}

export function activate(scope: ModuleActivation<ScientificState>): PrimaryModule<ScientificState> {
  const runtime = activateTool(scope, () => new Worker(new URL('./tool-scientific-worker.ts', import.meta.url), { type: 'module' }));
  let retained = scope.previousState ?? { input: initialInput };

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [notice, setNotice] = useState<Notice>();
    const [working, setWorking] = useState(false);
    const [copied, setCopied] = useState<'success' | 'failure'>();
    const active = useRef<AbortController | null>(null);
    const inputElement = useRef<HTMLTextAreaElement>(null);
    const presentation = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const s = m.scientific;
    const { input, proof } = state;

    function abort() {
      const controller = active.current;
      active.current = null;
      controller?.abort();
    }

    useEffect(() => () => abort(), []);

    function replace(next: ScientificState) {
      retained = next;
      setState(next);
      setCopied(undefined);
    }

    function change(update: Partial<ScientificInput>) {
      abort();
      setWorking(false);
      setNotice(undefined);
      replace({ input: { ...input, ...update } });
    }

    function edit(expression: string) {
      if (expression.length > INPUT_LIMIT || utf8.encode(expression).byteLength > INPUT_LIMIT) {
        setNotice('limit');
        return false;
      }
      change({ expression });
      return true;
    }

    function insert(fragment: string, wrap = false) {
      const element = inputElement.current;
      if (!element) return;
      const { selectionStart, selectionEnd } = element;
      const selected = input.expression.slice(selectionStart, selectionEnd);
      const text = wrap ? fragment + '(' + (selected ? selected + ')' : '') : fragment;
      const replacement = spliceExpression(input.expression, selectionStart, selectionEnd, text);
      if (!edit(replacement.expression)) return;
      element.focus();
      requestAnimationFrame(() => element.setSelectionRange(replacement.caret, replacement.caret));
    }

    function cancel() {
      abort();
      setWorking(false);
      setNotice('cancelled');
    }

    async function calculate() {
      if (active.current || !input.expression.trim()) return;
      const precision = normalizeExpression(input.precision, presentation.decimal);
      if (!/^\d{1,2}$/u.test(precision) || Number(precision) < 8 || Number(precision) > 80) {
        setNotice('precision');
        return;
      }
      const controller = new AbortController();
      active.current = controller;
      setWorking(true);
      setNotice(undefined);
      replace({ input });
      const started = performance.now();
      const result = await runtime.submit({
        schema: 1,
        module: 'scientific',
        operation: 'evaluate',
        input: normalizeExpression(input.expression, presentation.decimal),
        original_input: input.expression,
        options: { angle: input.angle, notation: input.notation, precision: Number(precision), complex: input.complex },
      }, controller.signal);
      if (active.current !== controller || scope.signal.aborted) return;
      active.current = null;
      setWorking(false);
      if (result.status === 'completed') {
        if (result.value.ok) {
          recordInteraction(performance.now() - started);
          replace({ input, proof: result.value.proof });
        } else setNotice(classifyError(result.value.code));
      } else {
        setNotice(result.status === 'timed_out' ? 'timeout' : result.status === 'cancelled' ? 'cancelled'
          : result.status === 'queue_full' || result.status === 'deferred' ? 'busy' : 'unavailable');
      }
    }

    function keyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
      if (event.nativeEvent.isComposing) return;
      if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      void calculate();
    }

    async function copy() {
      if (!proof) return;
      let result: 'success' | 'failure' = 'success';
      try {
        await navigator.clipboard.writeText(proof.result);
      } catch {
        result = 'failure';
      }
      if (retained.proof === proof && !scope.signal.aborted) setCopied(result);
    }

    const noticeText: Record<Notice, string> = {
      domain: m.domainError, limit: m.processingLimit, invalid: m.invalidExpression,
      unsupported: m.tools.unsupported, convergence: m.tools.convergence, precision: s.precisionError,
      unavailable: m.tools.engineUnavailable, timeout: m.engineTimeout, cancelled: m.engineCancelled, busy: m.engineBusy,
    };
    const sign = presentation.decimal === ',' ? ';' : presentation.decimal === '٫' ? '؛' : ',';
    const digits = presentation.digits;
    const keys = [
      digits[7], digits[8], digits[9], '÷', '(', ')',
      digits[4], digits[5], digits[6], '×', 'π', 'e',
      digits[1], digits[2], digits[3], '−', 'i', 'τ',
      digits[0], presentation.decimal, sign, '+', '^', '!',
    ].filter((key): key is string => key !== undefined);

    return <section className="scientific-workspace" aria-label={s.title} onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && active.current) cancel();
    }}>
      <form className="scientific-card scientific-editor" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
        <div className="scientific-settings">
          <label>{s.angle}
            <select value={input.angle} onChange={(event) => {
              const next = event.currentTarget.value;
              if (next === 'rad' || next === 'deg' || next === 'grad') change({ angle: next });
            }}>
              <option value="rad">{s.radians}</option><option value="deg">{s.degrees}</option><option value="grad">{s.gradians}</option>
            </select>
          </label>
          <label>{s.notation}
            <select value={input.notation} onChange={(event) => {
              const next = event.currentTarget.value;
              if (next === 'auto' || next === 'scientific' || next === 'engineering') change({ notation: next });
            }}>
              <option value="auto">{s.automatic}</option><option value="scientific">{s.scientific}</option><option value="engineering">{s.engineering}</option>
            </select>
          </label>
          <label>{s.precision}
            <input inputMode="numeric" maxLength={2} dir="ltr" value={input.precision}
              onChange={(event) => change({ precision: event.currentTarget.value })} />
          </label>
          <label>{s.numberMode}
            <select value={input.complex ? 'complex' : 'real'} onChange={(event) => change({ complex: event.currentTarget.value === 'complex' })}>
              <option value="real">{s.real}</option><option value="complex">{s.complex}</option>
            </select>
          </label>
        </div>
        <label className="scientific-expression">{m.expression}
          <textarea ref={inputElement} dir="ltr" spellCheck={false} autoCapitalize="off" autoComplete="off" rows={3}
            value={input.expression} onKeyDown={keyboard} aria-describedby="scientific-input-help"
            onChange={(event) => edit(event.currentTarget.value)} />
        </label>
        <p className="scientific-help" id="scientific-input-help">{s.separators.replace('{separator}', sign)}</p>
        <div className="scientific-examples">
          <span>{m.tools.examples}</span>
          {examples.map((expression) => <button key={expression} type="button" className="quiet-action" dir="ltr"
            onClick={() => { edit(localizeExpression(expression, presentation.decimal)); inputElement.current?.focus(); }}>
            {localizeExpression(expression, presentation.decimal)}
          </button>)}
        </div>
        <div className="scientific-keys">
          {Object.entries(functions).map(([group, names]) => <fieldset key={group}>
            <legend>{s[group as keyof typeof functions]}</legend>
            <div className="scientific-key-grid" dir="ltr">
              {names.map((name) => <button key={name} type="button" onClick={() => insert(name, true)}>{name}</button>)}
            </div>
          </fieldset>)}
          <fieldset>
            <legend>{s.keypad}</legend>
            <div className="scientific-key-grid" dir="ltr">
              {keys.map((key) => <button key={key} type="button" onClick={() => insert(key)}>{key}</button>)}
            </div>
          </fieldset>
        </div>
        <div className="scientific-actions">
          <button type="submit" className="scientific-submit" disabled={working || !input.expression.trim()}>{m.calculate}</button>
          <button type="button" className="quiet-action" disabled={!input.expression && !proof}
            onClick={() => { edit(''); inputElement.current?.focus(); }}>{m.clear}</button>
          {working && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
        </div>
        <p className="scientific-feedback" data-working={working || undefined}
          role="status">{working ? m.working : notice ? noticeText[notice] : ''}</p>
      </form>
      <div className="scientific-card scientific-output">
        <div className="scientific-result-label">
          <strong id="scientific-result-label">{m.result}</strong>
          {proof && <span>{proof.exactness === 'symbolic' ? s.symbolic : proof.exactness === 'exact' ? m.exact : m.approximate}</span>}
        </div>
        <output aria-labelledby="scientific-result-label" aria-live="polite" data-testid="scientific-result"
          data-canonical={proof?.result} className="scientific-result"><bdi dir="ltr">
          {proof ? presentation.format(proof.result) : '—'}
        </bdi></output>
        {proof && <div className="scientific-copy">
          <button className="quiet-action" type="button" onClick={() => void copy()}>{m.copy}</button>
          <span role="status">{copied === 'success' ? m.copied : copied === 'failure' ? m.copyFailed : ''}</span>
        </div>}
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
