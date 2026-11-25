import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import { normalizeSignedDigits, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { defaultWeekdays, exampleDrafts, fields, fromDefault, operations, periodFields, placeholder, toDefault, weekdays, zones } from './tool-date-time-input';
import type { Disambiguation, Draft, Field, Operation } from './tool-date-time-input';
import { activateTool } from './tool-runtime';
import './tool-date-time.css';

type DateTimeState = {
  operation: Operation;
  drafts: Partial<Record<Operation, Draft>>;
  workingWeek: readonly number[];
  holidays: string;
  proof?: CalculationProof;
};
const empty: Draft = { values: {} };
const maxHolidayBytes = 256;
const maxHolidays = 23;
const utf8 = new TextEncoder();

export function activate(scope: ModuleActivation<DateTimeState>): PrimaryModule<DateTimeState> {
  const runtime = activateTool(scope, () => new Worker(new URL('./tool-date-time-worker.ts', import.meta.url), { type: 'module' }));
  let retained: DateTimeState = scope.previousState ?? { operation: 'difference', drafts: {}, workingWeek: defaultWeekdays, holidays: '' };

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<string>();
    const current = useRef<AbortController | null>(null);
    const number = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const d = m.dateTime;
    const { operation, drafts, workingWeek, holidays, proof } = state;
    const draft = drafts[operation] ?? empty;
    const basis = draft.basis ?? 'business';
    const useWorkCalendar = operation === 'business_days' || (operation === 'deadline' && basis === 'business');
    const complete = fields[operation].every((name) => draft.values[name]?.trim()) &&
      (operation !== 'deadline' || Boolean(draft.values.count?.trim())) &&
      (operation !== 'timezone' || Boolean((draft.from ?? fromDefault).trim() && (draft.to ?? toDefault).trim()));
    const normalize = (value: string) => normalizeSignedDigits(value.trim());
    const normalizeDateTime = (value: string) => normalize(value)
      .replaceAll('：', ':').replaceAll('Ｔ', 'T').replaceAll('Ｚ', 'Z')
      .replace(/(T\d{2}:\d{2}:\d{2})[,٫．](?=\d)/u, '$1.');

    function abandon() {
      const handle = current.current;
      current.current = null;
      handle?.abort();
    }
    useEffect(() => () => abandon(), []);

    function commit(next: DateTimeState) {
      retained = next;
      setState(next);
    }

    function update(changes: Partial<Omit<DateTimeState, 'proof'>>) {
      abandon();
      setPending(false);
      setNotice(undefined);
      commit({ ...state, ...changes, proof: undefined });
    }

    function updateDraft(next: Draft) {
      update({ drafts: { ...drafts, [operation]: next } });
    }

    function loadExample() {
      const example = exampleDrafts[operation];
      update({
        drafts: { ...drafts, [operation]: example },
        ...(operation === 'business_days' || operation === 'deadline'
          ? { workingWeek: defaultWeekdays, holidays: '2024-01-12' } : {}),
      });
    }

    async function calculate() {
      if (current.current || !complete) return;
      const raw = fields[operation].map((name) => draft.values[name]?.trim() ?? '');
      if (raw.some((value) => value.includes('|'))) {
        update({});
        setNotice('invalid_input');
        return;
      }
      const original_input = raw.join('|');
      const input = raw.map(normalizeDateTime).join('|');
      const options: Record<string, string> = {};
      if (operation === 'period') {
        for (const name of periodFields) {
          const value = draft.values[name];
          if (value?.trim()) options[name] = normalize(value);
        }
        options.overflow = draft.overflow ?? 'clamp';
      }
      if (operation === 'deadline') {
        options.count = normalize(draft.values.count ?? '');
        options.basis = basis;
      }
      if (useWorkCalendar) {
        const entries = holidays.trim().split(/[\s,;،؛，；]+/u).filter(Boolean).map(normalize);
        const serialized = entries.join(',');
        if (workingWeek.length === 0 || entries.length > maxHolidays || utf8.encode(serialized).byteLength > maxHolidayBytes) {
          update({});
          setNotice(workingWeek.length === 0 ? 'working_week' : 'holiday_limit');
          return;
        }
        options.weekdays = workingWeek.join(',');
        if (entries.length) options.holidays = serialized;
      }
      if (operation === 'timezone') {
        options.from = (draft.from ?? fromDefault).trim();
        options.to = (draft.to ?? toDefault).trim();
        options.disambiguation = draft.disambiguation ?? 'reject';
      }
      const controller = new AbortController();
      current.current = controller;
      setPending(true);
      setNotice(undefined);
      commit({ ...state, proof: undefined });
      const start = performance.now();
      const response = await runtime.submit({ schema: 1, module: 'date-time', operation, input, original_input, options }, controller.signal);
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

    const messages: Readonly<Record<string, string>> = {
      invalid_input: d.invalid, domain: d.domainError, limit: m.processingLimit, working_week: d.workingWeekError,
      holiday_limit: d.holidayLimit, ambiguous_local_time: d.ambiguous, nonexistent_local_time: d.nonexistent,
      unsupported: m.tools.unsupported, no_convergence: m.tools.convergence, timed_out: m.engineTimeout,
      cancelled: m.engineCancelled, queue_full: m.engineBusy, deferred: m.engineBusy,
    };
    const entries = proof?.result.split('; ').map((entry) => {
      const split = entry.indexOf('=');
      return split > 0 ? { key: entry.slice(0, split), value: entry.slice(split + 1) } : { key: '', value: entry };
    }) ?? [];
    const versions = [
      { label: d.tzdbVersion, value: proof?.variables.tzdb_version },
      { label: d.tzdbFormat, value: proof?.variables.tzdb_format },
      { label: d.calendarVersion, value: proof?.variables.calendar_version },
    ].filter(({ value }) => Boolean(value));
    const visibleConstraints = proof?.constraints.filter((value) =>
      !/^Bundled IANA tzdb: /u.test(value) && value !== 'IANA rearguard daylight-saving flags' &&
      value !== 'Nonexistent local times are rejected') ?? [];

    function displayValue(key: string, value: string) {
      if (value === 'true' || value === 'false') return d.boolean[value];
      if (key === 'resolution' && Object.hasOwn(d.resolution, value)) return d.resolution[value as keyof typeof d.resolution];
      if (key === 'weekday' && Object.hasOwn(d.weekdays, value)) {
        return `${d.weekdays[value as keyof typeof d.weekdays]} · ${number.format(value)}`;
      }
      if (key === 'iso_year') return value;
      return number.format(value);
    }

    function presentProof(field: keyof CalculationProof, text: string): string {
      if (field === 'operation' && Object.hasOwn(d.operations, text)) return d.operations[text as Operation];
      if (field === 'domain' && Object.hasOwn(d.proof.domains, text)) return d.proof.domains[text as keyof typeof d.proof.domains];
      if (field === 'method' && Object.hasOwn(d.proof.methods, text)) return d.proof.methods[text as keyof typeof d.proof.methods];
      if (field === 'constraints' && Object.hasOwn(d.proof.constraints, text)) return d.proof.constraints[text as keyof typeof d.proof.constraints];
      if (field === 'constraints' && text.startsWith('Bundled IANA tzdb: ')) return `${d.tzdbVersion} · ${text.slice('Bundled IANA tzdb: '.length)}`;
      if (field === 'constraints' && text === 'IANA rearguard daylight-saving flags') return d.tzdbPolicy;
      if (field === 'constraints' && text.startsWith('End-of-month policy: ')) {
        return `${d.monthOverflow} · ${text.endsWith('clamp') ? d.clamp : d.rejectMonth}`;
      }
      if (field === 'formula' && Object.hasOwn(d.proof.formulas, text)) return d.proof.formulas[text as keyof typeof d.proof.formulas];
      if (field === 'units' && Object.hasOwn(d.proof.units, text)) return d.proof.units[text as keyof typeof d.proof.units];
      return text;
    }

    function entry(name: Field) {
      return <label className="date-time-field" key={name}>{d.fields[name]}
        <input type="text" dir="ltr" value={draft.values[name] ?? ''} maxLength={name === 'count' ? 32 : 48}
          placeholder={placeholder(name)} spellCheck={false} autoComplete="off" autoCapitalize="off"
          aria-describedby="date-time-input-help"
          onChange={(event) => updateDraft({ ...draft, values: { ...draft.values, [name]: event.currentTarget.value } })} />
      </label>;
    }

    return <section className="date-time-workspace" aria-label={d.title} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && current.current) cancel();
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void calculate();
      }
    }}>
      <div className="date-time-card date-time-operations" role="group" aria-label={d.operation}>
        {operations.map((name) => <button key={name} type="button" aria-pressed={name === operation}
          onClick={() => { if (name !== operation) update({ operation: name }); }}>{d.operations[name]}</button>)}
      </div>
      <div className="date-time-layout">
        <form className="date-time-card" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          <div className="date-time-fields">{fields[operation].map(entry)}</div>
          {operation === 'period' && <>
            <div className="date-time-fields date-time-period-fields">{periodFields.map(entry)}</div>
            <label className="date-time-field">{d.monthOverflow}
              <select value={draft.overflow ?? 'clamp'} onChange={(event) =>
                updateDraft({ ...draft, overflow: event.currentTarget.value === 'reject' ? 'reject' : 'clamp' })}>
                <option value="clamp">{d.clamp}</option><option value="reject">{d.rejectMonth}</option>
              </select>
            </label>
          </>}
          {operation === 'deadline' && <div className="date-time-fields">
            {entry('count')}
            <label className="date-time-field">{d.deadlineBasis}
              <select value={basis} onChange={(event) =>
                updateDraft({ ...draft, basis: event.currentTarget.value === 'civil' ? 'civil' : 'business' })}>
                <option value="business">{d.businessBasis}</option><option value="civil">{d.civilBasis}</option>
              </select>
            </label>
          </div>}
          {useWorkCalendar && <fieldset className="date-time-calendar">
            <legend>{d.workCalendar}</legend>
            <div className="date-time-days">
              {weekdays.map((day) => <label key={day}>
                <input type="checkbox" checked={workingWeek.includes(day)} onChange={(event) => update({
                  workingWeek: event.currentTarget.checked ? weekdays.filter((value) => value === day || workingWeek.includes(value))
                    : workingWeek.filter((value) => value !== day),
                })} />{d.weekdays[day]}
              </label>)}
            </div>
            <label className="date-time-field">{d.holidays}
              <textarea dir="ltr" rows={3} maxLength={1024} placeholder="YYYY-MM-DD" value={holidays}
                spellCheck={false} autoComplete="off" aria-describedby="date-time-calendar-help"
                onChange={(event) => update({ holidays: event.currentTarget.value })} />
            </label>
            <p className="date-time-hint" id="date-time-calendar-help">{d.calendarHint}</p>
          </fieldset>}
          {operation === 'timezone' && <>
            <div className="date-time-fields">
              <label className="date-time-field">{d.fromZone}
                <input type="text" dir="ltr" list="date-time-zones" value={draft.from ?? fromDefault} maxLength={96}
                  spellCheck={false} autoComplete="off" autoCapitalize="off"
                  onChange={(event) => updateDraft({ ...draft, from: event.currentTarget.value })} />
              </label>
              <label className="date-time-field">{d.toZone}
                <input type="text" dir="ltr" list="date-time-zones" value={draft.to ?? toDefault} maxLength={96}
                  spellCheck={false} autoComplete="off" autoCapitalize="off"
                  onChange={(event) => updateDraft({ ...draft, to: event.currentTarget.value })} />
              </label>
              <datalist id="date-time-zones">{zones.map((zone) => <option key={zone} value={zone} />)}</datalist>
            </div>
            <label className="date-time-field">{d.disambiguation}
              <select value={draft.disambiguation ?? 'reject'} onChange={(event) =>
                updateDraft({ ...draft, disambiguation: event.currentTarget.value as Disambiguation })}>
                {(['reject', 'earlier', 'later'] as const).map((mode) => <option key={mode} value={mode}>{d.transition[mode]}</option>)}
              </select>
            </label>
          </>}
          <p id="date-time-input-help" className="date-time-hint">{d.hints[operation]}</p>
          <div className="date-time-actions">
            <button className="date-time-primary" type="submit" disabled={pending || !complete}>{m.calculate}</button>
            {pending && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
            <button type="button" className="quiet-action" onClick={loadExample}>{d.useExample}</button>
            <button type="button" className="quiet-action" onClick={() => update({
              drafts: { ...drafts, [operation]: empty },
              ...(useWorkCalendar ? { workingWeek: defaultWeekdays, holidays: '' } : {}),
            })}>{m.clear}</button>
          </div>
          <p className="date-time-notice" role="status" data-error={Boolean(notice && notice !== 'cancelled') || undefined}>
            {pending ? m.working : notice ? (Object.hasOwn(messages, notice) ? messages[notice] : m.tools.engineUnavailable) : ''}
          </p>
        </form>

        <div className="date-time-card">
          <div className="date-time-result-heading">
            <strong id="date-time-result-label">{m.result}</strong>{proof && <span>{m.exact}</span>}
          </div>
          <div className="date-time-result" role="status" aria-labelledby="date-time-result-label"
            data-testid="date-time-result" data-canonical={proof?.result}>
            {entries.length ? <dl>{entries.map(({ key, value }, index) => <div key={index} data-date-field={key}>
              <dt>{Object.hasOwn(d.output, key) ? d.output[key as keyof typeof d.output] : key}</dt>
              <dd><bdi>{displayValue(key, value)}</bdi></dd>
            </div>)}</dl> : '—'}
          </div>
          {versions.length > 0 && <dl className="date-time-versions">
            {versions.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd><bdi dir="ltr">{value}</bdi></dd></div>)}
          </dl>}
          {visibleConstraints.length ? <ul className="date-time-constraints">
            {visibleConstraints.map((value, index) => <li key={index}><bdi>{presentProof('constraints', value)}</bdi></li>)}
          </ul> : null}
          <CalculationProofPanel proof={proof} locale={locale} localizeText={presentProof} />
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
