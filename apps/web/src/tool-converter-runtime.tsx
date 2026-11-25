import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationProofPanel } from './calculation-proof-panel';
import type { CalculationProof } from './calculation-proof';
import { LOCALES } from './i18n';
import { normalizeExpression, numberPresentation } from './locale-format';
import type { ModuleActivation } from './module-manager';
import type { ModuleWorkspaceProps, PrimaryModule } from './module-registry';
import { catalog, categoryList, currencies, defaultPairs, unitSymbol } from './tool-converter-catalog';
import type { Category, Pair } from './tool-converter-catalog';
import { activateTool } from './tool-runtime';
import './tool-converter.css';

type Mode = 'convert' | 'currency';
type CurrencyDraft = Pair & { amount: string; rate: string; source: string; as_of: string; valid_until: string; reference_date: string };
type ConverterState = {
  mode: Mode;
  category: Category;
  amount: string;
  pairs: Partial<Record<Category, Pair>>;
  currency: CurrencyDraft;
  proof?: CalculationProof;
};

const initialCurrency: CurrencyDraft = {
  amount: '', from: 'USD', to: 'BRL', rate: '', source: '', as_of: '', valid_until: '', reference_date: '',
};
const maxAmountBytes = 4096;
const utf8 = new TextEncoder();
const domainCategories: Readonly<Record<string, Category>> = {
  absolute_temperature: 'temperature', temperature_difference: 'temperature_delta',
  digital_storage: 'storage', transfer_rate: 'transfer',
};
const validityConstraints = {
  'Quote starts after the selected reference date': 'not_yet_valid',
  'Quote expired at the selected reference date': 'expired',
  'Quote within stated validity at the selected reference date': 'within_validity',
  'Quote validity date was not supplied': 'unverified_validity',
} as const;

export function activate(scope: ModuleActivation<ConverterState>): PrimaryModule<ConverterState> {
  const engine = activateTool(scope, () => new Worker(new URL('./tool-converter-worker.ts', import.meta.url), { type: 'module' }));
  let retained: ConverterState = scope.previousState ?? { mode: 'convert', category: 'length', amount: '', pairs: {}, currency: initialCurrency };

  function Workspace({ locale, messages: m, recordInteraction }: ModuleWorkspaceProps) {
    const [state, setState] = useState(retained);
    const [notice, setNotice] = useState<string>();
    const [pending, setPending] = useState(false);
    const current = useRef<AbortController | null>(null);
    const number = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
    const currencyNames = useMemo(() => new Intl.DisplayNames(LOCALES[locale].format, { type: 'currency' }), [locale]);
    const c = m.converter;
    const { mode, category, amount, currency, pairs, proof } = state;
    const pair = pairs[category] ?? defaultPairs[category];
    const isCurrency = mode === 'currency';
    const draftAmount = isCurrency ? currency.amount : amount;
    const complete = draftAmount.trim() && (!isCurrency ||
      (currency.rate.trim() && currency.source.trim() && currency.as_of && currency.reference_date));
    const normalize = (value: string) => normalizeExpression(value.trim(), number.decimal);

    function abandon() {
      const job = current.current;
      current.current = null;
      job?.abort();
    }
    useEffect(() => () => abandon(), []);

    function commit(next: ConverterState) {
      retained = next;
      setState(next);
    }

    function update(changes: Partial<Omit<ConverterState, 'proof'>>) {
      abandon();
      setPending(false);
      setNotice(undefined);
      commit({ ...state, ...changes, proof: undefined });
    }

    function changePair(next: Pair) {
      update({ pairs: { ...pairs, [category]: next } });
    }

    function changeCurrency(changes: Partial<CurrencyDraft>) {
      update({ currency: { ...currency, ...changes } });
    }

    function example() {
      if (isCurrency) {
        changeCurrency({
          amount: '25', from: 'USD', to: 'BRL', rate: '5', source: c.exampleSource,
          as_of: '2024-01-10', valid_until: '2024-01-31', reference_date: '2024-02-01',
        });
      } else update({ pairs: { ...pairs, [category]: defaultPairs[category] }, amount: category === 'temperature' ? '0' : '1' });
    }

    async function calculate() {
      if (current.current || !complete) return;
      const original_input = draftAmount.trim();
      const input = normalize(original_input);
      const rate = normalize(currency.rate);
      if (utf8.encode(original_input).byteLength > maxAmountBytes || utf8.encode(input).byteLength > maxAmountBytes ||
          (isCurrency && (utf8.encode(rate).byteLength > 256 || utf8.encode(currency.source.trim()).byteLength > 80))) {
        update({});
        setNotice('limit');
        return;
      }
      const options: Record<string, string> = isCurrency ? {
        from: currency.from, to: currency.to, rate, source: currency.source.trim(),
        as_of: currency.as_of, reference_date: currency.reference_date,
      } : { from: pair.from, to: pair.to };
      if (isCurrency && currency.valid_until) options.valid_until = currency.valid_until;
      const controller = new AbortController();
      current.current = controller;
      setPending(true);
      setNotice(undefined);
      commit({ ...state, proof: undefined });
      const start = performance.now();
      const response = await engine.submit({ schema: 1, module: 'converter', operation: mode, input, original_input, options }, controller.signal);
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
      invalid_input: c.invalid, domain: c.domainError, limit: m.processingLimit,
      unsupported: m.tools.unsupported, no_convergence: m.tools.convergence, timed_out: m.engineTimeout,
      cancelled: m.engineCancelled, queue_full: m.engineBusy, deferred: m.engineBusy,
    };
    const precision = proof?.precision;
    const currencyResult = isCurrency ? /^amount=(.+); status=([a-z_]+)$/u.exec(proof?.result ?? '') : null;
    const value = currencyResult?.[1] ?? proof?.result;
    const status = currencyResult?.[2];
    const unitFrom = proof?.units.from;
    const unitTo = proof?.units.to ?? proof?.units.amount;
    const statusLabel = status && Object.hasOwn(c.validity, status) ? c.validity[status as keyof typeof c.validity] : '';
    const financialOptions = isCurrency && proof ? proof.options : undefined;
    const metadata = [
      ['rate', c.exchangeRate], ['source', c.rateSource], ['as_of', c.rateDate], ['valid_until', c.validUntil], ['reference_date', c.referenceDate],
    ] as const;
    const format = (value: string) => number.format(value).replace(/\bpi\b/gu, 'π');

    function localizedUnit(code: string) {
      const meaning = Object.hasOwn(c.unitNames, code) ? c.unitNames[code as keyof typeof c.unitNames] : undefined;
      return meaning ? `${unitSymbol(code)} · ${meaning}` : unitSymbol(code);
    }

    function localizeProof(field: keyof CalculationProof, text: string): string {
      if (field === 'operation') return text === 'convert' ? c.units : text === 'currency' ? c.currency : text;
      if (field === 'units') return unitSymbol(text);
      if (field === 'domain') {
        if (text === 'currency') return c.currency;
        const family = Object.hasOwn(domainCategories, text) ? domainCategories[text] : text;
        if (family && Object.hasOwn(c.categories, family)) return c.categories[family as Category];
      }
      if (field === 'method' && Object.hasOwn(c.proof.methods, text)) return c.proof.methods[text as keyof typeof c.proof.methods];
      if (field === 'constraints') {
        if (Object.hasOwn(c.proof.constraints, text)) return c.proof.constraints[text as keyof typeof c.proof.constraints];
        if (Object.hasOwn(validityConstraints, text)) return c.validity[validityConstraints[text as keyof typeof validityConstraints]];
      }
      if (field === 'rounding' && text === 'nearest, ties to even') {
        return c.proof.constraints['Nominal result rounded to seven significant digits, ties to even'];
      }
      if (field === 'assumptions' && text === 'Working precision is not a certified error bound.') return c.proof.workingPrecision;
      if (field === 'formula') return text.replace(/\bpi\b/gu, 'π');
      return text;
    }

    function unitInput(side: keyof Pair) {
      return <label className="converter-field">{side === 'from' ? c.fromUnit : c.toUnit}
        <select value={pair[side]} onChange={(event) => changePair({ ...pair, [side]: event.currentTarget.value })}>
          {catalog[category].map((code) => <option key={code} value={code}>{localizedUnit(code)}</option>)}
        </select>
      </label>;
    }

    function currencyInput(side: keyof Pair) {
      return <label className="converter-field">{side === 'from' ? c.fromCurrency : c.toCurrency}
        <select value={currency[side]} onChange={(event) => changeCurrency({ [side]: event.currentTarget.value })}>
          {currencies.map((code) => <option key={code} value={code}>{code} · {currencyNames.of(code) ?? code}</option>)}
        </select>
      </label>;
    }

    function dateInput(key: 'as_of' | 'valid_until' | 'reference_date', label: string) {
      return <label className="converter-field">{label}
        <input type="date" dir="ltr" lang={locale} value={currency[key]} min="0001-01-01" max="9999-12-31"
          onChange={(event) => changeCurrency({ [key]: event.currentTarget.value })} />
      </label>;
    }

    return <section className="converter-workspace" aria-label={c.title} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && current.current) cancel();
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void calculate();
      }
    }}>
      <div className="converter-card converter-navigation" role="group" aria-label={c.mode}>
        {(['convert', 'currency'] as const).map((name) => <button key={name} type="button" aria-pressed={name === mode}
          onClick={() => { if (name !== mode) update({ mode: name }); }}>{name === 'convert' ? c.units : c.currency}</button>)}
      </div>
      <div className="converter-layout">
        <form className="converter-card" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          <div className="converter-fields">
            {!isCurrency && <label className="converter-field">{c.category}
              <select value={category} onChange={(event) => update({ category: event.currentTarget.value as Category })}>
                {categoryList.map((name) => <option key={name} value={name}>{c.categories[name]}</option>)}
              </select>
            </label>}
            <label className="converter-field">{c.amount}
              <input type="text" dir="ltr" className="converter-numeric" value={draftAmount} maxLength={maxAmountBytes}
                spellCheck={false} autoComplete="off" aria-describedby="converter-input-help"
                onChange={(event) => isCurrency ? changeCurrency({ amount: event.currentTarget.value }) : update({ amount: event.currentTarget.value })} />
            </label>
          </div>
          {isCurrency ? <>
            <div className="converter-fields converter-currency-line">{currencyInput('from')}{currencyInput('to')}</div>
            <div className="converter-quote-fields">
              <p className="converter-direction">{c.direction}
                {' '}<bdi dir="ltr">1 {currency.from} = {currency.rate.trim() || '…'} {currency.to}</bdi>
              </p>
              <div className="converter-fields">
                <label className="converter-field">{c.exchangeRate}
                  <input type="text" dir="ltr" className="converter-numeric" value={currency.rate} maxLength={256}
                    spellCheck={false} autoComplete="off" aria-describedby="converter-input-help"
                    onChange={(event) => changeCurrency({ rate: event.currentTarget.value })} />
                </label>
                <label className="converter-field">{c.rateSource}
                  <input type="text" dir="auto" value={currency.source} maxLength={80} autoComplete="off"
                    onChange={(event) => changeCurrency({ source: event.currentTarget.value })} />
                </label>
              </div>
              <div className="converter-fields">
                {dateInput('as_of', c.rateDate)}
                {dateInput('valid_until', c.validUntil)}
                {dateInput('reference_date', c.referenceDate)}
              </div>
            </div>
          </> : <div className="converter-units">
            {unitInput('from')}
            <button type="button" className="quiet-action" aria-label={c.swapUnits} title={c.swapUnits}
              onClick={() => changePair({ from: pair.to, to: pair.from })}>⇄</button>
            {unitInput('to')}
          </div>}
          <p className="converter-hint" id="converter-input-help">{isCurrency ? c.manualHint : c.hints[category]}</p>
          <div className="converter-actions">
            <button className="converter-primary" type="submit" disabled={pending || !complete}>{m.calculate}</button>
            {pending && <button type="button" className="quiet-action" onClick={cancel}>{m.cancelCalculation}</button>}
            <button type="button" className="quiet-action" onClick={example}>{c.useExample}</button>
            <button type="button" className="quiet-action" onClick={() => isCurrency ? update({ currency: initialCurrency }) : update({ amount: '' })}>{m.clear}</button>
          </div>
          <p className="converter-notice" role="status" data-error={Boolean(notice && notice !== 'cancelled') || undefined}>
            {pending ? m.working : notice ? (Object.hasOwn(messages, notice) ? messages[notice] : m.tools.engineUnavailable) : ''}
          </p>
        </form>

        <div className="converter-card">
          <div className="converter-result-heading">
            <strong id="converter-result-label">{m.result}</strong>
            {proof && <span>{proof.exactness === 'exact' ? m.exact : proof.exactness === 'symbolic' ? c.symbolic : m.approximate}</span>}
          </div>
          {statusLabel && <p className="converter-rate-status" role="status" data-stale={status !== 'within_validity' || undefined}>{statusLabel}</p>}
          <div className="converter-result" role="status" aria-labelledby="converter-result-label"
            data-testid="converter-result" data-canonical={proof?.result}>
            {value ? <>
              <div className="converter-value"><bdi dir="ltr">{format(value)}{unitTo ? ` ${unitSymbol(unitTo)}` : ''}</bdi></div>
              {unitFrom && proof && <p className="converter-exact"><bdi dir="ltr">{format(proof.normalized)} {unitSymbol(unitFrom)}</bdi></p>}
              {precision && <p className="converter-exact">{c.significantDigits.replace('{count}', number.format(String(precision)))}</p>}
            </> : '—'}
          </div>
          {financialOptions && <dl className="converter-dates">
            {metadata.map(([key, label]) => <div key={key}>
              <dt>{label}</dt><dd><bdi>{String(financialOptions[key] ?? '—')}</bdi></dd>
            </div>)}
          </dl>}
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
