import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import type { AdaptivePolicy } from './adaptive';
import { CalculationProofPanel } from './calculation-proof-panel';
import { withExpressionLocale } from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import InputNotation from './input-notation';
import { LOCALES } from './i18n';
import type { Locale, Messages } from './i18n';
import { editLocalizedDraft, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import type { ModuleProgress } from './module-work';
import { exampleField, fieldId, scienceOperations, scienceRequest, visibleFields } from './science-forms';
import type { Draft, Field, Operation } from './science-forms';
import type { CalculationScienceModule } from './science-modules';
import { activateTool } from './tool-runtime';
import './science-workspace.css';

const ScienceChart = lazy(() => import('./science-visual'));
const writers = {
  statistics: () => new Worker(new URL('./tool-statistics-worker.ts', import.meta.url), { type: 'module' }),
  probability: () => new Worker(new URL('./tool-probability-worker.ts', import.meta.url), { type: 'module' }),
  simulation: () => new Worker(new URL('./tool-simulation-worker.ts', import.meta.url), { type: 'module' }),
  optimization: () => new Worker(new URL('./tool-optimization-worker.ts', import.meta.url), { type: 'module' }),
  'physics-engineering': () => new Worker(new URL('./tool-physics-engineering-worker.ts', import.meta.url), { type: 'module' }),
  'graph-lab': () => new Worker(new URL('./tool-graph-lab-worker.ts', import.meta.url), { type: 'module' }),
};
const multiline = new Set(['formulas', 'series', 'matrix', 'constraints']);
const numeric = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?(?:\/[+-]?[0-9]+)?$/iu;
const chartKeys = new Set(['series', 'grid', 'plot', 'histogram']);
const inputBytes = 4096;
const encoder = new TextEncoder();
const empty: Draft = {};
const sharedLabels = new Set([
  'assumptions', 'contribution', 'currency', 'example', 'false', 'negative',
  'operation', 'period', 'positive', 'roots', 'sensitivity', 'status', 'table', 'true', 'unit',
]);
const parameterLabels: Readonly<Record<string, string>> = {
  'parameters.population': 'population_size',
  'parameters.rate': 'rate_parameter',
};
const fieldLabels: Partial<Record<CalculationScienceModule, Readonly<Record<string, string>>>> = {
  statistics: { table: 'contingency_table' },
  probability: { probability: 'quantile_probability' },
  simulation: { start: 'starting_value', initial: 'initial_wealth' },
  optimization: { initial: 'initial_estimate' },
  'physics-engineering': { mass: 'mass_quantity', amount: 'amount_of_substance' },
};
type RecordData = Record<string, unknown>;
type FramePolicy = Pick<AdaptivePolicy, 'graphicsFrameIntervalMs'>;

export type ScienceState = {
  operation: string;
  drafts: Record<string, Draft>;
  proof?: CalculationProof;
};

export function scienceLabel(messages: Messages, key: string) {
  const labels: Readonly<Record<string, string>> = messages.science.labels;
  const finance: Readonly<Record<string, string>> = messages.finance.labels;
  if (Object.hasOwn(labels, key)) return labels[key]!;
  if (sharedLabels.has(key) && Object.hasOwn(finance, key)) return finance[key]!;
  return key.replaceAll('_', ' ');
}

function makeDraft(module: CalculationScienceModule, operation: Operation, locale: Locale, previous: Draft = empty) {
  const initial = Object.fromEntries(operation.fields.map((entry) => [fieldId(entry), exampleField(entry, locale)]));
  return Object.fromEntries(visibleFields(module, operation, { ...initial, ...previous })
    .map((entry) => [fieldId(entry), previous[fieldId(entry)] ?? exampleField(entry, locale)]));
}

function isObject(value: unknown): value is RecordData {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function Value({ value, label, present, field, level = 0 }: {
  value: unknown; label(key: string): string; present(value: string): string; field?: string; level?: number;
}) {
  if (value === null || value === undefined) return <span aria-label={label('unavailable')}>—</span>;
  if (typeof value === 'boolean') {
    return label(field === 'population' ? value ? 'population_values' : 'sample_values' : String(value));
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const text = String(value);
    return <bdi>{numeric.test(text) ? present(text) : /^[a-z][a-z0-9_]*$/u.test(text) ? label(text) : text}</bdi>;
  }
  if (level >= 5) return <code>{JSON.stringify(value)}</code>;
  if (Array.isArray(value)) {
    if (!value.length) return <span aria-label={label('unavailable')}>—</span>;
    const sample = value.slice(0, 24);
    if (sample.every(isObject)) {
      const headings = [...new Set(sample.flatMap(Object.keys))];
      return <div className="science-scroll" tabIndex={0} aria-label={label('table')}>
        <table><thead><tr>{headings.map((key) => <th key={key} scope="col" data-science-reading={key}>{label(key)}</th>)}</tr></thead>
          <tbody>{sample.map((row, index) => <tr key={index}>{headings.map((key) =>
            <td key={key}><Value value={row[key]} label={label} present={present} field={key} level={level + 1} /></td>)}</tr>)}</tbody>
        </table>
        {value.length > sample.length && <p>{label('partial_preview').replace('{count}', present(String(value.length)))}</p>}
      </div>;
    }
    return <ol>{sample.map((item, index) => <li key={index}>
      <Value value={item} label={label} present={present} field={field} level={level + 1} />
    </li>)}{value.length > sample.length && <li>{label('partial_preview').replace('{count}', present(String(value.length)))}</li>}</ol>;
  }
  if (isObject(value)) {
    if (typeof value.value === 'string' && typeof value.unit === 'string') {
      return <span><bdi>{present(value.value)}</bdi>{' '}<bdi>{value.unit}</bdi></span>;
    }
    return <dl className="science-readings">
      {Object.entries(value).map(([key, item]) => {
        const labelKey = key === 'level' && field === 'confidence_interval' ? 'confidence_level'
          : key === 'level' && field === 'loss_risk' ? 'risk_level' : key;
        return <div key={key}>
          <dt data-science-reading={key}>{label(labelKey)}</dt>
          <dd><Value value={item} label={label} present={present} field={key} level={level + 1} /></dd>
        </div>;
      })}
    </dl>;
  }
  return null;
}

function summarize(result: RecordData) {
  return Object.fromEntries(Object.entries(result).filter(([key]) => !chartKeys.has(key)));
}

export function activateScience(module: CalculationScienceModule, scope: ModuleActivation<ScienceState>): PrimaryModule<ScienceState> {
  const runtime = activateTool(scope, writers[module]);
  const operations = scienceOperations[module];
  let retained = scope.previousState;
  let graphicsInterval: number | null = null;
  const subscribers = new Set<() => void>();
  function subscribe(listener: () => void) {
    subscribers.add(listener);
    return () => { subscribers.delete(listener); };
  }
  const snapshot = () => graphicsInterval;

  function Workspace({ locale, messages, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState<ScienceState>(() => retained ?? {
      operation: operations[0]!.id,
      drafts: { [operations[0]!.id]: makeDraft(module, operations[0]!, locale) },
    });
    const [progress, setProgress] = useState<ModuleProgress>();
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const controller = useRef<AbortController>(undefined);
    const id = useId();
    const label = (key: string) => scienceLabel(messages, key);
    const resultLabel = (key: string) => label(module === 'probability' && key === 'density' ? 'density_probability' : key);
    const present = numberPresentation(LOCALES[locale].format).format;
    const interval = useSyncExternalStore(subscribe, snapshot);
    const framePolicy: FramePolicy = useMemo(() => ({ graphicsFrameIntervalMs: interval }), [interval]);
    const selected = operations.find(({ id }) => id === state.operation) ?? operations[0]!;
    const draft = state.drafts[selected.id] ?? empty;
    const entries = visibleFields(module, selected, draft);
    const origins = [...new Set(entries.flatMap((entry) => {
      const cell = draft[fieldId(entry)];
      return cell?.text.trim() && !['choice', 'boolean', 'text'].includes(entry.kind) ? [cell.locale] : [];
    }))];
    const canSubmit = entries.every((entry) => entry.optional || Boolean(draft[fieldId(entry)]?.text.trim()));
    const proof = state.proof;
    const result = useMemo(() => {
      if (!proof) return null;
      try {
        const value: unknown = JSON.parse(proof.result);
        return isObject(value) ? value : null;
      } catch { return null; }
    }, [proof]);
    const description = messages.science.modules[module];
    const options = [...new Set(operations.map(({ group }) => group))];
    const errorText: Readonly<Record<string, string>> = {
      domain: messages.science.labels.invalid_domain,
      invalid_input: messages.science.labels.invalid_input,
      limit: messages.processingLimit,
      unsupported: messages.tools.unsupported,
      no_convergence: messages.tools.convergence,
      timed_out: messages.engineTimeout,
      cancelled: messages.engineCancelled,
      queue_full: messages.engineBusy,
      deferred: messages.engineBusy,
    };

    function stop() {
      const active = controller.current;
      controller.current = undefined;
      active?.abort();
    }

    useEffect(() => {
      retained ??= state;
      return stop;
    }, []);

    function commit(next: ScienceState) {
      retained = next;
      setState(next);
    }

    function change(next: ScienceState) {
      stop();
      setPending(false);
      setProgress(undefined);
      setNotice(undefined);
      commit({ ...next, proof: undefined });
    }

    function choose(operation: Operation) {
      change({ ...state, operation: operation.id, drafts: { ...state.drafts,
        [operation.id]: state.drafts[operation.id] ?? makeDraft(module, operation, locale),
      } });
    }

    function edit(entry: Field, text: string) {
      if (encoder.encode(text).byteLength > inputBytes) {
        setNotice('limit');
        return;
      }
      const key = fieldId(entry);
      let next = { ...draft, [key]: editLocalizedDraft(draft[key], text, locale) };
      if (key === 'distribution' || key === 'model') next = makeDraft(module, selected, locale, next);
      change({ ...state, drafts: { ...state.drafts, [selected.id]: next } });
    }

    async function calculate(event?: FormEvent) {
      event?.preventDefault();
      if (!canSubmit || controller.current) return;
      let request;
      try { request = scienceRequest(module, selected, entries, draft); }
      catch {
        setNotice('invalid_input');
        return;
      }
      if ([request.input, request.original_input].some((text) => encoder.encode(text).byteLength > inputBytes)) {
        setNotice('limit');
        return;
      }
      const { origin, ...values } = request;
      const active = new AbortController();
      controller.current = active;
      setPending(true);
      setNotice(undefined);
      setProgress(undefined);
      commit({ ...state, proof: undefined });
      const began = performance.now();
      const batch = module === 'simulation';
      const reply = await runtime.submit({ schema: 1, module, operation: selected.id, ...values },
        active.signal, batch ? 45_000 : 20_000, batch ? 'batch' : 'scientific',
        batch ? { update: (value) => { if (controller.current === active) setProgress(value); }, watchdogMs: 12_000 } : undefined);
      if (scope.signal.aborted || active !== controller.current) return;
      controller.current = undefined;
      setPending(false);
      if (reply.status !== 'completed') {
        setNotice(reply.status);
      } else if (reply.value.ok === false) {
        setNotice(reply.value.code);
      } else {
        recordInteraction(performance.now() - began);
        commit({ ...state, proof: origin ? withExpressionLocale(reply.value.proof, origin) : reply.value.proof });
      }
    }

    function cancel() {
      stop();
      setPending(false);
      setProgress(undefined);
      setNotice('cancelled');
    }

    function replaceDraft(next: Draft) {
      change({ ...state, drafts: { ...state.drafts, [selected.id]: next } });
    }

    function renderField(entry: Field) {
      const key = fieldId(entry);
      const value = draft[key]?.text ?? '';
      const props = {
        'data-science-field': key,
        'aria-describedby': origins.some((origin) => origin !== locale) ? id + '-notation' : undefined,
      };
      const entryLabel = label(parameterLabels[key] ?? fieldLabels[module]?.[entry.key] ?? entry.key);
      const caption = entry.place === 'units' ? entryLabel + ' · ' + label('unit') : entryLabel;
      return <label key={key} className={multiline.has(entry.kind) ? 'science-wide' : undefined}>
        <span>{caption}</span>
        {entry.kind === 'choice' ? <select {...props} value={value}
          onChange={(event) => edit(entry, event.currentTarget.value)}>
          {entry.optional && <option value="">{label('default_value')}</option>}
          {entry.choices?.map((choice) => <option key={choice} value={choice}>
            {label(entry.key === 'population' ? choice === 'true' ? 'population_values' : 'sample_values' : choice)}
          </option>)}
        </select> : entry.kind === 'boolean' ? <input {...props} type="checkbox" checked={value === 'true'}
          onChange={(event) => edit(entry, String(event.currentTarget.checked))} /> :
          multiline.has(entry.kind) ? <textarea {...props} value={value} dir="ltr" rows={3} spellCheck={false}
            onChange={(event) => edit(entry, event.currentTarget.value)} /> :
            <input {...props} value={value} dir="ltr" spellCheck={false} autoComplete="off"
              inputMode={entry.kind === 'decimal' ? 'decimal' : entry.kind === 'integer' ? 'numeric' : undefined}
              onChange={(event) => edit(entry, event.currentTarget.value)} />}
      </label>;
    }

    const showChart = result && (module === 'graph-lab' || Boolean(result.plot || result.histogram));
    return <section className="science-workspace" aria-label={description.title} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && controller.current) cancel();
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void calculate(); }
    }}>
      <section className="science-region science-input" aria-label={label('workspace_inputs')}>
        <form onSubmit={(event) => void calculate(event)}>
          <label className="science-operation"><span>{label('operation')}</span>
            <select data-testid="science-operation" value={selected.id} onChange={(event) => {
              const next = operations.find(({ id }) => id === event.currentTarget.value);
              if (next) choose(next);
            }}>
              {options.map((group) => {
                const children = operations.filter((operation) => operation.group === group)
                  .map(({ id }) => <option key={id} value={id}>{label(id)}</option>);
                return group ? <optgroup key={group} label={label(group)}>{children}</optgroup> : children;
              })}
            </select>
          </label>
          <p className="science-hint">{label('hint_' + module)} {entries.some((entry) => multiline.has(entry.kind)) && label('list_format')}</p>
          <div className="science-fields">{entries.filter((entry) => !entry.advanced).map(renderField)}</div>
          {entries.some((entry) => entry.advanced) && <details className="science-advanced">
            <summary>{label('advanced_parameters')}</summary>
            <div className="science-fields">{entries.filter((entry) => entry.advanced).map(renderField)}</div>
          </details>}
          <InputNotation origin={origins} locale={locale} messages={messages} id={id + '-notation'} />
          <div className="science-actions">
            <button className="science-primary" type="submit" disabled={pending || !canSubmit} data-testid="science-run">{messages.calculate}</button>
            {pending && <button type="button" className="quiet-action" data-testid="science-cancel"
              onClick={cancel}>{messages.cancelCalculation}</button>}
            <button type="button" className="quiet-action" onClick={() => replaceDraft(makeDraft(module, selected, locale))}
              data-testid="science-example">{label('example')}</button>
            <button type="button" className="quiet-action" onClick={() => replaceDraft(empty)}>{messages.clear}</button>
          </div>
          <p role="status" className="science-notice" data-testid="science-status">
            {pending ? progress ? label('task_progress').replace('{done}', present(String(progress.completed)))
              .replace('{total}', present(String(progress.total))) : messages.working
              : notice ? errorText[notice] ?? messages.tools.engineUnavailable : ''}
          </p>
          {pending && progress && <progress className="science-progress" max={progress.total}
            value={progress.completed} aria-label={label('samples')} />}
        </form>
      </section>
      <section className="science-region science-output" aria-labelledby={id + '-result'}>
        <header><h2 id={id + '-result'}>{messages.result}</h2>
          {proof && <span>{proof.exactness === 'exact' ? messages.exact : label(proof.exactness)}</span>}
        </header>
        {showChart && result && <Suspense fallback={<p>{messages.working}</p>}>
          <ScienceChart scope={scope} policy={framePolicy} result={result} locale={locale}
            label={label} title={description.title} />
        </Suspense>}
        <div data-testid="science-result" data-canonical={proof?.result} aria-busy={pending}>
          {result ? <Value value={isObject(result.values) && module === 'physics-engineering' ? result.values : summarize(result)}
            label={resultLabel} present={present} /> : <p className="science-reading-empty">{label('result_prompt')}</p>}
        </div>
        {proof && <CalculationProofPanel proof={proof} locale={locale}
          localizeText={(field, text) => field === 'operation' ? label(text) : text} />}
      </section>
    </section>;
  }

  return {
    Workspace,
    snapshot: () => retained ?? { operation: operations[0]!.id, drafts: {} },
    dispose: runtime.dispose,
    getResources: runtime.getResources,
    setPolicy(policy) {
      runtime.setPolicy(policy);
      if (graphicsInterval === policy.graphicsFrameIntervalMs) return;
      graphicsInterval = policy.graphicsFrameIntervalMs;
      subscribers.forEach((listener) => listener());
    },
  };
}
