# Standard calculation semantics

[Português brasileiro](../pt-BR/standard.md) · [Architecture](architecture.md)

## Use the calculator

Type or paste into **Expression**, or use the keypad to insert text at the caret. Press Enter or = to calculate, and Esc to clear. While editing, Ctrl+Z or ⌘Z undoes an edit. Ctrl+Y, Ctrl+Shift+Z or ⌘Shift+Z redoes it. The controls also work with Tab and Space or Enter. The editor retains up to 80 edits for undo.

Switch the result between **Decimal** and **Exact**. **Copy result** copies the active representation. It can be pasted into the expression field within the parser's input limits. An approximate-only result keeps its label and disables the Exact view.

| Memory key | Action |
| --- | --- |
| MS | Evaluate the current expression and store its value |
| M+ | Add the evaluated value to memory, starting from zero when memory is empty |
| M− | Subtract the evaluated value from memory, starting from zero when memory is empty |
| MR | Recall the stored value into the expression |
| MC | Clear memory |

Memory holds a reduced rational or certified interval produced by the engine. M+ and M− combine those values directly. For example, with `100` in memory, entering `sqrt(2)%` and pressing M+ adds √2 divided by 100, giving approximately `100.014142135623730950488`.

MR replaces an empty entry, a completed calculation, or the unchanged expression used by the last successful memory operation. In an edited expression, MR inserts the recalled value in parentheses at the caret or replaces the selection. If a result is approximate-only or an exact numerator or denominator exceeds 256 digits, the editor uses a reference such as `@1` for recall and when continuing a calculation. Each reference keeps the same value for as long as the editor, undo/redo, or history uses it. Clearing memory leaves those references usable for the current session.

Select an item from **History** to edit or rerun it. History retains the latest 32 successful calculations in this session. While a calculation is running, clearing history keeps that calculation from appearing in the cleared list. MC cancels a pending memory operation before clearing its value. **Cancel calculation** stops the current operation. Editing, undoing or redoing an edit also cancels work for the previous expression.

Closing or reloading resets calculator state. **Settings** saves the explicit theme and language choices on this device. Dark is the default on a fresh profile and uses a navy-blue palette. Choose System to follow the operating system, or choose Light or OLED explicitly. With no saved language, Standard uses the browser language preferences with English as the fallback.

The expression field accepts local decimal and digit forms. In locales that use a comma as the decimal mark, separate function arguments with `;`. For example, Brazilian Portuguese uses `root(-32;5)`, whereas the canonical engine and CLI syntax is `root(-32,5)`. Use ungrouped numbers for input. Grouping separators in the displayed result are presentation only.

## Expressions

The engine uses ASCII digits and a decimal point. Whitespace is allowed between tokens. A decimal point can precede or follow digits. A number token must have at least one digit. The UI handles locale-specific input and display at its boundary.

| Form | Meaning | Example |
| --- | --- | --- |
| `+`, `-` or `−` | Addition, subtraction, or prefix sign | `-2^2 = -4` |
| `*` or `×`, `/` or `÷` | Multiplication and exact rational division | `1/3` returns exact `1/3` |
| `^` | Right-associative exponentiation | `2^3^2 = 512` |
| `%` after a term | Divide by 100, with the relative rule below | `50% = 1/2` |
| `sqrt(x)`, `cbrt(x)`, `root(x,n)`, `√x` | Real roots | `root(-32,5) = -2` |
| `(x)` | Parenthesized expression | `(-2)^2 = 4` |

Precedence from highest to lowest is root prefix `√`, postfix percentage, power, prefix sign, multiplicative operators, and additive operators. Parentheses and function argument boundaries delimit a full expression. Multiplication and division at the same level associate to the left, as do addition and subtraction. Write multiplication explicitly. The grammar supports decimal literals without scientific notation or variables.

A percentage directly on the right of addition or subtraction uses the evaluated left operand as its base. For example, `200 + 10% = 220` and `200 - (10%) = 180`. Unary signs and grouping preserve that percentage form. Other operands use the ordinary division-by-100 meaning, so `200 * 10% = 20` and `200 + (10% * 2) = 200.2`. A recalled value or a reference such as `@1` is a numeric operand. An explicit `%` applied to it follows the same grammar.

## Exactness, approximation and limits

Decimals are exact rationals. An integer is returned as an integer string and other rational values as reduced numerator/denominator strings. For example, `0.1 + 0.2` produces exact `3/10` and decimal `0.3`. Real roots stay exact if both the numerator and denominator have exact roots.

The decimal output rounds to at most 24 significant digits, with ties to even. Irrational calculations use enclosures with outward rounding at 52 significant decimal digits. If the two endpoints do not certify the same displayed rounding, the engine returns `precision_limit`. Identical valid subexpressions can cancel exactly in subtraction, except when the relative percentage rule applies. The engine uses rational arithmetic and integer root bounds throughout.

Input is limited to 4,096 UTF-8 bytes, 256 digits per literal, 256 expression nodes and 48 recursive parsing levels. The engine bounds rational magnitude to 8,192 bits per numerator or denominator. A root degree must be an integer from 2 to 64. Exact rational exponents use a reduced denominator of at most 64 and an absolute numerator of at most 10,000. Division by zero, even roots of negative values, and `0^0` return errors. Unsupported operations, resource limits, and precision failures have separate codes.
