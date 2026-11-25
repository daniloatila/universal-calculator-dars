import { useEffect, useState } from 'react';
import type { CalculationProof } from './calculation-proof';
import type { Locale, Messages } from './i18n';
import './calculation-proof.css';

type Contents = typeof import('./calculation-proof-panel').CalculationProofContents;

export default function StandardCalculationProof({ proof, locale, messages }: {
  proof: CalculationProof | null;
  locale: Locale;
  messages: Messages['standardRecord'];
}) {
  const [expanded, setExpanded] = useState(false);
  const [Contents, setContents] = useState<Contents>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!expanded || Contents) return;
    let active = true;
    setUnavailable(false);
    void import('./calculation-proof-panel').then(
      (module) => { if (active) setContents(() => module.CalculationProofContents); },
      () => { if (active) setUnavailable(true); },
    );
    return () => { active = false; };
  }, [expanded, Contents]);

  function localizeText(field: keyof CalculationProof, text: string) {
    if (field === 'operation' && text === 'evaluate') return messages.evaluate;
    if (field === 'domain' && text === 'real') return messages.real;
    if (field === 'method' && text === 'standard_rational_expression') return messages.exactMethod;
    if (field === 'method' && text === 'standard_certified_interval') return messages.approximateMethod;
    if (field === 'rounding' && text === 'nearest_ties_even') return messages.rounding;
    if (field === 'constraints') {
      if (text === 'Replay bindings exceed the portable record size limit') return messages.bindingsLimit;
      if (text === 'Nonportable control whitespace replaced in the recorded expression') return messages.normalizedWhitespace;
      if (text === 'Original display expression could not fit the portable text limits') return messages.originalLimit;
    }
    return text;
  }

  return <details className="calculation-proof standard-proof" onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary>{messages.title}</summary>
    {Contents
      ? <Contents proof={proof} locale={locale} localizeText={localizeText} />
      : expanded && <p role="status" className="calculation-proof-body">{unavailable ? messages.unavailable : messages.loading}</p>}
  </details>;
}
