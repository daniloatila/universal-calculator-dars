"""Independent SymPy oracle for bounded Algebra CLI operations.

The fixtures define the supported mathematical domains, exclusions and
relations. Data returned by the CLI is parsed by an allowlisted arithmetic
reader before comparison. Neither requests nor replies are executed as code.
"""

import ast
from collections import Counter
import json
from pathlib import Path
import random
import re
import subprocess
import sys

import sympy as sp


SYMBOLS = {name: sp.Symbol(name) for name in ("x", "y", "z", "t1", "t2", "t3")}
SYMBOLS["i"] = sp.I
X, Y, Z = (SYMBOLS[name] for name in ("x", "y", "z"))


def read_math(text):
    """Read exact constants, named variables, arithmetic and square roots."""
    text = text.strip().replace("^", "**")
    assert len(text) <= 32768, text[:80]
    tree = ast.parse(text, mode="eval")
    assert sum(1 for _ in ast.walk(tree)) <= 1024, text[:80]

    def convert(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            literal = ast.get_source_segment(text, node)
            assert literal and re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", literal), literal
            return sp.Rational(literal)
        if isinstance(node, ast.Name) and node.id in SYMBOLS:
            return SYMBOLS[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            child = convert(node.operand)
            return -child if isinstance(node.op, ast.USub) else child
        if isinstance(node, ast.BinOp):
            a, b = convert(node.left), convert(node.right)
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
                assert b.is_Integer and abs(b) <= 64, (text, b)
                return a ** b
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                and node.func.id == "sqrt" and len(node.args) == 1 and not node.keywords):
            return sp.sqrt(convert(node.args[0]))
        raise AssertionError(f"Unexpected algebra notation: {text!r}")

    return convert(tree.body)


def equation(text):
    left, right = text.split("=")
    return read_math(left), read_math(right)


def equivalent(actual, expected):
    assert sp.simplify(actual - expected) == 0, (actual, expected)


def explicit_factors(expression):
    factors = Counter()
    for factor in sp.Mul.make_args(expression):
        if factor.is_Number:
            continue
        base, exponent = factor.as_base_exp()
        assert exponent.is_Integer and exponent > 0, factor
        factors[sp.Poly(base, X, Y, Z).monic().as_expr()] += int(exponent)
    return factors


def intervals(text):
    if text == "{}":
        return sp.EmptySet
    segments = []
    for interval in text.split(" union "):
        assert interval[0] in "([" and interval[-1] in ")]", text
        left, right = (piece.strip() for piece in interval[1:-1].split(","))
        low = -sp.oo if left == "-inf" else read_math(left)
        high = sp.oo if right == "inf" else read_math(right)
        assert low <= high, interval
        if low == -sp.oo:
            assert interval[0] == "(", interval
        if high == sp.oo:
            assert interval[-1] == ")", interval
        segments.append(sp.Interval(low, high, interval[0] == "(", interval[-1] == ")"))
    return sp.Union(*segments)


def check_exclusions(proof, expected, variable=X, *, aliases=None):
    """Compare the forbidden points of the engine's recorded nonzero constraints."""
    holes = sp.EmptySet
    domain = sp.S.Complexes if proof["domain"] == "complex" else sp.S.Reals
    for condition in proof["constraints"]:
        left, separator, right = condition.partition("!=")
        assert separator, condition
        polynomial = read_math(left.strip()) - read_math(right.strip())
        if aliases:
            polynomial = polynomial.xreplace(aliases)
        assert polynomial.free_symbols <= {variable}, condition
        holes |= sp.solveset(polynomial, variable, domain=domain)
    assert holes == sp.FiniteSet(*expected), (proof, holes, expected)


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.checks = Counter()

    def invoke(self, payload):
        process = subprocess.run(
            [self.executable, "tool", payload], capture_output=True, encoding="utf-8", timeout=8,
        )
        assert process.stdout.strip(), (payload, process.returncode, process.stderr)
        response = json.loads(process.stdout)
        assert process.returncode == (0 if response["ok"] else 1), (payload, response, process.stderr)
        return response

    def request(self, operation, input_text, *, domain=None, original=None, options=None):
        options = dict(options or {})
        if domain is not None:
            options["domain"] = domain
        request = {"schema": 1, "module": "algebra", "operation": operation, "input": input_text,
                   "options": options}
        if original is not None:
            request["original_input"] = original
        return self.invoke(json.dumps(request, ensure_ascii=False))

    def record(self, operation, input_text, **settings):
        result = self.request(operation, input_text, **settings)
        assert result["ok"], (operation, input_text, settings, result)
        proof = result["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, "algebra", operation), proof
        assert proof["expression"] == settings.get("original", input_text), proof
        assert proof["domain"] == settings.get("domain", "real"), proof
        options = dict(settings.get("options") or {})
        if settings.get("domain") is not None:
            options["domain"] = settings["domain"]
        assert proof["options"] == options, proof
        assert proof["exactness"] in ("exact", "symbolic"), proof
        assert all(proof[field] is None for field in ("precision", "error_bound", "rounding", "tolerance")), proof
        assert all(proof[field] for field in ("result", "normalized", "method", "engine_version",
                                              "algorithm_version")), proof
        return proof

    def expression(self, operation, input_text, expected, *, exclusions=(), **settings):
        proof = self.record(operation, input_text, **settings)
        observed = read_math(proof["result"])
        equivalent(observed, expected)
        if operation == "expand":
            assert observed == sp.expand(observed), proof
        if operation == "factor":
            assert explicit_factors(observed) == explicit_factors(sp.factor(expected)), (proof, expected)
        if exclusions:
            check_exclusions(proof, exclusions)
        self.checks[operation] += 1

    def polynomial(self, input_text, expected, *, variable=X):
        proof = self.record("polynomial", input_text)
        result = proof["result"]
        assert result.startswith("[") and result.endswith("]"), proof
        coefficients = [read_math(value.strip()) for value in result[1:-1].split(",")]
        assert coefficients == sp.Poly(expected, variable).all_coeffs(), (proof, expected)
        self.checks["polynomial"] += 1

    def solve(self, input_text, *, domain="real", exclusions=(), variable=X):
        proof = self.record("solve", input_text, domain=domain)
        a, b = equation(input_text)
        numerator = sp.cancel(a - b).as_numer_denom()[0]
        space = sp.S.Reals if domain == "real" else sp.S.Complexes
        result = proof["result"]
        checked = sp.solveset(numerator, variable, domain=space) - sp.FiniteSet(*exclusions)
        if exclusions:
            check_exclusions(proof, exclusions, variable)
        if numerator == 0:
            assert result == f"all {domain} {variable}", proof
        elif checked == sp.EmptySet:
            assert result == "none", proof
        else:
            roots = list(sp.roots(numerator, variable).items())
            actual = {}
            for item in result.split(";"):
                found = re.fullmatch(rf"{variable}\s*=\s*(.+?)\s*\[m=(\d+)\]", item.strip())
                assert found, proof
                root = read_math(found[1])
                matching = [value for value in checked if sp.simplify(value - root) == 0]
                assert len(matching) == 1 and matching[0] not in actual, (proof, checked)
                actual[matching[0]] = int(found[2])
            assert sp.FiniteSet(*actual) == checked, (proof, checked)
            for root, multiplicity in actual.items():
                expected = next(count for value, count in roots if sp.simplify(value - root) == 0)
                assert multiplicity == expected, (proof, roots)
        self.checks["solve"] += 1

    def inequality(self, input_text, relation, *, exclusions=(), variable=X):
        proof = self.record("inequality", input_text)
        expected = sp.solve_univariate_inequality(relation, variable, relational=False) - sp.FiniteSet(*exclusions)
        assert intervals(proof["result"]) == expected, (proof, expected)
        if exclusions:
            check_exclusions(proof, exclusions, variable)
        self.checks["inequality"] += 1

    def system(self, input_text, variables, *, exclusions=()):
        proof = self.record("system", input_text)
        original = [equation(line) for line in re.split(r"[;\n]", input_text) if line.strip()]
        equations = [a - b for a, b in original]
        expected = sp.linsolve(equations, variables)
        if exclusions and expected != sp.EmptySet:
            reference_for_x = next(iter(expected))[variables.index(X)]
            if reference_for_x in exclusions:
                expected = sp.EmptySet
        if expected == sp.EmptySet:
            assert proof["result"] == "none", proof
            if exclusions:
                check_exclusions(proof, exclusions)
        else:
            family = next(iter(expected))
            assignments = {}
            for part in proof["result"].split(";"):
                name, right = part.split("=")
                symbol = SYMBOLS[name.strip()]
                assert symbol not in assignments, proof
                assignments[symbol] = read_math(right.strip())
            assert set(assignments) == set(variables), proof
            free_reference = sorted(sp.Tuple(*family).free_symbols, key=str)
            free_observed = sorted(sp.Tuple(*assignments.values()).free_symbols, key=str)
            assert len(free_reference) == len(free_observed), proof
            renamed = dict(zip(free_reference, free_observed))
            if exclusions:
                check_exclusions(proof, exclusions, aliases={v: k for k, v in renamed.items()})
            for name, value in zip(variables, family):
                equivalent(assignments[name], value.xreplace(renamed))
            for relation in equations:
                equivalent(relation.subs(assignments, simultaneous=True), 0)
        self.checks["system"] += 1

    def verify(self, input_text, expected):
        proof = self.record("verify", input_text)
        assert proof["result"] == str(bool(expected)).lower(), (proof, expected)
        assert proof["exactness"] == "exact", proof
        self.checks["verify"] += 1

    def replay(self, operation, input_text, **options):
        first = self.record(operation, input_text, **options)
        replayed = self.record(operation, first["normalized"], original=input_text, **options)
        assert replayed == first, (first, replayed)
        self.checks["normalized replay"] += 1

    def reject(self, operation, input_text, code, **settings):
        response = self.request(operation, input_text, **settings)
        assert response == {"ok": False, "code": code}, (operation, input_text[:100], code, response)
        self.checks["rejected"] += 1


def transformations(oracle):
    for source, expression, exclusions in [
        ("x/x", sp.S.One, (0,)),
        ("(x^2-1)/(x-1)", X + 1, (1,)),
        ("(x^2-x)/(x*(x-1))", sp.S.One, (0, 1)),
        ("(x+1)/(x+1)", sp.S.One, (-1,)),
        ("x/x-1", sp.S.Zero, (0,)),
        ("x^-1*x", sp.S.One, (0,)),
        ("x^0", sp.S.One, (0,)),
        ("x/(1/x)", X**2, (0,)),
        ("y+y-2*y", sp.S.Zero, ()),
        ("2*x+3*y-x+z", X + 3*Y + Z, ()),
        ("1/7+1/11", sp.Rational(1, 7) + sp.Rational(1, 11), ()),
        ("2.5*x", sp.Rational(5, 2)*X, ()),
        ("4e-2 × y − y ÷ 25", sp.S.Zero, ()),
        ("1208925819614629174706177/3-1208925819614629174706176/3", sp.Rational(1, 3), ()),
    ]:
        oracle.expression("simplify", source, expression, exclusions=exclusions)
    for source, expression in [
        ("(x+1)^2", (X + 1)**2), ("(x+y)*(x-y)", (X + Y)*(X - Y)),
        ("(x+y+z)^2", (X + Y + Z)**2), ("(2*x-3)*(x+5)", (2*X - 3)*(X + 5)),
        ("2(x+1)(x-1)", 2*(X + 1)*(X - 1)),
        ("(x-1)^4", (X - 1)**4), ("(x/2+1/3)^2", (X/2 + sp.Rational(1, 3))**2),
    ]:
        oracle.expression("expand", source, sp.expand(expression))
    for source, expression in [
        ("x^2-1", X**2 - 1), ("x^2-6*x+9", X**2 - 6*X + 9),
        ("2*x^2+3*x+1", 2*X**2 + 3*X + 1), ("x^3-x", X**3 - X),
        ("4*x^2-9", 4*X**2 - 9), ("x^2+1", X**2 + 1),
        ("x^2-y^2", X**2 - Y**2), ("x^2*y-x*y", X**2*Y - X*Y),
    ]:
        oracle.expression("factor", source, expression)
    for source, expression in [
        ("x^2-3*x+2", X**2 - 3*X + 2), ("(x+1)^3", (X + 1)**3),
        ("x^4+1", X**4 + 1), ("x/2-1/3", X/2 - sp.Rational(1, 3)),
    ]:
        oracle.polynomial(source, expression)
    oracle.polynomial("(y-1)^3", (Y - 1)**3, variable=Y)

    rng = random.Random(304)
    for _ in range(10):
        a, b, c, d = (rng.randint(1, 9) for _ in range(4))
        product = (a*X + b)*(c*X - d)
        expression = sp.expand(product)
        oracle.expression("expand", f"({a}*x+{b})*({c}*x-{d})", expression)
        oracle.expression("factor", str(expression).replace("**", "^"), expression)


def equation_cases(oracle):
    for source, excluded in [
        ("2*x-3=5", ()), ("-3*x+7=10", ()), ("x/2=1/3", ()),
        ("9007199254740993*x=18014398509481986", ()),
        ("1=2", ()), ("x=x", ()), ("x^2-5*x+6=0", ()), ("x^2=2", ()), ("3*x^2=1", ()),
        ("x^2+1=0", ()), ("(x-2)^2=0", ()), ("x^2=0", ()),
        ("x/x=1", (0,)), ("(x^2-1)/(x-1)=2", (1,)),
        ("x/(x-1)=2", (1,)), ("(x^2-1)/(x-1)=0", (1,)),
        ("(x-1)^2*(x+3)*(x^2+1)=0", ()),
        ("(x^2-2)^2/(x^2-2)=0", (-sp.sqrt(2), sp.sqrt(2))),
    ]:
        oracle.solve(source, exclusions=excluded)
    for source in ("x^2+1=0", "x^2+4=0", "x^2-2*x+2=0", "x^2+x+1=0", "(x+3)^2=0", "x=x", "1=2"):
        oracle.solve(source, domain="complex")
    oracle.solve("(z+1)^2=0", variable=Z)
    oracle.solve("(x^2+1)^2/(x^2+1)=0", domain="complex", exclusions=(-sp.I, sp.I))
    for a, b, multiplicity in ((-5, 3, 2), (0, 8, 1), (2, -1, 3), (3, -4, 4)):
        oracle.solve(f"(x-({a}))^{multiplicity}*(x-({b}))=0")


def inequality_cases(oracle):
    for source, relation, excluded in [
        ("x^2>1", X**2 > 1, ()), ("x^2<=1", X**2 <= 1, ()),
        ("x^2>=1", X**2 >= 1, ()), ("x^2<1", X**2 < 1, ()),
        ("x^2<=0", X**2 <= 0, ()), ("x^2<0", X**2 < 0, ()),
        ("x^2+1>0", X**2 + 1 > 0, ()), ("-2*x+4<0", -2*X + 4 < 0, ()),
        ("-2*x+4>=0", -2*X + 4 >= 0, ()), ("3*x/2<1/3", 3*X/2 < sp.Rational(1, 3), ()),
        ("(x-1)/(x+2)<=0", (X - 1)/(X + 2) <= 0, (-2,)),
        ("1/(x-2)>0", 1/(X - 2) > 0, (2,)),
        ("(x-2)/(x-2)>0", sp.Gt(1, 0, evaluate=False), (2,)),
        ("x^2<2", X**2 < 2, ()), ("x^2-1!=0", sp.Ne(X**2 - 1, 0), ()),
        ("(x^2-2)/(x-3)>=0", (X**2 - 2)/(X - 3) >= 0, (3,)),
    ]:
        oracle.inequality(source, relation, exclusions=excluded)
    oracle.inequality("4*y+1≥0", 4*Y + 1 >= 0, variable=Y)
    for a, b, c in ((-1, 1, 3), (0, 2, -5), (5, 7, 6), (2, 2, 2)):
        oracle.inequality(f"((x-({a}))*(x-({b})))/(x-({c}))>=0",
                          (X-a)*(X-b)/(X-c) >= 0, exclusions=(c,))


def system_and_substitution(oracle):
    for equations, names in [
        ("x+y=3; x-y=1", (X, Y)), ("x+y=3\nx-y=1", (X, Y)),
        ("x/2+y/3=1; x-y=0", (X, Y)), ("x+y=3; 2*x+2*y=6", (X, Y)),
        ("x+y=3; 2*x+2*y=7", (X, Y)), ("x+y+z=6; x-y+z=2; z=1", (X, Y, Z)),
        ("x+y+z=6; x-y=0", (X, Y, Z)), ("x+y+z=6; 2*x+2*y+2*z=12", (X, Y, Z)),
        ("2*x=3; 6*x=9", (X,)), ("2*x=3; 6*x=8", (X,)),
    ]:
        oracle.system(equations, names)
    oracle.system("x/x=1; y=2", (X, Y), exclusions=(0,))
    oracle.system("x/x=1; x=0", (X,), exclusions=(0,))
    oracle.system("x/x=1; x=2", (X,), exclusions=(0,))

    bindings = {X: sp.Integer(2), Y: sp.Integer(3), Z: sp.Integer(-1)}
    for expression in ("x^2+y", "(x+y)/z", "x*y*z", "1/(x-y)", "(x+y+z)^2"):
        parsed = read_math(expression)
        text = "; ".join([expression, *(f"{symbol}={value}" for symbol, value in bindings.items()
                                        if symbol in parsed.free_symbols)])
        oracle.expression("substitute", text, parsed.subs(bindings, simultaneous=True))
    oracle.expression("substitute", "x^2+y; x=2", 4 + Y)
    oracle.expression("substitute", "x/2; x=1/3", sp.Rational(1, 6))
    oracle.expression("substitute", "(x^2-1)/(x-1); x=3", sp.Integer(4))
    oracle.expression("substitute", "x; x=1e255", sp.Integer(10)**255)
    for equation_text, x in [("x^2=4", 2), ("x^2=4", -2), ("x^2=4", 3), ("x^2+x=6", 2),
                             ("x/2=1/3", sp.Rational(2, 3)), ("(x-1)/(x+2)=0", 1)]:
        left, right = equation(equation_text)
        independently_true = sp.Eq(left.subs(X, x), right.subs(X, x))
        oracle.verify(f"{equation_text}; x={x}", independently_true)
    oracle.verify("(x^2-1)/(x-1)=2; x=1", False)
    oracle.verify("x/x=1; x=0", False)
    oracle.verify("x^0=1; x=0", False)
    oracle.verify("x+y>=3; x=2; y=1", sp.Ge(2 + 1, 3))
    oracle.verify("x+y!=3; x=2; y=1", sp.Ne(2 + 1, 3))


def adversarial_cases(oracle):
    for operation, text, code in [
        ("simplify", "", "invalid_input"), ("simplify", "sin(x)", "unsupported"),
        ("simplify", "w+1", "unsupported"), ("simplify", "x.__class__", "invalid_input"),
        ("simplify", "__import__('os')", "invalid_input"), ("simplify", "x[0]", "invalid_input"),
        ("simplify", "x+", "invalid_input"), ("simplify", "1/0", "domain"),
        ("simplify", "x\u202e+1", "invalid_input"), ("simplify", "x" + " " * 4096, "limit"),
        ("substitute", "x/x; x=0", "domain"), ("substitute", "x; x=1; x=2", "invalid_input"),
        ("substitute", "x; y=2", "invalid_input"), ("verify", "x+y=1; x=1", "invalid_input"),
        ("substitute", "x; x=1e256", "limit"),
        ("substitute", "x+1; x=2; __import__('os')", "invalid_input"),
        ("verify", "x=1; x=1; y.__class__", "invalid_input"),
        ("solve", "x==1", "invalid_input"), ("system", "x=1; y", "invalid_input"),
        ("system", "x*y=1; x+y=2", "unsupported"),
        ("inequality", "1/(x^2-2)>0", "unsupported"),
        ("differentiate", "x^2", "unsupported"),
        ("expand", "x^25", "limit"), ("simplify", "1e257", "limit"),
        ("simplify", "x^(1/2)", "unsupported"),
        ("system", ";".join(["x=1"] * 17), "limit"),
        ("simplify", "(" * 40 + "x" + ")" * 40, "limit"),
        ("simplify", "+".join(["x"] * 160), "limit"),
    ]:
        oracle.reject(operation, text, code)
    for options in ({"precision": 32}, {"domain": "integer"}, {"domain": []}, {"constructor": False}):
        oracle.reject("simplify", "x+x", "invalid_input", options=options)
    oracle.reject("inequality", "x^2<1", "unsupported", domain="complex")
    oracle.reject("simplify", "__import__('os')", "invalid_input", original="x+x")
    oracle.reject("simplify", "x+x", "invalid_input", original="x\u202e+x")
    oracle.reject("simplify", "x+x", "limit", original="x" * 4097)
    duplicate = ('{"schema":1,"module":"algebra","operation":"simplify","input":"x+x",'
                 '"options":{"domain":"real","domain":"complex"}}')
    assert oracle.invoke(duplicate) == {"ok": False, "code": "invalid_input"}
    oracle.checks["rejected"] += 1
    oracle.expression("simplify", "x+x", 2*X, original="⟦discarded wire text⟧ __import__('os')")


def normalization_cases(oracle):
    oracle.replay("simplify", " (X^2) ÷ x ")
    oracle.replay("solve", "x/x=1")
    oracle.replay("inequality", "(x^2-1)/(x-1)≥0")
    oracle.replay("system", "x/x=1\ny=2")
    oracle.replay("substitute", "(x+y + x)÷3; y=2; x=1")
    oracle.replay("verify", "x/x=1; x=0")
    oracle.replay("solve", "X^2+1=0", domain="complex")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-algebra.py RELEASE_CLI")
    oracle = Oracle(Path(sys.argv[1]).resolve(strict=True))
    transformations(oracle)
    equation_cases(oracle)
    inequality_cases(oracle)
    system_and_substitution(oracle)
    adversarial_cases(oracle)
    normalization_cases(oracle)
    print(json.dumps({"suite": "algebra-sympy", "passed": sum(oracle.checks.values()), "failed": 0,
                      "sympy": sp.__version__, "cases": dict(sorted(oracle.checks.items()))}))


if __name__ == "__main__":
    main()
