import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import { normalizeExpression, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { BitPreview, decodeWord, RadixValues } from './tool-programmer-result';
import { activateTool } from './tool-runtime';
import './tool-programmer.css';

const operations = [
  'convert', 'and', 'or', 'xor', 'not', 'shift_left', 'shift_right_logical', 'shift_right_arithmetic',
  'rotate_left', 'rotate_right', 'twos_complement',
] as const;
type Operation = typeof operations[number];
const radices = [2, 8, 10, 16] as const;
type Base = typeof radices[number];
type Field = 'value' | 'secondValue' | 'count';
type Draft = Partial<Record<Field, string>>;
type ProgrammerState = {
  operation: Operation;
  base: Base;
  width: string;
  signed: boolean;
  drafts: Partial<Record<Operation, Draft>>;
  proof?: CalculationProof;
};

const bases = { 2: 'binary', 8: 'octal', 10: 'decimal', 16: 'hexadecimal' } as const;
const widths = [8, 16, 32, 64, 128];
const paired = new Set<Operation>(['and', 'or', 'xor']);
const shifted = new Set<Operation>(['shift_left', 'shift_right_logical', 'shift_right_arithmetic', 'rotate_left', 'rotate_right']);
const exampleValues: Readonly<Record<Base, readonly [string, string]>> = {
  2: ['10101010', '01010101'], 8: ['252', '125'], 10: ['170', '85'], 16: ['AA', '55'],
};
const noDraft: Draft = {};
const utf8 = new TextEncoder();
const maxBytes = 4096;
const methods: Readonly<Record<string, Operation>> = {
  fixed_width_conversion: 'convert',
  fixed_width_and: 'and',
  fixed_width_or: 'or',
  fixed_width_xor: 'xor',
  fixed_width_not: 'not',
  fixed_width_left_shift: 'shift_left',
  fixed_width_logical_right_shift: 'shift_right_logical',
  fixed_width_arithmetic_right_shift: 'shift_right_arithmetic',
  fixed_width_rotate_left: 'rotate_left',
  fixed_width_rotate_right: 'rotate_right',
  fixed_width_twos_complement: 'twos_complement',
};

export function activate(scope: ModuleActivation<ProgrammerState>): PrimaryModule<ProgrammerState> {
  const engine = activateTool(scope, () => new Worker(new URL('./tool-programmer-worker.ts', import.meta.url), { type: 'module' }));
  let retained: ProgrammerState = scope.previousState ?? { operation: 'convert', base: 10, width: '8', signed: false, drafts: {} };

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState<ProgrammerState>(retained);
    const [notice, setNotice] = useState<string>();
    const [pending, setPending] = useState(false);
    const current = useRef<AbortController | null>(null);
    const presentation = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const p = m.programmer;
    const { operation, base, signed, width, drafts, proof } = state;
    const draft = drafts[operation] ?? noDraft;
    const fields: Field[] = paired.has(operation) ? ['value', 'secondValue'] : shifted.has(operation) ? ['value', 'count'] : ['value'];
    const complete = fields.every((field) => draft[field]?.trim());
    const normalized = (text: string) => normalizeExpression(text.trim(), presentation.decimal);
    const widthText = normalized(width);
    const wordWidth = /^\d{1,4}$/u.test(widthText) ? Number(widthText) : 0;
    const word = useMemo(() => decodeWord(proof?.result), [proof]);

    function abandon() {
      const job = current.current;
      current.current = null;
      job?.abort();
    }
    useEffect(() => () => abandon(), []);

    function commit(next: ProgrammerState) {
      retained = next;
      setState(next);
    }

    function update(changes: Partial<Omit<ProgrammerState, 'proof'>>) {
      abandon();
      setPending(false);
      setNotice(undefined);
      commit({ ...state, ...changes, proof: undefined });
    }

    function updateDraft(next: Draft) {
      update({ drafts: { ...drafts, [operation]: next } });
    }

    function useExample() {
      const [value, second] = signed ? ['-1', '0'] : wordWidth >= 8 ? exampleValues[base] : ['1', '0'];
      updateDraft({ value, secondValue: second, count: '2' });
    }

    async function calculate() {
      if (current.current || !complete) return;
      if (wordWidth < 1 || wordWidth > 1024) {
        update({});
        setNotice('width');
        return;
      }
      const values = fields.map((field) => draft[field]?.trim() ?? '');
      const inputs = values.map(normalized);
      if (inputs.some((value) => /\s/u.test(value))) {
        update({});
        setNotice('invalid_input');
        return;
      }
      const original_input = values.join(' ');
      const input = inputs.join(' ');
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
      const start = performance.now();
      const reply = await engine.submit({
        schema: 1, module: 'programmer', operation, input, original_input, options: { base, signed, width: wordWidth },
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

    const notices: Readonly<Record<string, string>> = {
      width: p.invalidWidth, invalid_input: p.invalid, domain: p.domainError, limit: m.processingLimit,
      unsupported: m.tools.unsupported, no_convergence: m.tools.convergence, timed_out: m.engineTimeout,
      cancelled: m.engineCancelled, queue_full: m.engineBusy, deferred: m.engineBusy,
    };
    const visibleConstraints = proof?.constraints.filter((value) =>
      /^(Shift count is at least|Effective rotation count|The minimum signed value)/u.test(value)) ?? [];
    function localizeProof(field: keyof CalculationProof, text: string): string {
      if (field === 'operation' && Object.hasOwn(p.operations, text)) return p.operations[text as Operation];
      if (field === 'domain' && text === 'fixed_width_integer') return p.proof.domain;
      const method = field === 'method' && Object.hasOwn(methods, text) ? methods[text] : undefined;
      if (method) return p.operations[method];
      if (field === 'variables') {
        if (text === 'Exact word from input') return p.proof.exactWord;
        if (text === 'Exact decimal count from input') return p.proof.exactCount;
      }
      if (field === 'constraints') {
        const meanings: Readonly<Record<string, string>> = {
          'Signed decimal interpretation': p.proof.signed,
          'Unsigned decimal interpretation': p.proof.unsigned,
          'Shift count is at least the word width': p.proof.shiftLimit,
          'Left shift discards bits outside the selected word width': p.proof.leftWrap,
          'Logical right shift inserts zero bits': p.proof.logicalFill,
          'Arithmetic right shift copies the most significant bit': p.proof.arithmeticFill,
          "Two's complement negation wraps modulo 2^width": p.proof.twosWrap,
          'The minimum signed value retains its bit pattern': p.proof.minSigned,
        };
        if (Object.hasOwn(meanings, text)) return meanings[text] ?? text;
        const measured = /^(Word width|Input base|Effective rotation count): (\d+)(?: bits)?$/u.exec(text);
        if (measured?.[2]) {
          const label = measured[1] === 'Word width' ? p.proof.width : measured[1] === 'Input base' ? p.proof.base : p.proof.rotation;
          return label.replace('{count}', presentation.format(measured[2]));
        }
      }
      return text;
    }

    return <section className="programmer-workspace" aria-label={p.title} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && current.current) cancel();
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void calculate();
      }
    }}>
      <div className="programmer-card programmer-operations" role="group" aria-label={p.operation}>
        {operations.map((name) => <button key={name} type="button" aria-pressed={name === operation}
          onClick={() => { if (operation !== name) update({ operation: name }); }}>{p.operations[name]}</button>)}
      </div>
      <div className="programmer-layout">
        <form className="programmer-card" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          <div className="programmer-fields programmer-word">
            <label>{p.inputBase}
              <select value={base} onChange={(event) => update({ base: Number(event.currentTarget.value) as Base })}>
                {radices.map((radix) => <option value={radix} key={radix}>
                  {p.representations[bases[radix]]} ({presentation.format(String(radix))})
                </option>)}
              </select>
            </label>
            <label>{p.bitWidth}
              <input dir="ltr" type="text" inputMode="numeric" value={width} maxLength={4}
                autoComplete="off" spellCheck={false} aria-describedby="programmer-width-help"
                onChange={(event) => update({ width: event.currentTarget.value })} />
            </label>
          </div>
          <div className="programmer-presets" role="group" aria-label={p.presets}>
            {widths.map((size) => <button type="button" aria-pressed={wordWidth === size} key={size}
              onClick={() => update({ width: String(size) })}>{p.bits.replace('{count}', presentation.format(String(size)))}</button>)}
          </div>
          <label className="programmer-signed"><input type="checkbox" checked={signed}
            onChange={(event) => update({ signed: event.currentTarget.checked })} />{p.signed}</label>
          <div className="programmer-fields">
            {fields.map((field) => <label key={field}>{p.fields[field]}
              <input dir="ltr" type="text" value={draft[field] ?? ''} maxLength={1027} autoComplete="off" spellCheck={false}
                aria-describedby="programmer-operation-help"
                onChange={(event) => updateDraft({ ...draft, [field]: event.currentTarget.value })} />
            </label>)}
          </div>
          <p id="programmer-operation-help" className="programmer-hint">{p.hints[operation]}</p>
          <p className="programmer-word-policy" id="programmer-width-help">{p.wordPolicy}</p>
          <div className="programmer-actions">
            <button className="programmer-primary" type="submit" disabled={pending || !complete}>{m.calculate}</button>
            {pending && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
            <button type="button" className="quiet-action" onClick={useExample}>{p.useExample}</button>
            <button type="button" className="quiet-action" onClick={() => updateDraft(noDraft)}>{m.clear}</button>
          </div>
          <p className="programmer-notice" role="status" data-error={Boolean(notice && notice !== 'cancelled') || undefined}>
            {pending ? m.working : notice ? (Object.hasOwn(notices, notice) ? notices[notice] : m.tools.engineUnavailable) : ''}
          </p>
        </form>

        <div className="programmer-card">
          <div className="programmer-result-heading"><strong id="programmer-result-label">{m.result}</strong>
            {proof && <span>{m.exact}</span>}
          </div>
          <div className="programmer-result" role="status" aria-labelledby="programmer-result-label"
            data-testid="programmer-result" data-canonical={proof?.result}>
            <RadixValues word={word} original={proof?.result} labels={p.representations} />
          </div>
          {word && <BitPreview binary={word.binary} signed={signed} messages={p} format={presentation.format} />}
          {visibleConstraints.length ? <ul className="programmer-constraints">
            {visibleConstraints.map((value, index) => <li key={index}><bdi>{localizeProof('constraints', value)}</bdi></li>)}
          </ul> : null}
          <CalculationProofPanel proof={proof} locale={locale} localizeText={localizeProof} />
        </div>
      </div>
    </section>;
  }

  return {
    Workspace,
    setPolicy: engine.setPolicy,
    getResources: engine.getResources,
    snapshot: () => retained,
    dispose: engine.dispose,
  };
}
