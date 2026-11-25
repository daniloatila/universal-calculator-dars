import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import { numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { combinatorics, encodeExpression, exampleValues, fieldsFor, groupList, groups, modularModes, normalizeDiscreteField, sequenceModes } from './tool-discrete-input';
import type { Draft, Field, Group, ModularMode, Operation, SequenceMode } from './tool-discrete-input';
import { DiscreteResult } from './tool-discrete-result';
import { activateTool } from './tool-runtime';
import './tool-discrete.css';

type DiscreteState = {
  group: Group;
  selected: Partial<Record<Group, Operation>>;
  drafts: Partial<Record<Operation, Draft>>;
  proof?: CalculationProof;
};

const empty: Draft = { values: {} };
const optional = new Set<Field>(['leftSet', 'rightSet', 'assignments']);
const multiline = new Set<Field>(['leftSet', 'rightSet', 'proposition', 'assignments', 'integers', 'multiplicities']);
const logicKeys = { not: '¬', and: '∧', xor: '⊕', or: '∨', implies: '→', iff: '↔' } as const;
const maxBytes = 4096;
const utf8 = new TextEncoder();

export function activate(scope: ModuleActivation<DiscreteState>): PrimaryModule<DiscreteState> {
  const runtime = activateTool(scope, () => new Worker(new URL('./tool-discrete-worker.ts', import.meta.url), { type: 'module' }));
  let retained: DiscreteState = scope.previousState ?? { group: 'combinatorics', selected: {}, drafts: {} };

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const current = useRef<AbortController | null>(null);
    const proposition = useRef<HTMLTextAreaElement>(null);
    const presentation = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const d = m.discrete;
    const { group, selected, drafts, proof } = state;
    const operation = selected[group] ?? groups[group][0];
    const draft = drafts[operation] ?? empty;
    const entries = fieldsFor(operation, draft);
    const complete = entries.every((field) => optional.has(field) || draft.values[field]?.trim());
    const repetitionEnabled = combinatorics.includes(operation);

    function abandon() {
      const handle = current.current;
      current.current = null;
      handle?.abort();
    }
    useEffect(() => () => abandon(), []);

    function commit(next: DiscreteState) {
      retained = next;
      setState(next);
    }

    function update(changes: Partial<Omit<DiscreteState, 'proof'>>) {
      abandon();
      setPending(false);
      setNotice(undefined);
      commit({ ...state, ...changes, proof: undefined });
    }

    function updateDraft(next: Draft) {
      update({ drafts: { ...drafts, [operation]: next } });
    }

    function change(field: Field, value: string) {
      if (utf8.encode(value).byteLength > maxBytes) {
        setNotice('limit');
        return;
      }
      updateDraft({ ...draft, values: { ...draft.values, [field]: value } });
    }

    function insertOperator(symbol: string) {
      const input = proposition.current;
      if (!input) return;
      const text = draft.values.proposition ?? '';
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const insertion = ` ${symbol} `;
      change('proposition', text.slice(0, start) + insertion + text.slice(end));
      input.focus();
      const position = start + insertion.length;
      requestAnimationFrame(() => {
        if (!scope.signal.aborted && proposition.current === input) input.setSelectionRange(position, position);
      });
    }

    function useExample() {
      const values = Object.fromEntries(entries.map((name) => [
        name, name === 'integer' && operation === 'factor' ? '360' : exampleValues[name],
      ]));
      updateDraft({ ...draft, values });
    }

    async function calculate() {
      if (current.current || !complete) return;
      const values = entries.map((name) => draft.values[name]?.trim() ?? '');
      const normalized = entries.map((field, index) => normalizeDiscreteField(field, values[index] ?? ''));
      if (entries.some((name, index) => !multiline.has(name) && /\s/u.test(normalized[index] ?? ''))) {
        update({});
        setNotice('invalid_input');
        return;
      }
      const original_input = encodeExpression(group, operation, values);
      const input = encodeExpression(group, operation, normalized);
      if (utf8.encode(original_input).byteLength > maxBytes || utf8.encode(input).byteLength > maxBytes) {
        update({});
        setNotice('limit');
        return;
      }
      const controller = new AbortController();
      current.current = controller;
      setPending(true);
      setNotice(undefined);
      commit({ ...state, proof: undefined });
      const options: Record<string, string | boolean> = {};
      if (repetitionEnabled) options.repetition = draft.repetition === true;
      if (operation === 'modular') options.mode = draft.modular ?? 'remainder';
      if (operation === 'sequence') options.mode = draft.sequence ?? 'fibonacci';
      const start = performance.now();
      const response = await runtime.submit({ schema: 1, module: 'discrete-mathematics', operation, input, original_input, options }, controller.signal);
      if (scope.signal.aborted || current.current !== controller) return;
      current.current = null;
      setPending(false);
      if (response.status === 'completed') {
        if (response.value.ok) {
          recordInteraction(performance.now() - start);
          commit({ ...state, proof: response.value.proof });
        } else setNotice(response.value.code);
      } else setNotice(response.status);
    }

    function cancel() {
      abandon();
      setPending(false);
      setNotice('cancelled');
    }

    const notices: Readonly<Record<string, string>> = {
      invalid_input: d.invalid, domain: d.domainError, limit: m.processingLimit, unsupported: m.tools.unsupported,
      no_convergence: m.tools.convergence, timed_out: m.engineTimeout, cancelled: m.engineCancelled,
      queue_full: m.engineBusy, deferred: m.engineBusy,
    };
    const certainty = proof?.result === 'probable_prime' ? d.probable
      : proof?.exactness === 'exact' ? m.exact : proof?.exactness === 'symbolic' ? d.symbolic : m.approximate;

    function presentProofText(field: keyof CalculationProof, value: string): string {
      if (field === 'operation' && Object.hasOwn(d.operations, value)) return d.operations[value as Operation];
      if (field === 'method' && Object.hasOwn(d.proof.methods, value)) return d.proof.methods[value as keyof typeof d.proof.methods];
      if (field === 'domain' && Object.hasOwn(d.proof.domains, value)) return d.proof.domains[value as keyof typeof d.proof.domains];
      if (field === 'variables') {
        if (value === 'boolean variable') return d.proof.booleanVariable;
        if (value === 'true' || value === 'false') return d.boolean[value];
        if (value === 'Exact integer from input') return d.proof.integerInput;
        const count = /^(\d+) distinct elements$/u.exec(value);
        if (count?.[1]) return d.proof.distinct.replace('{count}', presentation.format(count[1]));
      }
      if (field === 'result' && Object.hasOwn(d.primeStatus, value)) return d.primeStatus[value as keyof typeof d.primeStatus];
      if (field === 'constraints') {
        const labels: Readonly<Record<string, string>> = {
          'Primes are integers greater than one': d.proof.primeDomain,
          'Deterministic result for the unsigned 64-bit range': d.proof.deterministic,
          'Passed 12 fixed strong probable-prime tests': d.proof.testsPassed,
          'Prime factors verified in the unsigned 64-bit range with multiplicity': d.proof.factors,
          'Modulus is strictly positive': d.proof.positiveModulus,
          'Modular inverse requires coprime operands and modulus above one': d.proof.inverseModulus,
          'Sequence index is zero-based': d.proof.zeroBased,
        };
        if (Object.hasOwn(labels, value)) return labels[value] ?? value;
        const prefix = /^(Small prime divisor|Compositeness witness base): (\d+)$/u.exec(value);
        if (prefix?.[2]) return `${prefix[1] === 'Small prime divisor' ? d.proof.divisor : d.proof.witness} · ${presentation.format(prefix[2])}`;
      }
      if (field === 'formula') {
        const formulas: Readonly<Record<string, string>> = {
          'n!/(n-k)! for k<=n': 'n!/(n−k)! (k ≤ n)',
          'binomial(n+k-1,k) for n>0': 'C(n+k−1,k) (n > 0)',
          'f(a) for each a in {0,1}^n': 'f(a), a ∈ {0,1}ⁿ',
          'f(A,B,...) in {false,true}': 'f(A,B,…) ∈ {0,1}',
          'n-1 = d*2^s, check powers of a^d mod n': 'n−1 = d·2ˢ, (a^d)^(2^k) mod n',
        };
        if (Object.hasOwn(formulas, value)) return formulas[value] ?? value;
      }
      return value;
    }

    function field(name: Field) {
      const value = draft.values[name] ?? '';
      if (multiline.has(name)) return <label className="discrete-text" key={name}>{d.fields[name]}
        <textarea ref={name === 'proposition' ? proposition : undefined} rows={name === 'proposition' ? 3 : 2}
          dir="ltr" value={value} maxLength={maxBytes} autoComplete="off" autoCapitalize="off" spellCheck={false}
          aria-describedby="discrete-input-help" onChange={(event) => change(name, event.currentTarget.value)} />
      </label>;
      return <label key={name}>{d.fields[name]}
        <input type="text" dir="ltr" value={value} maxLength={maxBytes} autoComplete="off" spellCheck={false}
          aria-describedby="discrete-input-help" onChange={(event) => change(name, event.currentTarget.value)} />
      </label>;
    }

    return <section className="discrete-workspace" aria-label={d.title} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && current.current) cancel();
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void calculate();
      }
    }}>
      <div className="discrete-card discrete-pickers">
        <div className="discrete-nav" role="group" aria-label={d.category}>
          {groupList.map((name) => <button type="button" key={name} aria-pressed={name === group}
            onClick={() => { if (name !== group) update({ group: name }); }}>{d.groups[name]}</button>)}
        </div>
        <div className="discrete-operation" role="group" aria-label={d.operation}>
          {groups[group].map((name) => <button type="button" key={name} aria-pressed={name === operation}
            onClick={() => { if (name !== operation) update({ selected: { ...selected, [group]: name } }); }}>
            {d.operations[name]}
          </button>)}
        </div>
      </div>
      <div className="discrete-layout">
        <form className="discrete-card" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          {operation === 'modular' && <label className="discrete-mode">{d.modularMode}
            <select value={draft.modular ?? 'remainder'} onChange={(event) =>
              updateDraft({ ...draft, modular: event.currentTarget.value as ModularMode })}>
              {modularModes.map((mode) => <option key={mode} value={mode}>{d.modular[mode]}</option>)}
            </select>
          </label>}
          {operation === 'sequence' && <label className="discrete-mode">{d.sequenceMode}
            <select value={draft.sequence ?? 'fibonacci'} onChange={(event) =>
              updateDraft({ ...draft, sequence: event.currentTarget.value as SequenceMode })}>
              {sequenceModes.map((mode) => <option key={mode} value={mode}>{d.sequences[mode]}</option>)}
            </select>
          </label>}
          {entries.filter((name) => multiline.has(name)).map(field)}
          {entries.some((name) => !multiline.has(name)) && <div className="discrete-fields">
            {entries.filter((name) => !multiline.has(name)).map(field)}
          </div>}
          {repetitionEnabled && <label className="discrete-repetition">
            <input type="checkbox" checked={draft.repetition === true}
              onChange={(event) => updateDraft({ ...draft, repetition: event.currentTarget.checked })} />{d.repetition}
          </label>}
          {group === 'logic' && <div className="discrete-logic-keys" role="group" aria-label={d.logicOperators}>
            {Object.entries(logicKeys).map(([name, glyph]) => <button key={name} type="button" className="quiet-action"
              aria-label={d.operatorLabels[name as keyof typeof logicKeys]} onClick={() => insertOperator(glyph)}>{glyph}</button>)}
          </div>}
          <p id="discrete-input-help" className="discrete-hint">
            {operation === 'permutations' && draft.repetition ? d.repetitionHint : d.hints[operation]}
          </p>
          <div className="discrete-actions">
            <button className="discrete-primary" type="submit" disabled={pending || !complete}>{m.calculate}</button>
            {pending && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
            <button type="button" className="quiet-action" onClick={useExample}>{d.useExample}</button>
            <button type="button" className="quiet-action" onClick={() => updateDraft({ ...draft, values: {} })}>{m.clear}</button>
          </div>
          <p role="status" className="discrete-notice" data-error={Boolean(notice && notice !== 'cancelled') || undefined}>
            {pending ? m.working : notice ? (Object.hasOwn(notices, notice) ? notices[notice] : m.tools.engineUnavailable) : ''}
          </p>
        </form>
        <div className="discrete-card">
          <div className="discrete-result-heading">
            <strong id="discrete-result-label">{m.result}</strong>{proof && <span>{certainty}</span>}
          </div>
          <div className="discrete-result" role="status" aria-labelledby="discrete-result-label"
            data-testid="discrete-mathematics-result" data-canonical={proof?.result}>
            <DiscreteResult value={proof?.result} group={group} operation={operation} messages={m} format={presentation.format} />
          </div>
          {proof?.constraints.length ? <ul className="discrete-constraints">
            {proof.constraints.map((value, index) => <li key={index}><bdi>{presentProofText('constraints', value)}</bdi></li>)}
          </ul> : null}
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
