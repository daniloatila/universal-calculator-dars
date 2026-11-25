"""Independent SymPy/mpmath oracle for the Scientific CLI contract."""

import json
import random
import re
import subprocess
import sys
from pathlib import Path

import mpmath as mp
import sympy as sp


cli = Path(sys.argv[1]).resolve(strict=True)
mp.mp.dps = 125
checks = 0
number = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")


def request(expression, **options):
    payload = json.dumps({
        "schema": 1, "module": "scientific", "operation": "evaluate", "input": expression,
        "options": options,
    }, ensure_ascii=False)
    process = subprocess.run(
        [cli, "tool", payload], capture_output=True, encoding="utf-8", timeout=8,
    )
    response = json.loads(process.stdout)
    assert process.returncode == (0 if response["ok"] else 1), (expression, response, process.stderr)
    return response


def exact(expression, expected, **options):
    global checks
    response = request(expression, **options)
    assert response["ok"], (expression, response)
    proof = response["proof"]
    assert proof["exactness"] in ("exact", "symbolic"), (expression, proof)
    assert proof["result"] == expected, (expression, expected, proof["result"])
    assert proof["expression"] == expression and proof["module"] == "scientific", proof
    checks += 1


def numeric(expression, expected, precision=32, **options):
    global checks
    response = request(expression, precision=precision, **options)
    assert response["ok"], (expression, response)
    proof = response["proof"]
    assert proof["exactness"] == "approximate", (expression, proof)
    assert proof["precision"] == precision and proof["error_bound"] is None, (expression, proof)
    result = proof["result"]
    assert number.fullmatch(result), (expression, result)
    error = abs(mp.mpf(result) - expected)
    tolerance = mp.power(10, -(precision - 2)) * abs(expected)
    assert error <= tolerance, (expression, result, mp.nstr(expected, precision + 4))
    checks += 1


exact("sin(90°)", str(sp.sin(sp.pi / 2)))
exact("cos(180°)", str(sp.cos(sp.pi)))
exact("ln(1)", str(sp.log(1)))
exact("log₂(1024)", str(sp.log(1024, 2)))
exact("20!", str(sp.factorial(20)))
exact("sqrt(-1)", str(sp.sqrt(-1)).lower(), complex=True)
exact("exp(i*pi)+1", str(sp.exp(sp.I * sp.pi) + 1), complex=True)
exact("sin(100)", str(sp.sin(sp.pi / 2)), angle="grad")
exact("3/7 + 5/11", str(sp.Rational(3, 7) + sp.Rational(5, 11)))

for expression, expected in [
    ("3^-2", 3 ** sp.Integer(-2)), ("ln(e)", sp.log(sp.E)), ("e/e", sp.E / sp.E),
    ("e-e", sp.E - sp.E), ("sin(tau)", sp.sin(2 * sp.pi)), ("sin(0)", sp.sin(0)),
    ("tan(0)", sp.tan(0)), ("tan(pi)", sp.tan(sp.pi)),
    ("sin(7*pi/6)", sp.sin(7 * sp.pi / 6)), ("sin(11*pi/6)", sp.sin(11 * sp.pi / 6)),
    ("log10(1000)", sp.log(1000, 10)), ("log(1,3)", sp.log(1, 3)),
    ("cosh(0)", sp.cosh(0)), ("sinh(0)", sp.sinh(0)), ("tanh(0)", sp.tanh(0)),
    ("0^(1/2)", sp.sqrt(0)), ("0^2", sp.Integer(0) ** 2), ("4^(1/2)", sp.sqrt(4)),
    ("7^1", sp.Integer(7)), ("root(8,3)", sp.real_root(8, 3)), ("1^123", sp.Integer(1) ** 123),
    ("atan(0)", sp.atan(0)), ("tan(135°)", sp.tan(3 * sp.pi / 4)), ("cos(3*pi/2)", sp.cos(3 * sp.pi / 2)),
]:
    exact(expression, str(expected))

exact("exp(1)", str(sp.E).lower())
exact("tau", str(2 * sp.pi).replace("pi", "π"))
exact("abs(-pi)", str(sp.Abs(-sp.pi)).replace("pi", "π"))
exact("-(pi)", str(-sp.pi).replace("pi", "π"))
for coefficient in (-2, 2):
    exact(f"{coefficient}*i", str(coefficient * sp.I).lower(), complex=True)
assert sp.log(-1) == sp.I * sp.pi
exact("ln(-1)", "(i)*π", complex=True)
exact("abs(3+4*i)", str(sp.Abs(3 + 4 * sp.I)), complex=True)

for function, argument, reference in [
    ("sin", "0.3", mp.sin), ("cos", "-0.3", mp.cos), ("tan", "0.3", mp.tan),
    ("asin", "0.2", mp.asin), ("acos", "0.999999999999", mp.acos),
    ("atan", "-1.5", mp.atan), ("sinh", "-0.2", mp.sinh), ("cosh", "0.2", mp.cosh),
    ("tanh", "0.2", mp.tanh), ("asinh", "-0.2", mp.asinh), ("acosh", "1.001", mp.acosh),
    ("atanh", "0.9999999999", mp.atanh), ("ln", "1.00000000001", mp.log), ("exp", "-35", mp.exp),
    ("sqrt", "2", mp.sqrt), ("ln", "1e-100", mp.log),
]:
    numeric(f"{function}({argument})", reference(mp.mpf(argument)))

for requested in (8, 24, 80):
    numeric("sin(0.3)", mp.sin(mp.mpf("0.3")), precision=requested)
numeric("exp(10)", mp.exp(10), notation="engineering")
numeric("exp(10)", mp.exp(10), notation="scientific")
numeric("sin(1e-30)", mp.sin(mp.mpf("1e-30")), precision=60)
numeric("sin(89.999°)", mp.sin(mp.mpf("89.999") * mp.pi / 180), precision=40)
numeric("log(11,3)", mp.log(11, 3), precision=45)
numeric("1+e*0", mp.mpf(1))
numeric("-approx(pi)", -mp.pi)
numeric("-(e)", -mp.e)
numeric("sin(0.2*1°)", mp.sin(mp.mpf("0.2") * mp.pi / 180))
numeric("cos(pi/5)", mp.cos(mp.pi / 5))

rng = random.Random(193)
for _ in range(8):
    integer = rng.randint(100, 700)
    numeric(f"sin({integer}/1000)", mp.sin(mp.mpf(integer) / 1000))
    numerator, denominator = rng.randint(-30, 30), rng.randint(1, 40)
    exact(f"{numerator}/{denominator}", str(sp.Rational(numerator, denominator)))

for expression, expected in [
    ("tan(90°)", "domain"), ("ln(0)", "domain"), ("sqrt(-1)", "domain"),
    ("asin(1.01)", "domain"), ("atanh(1)", "domain"), ("log(8,1)", "domain"),
    ("1/(2-2)", "domain"), ("0^-1", "domain"), ("i", "domain"),
    ("1e99999", "limit"), ("admin()", "invalid_input"),
    ("(1).__class__", "invalid_input"), ("+".join(["2"] * 2500), "limit"),
]:
    response = request(expression)
    assert not response["ok"] and response["code"] == expected, (expression, response)
    checks += 1

for options in ({"angle": "hour"}, {"notation": "compact"}, {"future": 1}):
    response = request("1", **options)
    assert response == {"ok": False, "code": "invalid_input"}, response
    checks += 1

print(json.dumps({
    "suite": "scientific-sympy-mpmath",
    "passed": checks,
    "failed": 0,
    "sympy": sp.__version__,
    "mpmath": mp.__version__,
    "oracle_digits": mp.mp.dps,
}))
