import { useEffect, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import { parseCalculationProof, serializeCalculationProof, withExpressionLocale } from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import { dataLabels } from './data-lab-labels';
import type { DataJob } from './data-lab-worker';
import { LOCALES, type Locale } from './i18n';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { createModuleWork } from './module-work';
import './tool-data-lab.css';

const kinds = ['text', 'integer', 'decimal', 'boolean', 'date', 'time'] as const;
type Kind = (typeof kinds)[number];
type Format = 'csv' | 'tsv' | 'json' | 'xlsx';
type FormatOptions = {
  format: Format;
  header: string;
  encoding: string;
  decimal: string;
  delimiter?: string;
  sheet?: string;
  types: Record<string, Kind>;
  analysis?: { x: string; y?: string };
};
const defaults: FormatOptions = {
  format: 'csv',
  header: 'present',
  encoding: 'utf8',
  decimal: 'point',
  types: {},
};
const example = 'id,value\nA,1.25\nB,2.50\n';
const actions = ['sort', 'deduplicate', 'drop_missing', 'trim', 'multiply', 'filter'] as const;
type Action = (typeof actions)[number];
export type DataLabState = { options: FormatOptions; steps: string; origin?: Locale; example?: boolean };
type Column = { name: string; kind: Kind };
type Cell = { value: string; origin: string; formula?: string };
type Page = {
  rows: Cell[][];
  columns: Column[];
  source_columns: Column[];
  sheets: string[];
  sheet?: string;
  total: number;
  offset: number;
};
type Analysis = {
  n: number;
  histogram: number[];
  range?: [string, string];
  q1?: string;
  median?: string;
  q3?: string;
  outliers?: number;
  pearson?: { sign: number; r_squared: string; n: number };
};
type Profile = {
  profile: {
    column: Column;
    statistics: { sum: string; mean: string; min: string; max: string; n: number } | null;
    origins: Record<string, number>;
  }[];
  analysis: Analysis | null;
};
type Output = { page: Page; proof: CalculationProof; profile: Profile };
type Reply = { ok: true; output: Output; csv?: Uint8Array } | { ok: false; code: string };

function decode(value: unknown): Reply {
  if (!value || typeof value !== 'object') throw new Error('invalid reply');
  const r = value as Record<string, unknown>;
  if (r.ok === false && typeof r.code === 'string') return { ok: false, code: r.code };
  const proof = parseCalculationProof(r.proof);
  if (!proof || proof.module !== 'data-lab' || proof.operation !== 'dataset')
    throw new Error('invalid proof');
  const page = r.page as Page;
  const profile = JSON.parse(proof.result) as Profile & { sha256: string; rows: number };
  if (
    !Array.isArray(page?.rows) ||
    page.rows.length > 25 ||
    !Array.isArray(page.columns) ||
    !Array.isArray(page.source_columns) ||
    !Array.isArray(profile.profile) ||
    page.total !== profile.rows ||
    proof.variables.sha256 !== profile.sha256 ||
    JSON.parse(proof.expression).sha256 !== profile.sha256
  )
    throw new Error('invalid manifest');
  return { ok: true, output: { page, profile, proof }, csv: r.csv instanceof Uint8Array ? r.csv : undefined };
}

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
  let retained = scope.previousState ?? { options: defaults, steps: '[]' };
  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const l = dataLabels[locale];
    const [draft, setDraft] = useState<DataLabState>(retained);
    const [file, setFile] = useState<Blob | undefined>(() =>
      retained.example ? new Blob([example]) : undefined,
    );
    const [output, setOutput] = useState<Output>();
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
    const { options } = draft;
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
    function edit(changes: Partial<DataLabState>) {
      cancel();
      setError('');
      setOutput(undefined);
      retained = { ...draft, ...changes };
      setDraft(retained);
    }
    function configure(changes: Partial<FormatOptions>) {
      edit({ options: { ...options, ...changes } });
    }
    function choose(f: File | undefined) {
      cancel();
      setError('');
      setOutput(undefined);
      setSheets([]);
      setColumns([]);
      setInputs([]);
      setFile(undefined);
      if (!f) return;
      if (f.size > 16 * 1024 * 1024) {
        setError('limit');
        return;
      }
      setFile(f);
      edit({
        example: false,
        origin: locale,
        options: { ...options, format: sourceFormat(f.name), sheet: undefined },
      });
    }
    function loadExample() {
      edit({
        example: true,
        options: { ...defaults, types: { value: 'decimal' }, analysis: { x: 'value' } },
        steps: '[]',
        origin: locale,
      });
      if (filePicker.current) filePicker.current.value = '';
      setFile(new Blob([example]));
      setColumns([]);
      setInputs([]);
      setSheets([]);
    }
    function settings() {
      const steps: unknown = JSON.parse(draft.steps);
      if (!Array.isArray(steps) || steps.length > 32) throw new Error('invalid_input');
      return { ...options, steps };
    }
    async function run(offset = 0, exportMode?: 'protected' | 'literal') {
      if (!file || controller.current) return;
      const now = performance.now();
      const generation = ++revision.current;
      const abort = new AbortController();
      controller.current = abort;
      setError('');
      setProgress(0);
      try {
        const request: DataJob = { file, settings: JSON.stringify(settings()), offset, exportMode };
        const r = await work.submit(
          {
            request,
            createWorker() {
              const worker = new Worker(new URL('./data-lab-worker.ts', import.meta.url), { type: 'module' });
              worker.terminate = scope.resources.own('worker', worker.terminate.bind(worker));
              return worker;
            },
            decode,
            progress: {
              update(v) {
                if (generation === revision.current) setProgress(v.completed);
              },
              watchdogMs: 25000,
            },
          },
          { kind: 'import', signal: abort.signal, timeoutMs: 45000 },
        );
        if (abort.signal.aborted || generation !== revision.current) return;
        if (r.status !== 'completed') {
          setError(r.status);
          return;
        }
        if (!r.value.ok) {
          setError(r.value.code);
          return;
        }
        const result = r.value.output;
        result.proof = withExpressionLocale(result.proof, draft.origin ?? locale);
        setOutput(result);
        setColumns(result.page.columns);
        setInputs(result.page.source_columns);
        setSheets(result.page.sheets);
        if (r.value.csv) save('dars-data.csv', new Uint8Array(r.value.csv).buffer, 'text/csv;charset=utf-8');
      } catch {
        if (generation === revision.current) setError('invalid_input');
      } finally {
        if (generation === revision.current) {
          controller.current = null;
          setProgress(undefined);
          recordInteraction(performance.now() - now);
        }
      }
    }
    async function loadPipeline(f: File | undefined) {
      if (!f) return;
      cancel();
      const generation = revision.current;
      try {
        if (f.size > 16384) throw new Error('limit');
        const v = JSON.parse(await f.text());
        if (generation !== revision.current) return;
        if (v.version !== 'data-lab/1' || !v.configuration || !Array.isArray(v.configuration.steps))
          throw new Error('invalid_input');
        const { steps, ...imported } = v.configuration;
        if (
          !['csv', 'tsv', 'xlsx', 'json'].includes(imported.format) ||
          !imported.types ||
          typeof imported.types !== 'object' ||
          Array.isArray(imported.types) ||
          !Object.values(imported.types).every((k) => kinds.includes(k as Kind))
        )
          throw new Error('invalid_input');
        edit({ options: { ...defaults, ...imported }, steps: JSON.stringify(steps, null, 2) });
      } catch {
        if (generation === revision.current) setError('invalid_input');
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
    };
    const result = output?.page;
    const analysis = output?.profile.analysis;
    const select = (
      name: string,
      value: string,
      onChange: (value: string) => void,
      choices: [string, string][],
    ) => (
      <label>
        {name}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
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
            disabled={!file || progress !== undefined}
            data-testid="data-lab-run"
            onClick={() => void run()}
          >
            {l.apply}
          </button>
          {progress !== undefined && (
            <>
              <progress aria-label={l.staged} value={progress} max={4} />
              <button onClick={cancel}>{m.cancelCalculation}</button>
            </>
          )}
        </div>
        {error && (
          <p role="alert">
            {cellLabels[error] ?? m.tools.engineUnavailable} <code>{error}</code>
          </p>
        )}
        <details>
          <summary>{l.advanced}</summary>
          <div className="data-controls">
            {select(
              l.format,
              options.format,
              (v) => configure({ format: v as Format }),
              ['csv', 'tsv', 'json', 'xlsx'].map((v) => [v, v.toUpperCase()]),
            )}
            {select(l.header, options.header, (v) => configure({ header: v }), [
              ['present', l.present],
              ['absent', l.absent],
              ['detect', l.detect],
            ])}
            {select(
              l.encoding,
              options.encoding,
              (v) => configure({ encoding: v }),
              ['utf8', 'latin1', 'utf16le', 'utf16be'].map((v) => [v, v.toUpperCase()]),
            )}
            {select(l.delimiter, options.delimiter ?? '', (v) => configure({ delimiter: v || undefined }), [
              ['', '—'],
              [',', ','],
              [';', ';'],
              ['\t', '⇥'],
              ['|', '|'],
            ])}
            {select(l.decimal, options.decimal, (v) => configure({ decimal: v }), [
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
          </div>
          {inputs.length > 0 && (
            <fieldset>
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
                      {kinds.map((k) => (
                        <option key={k} value={k}>
                          {l[k === 'decimal' ? 'decimalType' : k]}
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
                  )}
                  {select(
                    l.pipeline,
                    action,
                    (v) => setAction(v as Action),
                    actions.map((a) => [a, l[a]]),
                  )}
                  {action === 'filter' && (
                    <label>
                      =<input value={operand} onChange={(e) => setOperand(e.target.value)} />
                    </label>
                  )}
                  <button
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
              value={draft.steps}
              onChange={(e) => edit({ steps: e.target.value })}
            />
            <div className="data-controls">
              <button
                onClick={() => {
                  edit({ options: { ...defaults, format: options.format }, steps: '[]' });
                }}
              >
                {m.clear}
              </button>
              <button
                onClick={() => {
                  try {
                    save(
                      'dars-pipeline.json',
                      JSON.stringify({ version: 'data-lab/1', configuration: settings() }, null, 2),
                      'application/json',
                    );
                  } catch {
                    setError('invalid_input');
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
              <output data-testid="data-lab-result" data-canonical={output.proof.result}>
                {number(result.total)} {l.rows} · {number(result.columns.length)} {l.columns}
              </output>
            </div>
            <div className="data-scroll">
              <table>
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c.name}>
                        <bdi>{c.name}</bdi>
                        <small>{l[c.kind === 'decimal' ? 'decimalType' : c.kind]}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>
                          <bdi>{c.value || '—'}</bdi>
                          {c.origin !== 'stored' && (
                            <small title={c.formula}>{l[c.origin as keyof typeof l] ?? c.origin}</small>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="data-controls">
              <button
                disabled={!result.offset || progress !== undefined}
                onClick={() => void run(Math.max(0, result.offset - 25))}
              >
                {l.previous}
              </button>
              <span>
                {number(result.total ? result.offset + 1 : 0)}–{number(result.offset + result.rows.length)}
              </span>
              <button
                disabled={result.offset + result.rows.length >= result.total || progress !== undefined}
                onClick={() => void run(result.offset + 25)}
              >
                {l.next}
              </button>
            </div>
            <h3>{l.profile}</h3>
            <div className="data-controls">
              {output.profile.profile.map(({ column: c, statistics: s, origins }) => (
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
                    {l.missing} {number((origins.null ?? 0) + (origins.empty ?? 0) + (origins.absent ?? 0))}
                  </small>
                </div>
              ))}
            </div>
            {analysis && analysis.n > 0 && (
              <figure>
                <figcaption>
                  {l.distributions} · {options.analysis?.x}
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
              <button onClick={() => void run(result.offset, 'protected')}>{l.protected}</button>
              <button onClick={() => void run(result.offset, 'literal')}>{l.literal}</button>
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
    setPolicy: work.setPolicy,
    getResources: () => {
      const s = work.getSnapshot();
      return { pending: s.active + s.queued };
    },
  };
}
