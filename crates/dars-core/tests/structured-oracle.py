"""Independent Fraction/Decimal oracle against the v0.1.1 structured WASM exports."""

from decimal import Decimal, localcontext
from fractions import Fraction
from pathlib import Path
import json
import subprocess


ROOT = Path(__file__).resolve().parents[3]
NODE = """
import { readFileSync } from 'node:fs';
import init, { evaluate_value_json, combine_values_json, evaluate_json }
  from './apps/web/src/wasm/dars_wasm.js';
await init({ module_or_path: readFileSync('./apps/web/src/wasm/dars_wasm_bg.wasm') });
const results = [];
for (const step of JSON.parse(readFileSync(0, 'utf8'))) {
  if (step[0] === 'evaluate') {
    const bindings = Object.fromEntries(Object.entries(step[2]).map(([id, previous]) => [id, results[previous].value]));
    results.push(JSON.parse(evaluate_value_json(step[1], JSON.stringify(bindings))));
  } else if (step[0] === 'combine') {
    const left = step[1] === null ? '' : results[step[1]].value;
    results.push(JSON.parse(combine_values_json(left, results[step[2]].value, step[3])));
  } else {
    results.push(JSON.parse(evaluate_json(step[1])));
  }
}
console.log(JSON.stringify(results));
"""


def expected_decimal(value):
    with localcontext() as context:
        context.prec = 24
        return +value


def main():
    steps = []
    expectations = []

    def case(step, expected, label, *, legacy=False, same_value=None):
        steps.append(step)
        expectations.append((expected, label, legacy, same_value))
        return len(steps) - 1

    def evaluate(text, expected, bindings=None, **kwargs):
        return case(["evaluate", text, bindings or {}], expected, text, **kwargs)

    def combine(left, right, subtract, expected):
        return case(["combine", left, right, subtract], expected, "subtract" if subtract else "add")

    with localcontext() as context:
        context.prec = 180
        base = evaluate("100", Fraction(100))
        absolute = Decimal(2).sqrt() / Decimal(100)
        rate = evaluate("sqrt(2)%", absolute)
        saved = combine(base, rate, False, Decimal(100) + absolute)
        evaluate("@1", Decimal(100) + absolute, {"1": saved}, same_value=saved)
        evaluate("100+(@1)", Decimal(100) + absolute, {"1": rate})
        evaluate("100+(@1)%", Decimal(100) + absolute, {"1": rate})
        evaluate("200+10%", Fraction(220))
        evaluate("200+@1%", Decimal(200) + 2 * absolute, {"1": rate})
        evaluate("@1^2", (Decimal(100) + absolute) ** 2, {"1": saved})
        evaluate("sqrt(@1)", (Decimal(100) + absolute).sqrt(), {"1": saved})
        evaluate("@1-@1", Fraction(0), {"1": saved})
        evaluate("@272", "missing_binding")
        evaluate("@01", "invalid_reference")
        evaluate("@1/(1-1)", "division_by_zero", {"1": rate})
        combine(None, rate, True, -absolute)

        # Display texts have 24 significant digits. Subtracting the exact accumulator
        # base recovers digits that would have been lost if memory stored that text.
        running = base
        for count in range(1, 41):
            result = Decimal(100) + count * absolute
            running = combine(running, rate, False, result)
            evaluate("@1", result, {"1": running}, same_value=running)
            evaluate("@1-100", count * absolute, {"1": running})
        for count in range(39, 8, -1):
            result = Decimal(100) + count * absolute
            running = combine(running, rate, True, result)
            evaluate("@1", result, {"1": running}, same_value=running)
            evaluate("@1-100", count * absolute, {"1": running})

        huge = Fraction(2 ** 1000)
        large = evaluate("2^1000", huge)
        unit = evaluate("1", Fraction(1))
        plus = combine(large, unit, False, huge + 1)
        evaluate("@1 - @2", Fraction(1), {"1": plus, "2": large})
        evaluate("@1 / 2", (huge + 1) / 2, {"1": plus})
        for index in range(1, 12):
            a = Fraction(-index, 7)
            b = Fraction(index + 2, 33)
            left = evaluate(str(a), a)
            right = evaluate(str(b), b)
            value = combine(left, right, False, a + b)
            combine(left, right, True, a - b)
            evaluate("(@1)^2", (a + b) ** 2, {"1": value})
        case(["legacy", "200+10%"], Fraction(220), "legacy relative percentage", legacy=True)
        case(["legacy", "@1"], "invalid_character", "legacy rejects bindings", legacy=True)
        case(["legacy", "1/3"], Fraction(1, 3), "legacy rational", legacy=True)

        run = subprocess.run(
            ["node", "--input-type=module", "-e", NODE], cwd=ROOT,
            input=json.dumps(steps), text=True, capture_output=True, check=True,
        )
        actual = json.loads(run.stdout)
        assert len(actual) == len(expectations)
        for index, (result, spec) in enumerate(zip(actual, expectations, strict=True)):
            expected, label, legacy, same_value = spec
            if isinstance(expected, str):
                assert result == {"ok": False, "code": expected}, (index, label, result)
                continue
            assert result["ok"] is True, (index, label, result)
            if isinstance(expected, Fraction):
                assert result["exact"] == str(expected), (index, label, result)
                decimal = Decimal(expected.numerator) / Decimal(expected.denominator)
            else:
                assert result["exact"] is None, (index, label, result)
                decimal = expected
            assert Decimal(result["approximate"]) == expected_decimal(decimal), (index, label, result, decimal)
            assert ("value" in result) is not legacy, (index, label, result)
            if same_value is not None:
                assert result["value"] == actual[same_value]["value"], (index, label)

    print(json.dumps({"suite": "fraction-decimal-structured-wasm", "passed": len(steps), "failed": 0, "referencePrecision": 180}))


if __name__ == "__main__":
    main()
