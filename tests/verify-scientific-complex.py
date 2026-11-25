"""Compare Scientific principal values against mpmath.

The engine requests 32 significant digits. Each real and imaginary component is
checked separately against a 105-digit reference with relative tolerance 2e-29.
The reference magnitude is floored at 1e-400 for a zero component.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import mpmath as mp


DECIMAL = r"(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
CARTESIAN = re.compile(fr"([+-]?{DECIMAL})([+-])({DECIMAL})?")
REQUESTED_DIGITS = 32
REFERENCE_DIGITS = 105


def decimal_value(text):
    if not re.fullmatch(fr"[+-]?{DECIMAL}", text):
        raise AssertionError(f"Expected a finite decimal component, got {text!r}.")
    return mp.mpf(text)


def read_cartesian(text):
    compact = text.replace(" ", "")
    if not compact.endswith("i"):
        return mp.mpc(decimal_value(compact))
    body = compact[:-1].removesuffix("*")
    components = CARTESIAN.fullmatch(body)
    if components:
        real, sign, imaginary = components.groups()
        return mp.mpc(decimal_value(real), decimal_value(sign + (imaginary or "1")))
    return mp.mpc(0, decimal_value({"": "1", "+": "1", "-": "-1"}.get(body, body)))


def request(executable, expression, *, complex_mode=True, angle="rad"):
    payload = json.dumps(
        {
            "schema": 1,
            "module": "scientific",
            "operation": "evaluate",
            "input": expression,
            "options": {"complex": complex_mode, "angle": angle, "precision": REQUESTED_DIGITS},
        }
    )
    process = subprocess.run(
        [executable, "tool", payload], capture_output=True, encoding="utf-8", timeout=10
    )
    if process.returncode not in (0, 1):
        raise AssertionError((expression, process.returncode, process.stderr))
    return json.loads(process.stdout)


def principal_cases():
    # On-cut values and the two nearby sides are distinct test inputs.
    for name, arguments in {
        "asin": (
            "2", "-2", "2+1e-30*i", "2-1e-30*i", "-2+1e-30*i", "-2-1e-30*i", "2+i"
        ),
        "acos": ("2", "-2", "2+1e-30*i", "-2-1e-30*i", "-2+i"),
        "atan": ("2*i", "-2*i", "1e-30+2*i", "-1e-30+2*i", "1+2*i"),
        "asinh": ("2*i", "-2*i", "1e-30+2*i", "-1e-30+2*i", "1+2*i"),
        "acosh": ("-2", "-2+1e-30*i", "-2-1e-30*i", "0", "0.5", "2+i"),
        "atanh": ("2", "-2", "2+1e-30*i", "2-1e-30*i", "1+2*i"),
        "sqrt": ("-2", "-2-1e-30*i", "-2+1e-30*i", "-1e150+1e-250*i"),
        "ln": ("-2", "-2-1e-30*i", "-2+1e-30*i", "1e-60+1e-30*i"),
    }.items():
        reference = getattr(mp, name)
        for argument in arguments:
            yield f"{name}({argument})", reference(read_cartesian(argument))


def composed_cases():
    z = mp.mpc("0.3", "-0.7")
    for name in ("sin", "cos", "tan", "sinh", "cosh", "tanh", "exp"):
        yield f"{name}(0.3-0.7*i)", getattr(mp, name)(z)
    yield "sin(asinh(0.3-0.7*i))", mp.sin(mp.asinh(z))
    yield "ln(exp(0.3-0.7*i))", mp.ln(mp.exp(z))
    yield "cosh(ln(0.3-0.7*i))", mp.cosh(mp.ln(z))
    yield "sqrt(1+sqrt(0.3-0.7*i))", mp.sqrt(1 + mp.sqrt(z))
    yield "ln(1+i)/sqrt(2-i)", mp.ln(mp.mpc(1, 1)) / mp.sqrt(mp.mpc(2, -1))
    yield "log(0.3-0.7*i,3)", mp.log(z, 3)
    yield "abs(1/3+i/11)", abs(mp.mpc(mp.mpf(1) / 3, mp.mpf(1) / 11))
    yield "approx(2+3*i)^-3", mp.power(mp.mpc(2, 3), -3)
    yield "root(-2,3)", mp.root(mp.mpc(-2), 3)
    yield "pow(0.3-0.7*i,1+i/5)", mp.power(z, mp.mpc(1, mp.mpf(1) / 5))
    yield "tanh(approx(i*pi/4))", mp.tanh(mp.pi * mp.j / 4)


def real_policy_cases():
    argument = mp.mpf("0.3")
    yield "atan(0.3)", mp.atan(argument) * 180 / mp.pi, "deg"
    yield "cos(approx(0.3))", mp.cos(argument * mp.pi / 200), "grad"
    yield "sin(approx(0.3)°)", mp.sin(argument * mp.pi / 180), "grad"
    # A large exact degree value reduces modulo 360 before entering numerical trig.
    reduced_degrees = 10**90 % 360
    yield "sin(1e90°)", mp.sin(reduced_degrees * mp.pi / 180), "rad"
    yield "root(-2,3)", -mp.root(2, 3), "rad"
    yield "pow(-2,-2/3)", mp.root(2, 3) ** -2, "rad"
    yield "-e+1", 1 - mp.e, "rad"


def check_value(executable, expression, expected, **options):
    answer = request(executable, expression, **options)
    assert answer["ok"], (expression, answer)
    proof = answer["proof"]
    assert proof["exactness"] == "approximate", (expression, proof["exactness"])
    assert proof["precision"] == REQUESTED_DIGITS and proof["error_bound"] is None
    actual = read_cartesian(proof["result"])
    tolerance = mp.mpf("2e-29")
    zero_scale = mp.mpf("1e-400")
    for received, reference in ((actual.real, expected.real), (actual.imag, expected.imag)):
        assert abs(received - reference) <= max(abs(reference), zero_scale) * tolerance, (
            expression, proof["result"], mp.nstr(expected, 40)
        )


def main():
    executable = Path(sys.argv[1]).resolve(strict=True)
    mp.mp.dps = REFERENCE_DIGITS
    results = {}
    for name, corpus in (("principal_values", principal_cases()), ("composed", composed_cases())):
        count = 0
        for expression, expected in corpus:
            check_value(executable, expression, expected)
            count += 1
        results[name] = count

    real_count = 0
    for expression, expected, angle in real_policy_cases():
        check_value(executable, expression, expected, angle=angle, complex_mode=False)
        real_count += 1
    results["real_policy"] = real_count

    failures = (
        ("atan(i)", True, "domain"),
        ("tanh(i*pi/2)", True, "domain"),
        ("log(1+i,1+i)", True, "domain"),
        ("acosh(0.5)", False, "domain"),
        ("asin(1+1e-500)", False, "domain"),
        ("atanh(1-1e-500)", False, "no_convergence"),
        ("approx(1e500)+1-approx(1e500)", False, "no_convergence"),
        ("exp(4097+i)", True, "limit"),
        ("approx(1°)", False, "domain"),
    )
    for expression, complex_mode, code in failures:
        answer = request(executable, expression, complex_mode=complex_mode)
        assert not answer["ok"] and answer["code"] == code, (expression, answer)
    results["bounded_rejections"] = len(failures)

    print(json.dumps({
        "suite": "scientific-complex-mpmath",
        "passed": sum(results.values()),
        "failed": 0,
        "cases": results,
        "mpmath": mp.__version__,
        "oracle_decimal_digits": REFERENCE_DIGITS,
        "requested_significant_digits": REQUESTED_DIGITS,
        "component_relative_tolerance": "2e-29 with 1e-400 scale floor",
    }))


if __name__ == "__main__":
    main()
