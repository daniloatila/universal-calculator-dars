import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { changeSign, edit, EMPTY_EDITOR, redo, spliceExpression, undo } from './editor';
import type { Evaluation } from './engine';
import { Icon } from './icons';
import { LOCALES } from './i18n';
import type { Messages } from './i18n';
import { isExactDecimal, localizeExpression, normalizeExpression, numberPresentation } from './locale-format';
import type { ModuleContext } from './module-registry';

type Answer = Extract<Evaluation, { ok: true }>;
type Completed = { id: number; expression: string; input: string; decimalSeparator: string; answer: Answer };
type Memory = { input: string; answer: Answer };
type Mode = 'exact' | 'decimal';
type MemoryAction = 'store' | 'add' | 'subtract';

const MAX_INPUT = 4_096;
const HISTORY_LIMIT = 32;
const ZERO: Answer = { ok: true, exact: '0', approximate: '0' };
const encoder = new TextEncoder();

function errorMessage(code: string, messages: Messages) {
  switch (code) {
    case 'division_by_zero': return messages.divisionByZero;
    case 'domain_error': return messages.domainError;
    case 'unsupported_exponent': return messages.unsupportedOperation;
    case 'input_limit': return messages.inputLimit;
    case 'complexity_limit':
    case 'magnitude_limit':
    case 'precision_limit': return messages.processingLimit;
    case 'empty_expression':
    case 'invalid_character':
    case 'invalid_number':
    case 'unexpected_token':
    case 'missing_parenthesis': return messages.invalidExpression;
    case 'engine_unavailable': return messages.engineUnavailable;
    default: return messages.unknownError;
  }
}

function reusableValue(input: string, answer: Answer) {
  // A large computed result may exceed the engine's per-literal digit budget.
  return answer.exact && !/\d{257}/.test(answer.exact) ? answer.exact : input;
}

export default function Standard({ locale, messages: m, evaluate, engineStatus }: ModuleContext) {
  const inputRef = useRef<HTMLInputElement>(null);
  const editRevision = useRef(0);
  const running = useRef(false);
  const nextId = useRef(0);
  const expressionId = useId();
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [history, setHistory] = useState<Completed[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [mode, setMode] = useState<Mode>('decimal');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const numbers = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
  const previousDecimal = useRef(numbers.decimal);

  useEffect(() => {
    const oldSeparator = previousDecimal.current;
    previousDecimal.current = numbers.decimal;
    if (oldSeparator === numbers.decimal) return;
    const convert = (value: string) => localizeExpression(normalizeExpression(value, oldSeparator), numbers.decimal);
    setEditor((previous) => ({
      before: previous.before.map(convert),
      expression: convert(previous.expression),
      after: previous.after.map(convert),
    }));
  }, [numbers.decimal]);

  const answer = completed?.answer ?? ZERO;
  const displayMode = mode === 'exact' && answer.exact === null ? 'decimal' : mode;
  const rawResult = displayMode === 'exact' ? (answer.exact ?? answer.approximate) : answer.approximate;
  const formattedResult = numbers.format(rawResult);
  const resultSize = formattedResult.length > 35 ? ' result-long' : formattedResult.length > 17 ? ' result-compact' : '';
  const alternate = displayMode === 'exact' ? answer.approximate : answer.exact;
  const decimalIsExact = isExactDecimal(answer.exact, answer.approximate);
  const ready = engineStatus === 'ready' && !busy;
  const inputAvailable = ready && Boolean(editor.expression.trim());

  function resetResult() {
    editRevision.current++;
    setCompleted(null);
    setError(null);
    setFeedback('');
  }

  function updateExpression(expression: string, caret?: number) {
    if (expression.length > MAX_INPUT || encoder.encode(normalizeExpression(expression, numbers.decimal)).length > MAX_INPUT) {
      setError('input_limit');
      return;
    }
    if (expression !== editor.expression) {
      resetResult();
      setEditor((previous) => edit(previous, expression));
    }
    if (caret !== undefined) {
      window.requestAnimationFrame(() => inputRef.current?.setSelectionRange(caret, caret));
    }
  }

  function editStep(direction: 'undo' | 'redo') {
    const next = direction === 'undo' ? undo(editor) : redo(editor);
    if (next === editor) return;
    resetResult();
    setEditor(next);
  }

  function visibleExpression(entry: Completed) {
    return entry.decimalSeparator === numbers.decimal ? entry.expression : localizeExpression(entry.input, numbers.decimal);
  }

  function insert(fragment: string, continues = false, wrap = false) {
    if (completed && continues) {
      const expression = `(${visibleExpression(completed)})${fragment}`;
      updateExpression(expression, expression.length);
      return;
    }
    if (completed && !wrap && /^[0-9\p{Nd}.,٫(]$/u.test(fragment)) {
      updateExpression(fragment, fragment.length);
      return;
    }
    const input = inputRef.current;
    const start = input?.selectionStart ?? editor.expression.length;
    const end = input?.selectionEnd ?? start;
    const value = wrap && start < end
      ? `${fragment}${editor.expression.slice(start, end)})`
      : fragment;
    const update = spliceExpression(editor.expression, start, end, value);
    updateExpression(update.expression, update.caret);
  }

  function backspace() {
    const input = inputRef.current;
    const start = input?.selectionStart ?? editor.expression.length;
    const end = input?.selectionEnd ?? start;
    const update = spliceExpression(editor.expression, start === end ? Math.max(0, start - 1) : start, end, '');
    updateExpression(update.expression, update.caret);
  }

  async function run<T>(work: () => Promise<T>) {
    if (running.current || engineStatus !== 'ready') return;
    running.current = true;
    setBusy(true);
    setError(null);
    setFeedback('');
    try {
      await work();
    } catch {
      setError('engine_unavailable');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function evaluateExpression() {
    if (!editor.expression.trim()) return;
    const expression = editor.expression;
    const revision = editRevision.current;
    const input = normalizeExpression(expression, numbers.decimal);
    void run(async () => {
      const result = await evaluate(input);
      if (revision !== editRevision.current) return;
      if (!result.ok) {
        setCompleted(null);
        setError(result.code);
        return;
      }
      const current = { id: ++nextId.current, expression, input, decimalSeparator: numbers.decimal, answer: result };
      setCompleted(current);
      setHistory((entries) => [current, ...entries].slice(0, HISTORY_LIMIT));
    });
  }

  function updateMemory(action: MemoryAction) {
    const expression = editor.expression;
    if (!expression.trim()) return;
    const input = normalizeExpression(expression, numbers.decimal);
    void run(async () => {
      const current = completed?.input === input ? completed.answer : await evaluate(input);
      if (!current.ok) {
        setError(current.code);
        return;
      }

      const value = reusableValue(input, current);
      if (action === 'store') {
        setMemory({ input: value, answer: current });
        return;
      }

      const sign = action === 'add' ? '+' : '-';
      const combined = `(${memory?.input ?? '0'})${sign}(${value})`;
      const result = await evaluate(combined);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      setMemory({ input: reusableValue(combined, result), answer: result });
    });
  }

  function recallMemory() {
    if (!memory) return;
    const localized = localizeExpression(memory.input, numbers.decimal);
    if (!editor.expression.length || completed) {
      updateExpression(localized, localized.length);
      return;
    }
    // Parentheses keep recalled fractions and expressions intact when inserted into another expression.
    insert(`(${localized})`);
  }

  async function copy() {
    if (!completed) return;
    const plain = rawResult.replaceAll('.', numbers.decimal);
    try {
      await navigator.clipboard.writeText(plain);
      setFeedback(m.copied);
    } catch {
      setFeedback(m.copyFailed);
    }
  }

  function onExpressionKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
      event.preventDefault();
      editStep(key === 'y' || event.shiftKey ? 'redo' : 'undo');
    } else if (key === '=' || key === 'enter') {
      event.preventDefault();
      evaluateExpression();
    } else if (key === 'escape') {
      event.preventDefault();
      updateExpression('', 0);
    }
  }

  function preserveCaret(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && document.activeElement === inputRef.current) event.preventDefault();
  }

  function key(label: string, content: ReactNode, action: () => void, style = 'key', disabled = false) {
    return <button type="button" className={style} aria-label={label} onPointerDown={preserveCaret}
      title={label} disabled={disabled} onClick={action}>{content}</button>;
  }

  const digit = (value: number) => key(String(value), numbers.digits[value], () => insert(numbers.digits[value] ?? String(value)));

  return (
    <div className="workspace">
      <section className="calculator-panel" aria-labelledby="calculator-title">
        <h2 className="visually-hidden" id="calculator-title">{m.pageTitle}</h2>
        <div className="display-panel">
          <div className="display-heading">
            <div className="display-labels">
              <span className="section-label">{m.result}</span>
              {completed && displayMode === 'decimal' && !decimalIsExact && <span>{m.approximate}</span>}
            </div>
            <div className="result-modes" role="group" aria-label={m.result}>
              <button type="button" aria-pressed={displayMode === 'decimal'} onClick={() => setMode('decimal')}>{m.decimal}</button>
              <button type="button" aria-pressed={displayMode === 'exact'} disabled={answer.exact === null}
                title={answer.exact === null ? m.noExact : undefined} onClick={() => setMode('exact')}>{m.exact}</button>
            </div>
          </div>
          <output data-testid="result" className={`result-value${resultSize}`} aria-label={m.result} aria-live="polite" aria-atomic="true" dir="ltr">
            {error && !completed ? '—' : formattedResult}
          </output>
          <div className="display-secondary">
            <div className="result-detail">
              {completed && alternate && alternate !== rawResult && <>
                <span>{displayMode === 'exact' ? (decimalIsExact ? m.decimal : m.approximate) : m.exact}</span>
                <bdi>{numbers.format(alternate)}</bdi>
              </>}
            </div>
            <button type="button" className="quiet-action copy-action" aria-label={m.copy}
              title={m.copyHint} disabled={!completed} onClick={() => void copy()}>
              <Icon name="copy" size={16} />{m.copy}
            </button>
          </div>
        </div>

        <div className="expression-block">
          <div className="expression-heading">
            <label htmlFor={expressionId} className="section-label">{m.expression}</label>
            <div className="editing-actions">
              {key(m.undo, <Icon name="undo" size={17} />, () => editStep('undo'), 'icon-button', !editor.before.length)}
              {key(m.redo, <Icon name="redo" size={17} />, () => editStep('redo'), 'icon-button', !editor.after.length)}
            </div>
          </div>
          <input ref={inputRef} id={expressionId} name="expression" type="text" inputMode="text"
            className="expression-input" value={editor.expression} placeholder={numbers.digits[0] ?? '0'}
            autoComplete="off" autoCorrect="off" spellCheck={false} dir="ltr"
            aria-invalid={Boolean(error)} aria-describedby={error ? 'feedback' : undefined}
            onChange={(event) => updateExpression(event.target.value)} onKeyDown={onExpressionKey}/>
          <div id="feedback" className={`feedback${error || engineStatus === 'unavailable' ? ' feedback-error' : ''}`}
            role="status" aria-atomic="true">
            {error ? errorMessage(error, m)
              : engineStatus === 'loading' ? m.engineLoading
              : engineStatus === 'unavailable' ? m.engineUnavailable
              : busy ? m.working : feedback}
          </div>
        </div>

        <div className="control-panel">
          <div className="memory-control" role="group" aria-label={m.memory}>
            <span className={`memory-status${memory ? ' memory-filled' : ''}`}
              title={memory ? numbers.format(memory.answer.exact ?? memory.answer.approximate) : m.emptyMemory}>
              <span aria-hidden="true">M</span>
              <span className="visually-hidden">
                {memory ? `${m.memory}: ${numbers.format(memory.answer.exact ?? memory.answer.approximate)}` : m.emptyMemory}
              </span>
            </span>
            {key(m.clearMemory, 'MC', () => { setMemory(null); setFeedback(m.memoryCleared); }, 'memory-key', !memory)}
            {key(m.recallMemory, 'MR', recallMemory, 'memory-key', !memory)}
            {key(m.storeMemory, 'MS', () => updateMemory('store'), 'memory-key', !inputAvailable)}
            {key(m.addMemory, 'M+', () => updateMemory('add'), 'memory-key', !inputAvailable)}
            {key(m.subtractMemory, 'M−', () => updateMemory('subtract'), 'memory-key', !inputAvailable)}
          </div>
          <div className="keypad" dir="ltr">
            {key(m.openParen, '(', () => insert('('), 'key key-function')}
            {key(m.closeParen, ')', () => insert(')'), 'key key-function')}
            {key(m.squareRoot, '√', () => insert('sqrt(', false, true), 'key key-function')}
            {key(m.power, <span aria-hidden="true">x<sup>y</sup></span>, () => insert('^', true), 'key key-function')}
            {key(m.clear, 'AC', () => updateExpression('', 0), 'key key-function key-clear')}
            {key(m.backspace, <Icon name="backspace" size={20} />, backspace, 'key key-function')}
            {key(m.percent, '%', () => insert('%', true), 'key key-function')}
            {key(m.divide, '÷', () => insert('/', true), 'key key-operator')}
            {digit(7)}{digit(8)}{digit(9)}
            {key(m.multiply, '×', () => insert('*', true), 'key key-operator')}
            {digit(4)}{digit(5)}{digit(6)}
            {key(m.subtract, '−', () => insert('-', true), 'key key-operator')}
            {digit(1)}{digit(2)}{digit(3)}
            {key(m.add, '+', () => insert('+', true), 'key key-operator')}
            {key(m.changeSign, '±', () => updateExpression(changeSign(editor.expression)), 'key key-function')}
            {digit(0)}
            {key(m.decimal, numbers.decimal, () => insert(numbers.decimal))}
            {key(m.calculate, '=', evaluateExpression, 'key key-equals', !inputAvailable)}
          </div>
        </div>
      </section>

      <aside className="history-panel" aria-labelledby="history-title">
        <div className="history-heading">
          <Icon name="clock" size={19}/>
          <h2 id="history-title">{m.history}</h2>
          <button type="button" className="icon-button history-clear" aria-label={m.clearHistory} title={m.clearHistory}
            disabled={!history.length} onClick={() => { setHistory([]); setFeedback(m.historyCleared); }}>
            <Icon name="trash" size={17}/>
          </button>
        </div>
        {history.length ? (
          <ol className="history-list">
            {history.map((entry) => {
              const expression = visibleExpression(entry);
              return <li key={entry.id}>
                <button type="button" className="history-entry"
                  aria-label={`${m.useHistory}: ${expression}`}
                  onClick={() => { updateExpression(expression, expression.length); inputRef.current?.focus(); }}>
                  <bdi className="history-expression">{expression}</bdi>
                  <bdi className="history-result">{numbers.format(entry.answer.exact ?? entry.answer.approximate)}</bdi>
                  <Icon name="arrow" size={15}/>
                </button>
              </li>;
            })}
          </ol>
        ) : (
          <div className="empty-history">
            <span className="empty-icon"><Icon name="clock" size={24}/></span>
            <h3>{m.emptyHistory}</h3>
            <p>{m.historyHint}</p>
          </div>
        )}
        <div className="history-note"><Icon name="lock" size={16}/><span>{m.temporary}</span></div>
      </aside>
    </div>
  );
}
