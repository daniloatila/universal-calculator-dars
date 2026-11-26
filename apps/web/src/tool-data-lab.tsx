import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import { MAX_CALCULATION_PROOF_BYTES, serializeCalculationProof, withExpressionLocale } from './calculation-proof';
import {
  BASIC_DATA_LAB_BUDGET, DATA_LAB_PAGE_SIZE, DATA_LAB_SEMANTICS, MAX_DATA_LAB_FILE_BYTES,
  MIN_DATA_LAB_BUDGET, dataLabKinds, decodeDataLabOutput, decodeDataLabRecipe, decodeDataLabReply,
  defaultDataLabOptions, serializeDataLabRecipe, validDataLabBudget, validateDataLabInput,
} from './data-lab-contract';
import type { Cell, Column, Configuration, DataJob, Format, FormatOptions, Kind, Output, Recipe } from './data-lab-contract';
import { dataLabels } from './data-lab-labels';
import { LOCALES, type Locale } from './i18n';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { createModuleWork } from './module-work';
import './tool-data-lab.css';

const example = 'id,value\nA,1.25\nB,2.50\n';
const actions = ['sort', 'deduplicate', 'drop_missing', 'trim', 'multiply', 'filter'] as const;
type Action = (typeof actions)[number];
export type DataLabState = { options: FormatOptions; steps: string; origin?: Locale; example?: boolean };
type Replay = { mode: 'historical' | 'exact' | 'migration'; recipe: Recipe };
type Inspection = { cell: Cell; column: Column; row: number; button: HTMLButtonElement };

function save(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
function nextStep(action: Action, column: string, value: string) {
  switch (action) {
    case 'sort':
      return { op: action, column };
    case 'deduplicate':
      return { op: action, columns: [column] };
    case 'drop_missing':
      return { op: action, column };
    case 'trim':
      return { op: 'text', column, transform: 'trim', name: column + '_trim' };
    case 'multiply':
      return {
        op: 'calculate',
        left: { column },
        operator: 'multiply',
        right: { constant: '2' },
        name: column + '_x2',
      };
    case 'filter':
      return { op: action, column, compare: 'eq', value };
  }
}
function sourceFormat(filename: string): Format {
  const suffix = filename.toLowerCase().split('.').pop();
  return suffix === 'xlsx' || suffix === 'tsv' || suffix === 'json' ? suffix : 'csv';
}
export function activate(scope: ModuleActivation<DataLabState>): PrimaryModule<DataLabState> {
  const work = createModuleWork(scope.signal, { pendingJobs: 1 });
  let retained = scope.previousState ?? { options: defaultDataLabOptions, steps: '[]' };
  let budget = BASIC_DATA_LAB_BUDGET;
  let running: { budget: number; abort: AbortController } | undefined;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const l = dataLabels[locale];
    const ceiling = useSyncExternalStore(subscribe, () => budget);
    const [draft, setDraft] = useState<DataLabState>(retained);
    const [file, setFile] = useState<Blob | undefined>(() =>
      retained.example ? new Blob([example]) : undefined,
    );
    const [output, setOutput] = useState<Output>();
    const [committed, setCommitted] = useState<{ draft: DataLabState; budget: number }>();
    const [replay, setReplay] = useState<Replay>();
    const [inspection, setInspection] = useState<Inspection>();
    const [columns, setColumns] = useState<Column[]>([]);
    const [inputs, setInputs] = useState<Column[]>([]);
    const [sheets, setSheets] = useState<string[]>([]);
    const [action, setAction] = useState<Action>('sort');
    const [column, setColumn] = useState('');
    const [operand, setOperand] = useState('');
    const [error, setError] = useState('');
    const [progress, setProgress] = useState<number>();
    const controller = useRef<AbortController | null>(null);
    const revision = useRef(0);
    const filePicker = useRef<HTMLInputElement>(null);
    const inspector = useRef<HTMLElement>(null);
    const { options } = draft;
    const current = committed?.draft === draft;
    const locked = replay?.mode === 'exact' || replay?.mode === 'historical';
    const activeColumn = columns.some((c) => c.name === column) ? column : (columns[0]?.name ?? '');
    function cancel() {
      revision.current++;
      controller.current?.abort();
      controller.current = null;
      setProgress(undefined);
    }
    useEffect(
      () => () => {
        revision.current++;
        controller.current?.abort();
      },
      [],
    );
    useEffect(() => { if (inspection) inspector.current?.focus(); }, [inspection]);
    function edit(changes: Partial<DataLabState>) {
      cancel();
      setError('');
      setInspection(undefined);
      retained = { ...draft, ...changes };
      setDraft(retained);
    }
    function configure(changes: Partial<FormatOptions>) {
      edit({ options: { ...options, ...changes } });
    }
    function choose(f: File | undefined) {
      if (!f) return;
      if (f.size > MAX_DATA_LAB_FILE_BYTES) {
        if (filePicker.current) filePicker.current.value = '';
        setError('limit');
        return;
      }
      setOutput(undefined);
      setCommitted(undefined);
      setSheets([]);
      setColumns([]);
      setInputs([]);
      setFile(f);
      edit({
        example: false,
        origin: replay?.recipe.proof?.expression_locale ?? locale,
        options: replay ? options : { ...options, format: sourceFormat(f.name), sheet: undefined },
      });
    }
    function loadExample() {
      setReplay(undefined);
      setOutput(undefined);
      setCommitted(undefined);
      edit({
        example: true,
        options: { ...defaultDataLabOptions, resource_budget_bytes: BASIC_DATA_LAB_BUDGET,
          types: { value: 'decimal' }, analysis: { x: 'value' } },
        steps: '[]',
        origin: locale,
      });
      if (filePicker.current) filePicker.current.value = '';
      setFile(new Blob([example]));
      setColumns([]);
      setInputs([]);
      setSheets([]);
    }
    function settings(): Configuration {
      const steps: unknown = JSON.parse(draft.steps);
      if (!Array.isArray(steps) || steps.length > 32) throw new Error('invalid_input');
      const configured = options.resource_budget_bytes;
      if (configured != null && !validDataLabBudget(configured)) throw new Error('invalid_input');
      return { ...options, steps, semantics_version: DATA_LAB_SEMANTICS };
    }
    async function run(offset = 0, exportMode?: 'protected' | 'literal') {
      if (!file || controller.current || replay?.mode === 'historical') return;
      const now = performance.now();
      const generation = ++revision.current;
      const abort = new AbortController();
      controller.current = abort;
      setError('');
      setProgress(0);
      try {
        const configuration = settings();
        const appliedBudget = configuration.resource_budget_bytes ?? (current ? committed.budget : budget);
        if (appliedBudget > budget) throw new Error('resource_budget');
        const request: DataJob = {
          file, offset, exportMode, budget: appliedBudget,
          settings: JSON.stringify({ ...configuration, resource_budget_bytes: appliedBudget }),
          descriptor: replay?.mode === 'exact' ? replay.recipe.proof?.expression : undefined,
          expectedSha256: replay?.recipe.sha256,
        };
        validateDataLabInput(file.size, request.settings, appliedBudget, request.descriptor);
        running = { budget: appliedBudget, abort };
        const r = await work.submit(
          {
            request,
            createWorker() {
              const worker = new Worker(new URL('./data-lab-worker.ts', import.meta.url), { type: 'module' });
              worker.terminate = scope.resources.own('worker', worker.terminate.bind(worker));
              return worker;
            },
            decode: decodeDataLabReply,
            progress: {
              update(v) {
                if (generation === revision.current) setProgress(v.completed);
              },
              watchdogMs: 25000,
            },
          },
          { kind: 'import', signal: abort.signal, timeoutMs: 45000 },
        );
        if (generation !== revision.current || scope.signal.aborted) return;
        if (r.status !== 'completed') {
          setError(abort.signal.reason === 'resource_budget' ? 'resource_budget' : r.status);
          return;
        }
        if (!r.value.ok) {
          setError(r.value.code);
          return;
        }
        const result = decodeDataLabOutput(r.value);
        if (replay?.recipe.sha256 && result.profile.sha256 !== replay.recipe.sha256) {
          setError('source_mismatch');
          return;
        }
        if (replay?.mode === 'exact' && replay.recipe.proof?.result !== undefined &&
            replay.recipe.proof.result !== result.proof.result) {
          setError('proof_mismatch');
          return;
        }
        result.proof = withExpressionLocale(result.proof, draft.origin ?? locale);
        setOutput(result);
        setCommitted({ draft, budget: appliedBudget });
        setInspection(undefined);
        setColumns(result.page.columns);
        setInputs(result.page.source_columns);
        setSheets(result.page.sheets);
        if (r.value.csv) save('dars-data.csv', r.value.csv, 'text/csv;charset=utf-8');
      } catch (cause) {
        if (generation === revision.current) {
          const code = cause instanceof Error ? cause.message : '';
          setError(code === 'resource_budget' || code === 'limit' ? code : 'invalid_input');
        }
      } finally {
        if (running?.abort === abort) running = undefined;
        if (generation === revision.current) {
          controller.current = null;
          setProgress(undefined);
          recordInteraction(performance.now() - now);
        }
      }
    }
    function applyRecipe(recipe: Recipe, mode?: 'exact' | 'migration') {
      const { steps, semantics_version: _, ...imported } = recipe.configuration;
      const origin = recipe.proof?.expression_locale ?? draft.origin ?? locale;
      setReplay(mode ? { mode, recipe } : undefined);
      edit({ options: imported, steps: JSON.stringify(steps, null, 2), origin });
    }
    async function loadPipeline(f: File | undefined) {
      if (!f) return;
      cancel();
      const generation = revision.current;
      try {
        if (f.size > MAX_CALCULATION_PROOF_BYTES) throw new Error('limit');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(await f.arrayBuffer());
        if (generation !== revision.current || scope.signal.aborted) return;
        const recipe = decodeDataLabRecipe(text);
        if (!recipe) throw new Error('invalid_input');
        if (recipe.version === 1) {
          setError('');
          setReplay({ mode: 'historical', recipe });
          return;
        }
        applyRecipe(recipe, recipe.sha256 ? 'exact' : undefined);
      } catch (cause) {
        if (generation === revision.current) setError(cause instanceof Error && cause.message === 'limit' ? 'limit' : 'invalid_input');
      }
    }
    const notation = new Intl.NumberFormat(LOCALES[locale].format, { useGrouping: false });
    const number = (n: number) => notation.format(n);
    const exact = (value: string) =>
      value
        .split('/')
        .map((part) => (/^-?\d+$/u.test(part) ? notation.format(BigInt(part)) : part))
        .join('/');
    const cellLabels: Record<string, string> = {
      invalid_input: m.invalidExpression,
      domain: m.domainError,
      limit: m.processingLimit,
      unsupported: m.tools.unsupported,
      timed_out: m.engineTimeout,
      cancelled: m.engineCancelled,
      queue_full: m.engineBusy,
      resource_budget: l.resourceExceeded,
      source_mismatch: l.sourceMismatch,
      proof_mismatch: l.proofMismatch,
    };
    const result = output?.page;
    const analysis = output?.profile.analysis;
    const typeLabel = (kind: Kind) => l[kind === 'decimal' ? 'decimalType' : kind];
    const sourceLabel = (value: Cell['source_type']) => ({
      text: l.text, number: l.nativeNumber, boolean: l.boolean, date: l.date, error: l.error,
      empty: l.empty, null: l.null, absent: l.absent,
    })[value];
    const validityLabel = (value: Cell['validity']) => ({
      valid: l.valid, invalid: l.invalid, empty: l.empty, null: l.null,
      absent: l.absent, uncached: l.formula, error: l.error,
    })[value];
    const notationLabel = (value: Cell['notation']) => ({
      text_point: l.point, text_comma: l.comma, json: l.nativeJson,
      xlsx: l.nativeXlsx, canonical: l.canonicalNotation,
    })[value];
    const originLabel = (value: string) => Object.hasOwn(l, value) ? l[value as keyof typeof l] : value;
    const cellDetails = (view: Inspection) => {
      const {cell} = view;
      const sheet = cell.workbook;
      const date = sheet?.date;
      const cache = sheet?.cache;
      const fields: [string, string | number | null | undefined][] = [
        [l.originalValue, cell.derivation ? undefined : cell.value],
        [l.sourceType, sourceLabel(cell.source_type)],
        [l.sourceOrigin, originLabel(cell.source_origin)],
        [l.requestedType, typeLabel(cell.requested_type ?? view.column.kind)],
        [l.validity, validityLabel(cell.validity)],
        [l.sourceNotation, notationLabel(cell.notation)],
        [l.canonicalValue, cell.canonical ?? '—'],
        [l.xlsxType, sheet?.cell_type],
        [l.rawWorkbook, sheet?.raw_value],
        [l.styleIndex, sheet?.style_index],
        [l.numberFormat, sheet?.number_format_code ?? sheet?.number_format_id],
        [l.formulaContent, cell.formula],
        [l.cacheState, cache && ({ stored: l.cache, empty: l.empty, missing: l.absent, error: l.error })[cache.status]],
        [l.cacheValue, cache?.value],
        [l.dateEpoch, date?.epoch],
        [l.dateRepresentation, date && (date.representation === 'iso' ? l.iso_date : l.serialDate)],
        [l.dateValidity, date && ({ valid: l.valid, invalid: l.invalid, unavailable: l.absent,
          fictitious_1900_leap_day: l.fictitiousDate })[date.status]],
        [l.iso_date, date?.iso],
        [l.operation, cell.derivation && originLabel(cell.derivation.operation)],
        [l.replacedState, cell.derivation?.from_missing && validityLabel(cell.derivation.from_missing)],
      ];
      return (
        <aside className="data-cell-details" tabIndex={-1} ref={inspector} aria-labelledby="data-lab-cell-heading" data-testid="data-lab-cell-details">
          <div className="data-heading">
            <h3 id="data-lab-cell-heading">{l.cellDetails} · <bdi>{view.column.name}</bdi> · {number(view.row)}</h3>
            <button onClick={() => { setInspection(undefined); view.button.focus(); }}>{l.closeDetails}</button>
          </div>
          <dl>{fields.filter(([, value]) => value != null).map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd><bdi>{value === '' ? l.empty : value}</bdi></dd></div>
          ))}</dl>
          {date?.discarded_subnanosecond_precision && <p>{l.datePrecision}</p>}
        </aside>
      );
    };
    const select = (
      name: string,
      value: string,
      onChange: (value: string) => void,
      choices: [string, string][],
      disabled = false,
    ) => (
      <label>
        {name}
        <select disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
          {choices.map(([v, label]) => (
            <option value={v} key={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
    );
    return (
      <section className="data-lab" aria-label={m.science.modules['data-lab'].title}>
        <div className="data-import">
          <label>
            {l.source}
            <input
              type="file"
              accept=".csv,.tsv,.json,.xlsx"
              ref={filePicker}
              data-testid="data-lab-file"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </label>
          <button onClick={loadExample} data-testid="data-lab-example">
            {l.example}
          </button>
          <button
            className="data-run"
            disabled={!file || progress !== undefined || replay?.mode === 'historical'}
            data-testid="data-lab-run"
            onClick={() => void run()}
          >
            {l.apply}
          </button>
          {progress !== undefined && (
            <>
              <progress aria-label={l.staged} value={progress} max={4} />
              <button onClick={() => { cancel(); setError('cancelled'); }}>{m.cancelCalculation}</button>
            </>
          )}
        </div>
        {error && (
          <p role="alert">
            {cellLabels[error] ?? m.tools.engineUnavailable} <code>{error}</code>
          </p>
        )}
        {replay && (
          <div className="data-replay" data-testid="data-lab-replay" data-mode={replay.mode} role="status">
            <p>{replay.mode === 'historical' ? l.historicalOnly : replay.mode === 'migration' ? l.migratedRecipe
              : current ? l.verifiedReplay : l.boundReplay}</p>
            {replay.recipe.sha256 && <p>{l.sourceDigest} <code dir="ltr">{replay.recipe.sha256}</code></p>}
            {replay.mode === 'historical' && (
              <>
                <details>
                  <summary>{l.historicalRecord}</summary>
                  <pre dir="ltr">{replay.recipe.proof?.result ?? JSON.stringify(replay.recipe.configuration.steps, null, 2)}</pre>
                </details>
                <button onClick={() => applyRecipe(replay.recipe, 'migration')}>{l.migrateRecipe}</button>
              </>
            )}
            <button onClick={() => { setReplay(undefined); edit({}); }}>{l.detachRecipe}</button>
          </div>
        )}
        <details>
          <summary>{l.advanced}</summary>
          <fieldset className="data-option-group" disabled={locked}>
            <div className="data-controls">
            {select(
              l.format,
              options.format,
              (v) => configure({ format: v as Format }),
              ['csv', 'tsv', 'json', 'xlsx'].map((v) => [v, v.toUpperCase()]),
            )}
            {select(l.header, options.header, (v) => configure({ header: v as FormatOptions['header'] }), [
              ['present', l.present],
              ['absent', l.absent],
              ['detect', l.detect],
            ])}
            {select(
              l.encoding,
              options.encoding,
              (v) => configure({ encoding: v as FormatOptions['encoding'] }),
              ['utf8', 'latin1', 'utf16le', 'utf16be'].map((v) => [v, v.toUpperCase()]),
            )}
            {select(l.delimiter, options.delimiter ?? '', (v) => configure({ delimiter: v || undefined }), [
              ['', '—'],
              [',', ','],
              [';', ';'],
              ['\t', '⇥'],
              ['|', '|'],
            ])}
            {select(l.decimal, options.decimal, (v) => configure({ decimal: v as FormatOptions['decimal'] }), [
              ['point', l.point],
              ['comma', l.comma],
            ])}
            {sheets.length > 0 &&
              select(
                l.sheet,
                options.sheet ?? sheets[0] ?? '',
                (v) => configure({ sheet: v, types: {}, analysis: undefined }),
                sheets.map((v) => [v, v]),
              )}
              <label>
                {l.resourceBudget}
                <input type="number" min={MIN_DATA_LAB_BUDGET} max={ceiling} step={1} inputMode="numeric"
                  data-testid="data-lab-budget" aria-describedby="data-lab-budget-info"
                  value={options.resource_budget_bytes ?? ''} placeholder={String(ceiling)}
                  onChange={(e) => configure({ resource_budget_bytes: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </label>
              <button onClick={() => configure({ resource_budget_bytes: undefined })}>{l.useProfileBudget}</button>
            </div>
            <small id="data-lab-budget-info">{l.profileBudget} <bdi>{number(ceiling / 2 ** 20)} MiB</bdi></small>
          </fieldset>
          {inputs.length > 0 && (
            <fieldset disabled={locked}>
              <legend>{l.types}</legend>
              <div className="data-controls">
                {inputs.map((c) => (
                  <label key={c.name}>
                    <bdi>{c.name}</bdi>
                    <select
                      value={Object.hasOwn(options.types, c.name) ? options.types[c.name]! : c.kind}
                      onChange={(e) =>
                        configure({ types: { ...options.types, [c.name]: e.target.value as Kind } })
                      }
                    >
                      {dataLabKinds.map((k) => (
                        <option key={k} value={k}>
                          {typeLabel(k)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {select(
                l.analyse,
                options.analysis?.x ?? '',
                (x) => configure({ analysis: x ? { x } : undefined }),
                [
                  ['', l.choose],
                  ...columns
                    .filter((c) =>
                      ['integer', 'decimal'].includes(
                        Object.hasOwn(options.types, c.name) ? options.types[c.name]! : c.kind,
                      ),
                    )
                    .map((c) => [c.name, c.name] as [string, string]),
                ],
              )}
              {options.analysis &&
                select(
                  l.paired,
                  options.analysis.y ?? '',
                  (y) => configure({ analysis: { x: options.analysis!.x, y: y || undefined } }),
                  [
                    ['', '—'],
                    ...columns
                      .filter((c) =>
                        ['integer', 'decimal'].includes(
                          Object.hasOwn(options.types, c.name) ? options.types[c.name]! : c.kind,
                        ),
                      )
                      .map((c) => [c.name, c.name] as [string, string]),
                  ],
                )}
            </fieldset>
          )}
          <fieldset>
            <legend>{l.pipeline}</legend>
            <div className="data-controls">
              {columns.length > 0 && (
                <>
                  {select(
                    l.columns,
                    activeColumn,
                    setColumn,
                    columns.map((c) => [c.name, c.name]),
                    locked,
                  )}
                  {select(
                    l.pipeline,
                    action,
                    (v) => setAction(v as Action),
                    actions.map((a) => [a, l[a]]),
                    locked,
                  )}
                  {action === 'filter' && (
                    <label>
                      =<input value={operand} disabled={locked} onChange={(e) => setOperand(e.target.value)} />
                    </label>
                  )}
                  <button
                    disabled={locked}
                    onClick={() => {
                      try {
                        edit({
                          steps: JSON.stringify(
                            [...settings().steps, nextStep(action, activeColumn, operand)],
                            null,
                            2,
                          ),
                        });
                      } catch {
                        setError('invalid_input');
                      }
                    }}
                  >
                    {l.add}
                  </button>
                </>
              )}
            </div>
            <textarea
              dir="ltr"
              aria-label={l.pipeline}
              maxLength={4096}
              rows={4}
              readOnly={locked}
              value={draft.steps}
              onChange={(e) => edit({ steps: e.target.value })}
            />
            <div className="data-controls">
              <button
                onClick={() => {
                  setReplay(undefined);
                  edit({ options: { ...defaultDataLabOptions, format: options.format }, steps: '[]' });
                }}
              >
                {m.clear}
              </button>
              <button
                disabled={replay?.mode === 'historical'}
                onClick={() => {
                  try {
                    save(
                      'dars-pipeline.json',
                      serializeDataLabRecipe(settings()),
                      'application/json',
                    );
                  } catch (cause) {
                    setError(cause instanceof Error && cause.message === 'limit' ? 'limit' : 'invalid_input');
                  }
                }}
              >
                {l.save}
              </button>
              <label>
                {l.load}
                <input
                  type="file"
                  accept=".json"
                  data-testid="data-lab-recipe-file"
                  onChange={(e) => {
                    void loadPipeline(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </fieldset>
        </details>
        {result && output && (
          <>
            <div className="data-heading">
              <h2>{l.preview}</h2>
              <output data-testid={current ? 'data-lab-result' : 'data-lab-previous-result'} data-canonical={output.proof.result}>
                {!current && <small>{l.previousResult}</small>}
                {number(result.total)} {l.rows} · {number(result.columns.length)} {l.columns}
                {result.workbook_epoch && <small>{l.dateEpoch} <bdi>{result.workbook_epoch}</bdi></small>}
              </output>
            </div>
            <div className="data-scroll">
              <table>
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c.name} scope="col">
                        <bdi>{c.name}</bdi>
                        <small>{typeLabel(c.kind)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>
                          <button className="data-cell" type="button" data-testid="data-lab-cell"
                            data-source-type={c.source_type} data-validity={c.validity} data-canonical={c.canonical ?? undefined}
                            onClick={(event) => setInspection({ cell: c, column: result.columns[j]!,
                              row: result.offset + i + 1, button: event.currentTarget })}>
                            <bdi>{(c.source_type === 'date' && c.requested_type === 'date' ? c.canonical : c.value) || '—'}</bdi>
                            {c.validity !== 'valid' && <small>{validityLabel(c.validity)}</small>}
                            {c.workbook?.date && <small>{c.workbook.date.representation === 'iso' ? l.iso_date
                              : c.workbook.date.epoch === '1900' ? l.date_serial1900 : l.date_serial1904}</small>}
                            {c.workbook?.cache?.status === 'stored' && <small>{l.cache}</small>}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inspection && cellDetails(inspection)}
            <div className="data-controls">
              <button
                disabled={!current || !result.offset || progress !== undefined}
                onClick={() => void run(Math.max(0, result.offset - DATA_LAB_PAGE_SIZE))}
              >
                {l.previous}
              </button>
              <span>
                {number(result.total ? result.offset + 1 : 0)}–{number(result.offset + result.rows.length)}
              </span>
              <button
                disabled={!current || result.offset + result.rows.length >= result.total || progress !== undefined}
                onClick={() => void run(result.offset + DATA_LAB_PAGE_SIZE)}
              >
                {l.next}
              </button>
            </div>
            <h3>{l.profile}</h3>
            <div className="data-controls">
              {output.profile.profile.map(({ column: c, statistics: s, origins, validity }) => (
                <div className="data-stat" key={c.name}>
                  <strong>
                    <bdi>{c.name}</bdi>
                  </strong>
                  {s && (
                    <span dir="ltr">
                      Σ {exact(s.sum)} · μ {exact(s.mean)}
                    </span>
                  )}
                  <small>
                    {l.missing} {number(((validity ?? origins).null ?? 0) + ((validity ?? origins).empty ?? 0) + ((validity ?? origins).absent ?? 0))}
                  </small>
                  {(validity ?? origins).invalid ? <small>{l.invalid} {number((validity ?? origins).invalid!)}</small> : null}
                </div>
              ))}
            </div>
            {analysis && analysis.n > 0 && (
              <figure>
                <figcaption>
                  {l.distributions} · {committed?.draft.options.analysis?.x}
                </figcaption>
                <div className="data-histogram">
                  {analysis.histogram.map((n, i) => (
                    <div
                      key={i}
                      title={String(n)}
                      style={{ height: (100 * n) / Math.max(1, ...analysis.histogram) + '%' }}
                    >
                      <small>{number(n)}</small>
                    </div>
                  ))}
                </div>
                <p dir="ltr">
                  {analysis.range?.map(exact).join(' … ')} · Q1 {exact(analysis.q1 ?? '')} · Q2{' '}
                  {exact(analysis.median ?? '')} · Q3 {exact(analysis.q3 ?? '')}
                </p>
                <p>
                  {l.anomalies}: {number(analysis.outliers ?? 0)}
                </p>
                {analysis.pearson && (
                  <p dir="ltr">
                    Pearson r = {analysis.pearson.sign < 0 ? '−' : ''}√({exact(analysis.pearson.r_squared)}),
                    n = {number(analysis.pearson.n)}
                  </p>
                )}
              </figure>
            )}
            <div className="data-controls">
              <button disabled={!current || progress !== undefined} onClick={() => void run(result.offset, 'protected')}>{l.protected}</button>
              <button disabled={!current || progress !== undefined} onClick={() => void run(result.offset, 'literal')}>{l.literal}</button>
              <button
                data-testid="data-lab-proof-export"
                onClick={() =>
                  save('dars-data-proof.json', serializeCalculationProof(output.proof), 'application/json')
                }
              >
                {l.exportProof} ↓
              </button>
            </div>
          </>
        )}
        <CalculationProofPanel proof={output?.proof} locale={locale} />
      </section>
    );
  }
  return {
    Workspace,
    snapshot: () => retained,
    dispose: work.close,
    setPolicy(policy) {
      work.setPolicy(policy);
      const next = policy.dataLabResourceBudgetBytes;
      if (next === budget) return;
      budget = next;
      if (running && running.budget > budget) running.abort.abort('resource_budget');
      for (const listener of listeners) listener();
    },
    getResources: () => {
      const s = work.getSnapshot();
      return { pending: s.active + s.queued };
    },
  };
}
