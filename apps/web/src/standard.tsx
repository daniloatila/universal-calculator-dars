import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { changeSign, edit, EMPTY_EDITOR, redo, spliceExpression, undo } from './editor';
import type { Editor } from './editor';
import type { Evaluation } from './engine';
import { Icon } from './icons';
import { LOCALES } from './i18n';
import type { Messages } from './i18n';
import { isExactDecimal, localizeExpression, normalizeExpression, numberPresentation } from './locale-format';
import type { ModuleContext } from './module-registry';

type Answer = Extract<Evaluation, { ok: true }>;
type Completed = { id: number; expression: string; input: string; decimalSeparator: string; answer: Answer };
type Mode = 'exact' | 'decimal';
type MemoryAction = 'store' | 'add' | 'subtract';
type Operation = { kind: 'evaluation' | 'memory'; controller: AbortController };
type Recalled = { expression: string; revision: number };

type StandardSnapshot = {
  editor: Editor;
  completed: Completed | null;
  history: Completed[];
  memory: Answer | null;
  mode: Mode;
  decimal: string;
  editRevision: number;
  memorySource: number | null;
  recalled: Recalled | null;
  nextId: number;
  nextBinding: number;
  bindings: Map<string, Answer>;
};

export type StandardSession = { current?: StandardSnapshot };

const MAX_INPUT = 4_096;
const HISTORY_LIMIT = 32;
const BINDING_LIMIT = 256;
const ZERO = { exact: '0', approximate: '0' };
const encoder = new TextEncoder();

function referenceIds(input: string): string[] {
  return Array.from(input.matchAll(/@[0-9]+/g), (match) => match[0].slice(1));
}

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
    case 'missing_parenthesis':
    case 'invalid_reference':
    case 'missing_binding': return messages.invalidExpression;
    case 'invalid_bindings':
    case 'invalid_value':
    case 'engine_unavailable': return messages.engineUnavailable;
    case 'engine_timeout': return messages.engineTimeout;
    case 'engine_busy': return messages.engineBusy;
    case 'engine_cancelled': return messages.engineCancelled;
    default: return messages.unknownError;
  }
}

export default function Standard({ locale, messages: m, evaluate, combine, engineStatus, session, cacheEntries }: ModuleContext) {
  const initial = session.current;
  const inputRef = useRef<HTMLInputElement>(null);
  const editRevision = useRef(initial?.editRevision ?? 0);
  const historyRevision = useRef(0);
  const memorySource = useRef(initial?.memorySource ?? null);
  const recalled = useRef(initial?.recalled ?? null);
  const operation = useRef<Operation | null>(null);
  const nextId = useRef(initial?.nextId ?? 0);
  const nextBinding = useRef(initial?.nextBinding ?? 0);
  const [retainedBindings] = useState(() => initial?.bindings ?? new Map<string, Answer>());
  const bindings = useRef(retainedBindings);
  const expressionId = useId();
  const referenceHelpId = useId();
  const [editor, setEditor] = useState(initial?.editor ?? EMPTY_EDITOR);
  const [completed, setCompleted] = useState(initial?.completed ?? null);
  const [history, setHistory] = useState(initial?.history ?? []);
  const [memory, setMemory] = useState(initial?.memory ?? null);
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'decimal');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState<Operation['kind'] | null>(null);
  const numbers = useMemo(() => numberPresentation(LOCALES[locale].format), [locale]);
  const previousDecimal = useRef(initial?.decimal ?? numbers.decimal);
  const format = useMemo(() => {
    if (!cacheEntries) return numbers.format;
    const cache = new Map<string, string>();
    return (value: string) => {
      const cached = cache.get(value);
      if (cached !== undefined) return cached;
      const formatted = numbers.format(value);
      if (cache.size >= cacheEntries) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(value, formatted);
      return formatted;
    };
  }, [numbers, cacheEntries]);

  useLayoutEffect(() => {
    session.current = {
      editor, completed, history, memory, mode, decimal: previousDecimal.current,
      editRevision: editRevision.current, memorySource: memorySource.current, recalled: recalled.current,
      nextId: nextId.current, nextBinding: nextBinding.current, bindings: bindings.current,
    };
  });

  useEffect(() => {
    const oldSeparator = previousDecimal.current;
    previousDecimal.current = numbers.decimal;
    if (oldSeparator === numbers.decimal) return;
    const convert = (value: string) => localizeExpression(normalizeExpression(value, oldSeparator), numbers.decimal);
    if (recalled.current) recalled.current.expression = convert(recalled.current.expression);
    setEditor((previous) => ({
      before: previous.before.map(convert),
      expression: convert(previous.expression),
      after: previous.after.map(convert),
    }));
  }, [numbers.decimal]);

  useEffect(() => {
    // Editor versions and history keep their original immutable value references alive.
    if (!bindings.current.size) return;
    const expressions = [editor.expression, ...editor.before, ...editor.after].filter((entry) => entry.includes('@'));
    const live = new Set(expressions.flatMap((entry) => referenceIds(normalizeExpression(entry, numbers.decimal))));
    for (const entry of history) for (const id of referenceIds(entry.input)) live.add(id);
    if (completed) for (const id of referenceIds(completed.input)) live.add(id);
    for (const id of bindings.current.keys()) if (!live.has(id)) bindings.current.delete(id);
  }, [editor, history, completed, memory, numbers.decimal]);

  useEffect(() => () => {
    const current = operation.current;
    operation.current = null;
    current?.controller.abort();
  }, []);

  const answer = completed?.answer ?? ZERO;
  const displayMode = mode === 'exact' && answer.exact === null ? 'decimal' : mode;
  const rawResult = displayMode === 'exact' ? (answer.exact ?? answer.approximate) : answer.approximate;
  const formattedResult = format(rawResult);
  const resultSize = formattedResult.length > 35 ? ' result-long' : formattedResult.length > 17 ? ' result-compact' : '';
  const alternate = displayMode === 'exact' ? answer.approximate : answer.exact;
  const decimalIsExact = isExactDecimal(answer.exact, answer.approximate);
  const acceptsWork = engineStatus === 'ready' || engineStatus === 'idle';
  const ready = acceptsWork && !busy;
  const inputAvailable = ready && Boolean(editor.expression.trim());

  function cancelActive() {
    const current = operation.current;
    if (!current) return;
    operation.current = null;
    current.controller.abort();
    setBusy(null);
  }

  function resetResult() {
    editRevision.current++;
    recalled.current = null;
    cancelActive();
    setCompleted(null);
    setError(null);
    setFeedback('');
  }

  function updateExpression(expression: string, caret?: number) {
    if (expression.length > MAX_INPUT || encoder.encode(normalizeExpression(expression, numbers.decimal)).length > MAX_INPUT) {
      setError('input_limit');
      return false;
    }
    if (expression !== editor.expression) {
      resetResult();
      setEditor((previous) => edit(previous, expression));
    }
    if (caret !== undefined) {
      window.requestAnimationFrame(() => inputRef.current?.setSelectionRange(caret, caret));
    }
    return true;
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

  function expressionBindings(input: string): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const id of referenceIds(input)) {
      const stored = bindings.current.get(id);
      if (stored) resolved[id] = stored.value;
    }
    return resolved;
  }

  function applyValue(value: Answer, apply: (expression: string) => boolean) {
    if (value.exact && !/\d{257}/.test(value.exact)) return apply(value.exact);
    for (const [id, existing] of bindings.current) if (existing === value) return apply(`@${id}`);
    if (bindings.current.size >= BINDING_LIMIT) {
      setError('complexity_limit');
      return false;
    }
    const id = String(++nextBinding.current);
    bindings.current.set(id, value);
    if (apply(`@${id}`)) return true;
    bindings.current.delete(id);
    return false;
  }

  function insert(fragment: string, continues = false, wrap = false) {
    if (completed && continues) {
      applyValue(completed.answer, (value) => {
        const expression = `(${value})${fragment}`;
        return updateExpression(expression, expression.length);
      });
      return;
    }
    if (continues && recalled.current?.revision === editRevision.current &&
        recalled.current.expression === editor.expression) {
      const expression = `(${editor.expression})${fragment}`;
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
    return updateExpression(update.expression, update.caret);
  }

  function backspace() {
    const input = inputRef.current;
    const start = input?.selectionStart ?? editor.expression.length;
    const end = input?.selectionEnd ?? start;
    const update = spliceExpression(editor.expression, start === end ? Math.max(0, start - 1) : start, end, '');
    updateExpression(update.expression, update.caret);
  }

  async function run(kind: Operation['kind'], work: (signal: AbortSignal, isCurrent: () => boolean) => Promise<void>) {
    if (operation.current || !acceptsWork) return;
    const current = { kind, controller: new AbortController() };
    const isCurrent = () => operation.current === current;
    operation.current = current;
    setBusy(kind);
    setError(null);
    setFeedback('');
    try {
      await work(current.controller.signal, isCurrent);
    } catch {
      if (isCurrent()) setError('engine_unavailable');
    } finally {
      if (isCurrent()) {
        operation.current = null;
        setBusy(null);
      }
    }
  }

  function evaluateExpression() {
    if (!editor.expression.trim()) return;
    const expression = editor.expression;
    const input = normalizeExpression(expression, numbers.decimal);
    const revision = historyRevision.current;
    void run('evaluation', async (signal, isCurrent) => {
      const result = await evaluate(input, expressionBindings(input), signal);
      if (!isCurrent()) return;
      if (!result.ok) {
        setCompleted(null);
        setError(result.code);
        return;
      }
      const current = { id: ++nextId.current, expression, input, decimalSeparator: numbers.decimal, answer: result };
      setCompleted(current);
      if (historyRevision.current === revision) setHistory((entries) => [current, ...entries].slice(0, HISTORY_LIMIT));
    });
  }

  function updateMemory(action: MemoryAction) {
    const expression = editor.expression;
    if (!expression.trim()) return;
    const input = normalizeExpression(expression, numbers.decimal);
    void run('memory', async (signal, isCurrent) => {
      const current = completed?.input === input ? completed.answer : await evaluate(input, expressionBindings(input), signal);
      if (!isCurrent()) return;
      if (!current.ok) {
        setError(current.code);
        return;
      }

      const result = action === 'store' ? current : await combine(memory?.value ?? '', current.value, action === 'subtract', signal);
      if (!isCurrent()) return;
      if (!result.ok) {
        setError(result.code);
        return;
      }
      memorySource.current = editRevision.current;
      setMemory(result);
    });
  }

  function recallMemory() {
    if (!memory) return;
    applyValue(memory, (value) => {
      if (!editor.expression.length || completed || memorySource.current === editRevision.current) {
        if (!updateExpression(value, value.length)) return false;
        recalled.current = { expression: value, revision: editRevision.current };
        return true;
      }
      // Parentheses preserve recalled rational values in an existing expression.
      return insert(`(${value})`) ?? false;
    });
  }

  function clearMemory() {
    if (operation.current?.kind === 'memory') cancelActive();
    memorySource.current = null;
    setMemory(null);
    setFeedback(m.memoryCleared);
  }

  async function copy() {
    if (!completed) return;
    const revision = editRevision.current;
    const plain = rawResult.replaceAll('.', numbers.decimal);
    try {
      await navigator.clipboard.writeText(plain);
      if (editRevision.current === revision) setFeedback(m.copied);
    } catch {
      if (editRevision.current === revision) setFeedback(m.copyFailed);
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
  const visibleReferences = [...new Set(referenceIds(editor.expression))].flatMap((id) => {
    const value = bindings.current.get(id);
    return value ? [{ id, value }] : [];
  });

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
                <bdi>{format(alternate)}</bdi>
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
            aria-invalid={Boolean(error)} aria-describedby={[error && 'feedback', visibleReferences.length && referenceHelpId].filter(Boolean).join(' ') || undefined}
            onChange={(event) => updateExpression(event.target.value)} onKeyDown={onExpressionKey}/>
          {visibleReferences.length > 0 && <ul id={referenceHelpId} className="value-references" aria-label={m.operations.retainedValues}>
            {visibleReferences.map(({ id, value }) => <li key={id}>
              <bdi>@{id} {value.exact === null ? '≈' : '='} {format(value.exact ?? value.approximate)}</bdi>
            </li>)}
          </ul>}
          <div id="feedback" className={`feedback${error || engineStatus === 'unavailable' ? ' feedback-error' : ''}`}
            role="status" aria-atomic="true">
            {error ? errorMessage(error, m)
              : engineStatus === 'loading' ? m.engineLoading
              : engineStatus === 'unavailable' ? m.engineUnavailable
              : busy ? m.working : feedback}
          </div>
          {busy && key(m.cancelCalculation, m.cancelCalculation, () => {
            cancelActive();
            setFeedback(m.engineCancelled);
          }, 'quiet-action')}
        </div>

        <div className="control-panel">
          <div className="memory-control" role="group" aria-label={m.memory}>
            <span className={`memory-status${memory ? ' memory-filled' : ''}`}
              title={memory ? format(memory.exact ?? memory.approximate) : m.emptyMemory}>
              <span aria-hidden="true">M</span>
              <span className="visually-hidden">
                {memory ? `${m.memory}: ${format(memory.exact ?? memory.approximate)}` : m.emptyMemory}
              </span>
            </span>
            {key(m.clearMemory, 'MC', clearMemory, 'memory-key', !memory && busy !== 'memory')}
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
            disabled={!history.length && busy !== 'evaluation'} onClick={() => {
              historyRevision.current++;
              setHistory([]);
              setFeedback(m.historyCleared);
            }}>
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
                  <bdi className="history-result">{format(entry.answer.exact ?? entry.answer.approximate)}</bdi>
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
