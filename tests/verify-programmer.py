"""Independent Python arbitrary-integer oracles for Programmer CLI bit words."""

from collections import Counter
import json
from pathlib import Path
import random
import subprocess
import sys


OPERATIONS = ("convert", "and", "or", "xor", "not", "shift_left", "shift_right_logical",
              "shift_right_arithmetic", "rotate_left", "rotate_right", "twos_complement")
COUNTS = {"shift_left", "shift_right_logical", "shift_right_arithmetic", "rotate_left", "rotate_right"}
RADICES = {2: "b", 8: "o", 10: "d", 16: "X"}


def mask(width):
    return 2**width - 1


def signed_decimal(value, width, signed):
    limit = 2**width
    return value - limit if signed and value >= limit // 2 else value


def expected_word(operation, words, width, count=None):
    first = words[0]
    modulus = 2**width
    if operation == "convert":
        return first
    if operation == "and":
        return first & words[1]
    if operation == "or":
        return first | words[1]
    if operation == "xor":
        return first ^ words[1]
    if operation == "not":
        return modulus - 1 - first
    if operation == "twos_complement":
        return (-first) % modulus
    if operation == "shift_left":
        return 0 if count >= width else (first * 2**count) % modulus
    if operation == "shift_right_logical":
        return 0 if count >= width else first // 2**count
    if operation == "shift_right_arithmetic":
        value = signed_decimal(first, width, True)
        if count >= width:
            return modulus - 1 if value < 0 else 0
        return (value // 2**count) % modulus
    assert operation in ("rotate_left", "rotate_right"), operation
    # Slice an independent bit string to avoid sharing the implementation's shift/mask algorithm.
    bits = format(first, f"0{width}b")
    split = (count if operation == "rotate_left" else -count) % width
    return int(bits[split:] + bits[:split], 2)


def radix_source(word, base, width, signed):
    value = signed_decimal(word, width, signed) if base == 10 else word
    return format(value, RADICES[base])


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
        request = {"schema": 1, "module": "programmer", "operation": operation, "input": source,
                   "options": options}
        if original is not None:
            request["original_input"] = original
        return self.invoke(json.dumps(request, ensure_ascii=False))

    def record(self, operation, source, options, *, original=None):
        response = self.request(operation, source, options, original=original)
        assert response["ok"], (operation, source[:100], options, response)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, "programmer", operation), proof
        assert proof["expression"] == (source if original is None else original), proof
        assert proof["options"] == options and proof["algorithm_version"].startswith("programmer/"), proof
        assert proof["exactness"] == "exact", proof
        assert proof["domain"] == "fixed_width_integer" and proof["units"] == {}, proof
        assert all(proof[field] is None for field in ("precision", "tolerance", "rounding", "error_bound")), proof
        assert all(proof[field] for field in ("result", "normalized", "method", "formula", "domain", "references")), proof
        width = options.get("width", 32)
        base = options.get("base", 10)
        signed_label = "Signed" if options.get("signed", False) else "Unsigned"
        constraints = proof["constraints"]
        assert all(item in constraints for item in (f"Word width: {width} bits", f"Input base: {base}",
                                                    f"{signed_label} decimal interpretation")), proof
        if operation in COUNTS:
            count = int(source.split()[-1])
            if operation.startswith("rotate_"):
                assert f"Effective rotation count: {count % width}" in constraints, proof
            else:
                has_overshift = "Shift count is at least the word width" in constraints
                assert has_overshift == (count >= width), proof
        if operation == "shift_right_arithmetic":
            assert "Arithmetic right shift copies the most significant bit" in constraints, proof
        return proof

    def compare(self, operation, source, reference, *, original=None, **options):
        proof = self.record(operation, source, options, original=original)
        width = options.get("width", 32)
        signed = options.get("signed", False)
        decimal = signed_decimal(reference, width, signed)
        expected = {
            "binary": format(reference, f"0{width}b"),
            "octal": format(reference, f"0{(width + 2)//3}o"),
            "decimal": str(decimal),
            "hexadecimal": format(reference, f"0{(width + 3)//4}X"),
        }
        actual = {}
        for pair in proof["result"].split("; "):
            key, equal, value = pair.partition("=")
            assert equal and key not in actual, proof
            actual[key] = value
        assert list(actual) == list(expected) and actual == expected, (proof, expected)
        bit_pattern = int(actual["binary"], 2)
        for name, base in (("octal", 8), ("decimal", 10), ("hexadecimal", 16)):
            assert int(actual[name], base) % (2**width) == bit_pattern, proof
        if operation == "twos_complement":
            assert "Two's complement negation wraps modulo 2^width" in proof["constraints"], proof
            retains_minimum = "The minimum signed value retains its bit pattern" in proof["constraints"]
            assert retains_minimum == (signed and bit_pattern == 2**(width-1)), proof
        self.checks["untrusted display text" if original is not None else operation] += 1
        return bit_pattern

    def word(self, operation, words, *, width=32, base=10, signed=False, count=None, source=None):
        if source is None:
            operands = [radix_source(word, base, width, signed) for word in words]
            if count is not None:
                operands.append(str(count))
            source = " ".join(operands)
        reference = expected_word(operation, words, width, count)
        return self.compare(operation, source, reference, width=width, base=base, signed=signed)

    def replay(self, operation, source, **options):
        first = self.record(operation, source, options)
        replayed = self.record(operation, first["normalized"], options, original=source)
        assert replayed == first, (first, replayed)
        self.checks["normalized replay"] += 1

    def reject(self, operation, source, code, *, original=None, **options):
        response = self.request(operation, source, options, original=original)
        assert response == {"ok": False, "code": code}, (operation, source[:100], options, code, response)
        self.checks["rejected"] += 1


def conversions(oracle):
    oracle.compare("convert", "0", 0)
    oracle.compare("convert", "4294967295", 2**32-1)
    oracle.compare("convert", "-2147483648", 2**31, signed=True)
    for width in (8, 16, 32, 64, 128):
        sign = 2**(width-1)
        maximum = mask(width)
        for value, base, is_signed in ((0, 2, False), (1, 8, True), (sign-1, 10, True),
                                       (sign, 10, True), (maximum, 16, True), (maximum, 10, False)):
            oracle.word("convert", (value,), width=width, base=base, signed=is_signed)
    for width in (1, 5, 7, 9, 33, 127, 129, 257, 1023, 1024):
        sign = 2**(width-1)
        oracle.word("convert", (sign,), width=width, base=8, signed=True)
        oracle.word("convert", (mask(width),), width=width, base=2)
        oracle.word("convert", (sign,), width=width, base=10, signed=True)

    for source, value, base, width, signed in [
        ("0b00101", 5, 2, 5, False), ("0B10101", 21, 2, 5, True),
        ("0o007", 7, 8, 4, False), ("0O177", 127, 8, 7, True),
        ("0x002a", 42, 16, 9, False), ("0XfF", 255, 16, 8, True),
        ("+00000", 0, 10, 8, True), ("-0", 0, 10, 1, False),
        ("-0x0", 0, 16, 1, False), ("-0X80", 128, 16, 8, True),
        ("+0x7f", 127, 16, 8, True), ("-0B100", 12, 2, 4, True),
        ("-0o10", 24, 8, 5, True), ("0b10", 0xB10, 16, 16, False),
        ("0B", 11, 16, 4, True), ("00001", 1, 2, 1, True),
    ]:
        oracle.word("convert", (value,), width=width, base=base, signed=signed, source=source)

    rng = random.Random(703)
    for width in (7, 64, 131):
        word = rng.getrandbits(width)
        for base in (2, 8, 10, 16):
            reencoded = oracle.word("convert", (word,), width=width, base=base, signed=True)
            assert reencoded == word


def bitwise_cases(oracle):
    rng = random.Random(307)
    for width, base in ((1, 2), (8, 10), (16, 8), (32, 16), (64, 10), (128, 16), (137, 8), (1024, 2)):
        high = 2**(width-1)
        left, right = rng.getrandbits(width) | high, rng.getrandbits(width)
        for operation in ("and", "or", "xor"):
            actual = oracle.word(operation, (left, right), width=width, base=base, signed=True)
            if operation == "xor":
                restored = oracle.word("xor", (actual, right), width=width, base=base, signed=True)
                assert restored == left
        inverse = oracle.word("not", (left,), width=width, base=base, signed=True)
        assert oracle.word("not", (inverse,), width=width, base=base, signed=True) == left
        negated = oracle.word("twos_complement", (left,), width=width, base=base, signed=True)
        assert oracle.word("twos_complement", (negated,), width=width, base=base, signed=True) == left
        assert oracle.word("twos_complement", (high,), width=width, base=base, signed=True) == high
        assert (left + negated) % (2**width) == 0
    for width in (8, 128):
        left = (2**width-1) // 3
        right = 2**(width-1)+7
        union = oracle.word("or", (left, right), width=width, base=16)
        expected_inverse = oracle.word("not", (union,), width=width, base=16)
        inverse_left = oracle.word("not", (left,), width=width, base=16)
        inverse_right = oracle.word("not", (right,), width=width, base=16)
        assert oracle.word("and", (inverse_left, inverse_right), width=width, base=16) == expected_inverse
    oracle.word("xor", (0, 0), width=8, base=2)
    oracle.word("twos_complement", (0,), width=1, base=2, signed=True)


def shifts_and_rotations(oracle):
    for width, base in ((1, 2), (8, 16), (16, 10), (32, 8), (64, 16), (128, 10), (1024, 2)):
        negative = 2**(width-1) | 1
        for operation in ("shift_left", "shift_right_logical", "shift_right_arithmetic"):
            for count in sorted({0, width-1, width, width+1}):
                oracle.word(operation, (negative,), width=width, base=base, signed=True, count=count)
        for count in (1, width, 2*width+3):
            rotated = oracle.word("rotate_left", (negative,), width=width, base=base, count=count)
            assert rotated.bit_count() == negative.bit_count()
            assert oracle.word("rotate_right", (rotated,), width=width, base=base, count=count) == negative
    assert oracle.word("shift_right_arithmetic", (128,), width=8, base=16, count=1) == 192
    assert oracle.word("shift_right_logical", (128,), width=8, base=16, count=1) == 64
    assert oracle.word("shift_right_arithmetic", (64,), width=8, base=16, count=1) == 32
    assert oracle.word("shift_right_arithmetic", (64,), width=8, base=16, count=8) == 0
    oracle.word("shift_right_logical", (32768,), width=16, base=16, count=10, source="8000 0010")
    oracle.word("shift_left", (1,), width=8, base=16, count=3, source="0x01 +3")
    oracle.word("shift_left", (1,), width=8, base=16, count=0, source="0x01 -0")
    huge = 10**1023+57
    for operation in ("shift_left", "shift_right_logical", "shift_right_arithmetic", "rotate_left", "rotate_right"):
        oracle.word(operation, (4097,), width=13, base=16, signed=True, count=huge)


def adversarial_and_replay(oracle):
    for operation, source, code, options in [
        ("convert", "", "invalid_input", {}), ("convert", "1 2", "invalid_input", {}),
        ("and", "1", "invalid_input", {}), ("xor", "1 2 3", "invalid_input", {}),
        ("shift_left", "1", "invalid_input", {}), ("not", "1 2", "invalid_input", {}),
        ("shift_left", "1 -1", "domain", {}), ("rotate_right", "1 -32", "domain", {}),
        ("shift_left", "1 0x10", "invalid_input", {"base": 16}),
        ("rotate_left", "1 2e1", "invalid_input", {}), ("shift_left", "1 1_0", "invalid_input", {}),
        ("shift_left", "1 1.0", "invalid_input", {}),
        ("convert", "-1", "domain", {"width": 8}), ("convert", "256", "domain", {"width": 8}),
        ("convert", "128", "domain", {"width": 8, "signed": True}),
        ("convert", "-129", "domain", {"width": 8, "signed": True}),
        ("convert", "-2", "domain", {"width": 1, "signed": True}),
        ("convert", "1", "domain", {"width": 1, "signed": True}),
        ("convert", "200", "domain", {"base": 16, "width": 8}),
        ("convert", "+FF", "domain", {"base": 16, "width": 8, "signed": True}),
        ("convert", "-FF", "domain", {"base": 16, "width": 8, "signed": True}),
        ("and", "0 FF", "domain", {"base": 16, "width": 7}),
        ("or", "-01 02", "domain", {"base": 16, "width": 8}),
        ("convert", "0xAB", "invalid_input", {"base": 2}),
        ("convert", "0b10", "invalid_input", {"base": 8}),
        ("convert", "0d10", "invalid_input", {"base": 10}),
        ("convert", "0x", "invalid_input", {"base": 16}),
        ("convert", "9", "invalid_input", {"base": 8}),
        ("convert", "1_0", "invalid_input", {}), ("convert", "1,0", "invalid_input", {}),
        ("convert", "1.0", "invalid_input", {}), ("convert", "1e2", "invalid_input", {}),
        ("convert", "١٢", "invalid_input", {}), ("convert", "12\u202e", "invalid_input", {}),
        ("convert", "1", "domain", {"width": 0}), ("convert", "1", "limit", {"width": 1025}),
        ("convert", "1", "invalid_input", {"width": "8"}),
        ("convert", "1", "invalid_input", {"width": 8.0}),
        ("convert", "1", "invalid_input", {"base": 3}),
        ("convert", "1", "invalid_input", {"base": "16"}),
        ("convert", "1", "invalid_input", {"signed": 1}),
        ("convert", "1", "invalid_input", {"precision": 32}),
        ("convert", "0"*1025, "limit", {"base": 2, "width": 1024}),
        ("shift_left", "1 "+"0"*1025, "limit", {}),
        ("convert", "1"+" "*4096, "limit", {}),
        ("convert", "__import__('os')", "invalid_input", {}),
        ("convert", "globalThis.Math.PI", "invalid_input", {}),
        ("multiply", "3 4", "unsupported", {}),
    ]:
        oracle.reject(operation, source, code, **options)
    oracle.reject("convert", "globalThis.Math.PI", "invalid_input", original="12")
    oracle.reject("convert", "12", "invalid_input", original="12\u202e")
    oracle.reject("convert", "12", "limit", original="1"*4097)
    oracle.compare("convert", "10", 10, original="⟦١٠⟧ <script>display text</script>")

    oracle.replay("convert", " -0X80 ", base=16, width=8, signed=True)
    oracle.replay("xor", " 0x00f0\n0x000f ", base=16, width=16, signed=True)
    oracle.replay("shift_right_arithmetic", " 0b10000\t9 ", base=2, width=5)
    oracle.replay("rotate_left", " 0177 +003 ", base=8, width=7, signed=True)
    oracle.replay("twos_complement", " -170141183460469231731687303715884105728 ", base=10, width=128, signed=True)
    oracle.replay("shift_left", " 1 000000 ", base=10, width=1)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-programmer.py RELEASE_CLI")
    oracle = Oracle(Path(sys.argv[1]).resolve(strict=True))
    conversions(oracle)
    bitwise_cases(oracle)
    shifts_and_rotations(oracle)
    adversarial_and_replay(oracle)
    print(json.dumps({"suite": "programmer-python-integers", "passed": sum(oracle.checks.values()), "failed": 0,
                      "python": sys.version.split()[0], "cases": dict(sorted(oracle.checks.items()))}))


if __name__ == "__main__":
    main()
