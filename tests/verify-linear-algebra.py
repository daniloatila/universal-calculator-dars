"""Independent SymPy, NumPy and SciPy oracles for the Linear Algebra CLI."""

import ast
from collections import Counter
import json
from pathlib import Path
import random
import re
import subprocess
import sys

import numpy as np
import scipy
from scipy import linalg
import sympy as sp


NUMBER = r"(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"


def read_result(text):
    """Parse structured output and rational literals without executing CLI text."""
    text = text.strip()
    assert len(text) <= 32768, text[:80]
    tree = ast.parse(text, mode="eval")
    assert sum(1 for _ in ast.walk(tree)) <= 8192, text[:80]

    def read(node):
        if isinstance(node, ast.Constant):
            if type(node.value) in (int, float):
                literal = ast.get_source_segment(text, node)
                assert literal and re.fullmatch(NUMBER, literal), literal
                exponent = re.search(r"e([+-]?\d+)$", literal, re.I)
                assert not exponent or abs(int(exponent[1])) <= 4096, literal
                return sp.Rational(literal)
            if type(node.value) is str and len(node.value) <= 80:
                return node.value
        if isinstance(node, ast.List):
            return [read(item) for item in node.elts]
        if isinstance(node, ast.Dict):
            keys = [read(key) for key in node.keys]
            assert all(isinstance(key, str) for key in keys) and len(set(keys)) == len(keys), text
            return dict(zip(keys, map(read, node.values)))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            operand = read(node.operand)
            assert isinstance(operand, sp.Rational), text
            return -operand if isinstance(node.op, ast.USub) else operand
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            numerator, denominator = read(node.left), read(node.right)
            assert isinstance(numerator, sp.Rational) and isinstance(denominator, sp.Rational), text
            assert denominator != 0, text
            return numerator / denominator
        raise AssertionError(f"Unexpected result notation: {text!r}")

    return read(tree.body)


def vector(values):
    assert isinstance(values, list) and values and all(isinstance(value, sp.Rational) for value in values), values
    return sp.Matrix(values)


def matrix(values):
    assert isinstance(values, list) and values, values
    sizes = [vector(row).rows for row in values]
    assert len(set(sizes)) == 1, values
    return sp.Matrix(values)


def source_of(reference):
    return ";".join(" ".join(map(str, row)) for row in reference.tolist())


def array(reference):
    return np.array(reference.tolist(), dtype=np.float64)


def numerically_close(actual, expected, tolerance, *, scale=None):
    assert actual.shape == expected.shape, (actual, expected)
    assert np.isfinite(actual).all() and np.isfinite(expected).all(), (actual, expected)
    reference_scale = max(1, float(linalg.norm(expected))) if scale is None else scale
    residual = float(linalg.norm(actual - expected)) / reference_scale
    assert residual <= tolerance, (actual, expected, residual, tolerance)
    return residual


def observed_metric(proof, name):
    values = [float(text.split(": ", 1)[1]) for text in proof["constraints"]
              if text.startswith(name + ": ")]
    assert len(values) == 1 and np.isfinite(values[0]) and values[0] >= 0, (name, proof)
    return values[0]


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.checks = Counter()

    def invoke(self, payload):
        process = subprocess.run([self.executable, "tool", payload], capture_output=True, encoding="utf-8", timeout=12)
        assert process.stdout.strip(), (payload, process.returncode, process.stderr)
        response = json.loads(process.stdout)
        assert process.returncode == (0 if response["ok"] else 1), (payload, response, process.stderr)
        return response

    def request(self, operation, source, options, *, original=None):
        request = {"schema": 1, "module": "linear_algebra", "operation": operation, "input": source,
                   "options": options}
        if original is not None:
            request["original_input"] = original
        return self.invoke(json.dumps(request, ensure_ascii=False))

    def record(self, operation, source, options, *, original=None):
        response = self.request(operation, source, options, original=original)
        assert response["ok"], (operation, source, options, response)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, "linear_algebra", operation), proof
        assert proof["expression"] == (source if original is None else original), proof
        assert proof["options"] == options, proof
        assert proof["algorithm_version"].startswith("linear_algebra/"), proof
        assert all(proof[field] for field in ("normalized", "method", "formula", "result", "engine_version",
                                              "domain", "references")), proof
        return proof

    def exact(self, operation, source, *, original=None, **options):
        proof = self.record(operation, source, options, original=original)
        assert proof["exactness"] in ("exact", "symbolic"), proof
        assert all(proof[field] is None for field in ("precision", "error_bound", "rounding", "tolerance")), proof
        return proof, read_result(proof["result"])

    def approximate(self, operation, source, tolerance=None):
        options = {} if tolerance is None else {"tolerance": tolerance}
        proof = self.record(operation, source, options)
        assert proof["exactness"] == "approximate" and proof["error_bound"] is None, proof
        assert proof["precision"] == 15 and proof["tolerance"] is not None, proof
        requested = float(sp.Rational(tolerance or "1e-10"))
        assert abs(float(proof["tolerance"]) - requested) <= 4 * np.finfo(float).eps * requested, proof
        return proof, read_result(proof["result"]), requested

    def matrix_result(self, operation, reference, second=None, *, source=None):
        text = source if source is not None else source_of(reference)
        if second is not None:
            text += "|" + source_of(second)
        proof, result = self.exact(operation, text)
        expected = {"add": lambda: reference + second, "subtract": lambda: reference - second,
                    "multiply": lambda: reference * second, "transpose": lambda: reference.T,
                    "inverse": reference.inv}[operation]()
        observed = matrix(result)
        assert observed == expected, (proof, expected)
        if operation == "inverse":
            identity = sp.eye(reference.rows)
            assert observed * reference == identity and reference * observed == identity, proof
        self.checks[operation] += 1

    def scalar_result(self, operation, reference, second=None, *, source=None):
        text = source if source is not None else source_of(reference)
        if second is not None:
            text += "|" + source_of(second)
        proof, observed = self.exact(operation, text)
        expected = {"determinant": reference.det, "rank": reference.rank,
                    "dot": lambda: reference.dot(second)}[operation]()
        assert isinstance(observed, sp.Rational) and observed == expected, (proof, expected)
        self.checks[operation] += 1

    def cross(self, left, right):
        proof, observed = self.exact("cross", f"{source_of(left)}|{source_of(right)}")
        expected = list(left.cross(right))
        assert list(vector(observed)) == expected, (proof, expected)
        assert vector(observed).dot(left) == 0 and vector(observed).dot(right) == 0, proof
        self.checks["cross"] += 1

    def solve(self, coefficients, constants, *, source=None):
        text = source or f"{source_of(coefficients)}|{source_of(constants)}"
        proof, observed = self.exact("solve", text)
        expected = sp.linsolve((coefficients, constants))
        if expected == sp.EmptySet:
            assert observed == {"status": "inconsistent"}, (proof, expected)
        elif coefficients.rank() == coefficients.cols:
            assert set(observed) == {"status", "solution"} and observed["status"] == "unique", proof
            solution = vector(observed["solution"])
            assert tuple(solution) == next(iter(expected)) and coefficients * solution == constants, proof
        else:
            assert set(observed) == {"status", "particular", "basis", "parameters"}, proof
            assert observed["status"] == "infinite" and coefficients * vector(observed["particular"]) == constants, proof
            assert "Free parameters range over the reals" in proof["constraints"], proof
            expected_basis = coefficients.nullspace()
            actual_basis = [vector(direction) for direction in observed["basis"]]
            assert len(actual_basis) == len(expected_basis), proof
            assert observed["parameters"] == [f"t{i}" for i in range(1, len(expected_basis) + 1)], proof
            assert all(coefficients * column == sp.zeros(coefficients.rows, 1) for column in actual_basis), proof
            actual_span = sp.Matrix.hstack(*actual_basis)
            assert actual_span.rank() == len(expected_basis), proof
            assert sp.Matrix.hstack(actual_span, *expected_basis).rank() == len(expected_basis), proof
        self.checks["solve"] += 1

    def lu(self, reference):
        proof, observed = self.exact("lu", source_of(reference))
        assert set(observed) == {"P", "L", "U"}, proof
        p, lower, upper = (matrix(observed[key]) for key in ("P", "L", "U"))
        m, n = reference.shape
        k = min(m, n)
        assert p.shape == (m, m) and lower.shape == (m, k) and upper.shape == (k, n), proof
        identity = sp.eye(m)
        assert p.T * p == identity and set(p) <= {0, 1}, proof
        assert lower.is_lower and lower.diagonal() == sp.ones(1, k), proof
        assert upper.is_upper and p * reference == lower * upper, proof
        numerical = array(reference)
        scipy_p, scipy_lower, scipy_upper = linalg.lu(numerical)
        numerically_close(scipy_p @ scipy_lower @ scipy_upper, numerical, 1e-12)
        numerically_close(array(p.T * lower * upper), scipy_p @ scipy_lower @ scipy_upper, 1e-12)
        self.checks["lu"] += 1

    def qr(self, reference, *, tolerance=None, ill_conditioned=False):
        proof, observed, requested = self.approximate("qr", source_of(reference), tolerance)
        assert set(observed) == {"Q", "R"}, proof
        q, r = (array(matrix(observed[key])) for key in ("Q", "R"))
        m, n = reference.shape
        k = min(m, n)
        assert q.shape == (m, k) and r.shape == (k, n), (proof, q.shape, r.shape)
        a = array(reference)
        reconstruction = numerically_close(q @ r, a, requested, scale=float(linalg.norm(a)) or 1)
        orthogonality = numerically_close(q.T @ q, np.eye(k), requested, scale=1)
        numerically_close(r, np.triu(r), requested, scale=float(linalg.norm(r)) or 1)
        assert np.all(np.diag(r) >= 0), proof
        floor = 20 * np.finfo(float).eps * max(m, n)
        reported_residual = observed_metric(proof, "Relative Frobenius residual (observed)")
        reported_orthogonality = observed_metric(proof, "Frobenius orthogonality error (observed)")
        assert reported_residual <= requested and abs(reported_residual - reconstruction) <= floor, proof
        assert reported_orthogonality <= requested and abs(reported_orthogonality - orthogonality) <= floor, proof
        rank = reference.rank()
        assert f"Exact rank: {rank} of {k}" in proof["constraints"], proof
        if rank < k:
            assert any(detail.startswith("Rank deficient:") for detail in proof["constraints"]), proof
        scipy_q, scipy_r = linalg.qr(a, mode="economic")
        if rank == k:
            for index in range(k):
                if abs(scipy_r[index, index]) > floor * linalg.norm(a):
                    # Column signs are arbitrary. Match their dot product before comparison.
                    sign = 1 if q[:, index] @ scipy_q[:, index] >= 0 else -1
                    numerically_close(sign*q[:, index], scipy_q[:, index], max(8*requested, 1e-12))
        if ill_conditioned:
            expected_condition = 1 / np.linalg.cond(a)
            assert expected_condition < 1e-8, a
            estimate = observed_metric(proof, "Estimated reciprocal 2-norm condition")
            assert estimate / expected_condition > 0.5 and estimate / expected_condition < 2, proof
            assert any(detail.startswith("Ill-conditioned:") for detail in proof["constraints"]), proof
        self.checks["qr"] += 1

    def eigen(self, reference, operation, *, tolerance=None, exact=False, clustered=False, near_zero=False):
        text = source_of(reference)
        if exact:
            options = {} if tolerance is None else {"tolerance": tolerance}
            proof, observed = self.exact(operation, text, **options)
            requested = 1e-12
        else:
            proof, observed, requested = self.approximate(operation, text, tolerance)
        values = vector(observed if operation == "eigenvalues" else observed["values"])
        assert values.rows == reference.rows and list(values) == sorted(values), proof
        a = array(reference)
        numerical_values = array(values).ravel()
        scipy_values, scipy_vectors = linalg.eigh(a)
        scale = float(linalg.norm(a)) or 1
        numerically_close(numerical_values, scipy_values, requested, scale=scale)
        numerically_close(numerical_values, np.linalg.eigvalsh(a), requested, scale=scale)
        if exact:
            expected_values = sorted(value for value, count in reference.eigenvals().items() for _ in range(count))
            assert list(values) == expected_values, proof
            if any(value == 0 for value in values):
                assert "Zero diagonal eigenvalue: the matrix is singular" in proof["constraints"], proof
        else:
            reported_residual = observed_metric(proof, "Relative Frobenius residual (observed)")
            reported_orthogonality = observed_metric(proof, "Frobenius orthogonality error (observed)")
            assert max(reported_residual, reported_orthogonality) <= requested, proof
            spectral_scale = max(map(abs, scipy_values))
            if clustered:
                assert min(np.diff(scipy_values)) <= np.sqrt(np.finfo(float).eps) * spectral_scale
                assert any(detail.startswith("Clustered eigenvalues:") for detail in proof["constraints"]), proof
            if near_zero:
                assert min(map(abs, scipy_values)) <= np.sqrt(np.finfo(float).eps) * spectral_scale
                assert "Eigenvalue near zero relative to the matrix scale" in proof["constraints"], proof
        if operation == "eigenvectors":
            assert set(observed) == {"values", "vectors"}, proof
            symbolic_vectors = matrix(observed["vectors"])
            vectors = array(symbolic_vectors)
            assert vectors.shape == a.shape, proof
            rec = numerically_close(a @ vectors, vectors * numerical_values, requested, scale=scale)
            ortho = numerically_close(vectors.T @ vectors, np.eye(reference.rows), requested, scale=1)
            if exact:
                assert reference * symbolic_vectors == symbolic_vectors * sp.diag(*values), proof
            else:
                floor = 20 * np.finfo(float).eps * reference.rows
                assert abs(reported_residual - rec) <= floor and abs(reported_orthogonality - ortho) <= floor, proof
            # Compare the entire invariant subspace for repeated values rather than arbitrary axes.
            cuts = np.flatnonzero(np.diff(scipy_values) > 10 * requested * scale) + 1
            for indices in np.split(np.arange(reference.rows), cuts):
                actual_space, reference_space = vectors[:, indices], scipy_vectors[:, indices]
                numerically_close(actual_space @ actual_space.T, reference_space @ reference_space.T,
                                  max(80*requested, 1e-10))
        self.checks[operation] += 1

    def replay(self, operation, source, **options):
        proof = self.record(operation, source, options)
        repeated = self.record(operation, proof["normalized"], options, original=source)
        assert repeated == proof, (proof, repeated)
        self.checks["normalized replay"] += 1

    def reject(self, operation, source, code, *, original=None, **options):
        response = self.request(operation, source, options, original=original)
        assert response == {"ok": False, "code": code}, (operation, source[:90], options, code, response)
        self.checks["rejected"] += 1


def exact_cases(oracle):
    r = sp.Rational
    small = sp.Matrix([[1, 2], [3, 4]])
    fractions = sp.Matrix([[r(1, 2), r(-1, 3)], [r(7, 11), r(3, 8)]])
    near = sp.Matrix([[1, 1], [1, 1 + r(1, 10**20)]])
    permuted = sp.Matrix([[0, 2, 1], [1, 0, 3], [2, 1, 4]])
    for operation in ("add", "subtract", "multiply"):
        oracle.matrix_result(operation, small, fractions)
    for independent in (sp.Matrix([[0]]), fractions, sp.zeros(3, 2), permuted, near):
        oracle.matrix_result("transpose", independent)
        oracle.scalar_result("rank", independent)
    for independent in (sp.Matrix([[0]]), sp.Matrix([[r(-7, 3)]]), small, fractions, near, permuted, sp.zeros(4)):
        oracle.scalar_result("determinant", independent)
    for independent in (sp.Matrix([[r(-7, 3)]]), small, fractions, near, permuted, sp.eye(3)):
        oracle.matrix_result("inverse", independent)
    large = sp.Matrix([[9_007_199_254_740_993, r(1, 10**22)]])
    oracle.matrix_result("add", large, sp.Matrix([[1, 2]]))
    oracle.scalar_result("determinant", fractions, source=".5 −1/3\n7/11 0.375")
    max_diagonal = sp.diag(*range(1, 13))
    oracle.scalar_result("determinant", max_diagonal)
    oracle.scalar_result("rank", sp.transpose(sp.Matrix([[1, 2, 3, 4, 5, 6]])))
    oracle.matrix_result("multiply", sp.Matrix([[1, 2, -3], [0, 4, 5]]),
                         sp.Matrix([[1], [0], [3]]))
    oracle.matrix_result("multiply", sp.Matrix([[1], [2]]), sp.Matrix([[3, 4, 5]]))

    rng = random.Random(3044)
    for m, n, k in ((2, 3, 2), (3, 2, 4), (1, 4, 3), (4, 4, 1), (4, 3, 5), (5, 4, 3), (2, 2, 2), (4, 1, 3)):
        a = sp.Matrix(m, n, lambda *_: r(rng.randint(-9, 9), rng.randint(1, 8)))
        b = sp.Matrix(m, n, lambda *_: r(rng.randint(-9, 9), rng.randint(1, 8)))
        c = sp.Matrix(n, k, lambda *_: r(rng.randint(-9, 9), rng.randint(1, 8)))
        oracle.matrix_result("add", a, b)
        oracle.matrix_result("subtract", a, b)
        oracle.matrix_result("multiply", a, c)
        oracle.matrix_result("transpose", a)
        oracle.scalar_result("rank", a)


def vector_and_solve_cases(oracle):
    r = sp.Rational
    for a, b in [([1, 2, 3], [4, -5, 6]), ([r(2, 5), 0, r(1, 3)], [r(7, 9), -2, r(2, 11)]),
                 ([1, 0, 0], [0, 1, 0]), ([0, 1, 0], [1, 0, 0]), ([1, 2, 3], [2, 4, 6]),
                 ([0, 0, 1], [1, 0, 0]), ([0, 1, 0], [0, 0, 1]),
                 ([0, 0, 0], [1, 2, 3])]:
        left, right = sp.Matrix([a]), sp.Matrix([b])
        oracle.scalar_result("dot", left, right.T)
        oracle.cross(left, right.T)
    oracle.scalar_result("dot", sp.Matrix([[r(1, 5)]]), sp.Matrix([[r(10, 3)]]))
    for a, b in [([[0, 2], [1, 3]], [4, 5]), ([[2]], [1]),
                 ([[r(1, 2), r(1, 3)], [r(1, 4), r(-1, 5)]], [r(1, 7), r(1, 11)]),
                 ([[1, 2], [2, 4]], [3, 6]), ([[1, 2], [2, 4]], [3, 7]),
                 ([[1, 2, 3]], [4]), ([[0, 1, 0], [0, 2, 0]], [2, 4]),
                 ([[0, 0, 0], [0, 0, 0]], [0, 0]), ([[0, 0], [0, 0]], [1, 0]),
                 ([[1, 0], [0, 1], [1, 1]], [2, 3, 5]), ([[1, 0], [0, 1], [1, 1]], [2, 3, 6]),
                 ([[0, 1], [0, 0], [0, 3]], [2, 0, 6]),
                 ([[1, 1], [1, 1+r(1,10**22)]], [0, 1])]:
        oracle.solve(sp.Matrix(a), sp.Matrix(b))
    oracle.solve(sp.Matrix([[1, 2], [3, 4]]), sp.Matrix([5, 6]), source="1 2\n3 4 | 5 6")


def decomposition_cases(oracle):
    r = sp.Rational
    for values in [
        [[2]], [[4, 3], [6, 3]], [[0, 2], [3, 4]], [[0, 1, 2], [2, 0, 1], [1, 4, 0]],
        [[r(2, 3), r(4, 5)], [r(7, 11), r(-1, 2)]], [[2, 0, 0], [1, 1, 0], [5, 2, 3]],
        [[9, 1, 2, 3], [1, 9, 3, 2], [3, 1, 9, 2], [1, 2, 1, 9]],
        [[1, 2], [2, 4]], [[0, 2, 1], [0, 3, 2], [0, 4, 5]], [[0, 0], [0, 0], [0, 0]],
        [[1, 2], [3, 4], [5, 7]], [[1, 0, 3], [0, 2, 4]],
    ]:
        oracle.lu(sp.Matrix(values))
    for values in [
        [[2]], [[-2]], [[2, 1], [1, 3]], [[1, 2], [3, 4], [5, 7]],
        [[1, 0, 3], [0, 2, 4]], [[r(1, 2), r(2, 3)], [r(3, 4), r(-1, 2)]],
        [[1, 1, 1], [0, 1, 1], [1, 0, 2]], [[1, 2, 3], [2, 4, 1], [1, 0, 3], [4, 1, 1]],
        [[0, 0], [0, 0], [0, 0]], [[1, 2], [2, 4], [0, 0]],
    ]:
        oracle.qr(sp.Matrix(values))
    oracle.qr(sp.Matrix([[1, 2], [3, 4], [5, 7]]), tolerance="1e-12")
    oracle.qr(sp.diag(1, r(1, 10**10)), tolerance="1e-12", ill_conditioned=True)
    oracle.qr(sp.Matrix([[1, 2], [3, 4], [5, 7]]) / 10**20, tolerance="1e-12")
    oracle.qr(sp.Matrix([[1, 2], [3, 4], [5, 7]]) * 10**90, tolerance="1e-12")
    oracle.qr(sp.Matrix(12, 5, lambda i, j: r(i+1, j+2) + int(i == j)), tolerance="1e-13")


def spectral_cases(oracle):
    exact = [sp.Matrix([[sp.Rational(-7, 3)]]), sp.diag(3, -2, 3), sp.eye(4), sp.zeros(2),
             sp.diag(sp.Rational(1, 10**25), sp.Rational(-9, 7), sp.Rational(1, 10**25))]
    approximate = [sp.Matrix([[2, 1], [1, 2]]), sp.Matrix([[1, 1], [1, 0]]),
                   sp.Matrix([[2, -1, 0], [-1, 2, -1], [0, -1, 2]]),
                   sp.Matrix([[4, 1, 0, 0], [1, 3, 0, 0], [0, 0, 6, -2], [0, 0, -2, 2]]),
                   sp.Matrix([[2, 1, -1], [1, -4, 2], [-1, 2, -3]])]
    for operation in ("eigenvalues", "eigenvectors"):
        for a in exact:
            oracle.eigen(a, operation, exact=True)
        for a in approximate:
            oracle.eigen(a, operation)
        oracle.eigen(sp.Matrix([[2, 1, 1], [1, 2, 1], [1, 1, 2]]), operation, clustered=True)
        oracle.eigen(sp.ones(4), operation, clustered=True, near_zero=True)
        oracle.eigen(sp.Matrix([[1, 1], [1, 1+sp.Rational(1, 10**12)]]), operation, near_zero=True)
        oracle.eigen(sp.Matrix([[2, 1], [1, 7]]), operation, tolerance="1e-12")
        oracle.eigen(sp.Matrix([[2, 1], [1, 7]]) / 10**20, operation, tolerance="1e-12")
        oracle.eigen(sp.Matrix([[2, 1], [1, 7]]) * 10**90, operation, tolerance="1e-12")
        oracle.eigen(sp.Matrix(12, 12, lambda i, j: {0: 2, 1: -1}.get(abs(i-j), 0)), operation, tolerance="1e-13")
        oracle.eigen(sp.diag(2, -3), operation, exact=True, tolerance="1e-12")


def adversarial_and_replay(oracle):
    for operation, text, code, options in [
        ("transpose", "", "invalid_input", {}), ("transpose", "1 2;3", "invalid_input", {}),
        ("transpose", "[1,2]", "invalid_input", {}), ("rank", "1 x", "invalid_input", {}),
        ("rank", "1\u202e 2", "invalid_input", {}), ("rank", "1" + " "*4096, "limit", {}),
        ("rank", " ".join(["1"]*13), "limit", {}), ("rank", ";".join(["1"]*13), "limit", {}),
        ("rank", "1/0", "domain", {}), ("rank", "1/2/3", "invalid_input", {}),
        ("rank", "1e257", "limit", {}), ("rank", "1 " + "9"*129, "limit", {}),
        ("rank", "1e99999999999999", "limit", {}), ("rank", "1e-x", "invalid_input", {}),
        ("rank", "1;", "invalid_input", {}), ("rank", "1;;2", "invalid_input", {}),
        ("rank", "1|2", "invalid_input", {}), ("multiply", "1|2|3", "invalid_input", {}),
        ("multiply", "1 2;3 4", "invalid_input", {}), ("multiply", "1| ", "invalid_input", {}),
        ("add", "1 2|3;4", "domain", {}), ("subtract", "1 2|3;4", "domain", {}),
        ("multiply", "1 2|3 4", "domain", {}), ("determinant", "1 2;3 4;5 6", "domain", {}),
        ("inverse", "1 2;2 4", "singular", {}), ("inverse", "1 2", "domain", {}),
        ("dot", "1 2|3;4;5", "domain", {}), ("dot", "1 2;3 4|1 2", "domain", {}),
        ("cross", "1 2|3;4", "domain", {}), ("solve", "1 2;3 4|5", "domain", {}),
        ("eigenvalues", "1 2;3 4", "unsupported", {}),
        ("eigenvectors", "1 1;1.000000000000000000000000000001 1", "unsupported", {}),
        ("eigenvectors", "0 -1;1 0", "unsupported", {}), ("eigenvalues", "1 2 3", "domain", {}),
        ("qr", "1 2;3 4", "invalid_input", {"tolerance": 1}),
        ("qr", "1 2;3 4", "limit", {"tolerance": "1e-14"}),
        ("qr", "1 2;3 4", "limit", {"tolerance": "1e-5"}),
        ("qr", "1e101", "limit", {}), ("qr", "1e-101", "limit", {}),
        ("qr", "1 0;0 1e-151", "limit", {}),
        ("eigenvalues", "1e100 1e-100;1e-100 1e100", "limit", {}),
        ("rank", "1 2;3 4", "invalid_input", {"tolerance": "1e-10"}),
        ("multiply", "__import__('os')|1", "invalid_input", {}),
        ("determinant", "globalThis.Math|2", "invalid_input", {}),
        ("frobenius", "1", "unsupported", {}),
        ("frobenius", "1|2", "unsupported", {}),
    ]:
        oracle.reject(operation, text, code, **options)
    giant = ";".join(" ".join("1e256" if i == j else "0" for j in range(5)) for i in range(5))
    oracle.reject("determinant", giant, "limit")
    oracle.reject("rank", "__import__('os')", "invalid_input", original="1 2;3 4")
    oracle.reject("rank", "1 2;3 4", "invalid_input", original="1\u202e 2")
    oracle.reject("rank", "1 2;3 4", "limit", original="1"*4097)
    proof, value = oracle.exact("rank", "1 2;3 4", original="⟦discarded text⟧ <script>display only</script>")
    assert value == 2 and proof["normalized"], proof
    oracle.checks["untrusted display text"] += 1

    oracle.replay("multiply", " 1/2 -1\n3 4 | 2; 5 ")
    oracle.replay("solve", " 1 2\n2 4 | 3 6 ")
    oracle.replay("lu", " 0 2\n3 4 ")
    oracle.replay("qr", " 1 2\n3 4\n5 7 ", tolerance="1e-12")
    oracle.replay("eigenvectors", " 2 1 1\n1 2 1\n1 1 2 ")
    oracle.replay("eigenvalues", " 3 0\n0 -2 ")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-linear-algebra.py RELEASE_CLI")
    oracle = Oracle(Path(sys.argv[1]).resolve(strict=True))
    exact_cases(oracle)
    vector_and_solve_cases(oracle)
    decomposition_cases(oracle)
    spectral_cases(oracle)
    adversarial_and_replay(oracle)
    print(json.dumps({"suite": "linear-algebra-sympy-numpy-scipy", "passed": sum(oracle.checks.values()), "failed": 0,
                      "sympy": sp.__version__, "numpy": np.__version__, "scipy": scipy.__version__,
                      "cases": dict(sorted(oracle.checks.items()))}))


if __name__ == "__main__":
    main()
