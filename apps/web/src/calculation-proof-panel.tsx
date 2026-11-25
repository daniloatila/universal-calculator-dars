import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  MAX_CALCULATION_PROOF_BYTES, parseCalculationProofFile, serializeCalculationProof,
} from './calculation-proof';
import type { CalculationProof } from './calculation-proof';
import { localizeProofText, proofLabels } from './calculation-proof-labels';
import { LOCALES } from './i18n';
import type { Locale } from './i18n';
import './calculation-proof.css';

const fieldOrder: readonly (keyof CalculationProof)[] = [
  'result', 'exactness', 'module', 'operation', 'expression', 'expression_locale', 'normalized', 'variables', 'standard_bindings', 'units', 'options',
  'domain', 'method', 'formula', 'precision', 'tolerance', 'rounding', 'error_bound', 'assumptions',
  'constraints', 'references', 'schema', 'engine_version', 'algorithm_version',
];

type ProofTextPresentation = (field: keyof CalculationProof, text: string) => string;

function FieldValue({ record, field, locale, format, localizeText }: {
  record: CalculationProof;
  field: keyof CalculationProof;
  locale: Locale;
  format: Intl.NumberFormat;
  localizeText?: ProofTextPresentation;
}): ReactNode {
  if (field === 'exactness') return proofLabels[locale].exactness[record.exactness];
  const value = record[field];
  if (field === 'expression_locale') return record.expression_locale && <bdi>{LOCALES[record.expression_locale].name}</bdi>;
  if (field === 'standard_bindings') {
    return <bdi dir="ltr">{Object.keys(record.standard_bindings ?? {}).map((id) => `@${id}`).join(', ')}</bdi>;
  }
  const display = (text: string) => localizeText?.(field, text) ?? localizeProofText(locale, record.module, field, text);
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    return <ul>{value.map((item, index) => <li key={index}><bdi>{display(item)}</bdi></li>)}</ul>;
  }
  if (value === null || value === '') return '—';
  if (typeof value === 'object') {
    const entries: [string, string | boolean | number][] = Object.entries(value);
    if (!entries.length) return '—';
    return <ul>{entries.map(([key, entry]) => <li key={key}>
      <bdi>{key}</bdi> = <bdi>{display(String(entry))}</bdi>
    </li>)}</ul>;
  }
  if (field === 'expression' || field === 'normalized' || field === 'formula') return <bdi>{String(value)}</bdi>;
  return <bdi>{typeof value === 'number' ? format.format(value) : display(String(value))}</bdi>;
}

function downloadProof(proof: CalculationProof) {
  const contents = new Blob([serializeCalculationProof(proof)], { type: 'application/json' });
  const url = URL.createObjectURL(contents);
  const download = document.createElement('a');
  download.href = url;
  download.download = 'dars-calculation-record.json';
  download.hidden = true;
  try {
    document.body.append(download);
    download.click();
  } finally {
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

type ProofProps = {
  proof?: CalculationProof | null;
  locale: Locale;
  localizeText?: ProofTextPresentation;
};

export function CalculationProofContents({ proof, locale, localizeText }: ProofProps) {
  const labels = proofLabels[locale];
  const format = new Intl.NumberFormat(LOCALES[locale].format, { useGrouping: false });
  const [imported, setImported] = useState<CalculationProof | null>(null);
  const [notice, setNotice] = useState<'invalid' | 'tooLarge' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadGeneration = useRef(0);
  const record = imported ?? proof;

  useEffect(() => () => { loadGeneration.current++; }, []);

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const generation = ++loadGeneration.current;
    setNotice(null);
    if (file.size > MAX_CALCULATION_PROOF_BYTES) {
      setNotice('tooLarge');
      return;
    }
    let next: CalculationProof | null = null;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      next = parseCalculationProofFile(text);
    } catch {
      // A read error or malformed UTF-8 leaves the previous record intact.
    }
    if (loadGeneration.current !== generation) return;
    if (next) setImported(next);
    else setNotice('invalid');
  }

  function dismiss() {
    loadGeneration.current++;
    setImported(null);
    setNotice(null);
  }

  return <div className="calculation-proof-body">
      <div className="calculation-proof-actions">
        <input ref={fileInput} type="file" accept=".json,application/json" hidden
          data-testid="proof-import-file" onChange={(event) => void openFile(event)} />
        <button type="button" onClick={() => fileInput.current?.click()}>{labels.importFile}</button>
        {record && <button type="button" onClick={() => downloadProof(record)}>{labels.exportFile}</button>}
        {imported && <button type="button" onClick={dismiss}>{labels.dismiss}</button>}
      </div>
      {notice && <p role="alert" className="calculation-proof-error">{labels[notice]}</p>}
      {record ? <>
        <p className="calculation-proof-source">
          <strong>{imported ? labels.imported : labels.computed}</strong>
          {' '}{imported ? labels.unverified : labels.scope}
        </p>
        <dl className="calculation-proof-fields">
          {fieldOrder.filter((field) => record[field] !== undefined).map((field) => <div key={field}>
            <dt>{labels.fields[field]}</dt>
            <dd><FieldValue record={record} field={field} locale={locale} format={format}
              localizeText={imported ? undefined : localizeText} /></dd>
          </div>)}
        </dl>
      </> : <p className="calculation-proof-source">{labels.empty}</p>}
  </div>;
}

export function CalculationProofPanel(props: ProofProps) {
  return <details className="calculation-proof">
    <summary>{proofLabels[props.locale].title}</summary>
    <CalculationProofContents {...props} />
  </details>;
}
