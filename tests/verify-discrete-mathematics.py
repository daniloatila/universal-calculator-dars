"""Independent Python and SymPy oracles for the Discrete Mathematics CLI."""

from collections import Counter
import itertools
import json
import math
from pathlib import Path
import re
import subprocess
import sys

import sympy as sp


MODULE = "discrete-mathematics"
INTEGER = re.compile(r"(?:0|-?[1-9][0-9]*)")


def read_integer(text):
    assert len(text) <= 32768 and INTEGER.fullmatch(text), text[:80]
    return int(text)


def integer_source(*values):
    return " ".join(map(str, values))


def lucas_lehmer(exponent):
    """An independent exact reference for the selected large Mersenne prime."""
    assert exponent > 2 and sp.isprime(exponent), exponent
    modulus = (1 << exponent) - 1
    state = 4
    for _ in range(exponent - 2):
        state = (state * state - 2) % modulus
    return state == 0


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.checks = Counter()

    def invoke(self, payload):
        process = subprocess.run([self.executable, "tool", payload], capture_output=True,
                                 encoding="utf-8", timeout=12)
        assert process.stdout.strip(), (payload, process.returncode, process.stderr)
        response = json.loads(process.stdout)
        assert process.returncode == (0 if response["ok"] else 1), (payload, response, process.stderr)
        return response

    def request(self, operation, source, options, *, original=None):
        request = {"schema": 1, "module": MODULE, "operation": operation, "input": source,
                   "options": options}
        if original is not None:
            request["original_input"] = original
        return self.invoke(json.dumps(request, ensure_ascii=False))

    def record(self, operation, source, options, *, original=None):
        response = self.request(operation, source, options, original=original)
        assert response["ok"], (operation, source, options, response)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, MODULE, operation), proof
        assert proof["expression"] == (source if original is None else original), proof
        assert proof["options"] == options and proof["algorithm_version"].startswith(MODULE+"/"), proof
        assert all(proof[field] for field in ("result", "normalized", "method", "formula", "domain", "references")), proof
        return proof

    def exact(self, operation, source, options, *, original=None):
        proof = self.record(operation, source, options, original=original)
        assert proof["exactness"] == "exact", proof
        assert all(proof[field] is None for field in ("precision", "tolerance", "rounding", "error_bound")), proof
        return proof

    def integer(self, operation, source, expected, *, original=None, **options):
        proof = self.exact(operation, source, options, original=original)
        actual = read_integer(proof["result"])
        assert actual == expected, (proof, expected)
        counter = "untrusted display text" if original is not None else operation
        self.checks[counter] += 1
        return actual

    def set_result(self, operation, a, b, *, source=None):
        if source is None:
            source = f"{integer_source(*a)}|{integer_source(*b)}"
        proof = self.exact(operation, source, {})
        observed = json.loads(proof["result"])
        left, right = set(a), set(b)
        if operation == "set_subset":
            assert type(observed) is bool and observed == (left <= right), proof
        else:
            expected = {
                "set_union": left | right,
                "set_intersection": left & right,
                "set_difference": left - right,
                "set_symmetric_difference": left ^ right,
            }[operation]
            assert isinstance(observed, list) and all(type(value) in (str, int) for value in observed), proof
            assert observed == sorted(expected, key=lambda value: (isinstance(value, str), value)), (proof, expected)
        self.checks[operation] += 1
        return observed

    def logic(self, expression, assignment, expected, *, source=None):
        if source is None:
            bindings = " ".join(f"{name}={bit}" for name, bit in assignment.items())
            source = f"{expression} | {bindings}" if bindings else expression
        proof = self.exact("logic", source, {})
        assert proof["result"] == str(bool(expected)).lower(), (proof, expected)
        assert proof["variables"] == {name: str(bool(bit)).lower() for name, bit in assignment.items()}, proof
        self.checks["logic"] += 1

    def truth_table(self, expression, variables, predicate):
        assert list(variables) == sorted(variables), variables
        expected = [list(bits) + [int(bool(predicate(*bits)))]
                    for bits in itertools.product((0, 1), repeat=len(variables))]
        proof = self.exact("truth_table", expression, {})
        observed = json.loads(proof["result"])
        assert observed == {"variables": list(variables), "rows": expected}, (proof, expected)
        assert all(type(bit) is int for row in observed["rows"] for bit in row), proof
        assert proof["variables"] == {name: "boolean variable" for name in variables}, proof
        self.checks["truth_table"] += 1
        return observed

    def prime(self, value, *, proven_large=False):
        proof = self.record("prime", str(value), {})
        if proven_large:
            assert value > (1 << 64) - 1 and sp.isprime(value), value
            assert proof["result"] == "probable_prime" and proof["exactness"] == "approximate", proof
            assert proof["method"] == "fixed_base_probable_primality", proof
            assert "Passed 12 fixed strong probable-prime tests" in proof["constraints"], proof
        else:
            is_prime = sp.isprime(value)
            expected = "not_prime" if value < 2 else "prime" if is_prime else "composite"
            assert proof["result"] == expected and proof["exactness"] == "exact", (proof, expected)
            if 2 <= value < 1 << 64:
                assert proof["method"] == "deterministic_miller_rabin_u64", proof
            if value >= 1 << 64:
                assert proof["method"] == "miller_rabin_composite_witness", proof
                evidence = [clause for clause in proof["constraints"]
                            if clause.startswith(("Small prime divisor: ", "Compositeness witness base: "))]
                assert len(evidence) == 1, proof
                if evidence[0].startswith("Small prime divisor:"):
                    divisor = read_integer(evidence[0].split(": ", 1)[1])
                    assert 1 < divisor < value and value % divisor == 0, proof
                else:
                    base = read_integer(evidence[0].split(": ", 1)[1])
                    odd = value - 1
                    powers_of_two = (odd & -odd).bit_length() - 1
                    odd >>= powers_of_two
                    assert pow(base, odd, value) != 1, proof
                    assert all(pow(base, odd << bit, value) != value-1 for bit in range(powers_of_two)), proof
        assert all(proof[field] is None for field in ("precision", "tolerance", "rounding", "error_bound")), proof
        self.checks["prime"] += 1

    def factor(self, value):
        proof = self.exact("factor", str(value), {})
        observed = json.loads(proof["result"])
        factors = [-1] if value < 0 else []
        reference = sp.factorint(abs(value))
        for factor, exponent in sorted(reference.items()):
            assert sp.isprime(factor), factor
            factors.extend([factor] * exponent)
        assert observed == factors and all(type(item) is int for item in observed), (proof, factors)
        assert math.prod(observed) == value, proof
        self.checks["factor"] += 1

    def replay(self, operation, source, **options):
        first = self.record(operation, source, options)
        replayed = self.record(operation, first["normalized"], options, original=source)
        assert replayed == first, (first, replayed)
        self.checks["normalized replay"] += 1

    def reject(self, operation, source, code, *, original=None, **options):
        response = self.request(operation, source, options, original=original)
        assert response == {"ok": False, "code": code}, (operation, source[:100], options, code, response)
        self.checks["rejected"] += 1


def combinatorics_cases(oracle):
    for n in (0, 1, 5, 21, 100, 512, 4096):
        oracle.integer("permutations", str(n), math.factorial(n))
    for counts in ((0,), (0, 0, 0), (0, 2, 2), (3, 2, 1), (10, 7, 3, 1), (500, 500), (58, 0, 62)):
        expected = math.factorial(sum(counts)) // math.prod(math.factorial(count) for count in counts)
        if sum(counts) <= 6:
            letters = tuple(letter for letter, count in enumerate(counts) for _ in range(count))
            assert expected == len(set(itertools.permutations(letters))), counts
        oracle.integer("permutations", integer_source(*counts), expected, repetition=True)
    for n, k in ((0, 0), (0, 4), (1, 0), (1, 5), (4, 2), (6, 6), (6, 7), (8, 3), (34, 16), (4096, 16)):
        source = integer_source(n, k)
        arrangements = math.perm(n, k)
        combinations = math.comb(n, k)
        repeated_combinations = (math.comb(n + k - 1, k) if n else int(k == 0))
        if n <= 8 and k <= 7:
            labels = range(n)
            assert arrangements == sum(1 for _ in itertools.permutations(labels, k))
            assert combinations == sum(1 for _ in itertools.combinations(labels, k))
            assert repeated_combinations == sum(1 for _ in itertools.combinations_with_replacement(labels, k))
        oracle.integer("arrangements", source, arrangements)
        oracle.integer("combinations", source, combinations, repetition=False)
        oracle.integer("arrangements", source, n**k, repetition=True)
        oracle.integer("combinations", source, repeated_combinations, repetition=True)


def set_cases(oracle):
    giant = 10**80 + 19
    operations = ("set_union", "set_intersection", "set_difference", "set_symmetric_difference", "set_subset")
    for a, b in [((1, 2, 2, 3), (2, 4)), ((), ()), ((), (4,)), ((4,), ()),
                 (("A", "a", "value-1", "value_2", -9, giant), ("a", 0, giant, giant, "Z")),
                 ((-10, -3, -2, 1), (-2, -10, 1, -3, 1))]:
        results = {operation: oracle.set_result(operation, a, b) for operation in operations}
        intersection = set(results["set_intersection"])
        xor = set(results["set_symmetric_difference"])
        assert intersection.isdisjoint(xor) and intersection | xor == set(results["set_union"])
        assert set(results["set_difference"]).isdisjoint(b)
    oracle.set_result("set_union", (1, -2, 0, "a"), (3, -2, "a"), source=" +01 -02 -0 a | 3 -2 a ")
    oracle.set_result("set_subset", ("A", "b"), ("b", "A", "c"))
    oracle.set_result("set_union", ("constructor", "prototype"), ("constructor", "x"))
    oracle.set_result("set_intersection", tuple(range(128)), tuple(range(64, 192)))
    identifier_at_cap = "a"*32
    oracle.set_result("set_union", (identifier_at_cap,), (identifier_at_cap, -1))


def logic_cases(oracle):
    def implies(a, b):
        return not a or b

    for expression, variables, reference in [
        ("!A", "A", lambda a: not a),
        ("B && A", "AB", lambda a, b: a and b),
        ("A || B", "AB", lambda a, b: a or b),
        ("A ^ B", "AB", lambda a, b: a != b),
        ("A -> B", "AB", implies), ("A <-> B", "AB", lambda a, b: a == b),
        ("A -> B -> C", "ABC", lambda a, b, c: implies(a, implies(b, c))),
        ("A || B ^ C && !D", "ABCD", lambda a, b, c, d: a or (bool(b) != bool(c and not d))),
        ("(A AND B) IFF NOT (NOT A OR NOT B)", "AB", lambda a, b: (a and b) == (not (not a or not b))),
        ("A ∧ ¬B ∨ C", "ABC", lambda a, b, c: (a and not b) or c),
        ("A ⊕ B ↔ ¬(A ↔ B)", "AB", lambda a, b: (a != b) == (not (a == b))),
        ("(A AND B) || (C AND D) || (E AND F) || (G AND H)", "ABCDEFGH",
         lambda a, b, c, d, e, f, g, h: (a and b) or (c and d) or (e and f) or (g and h)),
    ]:
        oracle.truth_table(expression, variables, reference)
    for a, b, c in itertools.product((0, 1), repeat=3):
        oracle.logic("A -> B -> C", {"C": c, "A": a, "B": b}, implies(a, implies(b, c)))
    oracle.logic("A || !A", {"A": 0}, True)
    oracle.logic("A && !A", {"A": 1}, False)
    oracle.logic("(A XOR B) IMPLIES C", {"A": 1, "B": 0, "C": 0}, False)
    oracle.logic("A ∨ B", {"A": 0, "B": 1}, True)
    oracle.logic("TRUE IFF 1", {}, True)
    oracle.logic("False OR A", {"A": 1}, True, source="False OR A | A=true")
    oracle.logic("Alpha && !alpha", {"Alpha": 1, "alpha": 0}, True)
    oracle.truth_table("true xor false", "", lambda: True)
    oracle.truth_table("X_1 ↔ X_2", ("X_1", "X_2"), lambda a, b: a == b)


def number_theory_cases(oracle):
    u64_max = (1 << 64) - 1
    for value in (-73, -1, 0, 1, 2, 3, 4, 21, 97, 561, 1105, 1729, 2**31 - 1,
                  341_550_071_728_321, 3_825_123_056_546_413_051,
                  2**61 - 1, 18_446_744_073_709_551_557, u64_max, u64_max+1,
                  (2**61 - 1)*(2**31 - 1), 10**90 + 1):
        oracle.prime(value)
    assert lucas_lehmer(127)
    oracle.prime(2**127 - 1, proven_large=True)
    for value in (-1, 1, -360, 2, -97, 2**63, 97**5, 360, 2**32 - 1,
                  1_000_003 * 1_000_033, 2**61 - 1, u64_max, -u64_max, 18_446_744_073_709_551_557):
        oracle.factor(value)

    for numbers in ((0, 0), (0, -14), (21, -6), (-60, -48), (17, 31), (6, -8, 10, 18),
                    (2**93*7, -(2**67*7), 2**71*7), (10**100+24, 10**100+48),
                    tuple(range(1, 33))):
        gcd_value = oracle.integer("gcd", integer_source(*numbers), math.gcd(*numbers))
        lcm_value = oracle.integer("lcm", integer_source(*numbers), math.lcm(*numbers))
        if len(numbers) == 2:
            assert gcd_value*lcm_value == abs(numbers[0]*numbers[1])


def modular_and_sequence_cases(oracle):
    for a, modulus in ((-11, 5), (11, 5), (0, 1), (11, 1), (10**180+33, 2**65+59)):
        oracle.integer("modular", integer_source(a, modulus), a % modulus)
    for a, b, modulus in ((-11, 3, 5), (5, -9, 11), (0, 0, 1), (2**180, -(2**140), 2**125+51)):
        oracle.integer("modular", integer_source(a, b, modulus), (a+b) % modulus, mode="add")
        oracle.integer("modular", integer_source(a, b, modulus), (a*b) % modulus, mode="mul")
    for a, exponent, modulus in ((-11, 3, 5), (15, 0, 7), (0, 0, 1), (7, -1, 13), (-7, -3, 23), (3, 2**100+1, 107)):
        oracle.integer("modular", integer_source(a, exponent, modulus), pow(a, exponent, modulus), mode="pow")
    exponent, modulus = 2**1023+17, 2**2047+237
    oracle.integer("modular", integer_source(3, exponent, modulus), pow(3, exponent, modulus), mode="pow")
    for a, modulus in ((3, 11), (-3, 11), (10**100+31, 2**31-1)):
        observed = oracle.integer("modular", integer_source(a, modulus), pow(a, -1, modulus), mode="inverse")
        assert (a*observed) % modulus == 1 % modulus

    for n in (0, 1, 2, 15, 93, 1000, 32768):
        oracle.integer("sequence", str(n), sp.fibonacci(n))
    for n in (0, 1, 2, 11, 91, 512):
        oracle.integer("sequence", str(n), sp.lucas(n), mode="lucas")
    for first, step, n in ((0, -1, 0), (5, -3, 6), (-5, 4, 19), (2**70, 2**80, 2000)):
        oracle.integer("sequence", integer_source(first, step, n), first+n*step, mode="arithmetic")
    for first, ratio, n in ((0, 0, 0), (5, 0, 0), (5, 0, 4), (-5, -3, 7), (3, -2, 12), (7, 2, 1024)):
        oracle.integer("sequence", integer_source(first, ratio, n), first*ratio**n, mode="geometric")
    oracle.integer("sequence", "2 4 32767", 2**65535, mode="geometric")


def adversarial_and_replay(oracle):
    for operation, source, code, options in [
        ("permutations", "", "invalid_input", {}), ("permutations", "-1", "domain", {}),
        ("permutations", "4097", "limit", {}), ("permutations", "1 2", "invalid_input", {}),
        ("permutations", "1 -1", "domain", {"repetition": True}),
        ("permutations", "4096 1", "limit", {"repetition": True}),
        ("permutations", " ".join(["1"]*65), "limit", {"repetition": True}),
        ("arrangements", "4 -1", "domain", {}), ("combinations", "1 4097", "limit", {}),
        ("combinations", "4 2", "invalid_input", {"repetition": "false"}),
        ("set_union", "1 2", "invalid_input", {}), ("set_union", "1|2|3", "invalid_input", {}),
        ("set_union", "a/b|2", "invalid_input", {}), ("set_union", "Á|2", "invalid_input", {}),
        ("set_union", "bad.token|2", "invalid_input", {}), ("set_subset", "[1 2]|2", "invalid_input", {}),
        ("set_union", "a"*33+"|b", "limit", {}), ("set_union", integer_source(*range(129))+"|4", "limit", {}),
        ("logic", "A && B | A=1", "invalid_input", {}),
        ("logic", "A | A=1 A=0", "invalid_input", {}),
        ("logic", "A | A=2", "invalid_input", {}),
        ("logic", "A && | A=1", "invalid_input", {}),
        ("logic", "A || B | A=1 B=0 C=1", "invalid_input", {}),
        ("logic", "true | ", "invalid_input", {}),
        ("truth_table", "A || B || C || D || E || F || G || H || I", "limit", {}),
        ("truth_table", "("*80+"A"+")"*80, "limit", {}),
        ("truth_table", "!"*260+"true", "limit", {}), ("truth_table", "A"*17, "limit", {}),
        ("truth_table", "A B", "invalid_input", {}),
        ("truth_table", "A‮ OR B", "invalid_input", {}),
        ("factor", "0", "domain", {}), ("factor", str(2**64), "limit", {}),
        ("prime", "1/2", "invalid_input", {}), ("prime", str(2**1024), "limit", {}),
        ("gcd", "1", "invalid_input", {}),
        ("gcd", " ".join(["1"]*33), "limit", {}),
        ("gcd", f"{2**4096} 1", "limit", {}),
        ("lcm", "1 2.0", "invalid_input", {}),
        ("modular", "1 0", "domain", {}), ("modular", "1 -5", "domain", {}),
        ("modular", "4 8", "domain", {"mode": "inverse"}),
        ("modular", "3 1", "domain", {"mode": "inverse"}),
        ("modular", "4 -2 8", "domain", {"mode": "pow"}),
        ("modular", f"2 {2**1024} 7", "limit", {"mode": "pow"}),
        ("modular", f"2 3 {2**2048}", "limit", {"mode": "pow"}),
        ("modular", "1 2", "invalid_input", {"mode": "divide"}),
        ("modular", "1 2", "invalid_input", {"mode": 1}),
        ("sequence", "-1", "domain", {}), ("sequence", "32769", "limit", {}),
        ("sequence", "3 100 32768", "limit", {"mode": "geometric"}),
        ("sequence", "2 4 32768", "limit", {"mode": "geometric"}),
        ("sequence", "9", "invalid_input", {"mode": "collatz"}),
        ("prime", "1" + " "*4096, "limit", {}),
        ("logic", "__import__('os') | A=1", "invalid_input", {}),
        ("prime", "globalThis.Math.PI", "invalid_input", {}),
        ("binomial", "5 3", "unsupported", {}),
    ]:
        oracle.reject(operation, source, code, **options)
    oracle.reject("prime", "globalThis.Math.PI", "invalid_input", original="97")
    oracle.reject("prime", "97", "invalid_input", original="97‮")
    oracle.reject("prime", "97", "limit", original="9"*4097)
    oracle.integer("gcd", "12 18", 6, original="⟦12 et 18⟧ <script>display only</script>")

    oracle.replay("permutations", " +03 002 01 ", repetition=True)
    oracle.replay("combinations", " 5 3 ", repetition=True)
    oracle.replay("set_union", " 3 1 2 2 | a 2 -2 ")
    oracle.replay("logic", " A ∧ ¬B | B=0 A=1 ")
    oracle.replay("truth_table", " B XOR A ")
    oracle.replay("prime", " +00097 ")
    oracle.replay("prime", f" {(1 << 127) - 1} ")
    oracle.replay("factor", " -360 ")
    oracle.replay("modular", " -7 -3 23 ", mode="pow")
    oracle.replay("sequence", " -5 -3 7 ", mode="geometric")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-discrete-mathematics.py RELEASE_CLI")
    sys.set_int_max_str_digits(32768)
    oracle = Oracle(Path(sys.argv[1]).resolve(strict=True))
    combinatorics_cases(oracle)
    set_cases(oracle)
    logic_cases(oracle)
    number_theory_cases(oracle)
    modular_and_sequence_cases(oracle)
    adversarial_and_replay(oracle)
    print(json.dumps({"suite": "discrete-mathematics-python-sympy", "passed": sum(oracle.checks.values()), "failed": 0,
                      "sympy": sp.__version__, "cases": dict(sorted(oracle.checks.items()))}))


if __name__ == "__main__":
    main()
