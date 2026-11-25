import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { AdaptivePolicy } from './adaptive';
import { CalculationProofPanel } from './calculation-proof-panel';
import { withExpressionLocale } from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import InputNotation from './input-notation';
import { editLocalizedDraft, localizeExpression, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { GeometryDiagram } from './tool-geometry-diagram';
import { coordinateOperations, dimensions, examples, expressionFor, normalizedDimension, normalizedRows, operations, units } from './tool-geometry-input';
import type { Draft, Operation, Unit } from './tool-geometry-input';
import { activateTool } from './tool-runtime';
import './tool-geometry.css';

type Angle = 'deg' | 'rad';
type GeometryState = {
  operation: Operation;
  unit: Unit;
  angle: Angle;
  drafts: Partial<Record<Operation, Draft>>;
  proof?: CalculationProof;
};

const noDraft: Draft = { dimensions: {} };
const maxBytes = 4096;
const utf8 = new TextEncoder();

function unitSymbol(unit: string) {
  return unit === 'deg' ? '°' : unit.replace(/\^2$/u, '²').replace(/\^3$/u, '³');
}

function presentResult(value: string, format: (value: string) => string) {
  return format(value).replace(/\bpi\b/gu, 'π').replace(/\bsqrt\(/gu, '√(');
}

export function activate(scope: ModuleActivation<GeometryState>): PrimaryModule<GeometryState> {
  const runtime = activateTool(scope, () => new Worker(new URL('./tool-geometry-worker.ts', import.meta.url), { type: 'module' }));
  let retained: GeometryState = scope.previousState ?? { operation: 'rectangle', unit: 'u', angle: 'deg', drafts: {} };
  let graphicsInterval: number | null = null;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  const getInterval = () => graphicsInterval;

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const current = useRef<AbortController | null>(null);
    const presentation = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const interval = useSyncExternalStore(subscribe, getInterval);
    const framePolicy = useMemo(() => ({ graphicsFrameIntervalMs: interval }), [interval]);
    const g = m.geometry;
    const { operation, unit, angle, drafts, proof } = state;
    const draft = drafts[operation] ?? noDraft;
    const coordinateField = draft.coordinates;
    const coordinates = coordinateField?.text ?? '';
    const hasCoordinates = coordinateOperations.has(operation);
    const complete = (!hasCoordinates || coordinates.trim().length > 0) &&
      dimensions[operation].every((name) => draft.dimensions[name]?.text.trim());
    const origins = new Set(dimensions[operation].flatMap((name) => {
      const field = draft.dimensions[name];
      return field?.text.trim() ? [field.locale] : [];
    }));
    if (hasCoordinates && coordinateField?.text.trim()) origins.add(coordinateField.locale);

    function abandon() {
      const calculation = current.current;
      current.current = null;
      calculation?.abort();
    }
    useEffect(() => () => abandon(), []);

    function commit(next: GeometryState) {
      retained = next;
      setState(next);
    }

    function update(changes: Partial<Omit<GeometryState, 'proof'>>) {
      abandon();
      setPending(false);
      setNotice(undefined);
      commit({ ...state, ...changes, proof: undefined });
    }

    function updateDraft(next: Draft) {
      if (next.coordinates && utf8.encode(next.coordinates.text).byteLength > maxBytes) {
        setNotice('limit');
        return;
      }
      update({ drafts: { ...drafts, [operation]: next } });
    }

    function useExample() {
      const example = examples[operation];
      const localize = (value: string) => editLocalizedDraft(undefined, localizeExpression(value, presentation.decimal), locale);
      updateDraft({
        dimensions: Object.fromEntries(Object.entries(example.dimensions).map(([name, value]) => [name, localize(value)])),
        ...(example.coordinates ? { coordinates: localize(example.coordinates) } : {}),
      });
    }

    async function calculate() {
      if (current.current || !complete) return;
      if (dimensions[operation].some((name) => /[\s;|,]/u.test(normalizedDimension(draft.dimensions[name]!)))) {
        update({});
        setNotice('invalid_input');
        return;
      }
      const original_input = expressionFor(operation, draft, 'original');
      const input = expressionFor(operation, draft, 'canonical');
      const origin = origins.size === 1 ? origins.values().next().value : undefined;
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
      const options: Record<string, string> = operation === 'angle' ? { unit, angle } : { unit };
      const start = performance.now();
      const reply = await runtime.submit({ schema: 1, module: 'geometry', operation, input, original_input, options }, controller.signal);
      if (scope.signal.aborted || current.current !== controller) return;
      current.current = null;
      setPending(false);
      if (reply.status === 'completed') {
        if (reply.value.ok) {
          recordInteraction(performance.now() - start);
          const record = reply.value.proof;
          commit({ ...state, proof: origin ? withExpressionLocale(record, origin) : record });
        } else setNotice(reply.value.code);
      } else setNotice(reply.status);
    }

    function cancel() {
      abandon();
      setPending(false);
      setNotice('cancelled');
    }

    const notices: Readonly<Record<string, string>> = {
      invalid_input: g.invalid, domain: g.domainError, limit: m.processingLimit, unsupported: m.tools.unsupported,
      no_convergence: m.tools.convergence, timed_out: m.engineTimeout, cancelled: m.engineCancelled,
      queue_full: m.engineBusy, deferred: m.engineBusy,
    };
    const output = proof?.result.split('; ').map((entry) => {
      const index = entry.indexOf('=');
      return index < 0 ? { key: '', value: entry } : { key: entry.slice(0, index), value: entry.slice(index + 1) };
    }) ?? [];

    function displayClassification(value: string) {
      return Object.hasOwn(g.classification, value) ? g.classification[value as keyof typeof g.classification] : undefined;
    }

    function presentProofText(field: keyof CalculationProof, value: string): string {
      if (field === 'operation' && Object.hasOwn(g.operations, value)) return g.operations[value as Operation];
      if (field === 'domain' && value === 'real') return g.proof.realDomain;
      if (field === 'method' && Object.hasOwn(g.proof.methods, value)) return g.proof.methods[value as keyof typeof g.proof.methods];
      if (field === 'units') return unitSymbol(value);
      if (field === 'formula') return presentResult(value, presentation.format);
      if (field === 'constraints') {
        const constraints: Readonly<Record<string, string>> = {
          'Dimensions are strictly positive': g.proof.positive,
          'Strict triangle inequality': g.proof.inequality,
          'Simple nonzero-area polygon': g.proof.simplePolygon,
          'Both rays are nonzero': g.proof.nonzeroRays,
          'Each segment has distinct endpoints': g.proof.distinctEnds,
        };
        if (Object.hasOwn(constraints, value)) return constraints[value] ?? value;
      }
      if (field === 'variables') {
        if (value === 'Positive rational length from input') return g.proof.rationalLength;
        if (value === 'Rational point from input') return g.proof.rationalPoint;
        const vertices = /^(\d+) planar vertices$/u.exec(value);
        if (vertices?.[1]) return g.proof.vertices.replace('{count}', presentation.format(vertices[1]));
      }
      return value;
    }

    return <section className="geometry-workspace" aria-label={g.title} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && current.current) cancel();
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void calculate();
      }
    }}>
      <div className="geometry-pick geometry-card" role="group" aria-label={g.operation}>
        {operations.map((name) => <button key={name} type="button" aria-pressed={operation === name}
          onClick={() => { if (name !== operation) update({ operation: name }); }}>{g.operations[name]}</button>)}
      </div>
      <div className="geometry-layout">
        <form className="geometry-card geometry-form" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          <div className="geometry-fields geometry-preferences">
            <label>{g.unit}
              <select value={unit} onChange={(event) => update({ unit: event.currentTarget.value as Unit })}>
                {units.map((code) => <option key={code} value={code}>{g.units[code]}</option>)}
              </select>
            </label>
            {operation === 'angle' && <label>{g.angleUnit}
              <select value={angle} onChange={(event) => update({ angle: event.currentTarget.value === 'rad' ? 'rad' : 'deg' })}>
                <option value="deg">{g.degrees}</option><option value="rad">{g.radians}</option>
              </select>
            </label>}
          </div>
          {dimensions[operation].length > 0 && <div className="geometry-fields geometry-dimensions">
            {dimensions[operation].map((name) => {
              const field = draft.dimensions[name];
              return <label key={name}>{g.dimensions[name]}
                <input dir="ltr" type="text" maxLength={256} value={field?.text ?? ''} lang={field?.locale ?? locale}
                  autoComplete="off" spellCheck={false}
                  aria-describedby={field?.text.trim() && field.locale !== locale
                    ? `geometry-input-help geometry-input-notation-${field.locale}` : 'geometry-input-help'}
                  onChange={(event) => updateDraft({ ...draft, dimensions: { ...draft.dimensions,
                    [name]: editLocalizedDraft(field, event.currentTarget.value, locale) } })} />
              </label>;
            })}
          </div>}
          {hasCoordinates && <label className="geometry-coordinates">{g.coordinates}
            <textarea dir="ltr" rows={operation === 'distance' ? 3 : 5} maxLength={maxBytes} value={coordinates}
              lang={coordinateField?.locale ?? locale} autoComplete="off" spellCheck={false}
              aria-describedby={coordinateField?.text.trim() && coordinateField.locale !== locale
                ? `geometry-input-help geometry-input-notation-${coordinateField.locale}` : 'geometry-input-help'}
              onChange={(event) => updateDraft({ ...draft, coordinates:
                editLocalizedDraft(coordinateField, event.currentTarget.value, locale) })} />
          </label>}
          <p className="geometry-hint" id="geometry-input-help">{g.hints[operation]}</p>
          {[...origins].map((origin) => <InputNotation key={origin} origin={origin} locale={locale} messages={m}
            id={`geometry-input-notation-${origin}`} />)}
          <div className="geometry-actions">
            <button className="geometry-primary" type="submit" disabled={pending || !complete}>{m.calculate}</button>
            {pending && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
            <button type="button" className="quiet-action" onClick={useExample}>{g.useExample}</button>
            <button type="button" className="quiet-action" onClick={() => updateDraft(noDraft)}>{m.clear}</button>
          </div>
          <p role="status" className="geometry-notice" data-error={Boolean(notice && notice !== 'cancelled') || undefined}>
            {pending ? m.working : notice ? (Object.hasOwn(notices, notice) ? notices[notice] : m.tools.engineUnavailable) : ''}
          </p>
        </form>
        <div className="geometry-card geometry-result-card">
          <GeometryDiagram scope={scope} policy={framePolicy} operation={operation}
            coordinateText={hasCoordinates ? normalizedRows(draft.coordinates) : ''} title={g.sketch.replace('{shape}', g.operations[operation])}
            caption={operation === 'distance' || operation === 'angle' ? g.projection : g.diagramCaption} />
          <div className="geometry-result-heading">
            <strong id="geometry-result-label">{m.result}</strong>
            {proof && <span>{proof.exactness === 'symbolic' ? g.symbolic : proof.exactness === 'exact' ? m.exact : m.approximate}</span>}
          </div>
          <div role="status" aria-labelledby="geometry-result-label" className="geometry-result" data-testid="geometry-result" data-canonical={proof?.result}>
            {output.length ? <dl>{output.map(({ key, value }, index) => {
              const label = Object.hasOwn(g.quantities, key) ? g.quantities[key as keyof typeof g.quantities] : key;
              const usedUnit = proof?.units[key];
              const classification = displayClassification(value);
              return <div key={index} data-quantity={key}><dt>{label}</dt>
                <dd><bdi dir={classification ? 'auto' : 'ltr'}>{classification ?? presentResult(value, presentation.format)}
                  {usedUnit && <> <span>{unitSymbol(usedUnit)}</span></>}</bdi></dd></div>;
            })}</dl> : '—'}
          </div>
          {proof?.constraints.length ? <ul className="geometry-constraints">
            {proof.constraints.map((value, index) => <li key={index}><bdi>{presentProofText('constraints', value)}</bdi></li>)}
          </ul> : null}
          <CalculationProofPanel proof={proof} locale={locale} localizeText={presentProofText} />
        </div>
      </div>
    </section>;
  }

  return {
    Workspace,
    setPolicy(policy: AdaptivePolicy) {
      runtime.setPolicy(policy);
      if (graphicsInterval !== policy.graphicsFrameIntervalMs) {
        graphicsInterval = policy.graphicsFrameIntervalMs;
        for (const listener of listeners) listener();
      }
    },
    getResources: runtime.getResources,
    snapshot: () => retained,
    dispose: runtime.dispose,
  };
}
