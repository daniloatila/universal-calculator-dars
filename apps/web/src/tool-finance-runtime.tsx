import { useEffect, useId, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import { MAX_CALCULATION_PROOF_BYTES, MAX_FINANCE_COMPARISON_INPUT_BYTES } from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import type { Locale } from './i18n';
import type { FinanceModule } from './finance-modules';
import { localizedDecimal } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { canonicalDraft, exampleDraft, operations, replayDraft } from './tool-finance-input';
import type { Cell, Draft, Field } from './tool-finance-input';
import { readComparison } from './tool-finance-comparison';
import { FinanceResult, ScenarioResults, readResult, downloadJson } from './tool-finance-result';
import { activateTool } from './tool-runtime';
import type { ToolRequest } from './tool-runtime';
import './tool-finance.css';

const workers: Record<FinanceModule, () => Worker> = {
  financial: () => new Worker(new URL('./tool-financial-worker.ts', import.meta.url), { type: 'module' }),
  investment: () => new Worker(new URL('./tool-investment-worker.ts', import.meta.url), { type: 'module' }),
  loans: () => new Worker(new URL('./tool-loans-worker.ts', import.meta.url), { type: 'module' }),
  tax: () => new Worker(new URL('./tool-tax-worker.ts', import.meta.url), { type: 'module' }),
  business: () => new Worker(new URL('./tool-business-worker.ts', import.meta.url), { type: 'module' }),
};

const currencies = ['BRL', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY', 'INR', 'MXN', 'AED', 'SAR', 'JPY', 'CLP', 'KRW', 'KWD', 'BHD', 'JOD'];
const roundings = ['half_even', 'half_up', 'toward_zero'];
const byteLength = new TextEncoder();
const MAX_SCENARIO_BYTES = 64 * 1024;
const currenciesFor = (id: FinanceModule) => id === 'tax' ? ['BRL'] : currencies;
const maxScenarios = 6;

type Saved = { id: number; proof: CalculationProof };
type ComparisonState = {
  reference: number;
  alternative: number;
  result?: ReturnType<typeof readComparison>;
  proof?: CalculationProof;
};
const noComparison: ComparisonState = { reference: 0, alternative: 0 };

export type FinanceState = {
  operation: string;
  drafts: Record<string, Draft>;
  currency: string;
  rounding: string;
  proof?: CalculationProof;
  scenarios: Saved[];
  next: number;
  comparison?: ComparisonState;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function storedRequest(proof: CalculationProof): ToolRequest {
  return { schema: 1, module: proof.module, operation: proof.operation, input: proof.normalized,
    original_input: proof.expression, options: proof.options };
}

function comparisonRequest(id: FinanceModule, baseline: Saved, candidate: Saved, metric?: string): ToolRequest {
  function source({ proof }: Saved) {
    return { operation: proof.operation, input: proof.normalized, options: proof.options };
  }
  const input = JSON.stringify({ reference: source(baseline), alternative: source(candidate), metric });
  if (byteLength.encode(input).length > MAX_FINANCE_COMPARISON_INPUT_BYTES) throw new TypeError('limit');
  return { schema: 1, module: id, operation: 'scenario_compare', input, options: {} };
}

export function activateFinance(id: FinanceModule, scope: ModuleActivation<FinanceState>): PrimaryModule<FinanceState> {
  const runtime = activateTool(scope, workers[id]);
  const choices = operations[id];
  let retained: FinanceState = scope.previousState ?? {
    operation: choices[0]!.id, drafts: {}, currency: 'BRL', rounding: id === 'tax' ? 'half_up' : 'half_even',
    scenarios: [], next: 1,
  };

  function Workspace({ locale, messages, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const running = useRef<AbortController | undefined>(undefined);
    const file = useRef<HTMLInputElement>(null);
    const help = useId();
    const operation = choices.find((candidate) => candidate.id === state.operation) ?? choices[0]!;
    const draft = state.drafts[operation.id] ?? {};
    const comparison = state.comparison ?? noComparison;
    const labels: Readonly<Record<string, string>> = messages.finance.labels;
    const operationLabels: Readonly<Record<string, string>> = messages.finance.operations;
    function label(key: string): string {
      const term = key === 'price' ? (id === 'loans' ? 'price_loan' : 'price_result') : key;
      if (Object.hasOwn(labels, term)) return labels[term]!;
      if (Object.hasOwn(operationLabels, key)) return operationLabels[key]!;
      if (key.endsWith('_exact') && Object.hasOwn(labels, 'exact_value')) {
        return labels.exact_value!.replace('{field}', label(key.slice(0, -6)));
      }
      return /^[a-z][a-z0-9_]*$/u.test(key) ? key.replaceAll('_', ' ') : key;
    }
    const title = messages.finance.modules[id].title;
    const errors: Readonly<Record<string, string>> = {
      invalid_input: label('invalid_input'), domain: label('domain'), limit: messages.processingLimit,
      unsupported: label('unsupported'), no_convergence: messages.tools.convergence,
      timed_out: messages.engineTimeout, cancelled: messages.engineCancelled, queue_full: messages.engineBusy,
      deferred: messages.engineBusy, engine_unavailable: messages.tools.engineUnavailable,
    };

    function commit(next: FinanceState) {
      retained = next;
      setState(next);
    }

    function cancel() {
      running.current?.abort();
      running.current = undefined;
      setPending(false);
    }
    useEffect(() => () => running.current?.abort(), []);

    function edit(next: Partial<FinanceState>) {
      cancel();
      setNotice(undefined);
      commit({ ...state, ...next, proof: undefined });
    }

    function editDraft(next: Draft) {
      edit({ drafts: { ...state.drafts, [operation.id]: next } });
    }

    function changed(previous: Cell | undefined, text: string, fixed: boolean): Cell {
      return { text, locale: !fixed && text.trim() && previous?.text.trim() ? previous.locale : locale };
    }

    function showField(field: Field, cell: Cell | undefined, update: (text: string) => void, key: string) {
      const fixed = field.kind === 'choice' || field.kind === 'text';
      const same = !cell?.text.trim() || cell.locale === locale || fixed || field.kind === 'date';
      return <label className="finance-field" key={key}>
        <span>{label(field.key)}{field.optional && <small> · {label('optional')}</small>}</span>
        {field.kind === 'choice' ? <select value={cell?.text ?? (field.optional ? '' : field.choices?.[0])}
          data-field={key} onChange={(event) => update(event.currentTarget.value)}>
          {field.optional && <option value="">{label('default')}</option>}
          {field.choices?.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select> : <input type="text" dir="ltr" data-field={key} value={cell?.text ?? ''}
          inputMode={field.kind === 'decimal' ? 'decimal' : field.kind === 'integer' ? 'numeric' : 'text'}
          maxLength={field.kind === 'text' ? 256 : 40} spellCheck={false} autoComplete="off" autoCapitalize="off"
          placeholder={field.kind === 'date' ? 'YYYY-MM-DD' : undefined} aria-describedby={help}
          onChange={(event) => update(event.currentTarget.value)} />}
        {!same && cell && <small className="finance-notation">{messages.inputNotation.retained
          .replace('{language}', LOCALES[cell.locale].name).replace('{decimal}', localizedDecimal(cell.locale))}</small>}
      </label>;
    }

    function showRows(field: Field, rows: Cell[][]) {
      const columns = field.columns ?? [];
      const save = (entries: Cell[][]) => editDraft({ ...draft, [field.key]: entries });
      function move(index: number, direction: -1 | 1) {
        const target = index + direction;
        const next = rows.slice();
        const item = next[index];
        const neighbor = next[target];
        if (!item || !neighbor) return;
        next[index] = neighbor;
        next[target] = item;
        save(next);
      }
      return <fieldset className="finance-rows" key={field.key}>
        <legend>{label(field.key)}</legend>
        {rows.map((row, index) => <div className="finance-row" key={index}>
          {columns.map((column, columnIndex) => showField(column, row[columnIndex], (text) => {
            const next = row.slice();
            next[columnIndex] = changed(row[columnIndex], text, column.kind === 'choice' || column.kind === 'text');
            save(rows.map((item, rowIndex) => index === rowIndex ? next : item));
          }, `${field.key}.${index}.${column.key}`))}
          <div className="finance-actions">
            <button type="button" disabled={index === 0} aria-label={label('move_up')}
              onClick={() => move(index, -1)}>↑</button>
            <button type="button" disabled={index + 1 === rows.length} aria-label={label('move_down')}
              onClick={() => move(index, 1)}>↓</button>
            <button type="button" aria-label={label('remove_row')}
              onClick={() => save(rows.filter((_, rowIndex) => index !== rowIndex))}>×</button>
          </div>
        </div>)}
        <button type="button" disabled={rows.length >= (field.key === 'flows' ? 40 : 60)}
          onClick={() => save([...rows, columns.map(() => ({ text: '', locale }))])}>
          {label('add_row')}
        </button>
      </fieldset>;
    }

    async function run(work: (controller: AbortController) => Promise<void>) {
      if (running.current) return;
      const controller = new AbortController();
      running.current = controller;
      setPending(true);
      setNotice(undefined);
      try {
        await work(controller);
      } catch (error) {
        if (current(controller)) setNotice(error instanceof Error ? error.message : 'invalid_input');
      } finally {
        if (current(controller)) {
          running.current = undefined;
          setPending(false);
        }
      }
    }

    function current(controller: AbortController) {
      return !scope.signal.aborted && running.current === controller;
    }

    async function submit(request: ToolRequest, controller: AbortController) {
      const reply = await runtime.submit(request, controller.signal);
      if (!current(controller)) return;
      if (reply.status !== 'completed') throw new Error(reply.status);
      if (!reply.value.ok) throw new Error(reply.value.code);
      return reply.value.proof;
    }

    function calculate() {
      void run(async (controller) => {
        const inputs = canonicalDraft(operation, draft);
        if (Object.values(inputs).some((value) => byteLength.encode(value).length > 4096)) throw new Error('limit');
        const start = performance.now();
        const proof = await submit({ schema: 1, module: id, operation: operation.id, ...inputs,
          options: { currency: state.currency, rounding: state.rounding } }, controller);
        if (proof) {
          recordInteraction(performance.now() - start);
          commit({ ...state, proof });
        }
      });
    }

    function saveScenario(proof: CalculationProof) {
      if (state.scenarios.length === maxScenarios) return;
      commit({ ...state, scenarios: [...state.scenarios, { id: state.next, proof }], next: state.next + 1 });
    }

    const baseline = state.scenarios.find((scenario) => scenario.id === comparison.reference);
    const candidate = state.scenarios.find((scenario) => scenario.id === comparison.alternative);
    const comparable = baseline && candidate && baseline.id !== candidate.id;

    async function inspectComparison(left: Saved, right: Saved, controller: AbortController, metric?: string) {
      const proof = await submit(comparisonRequest(id, left, right, metric), controller);
      if (!proof) return;
      const result = readComparison(proof, metric);
      return { reference: left.id, alternative: right.id, result, proof: result.selected ? proof : undefined };
    }

    async function importScenario(imported: File) {
      await run(async (controller) => {
        if (state.scenarios.length === maxScenarios || imported.size > MAX_SCENARIO_BYTES) throw new Error('limit');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(await imported.arrayBuffer());
        let document: unknown;
        try { document = JSON.parse(text); } catch { throw new Error('invalid_input'); }
        if (!isObject(document) || (document.schema !== 1 && document.schema !== 2) || !Array.isArray(document.requests) ||
          document.requests.length < 1 || document.requests.length > maxScenarios - state.scenarios.length) {
          throw new Error('invalid_input');
        }
        const checked: Saved[] = [];
        for (const value of document.requests) {
          if (!isObject(value) || value.schema !== 1 || value.module !== id ||
            !choices.some((entry) => entry.id === value.operation) || typeof value.operation !== 'string' ||
            typeof value.input !== 'string' || typeof value.original_input !== 'string' || !isObject(value.options) ||
            typeof value.options.currency !== 'string' || typeof value.options.rounding !== 'string' ||
            !currenciesFor(id).includes(value.options.currency) || !roundings.includes(value.options.rounding) ||
            byteLength.encode(value.input).length > 4096 || byteLength.encode(value.original_input).length > 4096) {
            throw new Error('invalid_input');
          }
          if (!current(controller)) return;
          const proof = await submit({ schema: 1, module: id, operation: value.operation, input: value.input,
            original_input: value.original_input, options: { currency: value.options.currency,
              rounding: value.options.rounding } }, controller);
          if (!proof) return;
          const descriptor = choices.find((entry) => entry.id === proof.operation)!;
          replayDraft(descriptor, proof.expression, proof.normalized);
          checked.push({ id: state.next + checked.length, proof });
        }
        let restored = comparison;
        if (document.comparison !== undefined && document.comparison !== null) {
          const saved = document.comparison;
          if (!isObject(saved) || typeof saved.reference_index !== 'number' || typeof saved.alternative_index !== 'number' ||
            !Number.isSafeInteger(saved.reference_index) || !Number.isSafeInteger(saved.alternative_index) ||
            (saved.metric !== null || document.schema !== 2) &&
              (typeof saved.metric !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(saved.metric))) {
            throw new Error('invalid_input');
          }
          const left = checked[saved.reference_index];
          const right = checked[saved.alternative_index];
          if (!left || !right || left.id === right.id) throw new Error('invalid_input');
          // Imported results and proofs never determine the display. Replay the two requests in Rust.
          const initial = await inspectComparison(left, right, controller);
          if (!initial) return;
          restored = initial;
          if (saved.metric !== null) {
            const items = initial.result.items;
            const item = items.find(({ id }) => id === saved.metric) ??
              (document.schema === 1 ? items.find(({ key }) => key === saved.metric) : undefined);
            if (item) {
              const selected = await inspectComparison(left, right, controller, item.id);
              if (!selected) return;
              restored = selected;
            } else if (document.schema === 2) {
              throw new Error('invalid_input');
            }
          }
        }
        if (current(controller)) commit({
          ...state, scenarios: [...state.scenarios, ...checked], next: state.next + checked.length, comparison: restored,
        });
      });
    }

    function compareMetric(key: string) {
      if (!comparable) return;
      void run(async (controller) => {
        const updated = await inspectComparison(baseline, candidate, controller, key);
        if (updated) commit({ ...state, comparison: updated });
      });
    }

    function selectScenario(value: string, which: 'reference' | 'alternative') {
      cancel();
      setNotice(undefined);
      const selection = { reference: comparison.reference, alternative: comparison.alternative, [which]: Number(value) };
      commit({ ...state, comparison: selection });
      const left = state.scenarios.find(({ id }) => id === selection.reference);
      const right = state.scenarios.find(({ id }) => id === selection.alternative);
      if (left && right && left.id !== right.id) {
        void run(async (controller) => {
          const updated = await inspectComparison(left, right, controller);
          if (updated) commit({ ...state, comparison: updated });
        });
      }
    }

    function exportScenarios() {
      try {
        downloadJson('dars-scenarios.json', {
          schema: 2,
          requests: state.scenarios.map(({ proof }) => storedRequest(proof)),
          comparison: comparable ? {
            reference_index: state.scenarios.indexOf(baseline),
            alternative_index: state.scenarios.indexOf(candidate),
            metric: comparison.result?.selected?.id ?? null,
          } : null,
        }, MAX_SCENARIO_BYTES);
      } catch { setNotice('limit'); }
    }

    function exportComparisonProof() {
      if (!comparison.proof) return;
      try { downloadJson('dars-comparison-proof.json', comparison.proof, MAX_CALCULATION_PROOF_BYTES); }
      catch { setNotice('limit'); }
    }

    return <section className="finance-workspace" aria-label={title} onKeyDown={(event) => {
      if (!event.nativeEvent.isComposing && event.key === 'Escape' && running.current) {
        cancel();
        setNotice('cancelled');
      }
    }}>
      <div className="finance-layout">
        <form className="finance-card" onSubmit={(event) => { event.preventDefault(); calculate(); }}>
          <div className="finance-fields finance-form-settings">
            <label className="finance-field">{label('operation')}
              <select data-testid="finance-operation" value={operation.id}
                onChange={(event) => edit({ operation: event.currentTarget.value })}>
                {choices.map((entry) => <option key={entry.id} value={entry.id}>
                  {id === 'loans' && entry.id === 'price' ? label('price_loan') : operationLabels[entry.id] ?? label(entry.id)}
                </option>)}
              </select>
            </label>
            <label className="finance-field">{label('currency')}
              <select value={state.currency} disabled={id === 'tax'} onChange={(event) => edit({ currency: event.currentTarget.value })}>
                {currenciesFor(id).map((code) => <option key={code}>{code}</option>)}
              </select>
            </label>
            <label className="finance-field">{label('rounding')}
              <select value={state.rounding} disabled={id === 'tax'} onChange={(event) => edit({ rounding: event.currentTarget.value })}>
                {roundings.map((key) => <option key={key} value={key}>{label(key)}</option>)}
              </select>
            </label>
          </div>
          <p className="finance-guidance" id={help}>{label('input_help')}</p>
          <div className="finance-fields">{operation.fields.filter((field) => field.kind !== 'rows').map((field) => {
            const value = draft[field.key];
            const cell = !Array.isArray(value) ? value : undefined;
            return showField(field, cell, (text) => editDraft({ ...draft, [field.key]: changed(cell, text,
              field.kind === 'choice' || field.kind === 'text') }), field.key);
          })}</div>
          {operation.fields.filter((field) => field.kind === 'rows').map((field) => {
            const value = draft[field.key];
            return showRows(field, Array.isArray(value) ? value : []);
          })}
          <div className="finance-actions">
            <button type="submit" disabled={pending}>{label('calculate')}</button>
            <button type="button" onClick={() => editDraft(exampleDraft(operation, locale))}>{label('example')}</button>
            {pending && <button type="button" onClick={() => { cancel(); setNotice('cancelled'); }}>{label('cancel')}</button>}
          </div>
          {notice && <p role="alert" className="finance-notice">{errors[notice] ?? label('invalid_input')}</p>}
        </form>
        <div className="finance-card finance-output" data-testid="finance-result" aria-live="polite" aria-busy={pending}>
          <h2>{label('result')}</h2>
          {state.proof ? <>
            <FinanceResult result={readResult(state.proof)} label={label} locale={locale} />
            <div className="finance-actions">
              <button type="button" disabled={pending || state.scenarios.length >= maxScenarios}
                onClick={() => saveScenario(state.proof!)}>{label('save_scenario')}</button>
              <button type="button" onClick={() => downloadJson('dars-finance-result.json', { schema: 1, proof: state.proof })}>
                {label('export_result')}</button>
            </div>
          </> : <p>{label(pending ? 'calculating' : 'empty')}</p>}
          <CalculationProofPanel proof={state.proof} locale={locale}
            localizeText={(field, value) => field === 'operation' || field === 'module' ? (value === id ? title : label(value)) : value} />
        </div>
      </div>
      <details className="finance-card finance-scenarios" data-testid="finance-scenarios">
        <summary>{label('scenario_comparator')}</summary>
        <p>{label('comparison_help')}</p>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(event) => {
          const imported = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (imported) void importScenario(imported);
        }} />
        <div className="finance-actions">
          <button type="button" disabled={pending || state.scenarios.length >= maxScenarios}
            onClick={() => file.current?.click()}>{label('open_scenarios')}</button>
          <button type="button" disabled={pending || !state.scenarios.length}
            onClick={exportScenarios}>{label('export_scenarios')}</button>
        </div>
        <ul className="finance-scenario-list">{state.scenarios.map((scenario) => <li key={scenario.id}>
          <span>{label('scenario')} {scenario.id} · {label(scenario.proof.operation)} · {scenario.proof.units.currency}</span>
          <button type="button" disabled={pending || state.scenarios.length >= maxScenarios}
            onClick={() => saveScenario(scenario.proof)}>{label('duplicate')}</button>
          <button type="button" disabled={pending} onClick={() => {
            const request = storedRequest(scenario.proof);
            try {
              const descriptor = choices.find((entry) => entry.id === request.operation);
              if (!descriptor) throw new TypeError('invalid_input');
              const previous = replayDraft(descriptor, scenario.proof.expression, request.input);
              edit({ operation: request.operation, currency: String(request.options.currency),
                rounding: String(request.options.rounding), drafts: { ...state.drafts, [request.operation]: previous } });
            } catch { setNotice('invalid_input'); }
          }}>{label('edit_scenario')}</button>
          <button type="button" disabled={pending} onClick={() => {
            const reference = comparison.reference === scenario.id ? 0 : comparison.reference;
            const alternative = comparison.alternative === scenario.id ? 0 : comparison.alternative;
            commit({ ...state, scenarios: state.scenarios.filter((entry) => entry.id !== scenario.id),
              comparison: reference === comparison.reference && alternative === comparison.alternative
                ? comparison : { reference, alternative } });
          }}>{label('remove_row')}</button>
        </li>)}</ul>
        {state.scenarios.length > 1 && <div className="finance-fields">
          {(['reference', 'alternative'] as const).map((key) => <label className="finance-field" key={key}>{label(key)}
            <select value={comparison[key]}
              onChange={(event) => selectScenario(event.currentTarget.value, key)}>
              <option value={0}>{label('choose_scenario')}</option>
              {state.scenarios.map((entry) => <option value={entry.id} key={entry.id}>{label('scenario')} {entry.id}</option>)}
            </select>
          </label>)}
        </div>}
        {comparable && comparison.result && <ScenarioResults result={comparison.result}
          firstInputs={baseline.proof.normalized} secondInputs={candidate.proof.normalized}
          label={label} locale={locale} pending={pending} compare={compareMetric} proof={comparison.proof}
          exportProof={exportComparisonProof} />}
        {comparable && !comparison.result && !pending && <div className="finance-actions">
          <button type="button" onClick={() => selectScenario(String(comparison.reference), 'reference')}>
            {label('compare_scenarios')}
          </button>
        </div>}
        {!comparable && baseline && candidate && <p>{label('incompatible_scenarios')}</p>}
      </details>
    </section>;
  }

  return { Workspace, snapshot: () => retained, dispose: runtime.dispose, setPolicy: runtime.setPolicy, getResources: runtime.getResources };
}
