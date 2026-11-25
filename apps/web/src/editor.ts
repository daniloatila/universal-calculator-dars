const UNDO_LIMIT = 80;

export type Editor<T = string> = { before: T[]; expression: T; after: T[] };

export const EMPTY_EDITOR: Editor = { before: [], expression: '', after: [] };

export function edit<T>(editor: Editor<T>, expression: T): Editor<T> {
  if (expression === editor.expression) return editor;
  return {
    before: [...editor.before, editor.expression].slice(-UNDO_LIMIT),
    expression,
    after: [],
  };
}

export function undo<T>(editor: Editor<T>): Editor<T> {
  const previous = editor.before.at(-1);
  if (previous === undefined) return editor;
  return {
    before: editor.before.slice(0, -1),
    expression: previous,
    after: [editor.expression, ...editor.after],
  };
}

export function redo<T>(editor: Editor<T>): Editor<T> {
  const [next, ...after] = editor.after;
  if (next === undefined) return editor;
  return { before: [...editor.before, editor.expression], expression: next, after };
}

export function changeSign(expression: string): string {
  if (!expression.trim()) return '-';
  if (expression === '-') return '';
  if (/^-[\p{Nd}.,٫]+$/u.test(expression)) return expression.slice(1);
  // Only unwrap a leading negation when its closing parenthesis ends the entire expression.
  if (expression.startsWith('-(') && expression.endsWith(')')) {
    let depth = 0;
    for (let index = 1; index < expression.length; index++) {
      if (expression[index] === '(') depth++;
      if (expression[index] === ')') depth--;
      if (depth === 0 && index !== expression.length - 1) return `-(${expression})`;
    }
    return expression.slice(2, -1);
  }
  return `-(${expression})`;
}

export function spliceExpression(expression: string, start: number, end: number, fragment: string) {
  return {
    expression: expression.slice(0, start) + fragment + expression.slice(end),
    caret: start + fragment.length,
  };
}
