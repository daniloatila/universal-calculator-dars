"""Compare the CLI against independent Python Decimal and Fraction references."""
from decimal import Decimal, localcontext
from fractions import Fraction
import json
from pathlib import Path
import random
import subprocess
import sys


def evaluate(cli, expression, code=0):
    result = subprocess.run([cli, expression], capture_output=True, text=True, timeout=10, check=False)
    if result.returncode != code:
        raise AssertionError(f"{expression}: exit {result.returncode}, expected {code}")
    return json.loads(result.stdout)


def exact_string(number):
    return str(number.numerator) if number.denominator == 1 else str(number)


def verify_approximation(value, expected):
    with localcontext() as context:
        context.prec = 24
        assert Decimal(value) == +expected, (value, str(expected))


def main():
    cli = Path(sys.argv[1]).resolve(strict=True)
    rng = random.Random(117)
    count = 0
    operations = (
        ("(({a}/{b}) + ({c}/{d})) * {n}", lambda x, y, n: (x + y) * n),
        ("(({a}/{b}) - ({c}/{d})) / {n}", lambda x, y, n: (x - y) / n),
        ("(({a}/{b}) * ({c}/{d})) + {n}%", lambda x, y, n: (x * y) * (1 + Fraction(n, 100))),
        ("({a}/{b})^(-2) / (({c}/{d})^2)", lambda x, y, _: (x**-2) / (y**2)),
    )
    for pattern, expected in operations:
        for _ in range(36):
            a, b, c, d, n = (rng.randrange(1, 40) for _ in range(5))
            if rng.getrandbits(1):
                a *= -1
            experience = pattern.format(a=a, b=b, c=c, d=d, n=n)
            result = evaluate(cli, experience)
            reference = expected(Fraction(a, b), Fraction(c, d), n)
            assert result["ok"] and result["exact"] == exact_string(reference), (experience, result, reference)
            with localcontext() as context:
                context.prec = 90
                approximately = Decimal(reference.numerator) / Decimal(reference.denominator)
            verify_approximation(result["approximate"], approximately)
            count += 1

    with localcontext() as context:
        context.prec = 90
        for integer in (2, 3, 5, 7, 13, 67, 997, 998001, 999983):
            value = Decimal(integer).sqrt()
            expected = value / (value + 1)
            result = evaluate(cli, f"sqrt({integer})/(sqrt({integer})+1)")
            assert result["ok"]
            verify_approximation(result["approximate"], expected)
            count += 1

    for expression, error in {
        "1/0": "division_by_zero",
        "sqrt(-1)": "domain_error",
        "(1+2": "missing_parenthesis",
        "1 + @": "invalid_character",
    }.items():
        assert evaluate(cli, expression, 1) == {"ok": False, "code": error}
        count += 1
    print(json.dumps({"suite": "python-fraction-decimal-oracle", "passed": count, "failed": 0}))


if __name__ == "__main__":
    main()
