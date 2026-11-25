"""Independent exact SymPy and high-precision mpmath oracles for the Calculus CLI."""

import ast
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import sys

import mpmath as mp
import sympy as sp


X, Y, Z = (sp.Symbol(name, real=True) for name in ("x", "y", "z"))
SYMBOLS = {str(variable): variable for variable in (X, Y, Z)}
SYMBOLS.update({"C": sp.Symbol("C", real=True), "pi": sp.pi, "e": sp.E, "inf": sp.oo})
FUNCTIONS = {"sin": sp.sin, "cos": sp.cos, "exp": sp.exp, "ln": sp.log,
             "log": sp.log, "abs": sp.Abs, "sqrt": sp.sqrt}
NUMBER = r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"


def read_math(text, *, order_at=None):
    """Decode arithmetic and known mathematical names without executing CLI output."""
    source = text.strip().replace("^", "**").replace("π", "pi").replace("−", "-").replace("∞", "inf")
    assert len(source) <= 32768, text[:80]
    tree = ast.parse(source, mode="eval")
    assert sum(1 for _ in ast.walk(tree)) <= 4096, text[:80]

    def read(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            literal = ast.get_source_segment(source, node)
            assert literal and re.fullmatch(NUMBER, literal), literal
            exponent = re.search(r"[eE]([+-]?\d+)$", literal)
            assert not exponent or abs(int(exponent[1])) <= 4096, literal
            return sp.Rational(literal)
        if isinstance(node, ast.Name) and node.id in SYMBOLS:
            return SYMBOLS[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = read(node.operand)
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp):
            a, b = read(node.left), read(node.right)
            if isinstance(node.op, ast.Add):
                return a + b
            if isinstance(node.op, ast.Sub):
                return a - b
            if isinstance(node.op, ast.Mult):
                return a * b
            if isinstance(node.op, ast.Div):
                assert b != 0, text
                return a / b
            if isinstance(node.op, ast.Pow):
                assert b.is_Integer and abs(b) <= 128, (text, b)
                return a ** b
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                and len(node.args) == 1 and not node.keywords):
            function = node.func.id
            if function in FUNCTIONS:
                return FUNCTIONS[function](read(node.args[0]))
            if function == "O" and order_at is not None:
                return sp.O(read(node.args[0]), order_at)
        raise AssertionError(f"Unexpected calculus notation: {text!r}")

    return read(tree.body)


def equivalent(observed, expected):
    difference = sp.simplify(observed - expected)
    assert difference == 0, (observed, expected, difference)


def meaningful_exclusion(proof, point, variable=X):
    """Find an actual recorded comparison that excludes the requested real point."""
    relations = {"!=": sp.Ne, ">": sp.Gt, "<": sp.Lt, ">=": sp.Ge, "<=": sp.Le}
    for item in proof["constraints"]:
        match = re.fullmatch(r"(.+?)\s*(!=|>=|<=|>|<)\s*(.+)", item)
        if not match:
            continue
        try:
            left, right = read_math(match[1]), read_math(match[3])
        except (AssertionError, SyntaxError):
            continue
        if variable not in (left.free_symbols | right.free_symbols):
            continue
        relation = relations[match[2]](left.subs(variable, point), right.subs(variable, point))
        if relation is sp.false:
            return
    raise AssertionError((point, proof))


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.checks = Counter()

    def invoke(self, payload):
        command = [self.executable, "tool", payload]
        process = subprocess.run(command, capture_output=True, encoding="utf-8", timeout=12)
        assert process.stdout.strip(), (payload, process.returncode, process.stderr)
        response = json.loads(process.stdout)
        assert process.returncode == (0 if response["ok"] else 1), (payload, response, process.stderr)
        return response

    def request(self, operation, source, options, *, original=None):
        request = {"schema": 1, "module": "calculus", "operation": operation, "input": source,
                   "options": options}
        if original is not None:
            request["original_input"] = original
        return self.invoke(json.dumps(request, ensure_ascii=False))

    def record(self, operation, source, options, *, original=None):
        response = self.request(operation, source, options, original=original)
        assert response["ok"], (operation, source, options, response)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, "calculus", operation), proof
        assert proof["expression"] == (source if original is None else original), proof
        assert proof["options"] == options and proof["domain"] == "real", proof
        assert proof["algorithm_version"].startswith("calculus/"), proof
        assert all(proof[field] for field in ("normalized", "method", "formula", "result", "engine_version", "references")), proof
        if operation != "numerical_integral":
            assert proof["exactness"] in ("exact", "symbolic"), proof
            assert all(proof[field] is None for field in ("precision", "tolerance", "error_bound", "rounding")), proof
        return proof

    def derivative(self, source, reference, *, order=None, variable=None, excluded=None):
        options = {}
        if order is not None:
            options["order"] = order
        if variable is not None:
            options["variable"] = str(variable)
        proof = self.record("derivative", source, options)
        variable = variable if variable is not None else X
        result = read_math(proof["result"])
        expected = sp.diff(reference, variable, order or 1)
        if reference == sp.Abs(variable):
            positive = sp.Symbol("p", positive=True)
            for branch in (positive, -positive):
                equivalent(result.subs(variable, branch), expected.subs(variable, branch))
        else:
            equivalent(result, expected)
        if excluded is not None:
            meaningful_exclusion(proof, excluded, variable)
        self.checks["derivative"] += 1

    def antiderivative(self, source, reference, *, variable=None, excluded=None):
        options = {"variable": str(variable)} if variable is not None else {}
        proof = self.record("antiderivative", source, options)
        variable = variable if variable is not None else X
        result = read_math(proof["result"])
        assert sp.diff(result, SYMBOLS["C"]) == 1, proof
        recovered = sp.diff(result, variable)
        if result.has(sp.Abs) and excluded is not None:
            # The supported affine reciprocal primitive uses log(abs(argument)).
            positive = sp.Symbol("p", positive=True)
            for side in (-1, 1):
                sample = excluded + side * positive
                equivalent(recovered.subs(variable, sample), reference.subs(variable, sample))
        elif reference == sp.log(variable):
            positive = sp.Symbol("p", positive=True)
            equivalent(recovered.subs(variable, positive), reference.subs(variable, positive))
        else:
            equivalent(recovered, reference)
        if excluded is not None:
            meaningful_exclusion(proof, excluded, variable)
        self.checks["antiderivative"] += 1

    def integral(self, source, reference, lower, upper, *, variable=None):
        options = {"lower": lower, "upper": upper}
        if variable is not None:
            options["variable"] = str(variable)
        proof = self.record("integral", source, options)
        bounds = (variable if variable is not None else X, sp.Rational(lower), sp.Rational(upper))
        equivalent(read_math(proof["result"]), sp.integrate(reference, bounds))
        self.checks["integral"] += 1

    def limit(self, source, reference, point, *, side=None, variable=None, excluded=None, real_inputs=None):
        options = {"point": point}
        if side is not None:
            options["side"] = side
        if variable is not None:
            options["variable"] = str(variable)
        proof = self.record("limit", source, options)
        variable = variable if variable is not None else X
        destination = {"inf": sp.oo, "+inf": sp.oo, "∞": sp.oo, "+∞": sp.oo,
                       "-inf": -sp.oo, "-∞": -sp.oo, "−∞": -sp.oo}.get(point)
        if destination is not None:
            expected = sp.limit(reference, variable, destination)
            if isinstance(expected, sp.AccumBounds):
                expected = None
        else:
            destination = sp.Rational(point)
            sides = {"left": ("-",), "right": ("+",), "both": ("-", "+")}
            values = []
            for direction in sides[side or "both"]:
                half_line = sp.Interval.open(-sp.oo, destination) if direction == "-" else sp.Interval.open(destination, sp.oo)
                if real_inputs is not None and destination not in (real_inputs & half_line).closure:
                    values.append(None)
                else:
                    values.append(sp.limit(reference, variable, destination, dir=direction))
            expected = values[0] if all(value == values[0] for value in values) else None
        if expected is None:
            assert proof["result"] == "does_not_exist", proof
        elif expected in (sp.oo, -sp.oo):
            assert read_math(proof["result"]) == expected, (proof, expected)
        else:
            equivalent(read_math(proof["result"]), expected)
        if excluded is not None:
            meaningful_exclusion(proof, excluded, variable)
        self.checks["limit"] += 1

    def series(self, source, reference, *, point=None, terms=None, variable=None,
               singularity=None, branch_boundary=None, local=False):
        options = {}
        if point is not None:
            options["point"] = point
        if terms is not None:
            options["terms"] = terms
        if variable is not None:
            options["variable"] = str(variable)
        proof = self.record("series", source, options)
        variable = variable if variable is not None else X
        center = sp.Rational(point or "0")
        order = terms or 6
        result = read_math(proof["result"], order_at=(variable, center))
        assert result.getO() == sp.O((variable - center) ** order, (variable, center)), proof
        reference_series = sp.series(reference, variable, center, order)
        equivalent(result.removeO(), reference_series.removeO())
        if singularity is not None:
            meaningful_exclusion(proof, singularity, variable)
        boundary = singularity if singularity is not None else branch_boundary
        if boundary is not None:
            for condition in proof["constraints"]:
                radius = re.fullmatch(r"Taylor convergence for \|(.+)\| < (.+)", condition)
                if radius:
                    equivalent(read_math(radius[1]), variable - center)
                    equivalent(read_math(radius[2]), abs(center - boundary))
                    break
            else:
                raise AssertionError(proof)
        elif local:
            assert "Taylor convergence on a neighborhood of the expansion point" in proof["constraints"], proof
        else:
            assert "Taylor convergence for all real inputs" in proof["constraints"], proof
        self.checks["series"] += 1

    def numerical(self, source, function, lower, upper, tolerance=None, *, variable=None, smooth=False):
        options = {"lower": lower, "upper": upper}
        if tolerance is not None:
            options["tolerance"] = tolerance
        if variable is not None:
            options["variable"] = str(variable)
        proof = self.record("numerical_integral", source, options)
        assert proof["exactness"] == "approximate" and proof["error_bound"] is None, proof
        assert proof["method"] == "adaptive_simpson_quadrature" and proof["precision"] == 15, proof
        exact_tolerance = sp.Rational(tolerance or "1e-8")
        expected_tolerance = mp.mpf(int(exact_tolerance.p)) / int(exact_tolerance.q)
        assert proof["tolerance"] is not None, proof
        recorded_tolerance = mp.mpf(proof["tolerance"])
        assert abs(recorded_tolerance - expected_tolerance) <= expected_tolerance * mp.mpf("2.3e-16"), proof
        assert re.fullmatch(NUMBER, proof["result"]), proof
        observed = mp.mpf(proof["result"])
        a, b = [mp.mpf(str(sp.N(sp.Rational(bound), mp.mp.dps))) for bound in (lower, upper)]
        reference = mp.quad(function, [a, b], method="gauss-legendre")
        actual_error = abs(observed - reference)
        assert actual_error <= expected_tolerance, (proof, str(reference), str(actual_error))
        estimate_text = rf"Estimated absolute quadrature error \(uncertified\): ({NUMBER})"
        estimates = [mp.mpf(match[1]) for label in proof["constraints"]
                     if (match := re.fullmatch(estimate_text, label))]
        assert len(estimates) == 1 and 0 <= estimates[0] <= expected_tolerance, proof
        if smooth:
            assert estimates[0] > 0, proof
        self.checks["numerical integral"] += 1
        return actual_error

    def replay(self, operation, source, **options):
        first = self.record(operation, source, options)
        repeated = self.record(operation, first["normalized"], options, original=source)
        assert first == repeated, (first, repeated)
        self.checks["normalized replay"] += 1

    def reject(self, operation, source, code, *, original=None, **options):
        response = self.request(operation, source, options, original=original)
        assert response == {"ok": False, "code": code}, (operation, source[:80], options, code, response)
        self.checks["rejected"] += 1


def derivative_cases(oracle):
    for source, expression, order in [
        ("7", sp.Integer(7), None), ("x^5-3*x^2+7", X**5 - 3*X**2 + 7, None),
        ("x^8", X**8, 8), ("x^4+x", X**4 + X, 6), ("(x-2)^5", (X - 2)**5, 3),
        ("sin(2*x+1)", sp.sin(2*X + 1), None), ("cos(x)", sp.cos(X), 4),
        ("exp(x^2)", sp.exp(X**2), None), ("exp(-3*x)", sp.exp(-3*X), 3),
        ("x^2*sin(x)", X**2 * sp.sin(X), None), ("sin(cos(x))", sp.sin(sp.cos(X)), None),
        ("(x+1)/(x^2+1)", (X + 1)/(X**2 + 1), None),
        ("4e-2*x^3", sp.Rational(1, 25)*X**3, None),
        ("9007199254740993*x", sp.Integer(9007199254740993)*X, None),
        ("1e-25*x^2", sp.Rational(1, 10**25)*X**2, None),
    ]:
        oracle.derivative(source, expression, order=order)
    oracle.derivative("x/x", sp.S.One, excluded=0)
    oracle.derivative("x^0", sp.S.One, excluded=0)
    oracle.derivative("1/(x-2)", 1/(X - 2), excluded=2)
    oracle.derivative("ln(x)", sp.log(X), excluded=-1)
    oracle.derivative("ln(1+x^2)", sp.log(1 + X**2))
    oracle.derivative("abs(x)", sp.Abs(X), excluded=0)
    oracle.derivative("x^2*y^3+z", X**2 * Y**3 + Z, variable=Y, order=2)
    oracle.derivative("x*y+z^2", X*Y + Z**2, variable=Z)
    oracle.derivative("x^2", X**2, variable=Y)


def integral_cases(oracle):
    for source, expression, variable, excluded in [
        ("7", sp.Integer(7), None, None), ("x^4-3*x^2+1/2", X**4 - 3*X**2 + sp.Rational(1, 2), None, None),
        ("(x+1)*(x-1)", (X+1)*(X-1), None, None),
        ("sin(2*x+1)", sp.sin(2*X + 1), None, None), ("cos(3*x-2)", sp.cos(3*X - 2), None, None),
        ("exp(-2*x+1)", sp.exp(1 - 2*X), None, None), ("1/x", 1/X, None, 0),
        ("1/(2*x-3)", 1/(2*X-3), None, sp.Rational(3, 2)),
        ("ln(x)", sp.log(X), None, 0), ("x^-3", X**-3, None, 0),
        ("y^3+2*y", Y**3 + 2*Y, Y, None), ("sin(x)+2*cos(x)+exp(x)", sp.sin(X) + 2*sp.cos(X) + sp.exp(X), None, None),
    ]:
        oracle.antiderivative(source, expression, variable=variable, excluded=excluded)
    for source, expression, lower, upper in [
        ("x^2", X**2, "0", "1"), ("x^3", X**3, "-2", "2"),
        ("x^2-2*x+1", (X - 1)**2, "-1/2", "5/3"), ("x^2", X**2, "1", "0"),
        ("(x+1)*(x-1)", (X+1)*(X-1), "-1", "1"),
        ("x^2", X**2, "5/7", "5/7"), ("x/x", sp.S.One, "1", "2"),
        ("cos(x)", sp.cos(X), "0", "1"), ("exp(2*x)", sp.exp(2*X), "-1", "1"),
        ("1/x", 1/X, "1", "2"), ("1/x", 1/X, "-2", "-1"),
        ("1/(x-1)", 1/(X-1), "1000001/1000000", "10001/10000"),
        ("ln(x)", sp.log(X), "1", "2"), ("1e-25*x^2", X**2 / 10**25, "0", "1"),
    ]:
        oracle.integral(source, expression, lower, upper)
    oracle.integral("z^3", Z**3, "0", "1", variable=Z)


def limit_cases(oracle):
    for source, expression, point, side, excluded in [
        ("x^2+1", X**2 + 1, "2", None, None),
        ("(x^2-1)/(x-1)", X + 1, "1", "both", 1),
        ("(x^2-1)/(x-1)", X + 1, "1", "left", 1),
        ("x/x", sp.S.One, "0", "right", 0),
        ("sin(x)/x", sp.sin(X)/X, "0", "both", 0),
        ("(1-cos(x))/x^2", (1-sp.cos(X))/X**2, "0", None, 0),
        ("(sin(x)-x)/x^3", (sp.sin(X)-X)/X**3, "0", None, 0),
        ("(exp(x)-1-x)/x^2", (sp.exp(X)-1-X)/X**2, "0", None, 0),
        ("1/x", 1/X, "0", "left", 0), ("1/x", 1/X, "0", "right", 0),
        ("1/x", 1/X, "0", "both", 0), ("1/x^2", 1/X**2, "0", "both", 0),
        ("(3*x^2+1)/(2*x^2-5*x)", (3*X**2 + 1)/(2*X**2-5*X), "+inf", None, None),
        ("(x+1)/(x^2+1)", (X + 1)/(X**2 + 1), "-inf", None, None),
        ("x^3", X**3, "-inf", None, None), ("x^2", X**2, "+inf", None, None),
        ("1/x", 1/X, "inf", None, None),
        ("exp(x)", sp.exp(X), "-inf", None, None), ("exp(x)", sp.exp(X), "+inf", None, None),
        ("ln(x)", sp.log(X), "+inf", None, None), ("sin(x)", sp.sin(X), "+inf", None, None),
    ]:
        oracle.limit(source, expression, point, side=side, excluded=excluded)
    real_log_domain = sp.calculus.util.continuous_domain(sp.log(X), X, sp.S.Reals)
    for side in ("right", "left", "both"):
        oracle.limit("ln(x)", sp.log(X), "0", side=side, excluded=0, real_inputs=real_log_domain)
    oracle.limit("y^2", Y**2, "1/3", variable=Y)


def series_cases(oracle):
    for source, expression, center, terms in [
        ("sin(x)", sp.sin(X), "0", 7), ("cos(x)", sp.cos(X), None, None),
        ("exp(x)", sp.exp(X), "0", 8), ("ln(1+x)", sp.log(1 + X), "0", 6),
        ("1/(1-x)", 1/(1-X), "0", 7), ("1/(1+x)", 1/(1+X), "1", 4),
        ("(x-1)^4+2", (X - 1)**4 + 2, "1", 6),
        ("exp(x)", sp.exp(X), "1", 5), ("sin(x)", sp.sin(X), "1", 4),
        ("sin(x)", sp.sin(X), "0", 1), ("exp(x)", sp.exp(X), "0", 12),
        ("1e-25*cos(x)", sp.cos(X)/10**25, "0", 4),
    ]:
        singularity = {"ln(1+x)": -1, "1/(1-x)": 1, "1/(1+x)": -1}.get(source)
        oracle.series(source, expression, point=center, terms=terms, singularity=singularity)
    oracle.series("z/(1-z)", Z/(1-Z), point="0", terms=5, variable=Z, singularity=1)


def numerical_cases(oracle):
    gaussian = lambda x: mp.exp(-x**2)
    for source, reference, lower, upper, tolerance in [
        ("exp(-x^2)", gaussian, "0", "1", "1e-10"),
        ("exp(-x^2)", gaussian, "1", "0", "1e-9"),
        ("sin(x)", mp.sin, "0", "2", None),
        ("exp(x)", mp.exp, "-1", "1", "1e-11"),
        ("ln(1+x)", lambda x: mp.log1p(x), "0", "1", "1e-10"),
        ("1/(1+x^2)", lambda x: 1/(1+x**2), "-1", "2", "1e-9"),
        ("1e-9*exp(-x^2)", lambda x: mp.mpf("1e-9")*gaussian(x), "0", "1", "1e-12"),
        ("exp(-x^2)", gaussian, "1/3", "5/7", "1e-11"),
        ("exp(-x^2)", gaussian, "0", "1", "1/3000000"),
        ("cos(25.132741228718345*x)", lambda x: mp.cos(mp.mpf("25.132741228718345")*x), "0", "1", "1e-9"),
    ]:
        oracle.numerical(source, reference, lower, upper, tolerance, smooth=True)
    oracle.numerical("x^3", lambda x: x**3, "-1", "1", "1e-10")
    oracle.numerical("2*z+1", lambda z: 2*z+1, "0", "1", "1e-10", variable=Z)
    loose = oracle.numerical("exp(-x^2)", gaussian, "0", "3", "1e-4", smooth=True)
    tight = oracle.numerical("exp(-x^2)", gaussian, "0", "3", "1e-10", smooth=True)
    assert tight < loose, (loose, tight)


def rejection_and_replay_cases(oracle):
    for operation, source, code, options in [
        ("derivative", "", "invalid_input", {}), ("derivative", "x+", "invalid_input", {}),
        ("derivative", "__import__('os')", "invalid_input", {}),
        ("derivative", "x[0]", "invalid_input", {}), ("derivative", "x\u202e+1", "invalid_input", {}),
        ("derivative", "x" + " " * 4096, "limit", {}),
        ("derivative", "(" * 40 + "x" + ")" * 40, "limit", {}),
        ("derivative", "+".join(["x"] * 160), "limit", {}),
        ("derivative", "x^65", "limit", {}), ("derivative", "x^x", "unsupported", {}),
        ("derivative", "x", "limit", {"order": 0}),
        ("derivative", "x", "limit", {"order": 9}),
        ("derivative", "x", "invalid_input", {"order": "2"}),
        ("derivative", "x", "invalid_input", {"variable": "t"}),
        ("derivative", "x", "invalid_input", {"complex": True}),
        ("antiderivative", "exp(x^2)", "unsupported", {}),
        ("integral", "exp(-x^2)", "unsupported", {"lower": "0", "upper": "1"}),
        ("integral", "x", "invalid_input", {"lower": "0"}),
        ("integral", "x", "invalid_input", {"lower": "0", "upper": "inf"}),
        ("integral", "x/x", "domain", {"lower": "-1", "upper": "1"}),
        ("integral", "1/x", "domain", {"lower": "0", "upper": "1"}),
        ("numerical_integral", "x/x", "domain", {"lower": "-1", "upper": "1"}),
        ("numerical_integral", "ln(x)", "domain", {"lower": "0", "upper": "1"}),
        ("numerical_integral", "ln(x)", "domain", {"lower": "-2", "upper": "-1"}),
        ("numerical_integral", "exp(-1e12*(x-0.1234567)^2)", "unsupported", {"lower": "0", "upper": "1"}),
        ("numerical_integral", "1e18", "no_convergence", {"lower": "0", "upper": "1", "tolerance": "1e-12"}),
        ("numerical_integral", "x", "limit", {"lower": "0", "upper": "1000001"}),
        ("numerical_integral", "x", "limit", {"lower": "0", "upper": "1", "tolerance": "0"}),
        ("numerical_integral", "x", "limit", {"lower": "0", "upper": "1", "tolerance": "1e-14"}),
        ("numerical_integral", "x", "limit", {"lower": "0", "upper": "1", "tolerance": "1e-2"}),
        ("limit", "x", "invalid_input", {"point": "0", "side": "above"}),
        ("limit", "1/x", "invalid_input", {"point": "NaN"}),
        ("limit", "1/x", "invalid_input", {"point": "+inf", "side": "left"}),
        ("series", "exp(x)", "limit", {"terms": 0}),
        ("series", "exp(x)", "limit", {"terms": 13}),
        ("series", "1/x", "domain", {"point": "0"}),
        ("eigenvalues", "x", "unsupported", {}),
    ]:
        oracle.reject(operation, source, code, **options)
    oracle.reject("derivative", "__import__('os')", "invalid_input", original="x^2")
    oracle.reject("derivative", "x^2", "invalid_input", original="x\u202e^2")
    oracle.reject("derivative", "x^2", "limit", original="x" * 4097)
    proof = oracle.record("derivative", "x^2", {}, original="x² <script>discarded wire text</script>")
    equivalent(read_math(proof["result"]), 2*X)
    oracle.checks["untrusted display text"] += 1

    oracle.replay("derivative", " ((x^2−1) ÷ (x−1)) ")
    oracle.replay("antiderivative", " sin(2 * x) ")
    oracle.replay("integral", " 2 * y ", lower="0", upper="1", variable="y")
    oracle.replay("limit", " sin(x) / x ", point="0", side="right")
    oracle.replay("series", " exp(x) ", point="1/2", terms=7)
    oracle.replay("numerical_integral", " exp(-x^2) ", lower="0", upper="1", tolerance="1e-9")


def domain_and_series_boundaries(oracle):
    oracle.derivative("+sin(x)/(1+x)", sp.sin(X)/(1+X), excluded=-1, order=2)
    oracle.derivative("cos(x-y)×exp(z)", sp.cos(X-Y)*sp.exp(Z), variable=Y)
    oracle.derivative("(x^32)^2", X**64, order=8)
    oracle.antiderivative("abs(3*x-2)", sp.Abs(3*X-2))
    oracle.antiderivative("y*cos(x+1)", Y*sp.cos(X+1))
    oracle.antiderivative("(2*x^2+1)^3", (2*X**2+1)**3)

    # Endpoints alone establish neither an interval guard nor a complete domain.
    for denominator, lower, upper in [
        ("x^2-x+1", "0", "2"), ("abs(x)", "1", "2"), ("exp(x)", "-1", "1"),
        ("cos(x)+2", "-1", "1"), ("abs(x)+2", "-1", "1"),
        ("(x^2+x+1)^-1", "-1", "0"),
    ]:
        oracle.integral(f"({denominator})/({denominator})", sp.S.One, lower, upper)
    oracle.reject("integral", "1/(x-1/16)^2", "domain", lower="0", upper="1")
    oracle.reject("integral", "(ln(x)+2)/(ln(x)+2)", "unsupported", lower="1", upper="2")
    oracle.integral("x", X, "+.5e+1/2", "+6e0")
    oracle.integral("abs(x-1/2)", sp.Abs(X-sp.Rational(1, 2)), "-1", "1")

    # Pole orders and cancellations include analytic terms beyond purely rational limits.
    oracle.limit("1/x+sin(x)", 1/X+sp.sin(X), "0", side="right", excluded=0)
    oracle.limit("1/x+sin(x)/x^2", 1/X+sp.sin(X)/X**2, "0", side="left", excluded=0)
    oracle.reject("limit", "sin(x)/x^2-1/x", "no_convergence", point="0")
    oracle.limit("x^2/abs(x)", X**2/sp.Abs(X), "0", excluded=0)
    oracle.limit("abs(x)+1", sp.Abs(X)+1, "0")
    oracle.limit("abs(x)*sin(x)", sp.Abs(X)*sp.sin(X), "0")
    oracle.limit("abs(x)^2", X**2, "0")
    oracle.limit("(abs(x)+1)/x", (sp.Abs(X)+1)/X, "0", side="left", excluded=0)
    oracle.limit("x*exp(1)/abs(x)", X*sp.E/sp.Abs(X), "0", excluded=0)
    oracle.reject("limit", "x*sin(1)/abs(x)", "unsupported", point="0")
    oracle.limit("abs(x)", sp.Abs(X), "−∞")
    oracle.limit("sin(cos(x))", sp.sin(sp.cos(X)), "+∞")
    oracle.limit("ln(exp(x))", X, "0")
    oracle.limit("exp(x+2)", sp.exp(X+2), "1")
    oracle.limit("abs((x+1)*(x-1)-(x^2-1))^2/x", sp.S.Zero, "0", excluded=0)
    oracle.limit("1/((x+1)*(x-1)-(x^2-1))", sp.nan, "0", real_inputs=sp.S.EmptySet)
    oracle.reject("limit", "(x^2+x+1)^32*x^2", "limit", point="0")
    oracle.reject("limit", "x", "domain", point="2/0")

    # Absolute value has a Taylor branch on either side of its kink.
    oracle.series("abs(x-1)", sp.Abs(X-1), point="0", terms=4, branch_boundary=1)
    oracle.series("abs(x+2)", sp.Abs(X+2), point="0", terms=4, branch_boundary=-2)
    oracle.series("1/(1-x)+1/(2+x)", 1/(1-X)+1/(2+X), terms=6, singularity=1)
    oracle.series("1/(1-x)+1/(1+x^2)", 1/(1-X)+1/(1+X**2), terms=6, local=True)
    oracle.series("ln(exp(x+1)^2)", 2*(X+1), terms=5, local=True)
    oracle.series("ln(abs(exp(x+1)))", X+1, terms=5, local=True)
    oracle.series("1/(2*exp(x+1))", sp.exp(-X-1)/2, terms=5, local=True)
    oracle.reject("series", "abs(x)", "unsupported", point="0", terms=3)
    oracle.reject("series", "abs(sin(x))", "unsupported", point="1")
    oracle.reject("series", "ln(sin(x))", "unsupported", point="1")

    # Sampling stays on valid smooth branches and rejects steps without representable midpoints.
    oracle.numerical("abs(x-1)", lambda x: abs(x-1), "2", "3", "1e-12")
    oracle.numerical("ln(abs(x))", lambda x: mp.log(abs(x)), "-2", "-1", "1e-10", smooth=True)
    oracle.numerical("1/(x^2-2*x+2)", lambda x: 1/(x**2-2*x+2), "0", "2", "1e-10", smooth=True)
    oracle.numerical("exp(sin(x)/10)", lambda x: mp.exp(mp.sin(x)/10), "0", "1", "1e-10", smooth=True)
    oracle.numerical("x^2", lambda x: x**2, "2", "2")
    oracle.reject("numerical_integral", "abs(x-1)", "domain", lower="0", upper="2")
    oracle.reject("numerical_integral", "exp(1000)", "limit", lower="0", upper="1")
    oracle.reject("numerical_integral", "exp(ln(x))", "unsupported", lower="1", upper="2")
    oracle.reject("numerical_integral", "x", "no_convergence", lower="1",
                  upper="281474976710657/281474976710656")

    # These are public grammar and work limits, including guards removed by simplification.
    oracle.reject("derivative", "0^0", "domain")
    oracle.reject("derivative", "(x^32)^3", "limit")
    oracle.reject("derivative", "1e257*x", "limit")
    oracle.reject("derivative", "(1e128)^32*x", "limit")
    oracle.reject("derivative", "sin x", "invalid_input")
    oracle.reject("derivative", "x+1)", "invalid_input")
    oracle.reject("derivative", "+".join(f"1/(x-{index})" for index in range(1, 18)), "limit")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-calculus.py RELEASE_CLI")
    mp.mp.dps = 85
    oracle = Oracle(Path(sys.argv[1]).resolve(strict=True))
    derivative_cases(oracle)
    integral_cases(oracle)
    limit_cases(oracle)
    series_cases(oracle)
    numerical_cases(oracle)
    rejection_and_replay_cases(oracle)
    domain_and_series_boundaries(oracle)
    print(json.dumps({"suite": "calculus-sympy-mpmath", "passed": sum(oracle.checks.values()), "failed": 0,
                      "sympy": sp.__version__, "mpmath": mp.__version__, "cases": dict(sorted(oracle.checks.items()))}))


if __name__ == "__main__":
    main()
