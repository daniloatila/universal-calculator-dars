"""Independently verify Financial and Loans through the public Rust CLI.

The oracle uses Python Decimal (80 digits), Fraction, and civil dates. Results
contain the seed and counts by check category, with no local paths or user data.
"""

from collections import Counter
from datetime import date
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_EVEN, ROUND_HALF_UP, getcontext
from fractions import Fraction
from pathlib import Path
import argparse
import calendar
import hashlib
import json
import random
import subprocess


getcontext().prec = 80
D = Decimal
CENT = D("0.01")
ROOT_TOL = D("0.000000000001")
SEED = 4102026


class Oracle:
    def __init__(self, executable):
        self.executable = executable.resolve(strict=True)
        self.checks = Counter()

    def run(self, module, operation, data, *, options=None, error=None, category=None):
        canonical = json.dumps(data, separators=(",", ":"))
        request = {"schema": 1, "module": module, "operation": operation, "input": canonical,
                   "options": options or {}}
        process = subprocess.run([self.executable, "tool", json.dumps(request)], capture_output=True,
                                 encoding="utf-8", timeout=12)
        response = json.loads(process.stdout)
        self.checks[category or f"{module}.{operation}"] += 1
        if error:
            assert (process.returncode, response.get("ok"), response.get("code")) == (1, False, error), (request, response)
            return None, None
        assert process.returncode == 0 and response["ok"], (request, response, process.stderr)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, module, operation), proof
        assert proof["expression"] == canonical and json.loads(proof["normalized"]) == data, proof
        assert proof["units"]["currency"] == (options or {}).get("currency", "BRL"), proof
        assert proof["algorithm_version"] == f"{module}/1" and proof["references"], proof
        return json.loads(proof["result"]), proof


def quantize(value, scale=CENT, rounding=ROUND_HALF_EVEN):
    return value.quantize(scale, rounding=rounding)


def financial(oracle, generator):
    def run(operation, values, **kwargs):
        return oracle.run("financial", operation, values, **kwargs)

    for number in range(30):
        principal = D(generator.randrange(1, 200_000)) / 100
        rate = D(generator.randrange(-300, 800) if number else 0) / 1_000
        periods = generator.randrange(0, 7)
        options, scale, rounding = (
            ({"currency": "BRL", "rounding": "half_even"}, CENT, ROUND_HALF_EVEN),
            ({"currency": "JPY", "rounding": "half_up"}, D("1"), ROUND_HALF_UP),
            ({"currency": "KWD", "rounding": "toward_zero"}, D("0.001"), ROUND_DOWN),
        )[number % 3]
        compound = bool(number % 2)
        growth = (1 + Fraction(rate)) ** periods if compound else 1 + Fraction(rate) * periods
        if growth < 0:
            continue
        expected = Fraction(principal) * growth
        out, proof = run("compound_interest" if compound else "simple_interest",
                         {"principal": str(principal), "rate": str(rate), "periods": periods}, options=options)
        assert proof["exactness"] == "exact"
        assert Fraction(out["amount_exact"]) == expected
        assert Fraction(out["interest_exact"]) == expected - Fraction(principal)
        assert D(out["amount"]) == quantize(D(expected.numerator) / expected.denominator, scale, rounding)

    for number in range(18):
        amount = D(generator.randrange(1, 200_000)) / 100
        rate = D(generator.randrange(-150, 100) if number else 0) / 1_000
        periods = generator.randrange(1, 14)
        begin = bool(number % 2)
        future = bool(number % 3)
        growth = 1 + Fraction(rate)
        times = range(0 if begin else 1, periods if begin else periods + 1)
        factor = sum(growth ** (periods - t if future else -t) for t in times)
        out, _ = run("annuity_future_value" if future else "annuity_present_value",
                     {"payment": str(amount), "rate": str(rate), "periods": periods,
                      "timing": "begin" if begin else "end"})
        assert Fraction(out["amount_exact"]) == Fraction(amount) * factor

    exact_values = [
        ("nominal_effective", {"rate": "0.2", "compounds": 2, "direction": "nominal_to_effective"}, "rate", "21/100"),
        ("nominal_effective", {"rate": "0.21", "compounds": 2, "direction": "effective_to_nominal"}, "rate", "1/5"),
        ("equivalent_rate", {"rate": "0.02", "from_periods_per_year": 12, "to_periods_per_year": 4}, "rate", "7651/125000"),
        ("annuity_payment", {"principal": "1000", "rate": "0", "periods": 4, "timing": "end"}, "payment", "250"),
        ("periods", {"present": "100", "future": "81", "rate": "-0.1"}, "periods", "2"),
        ("rate", {"present": "100", "future": "81", "periods": 2}, "rate", "-1/10"),
        ("present_value", {"amount": "121", "rate": "0.1", "periods": 2}, "amount", "100"),
        ("future_value", {"amount": "100", "rate": "-0.1", "periods": 2}, "amount", "81"),
        ("discount", {"amount": "100", "rate": "0.1", "periods": 2, "convention": "commercial_simple"}, "present", "80"),
        ("discount", {"amount": "100", "rate": "0.1", "periods": 2, "convention": "rational_simple"}, "present", "250/3"),
        ("discount", {"amount": "121", "rate": "0.1", "periods": 2, "convention": "rational_compound"}, "present", "100"),
        ("mirr", {"flows": ["-100", "0", "121"], "finance_rate": "0.05", "reinvest_rate": "0.08"}, "mirr", "1/10"),
        ("payback", {"flows": ["-100", "40", "80"]}, "payback", "7/4"),
        ("discounted_payback", {"flows": ["-100", "44", "96.8"], "rate": "0.1"}, "payback", "7/4"),
        ("profitability_index", {"flows": ["-100", "66", "72.6"], "rate": "0.1"}, "profitability_index", "6/5"),
    ]
    for operation, data, key, expected in exact_values:
        out, _ = run(operation, data)
        assert Fraction(out[f"{key}_exact"]) == Fraction(expected)

    early, late = date(2027, 1, 31), date(2028, 3, 12)
    for basis, elapsed in [("act_365f", D((late - early).days) / 365),
                           ("act_360", D((late - early).days) / 360), ("30e_360", D(402) / 360)]:
        out, proof = run("npv", {"flows": ["55", "-100", "80"], "rate": "0.10", "day_count": basis,
                                 "dates": [str(late), str(early), str(late)]})
        assert proof["exactness"] == "approximate" and proof["variables"]["day_count"] == basis
        assert D(out["npv"]) == quantize(-100 + 135 / D("1.1") ** elapsed)

    cases = [
        (["-100", "230", "-132"], [(Fraction(1, 10), 1), (Fraction(1, 5), 1)]),
        (["-100", "220", "-121"], [(Fraction(1, 10), 2)]),
        (["-1000", "3300", "-3630", "1331"], [(Fraction(1, 10), 3)]),
    ]
    for factors in [[(1, 2), (1, 1), (3, 2), (-1, 1)], [(3, 2), (3, 2), (4, 3), (-2, 1)]]:
        coefficients = [1]
        multiplicities = Counter(factors)
        for p, q in factors:
            low, high = [-p * x for x in coefficients] + [0], [0] + [q * x for x in coefficients]
            coefficients = [a + b for a, b in zip(low, high)]
        exact_roots = sorted((Fraction(q, p) - 1, n) for (p, q), n in multiplicities.items() if p > 0)
        cases.append((list(map(str, coefficients)), exact_roots))
    for flows, expected in cases:
        out, _ = run("irr", {"flows": flows})
        assert out["status"] == "solved" and len(out["roots"]) == len(expected)
        for root, (rate, multiplicity) in zip(out["roots"], expected):
            assert root["multiplicity"] == multiplicity
            if "rate_exact" in root:
                assert Fraction(root["rate_exact"]) == rate
            else:
                assert Fraction(root["lower_exact"]) <= rate <= Fraction(root["upper_exact"])
                assert abs(D(root["rate"]) - D(rate.numerator) / rate.denominator) <= ROOT_TOL

    for flows, status in [(["100", "10"], "none"), (["-100", "-90"], "none"), (["-100", "5", "-200"], "none"),
                          (["0", "0"], "indeterminate"), (["-1", "2"] * 25, "completeness_uncertified")]:
        out, _ = run("irr", {"flows": flows})
        assert out == {"status": status, "roots": []}

    out, proof = run("irr", {"flows": ["-100", "0", "200"]})
    root = out["roots"][0]
    assert D(proof["error_bound"]) == ROOT_TOL
    assert (1 + Fraction(root["lower_exact"])) ** 2 < 2 < (1 + Fraction(root["upper_exact"])) ** 2
    assert abs(D(root["rate"]) - (D(2).sqrt() - 1)) < ROOT_TOL
    for cash, status in [("80", "solved"), ("120", "solved"), ("1000000001", "not_resolved_in_search")]:
        out, proof = run("irr", {"flows": ["-100", cash], "dates": [str(early), str(late)]})
        assert out["status"] == status and proof["exactness"] == "approximate"
        if status == "solved":
            expected = (D(cash) / 100) ** (D(365) / (late - early).days) - 1
            assert abs(D(out["roots"][0]["rate"]) - expected) < ROOT_TOL
    out, _ = run("irr", {"flows": ["-100", "230", "-132"], "dates": ["2026-01-01", "2027-02-01", "2028-03-01"]})
    assert out == {"status": "completeness_uncertified", "roots": []}
    invalid = [
        ("rate", {"present": "100", "future": "121", "periods": 0}, "domain"),
        ("discount", {"amount": "100", "rate": "0.9", "periods": 2, "convention": "commercial_simple"}, "domain"),
        ("present_value", {"amount": "100", "rate": "-1", "periods": 1}, "domain"),
        ("npv", {"flows": ["-100", "50"], "rate": "0", "dates": ["2027-02-29", "2028-02-29"]}, "invalid_input"),
        ("future_value", {"amount": "100", "rate": "1", "periods": 601}, "limit"),
        ("compound_interest", {"principal": "100", "rate": "999999999999999999.000000000001", "periods": 600}, "limit"),
    ]
    for operation, data, code in invalid:
        run(operation, data, error=code, category="financial.errors")


def loans(oracle, generator):
    def run(operation, values, **kwargs):
        return oracle.run("loans", operation, values, **kwargs)

    def contract(principal="1000", rate="0.01", periods=3):
        return {"principal": principal, "rate": rate, "periods": periods, "start_date": "2027-01-31"}

    def due(period):
        year, month = 2027 + period // 12, 1 + period % 12
        return str(date(year, month, calendar.monthrange(year, month)[1]))

    for number in range(24):
        principal = D(generator.randrange(100, 100_000)) / 100
        rate = D(generator.randrange(1, 100) if number > 1 else 0) / 1_000
        periods = generator.randrange(1, 22)
        method = "sac" if number % 2 else "price"
        per_row = number % 4 in (0, 1)
        request = {**contract(str(principal), str(rate), periods), "rounding_scope": "per_row" if per_row else "final"}
        out, proof = run(method, request)
        assert proof["exactness"] == "exact" and len(out["rows"]) == periods
        initial = principal
        fixed = principal / periods if method == "sac" or rate == 0 else principal * rate / (1 - (1 + rate) ** -periods)
        if per_row:
            fixed = quantize(fixed)
        payments = []
        expected_interest = []
        for period, row in enumerate(out["rows"], 1):
            interest = initial * rate
            if per_row:
                interest = quantize(interest)
            scheduled = fixed if method == "sac" else fixed - interest
            repayment = min(initial, scheduled) if period < periods else initial
            expected = {"balance_start": initial, "interest": interest, "amortization": repayment,
                        "balance_end": initial - repayment, "payment": repayment + interest}
            for key, value in expected.items():
                assert D(row[key]) == quantize(value), (request, key, row, value)
            assert row["date"] == due(period)
            initial -= repayment
            payments.append(repayment + interest)
            expected_interest.append(interest)
        assert initial == 0 and out["summary"]["balance_end"] == "0.00"
        assert D(out["summary"]["total_paid"]) == quantize(sum(payments))
        assert D(out["summary"]["interest"]) == quantize(sum(expected_interest))

    out, _ = run("single_payment", contract("1000", "0.05", 6))
    assert [D(row["payment"]) for row in out["rows"]] == [0] * 5 + [quantize(1000 * D("1.05") ** 6)]
    out, _ = run("bullet", contract("1000", "0.05", 6))
    assert [D(row["payment"]) for row in out["rows"]] == [50] * 5 + [1050]
    out, _ = run("uniform", {**contract(), "payment": "300"})
    assert [D(row["payment"]) for row in out["rows"][:2]] == [300, 300]
    assert out["summary"]["balance_end"] == "0.00"

    hybrid = {**contract(periods=8), "method": "sac", "rounding_scope": "per_row", "grace_periods": 1,
              "grace": "capitalize", "rates": [{"period": 3, "rate": "0.03"}],
              "extra": [{"period": 2, "amount": "410"}], "fees": [{"period": 3, "amount": "2.125"}],
              "upfront_fee": "20.125"}
    short, _ = run("schedule", hybrid)
    smaller, _ = run("schedule", {**hybrid, "extra_policy": "reduce_payment"})
    assert short["summary"]["actual_periods"] < smaller["summary"]["actual_periods"]
    assert short["rows"][0]["capitalized"] == "10.00" and short["rows"][0]["payment"] == "0.00"
    assert short["rows"][2]["fees"] == "2.12"
    for schedule in (short, smaller):
        summary = schedule["summary"]
        rows = [{key: D(value) for key, value in row.items() if key not in ("date", "period")} for row in schedule["rows"]]
        assert sum(row["amortization"] + row["extra"] for row in rows) == D(summary["principal"]) + D(summary["capitalized"])
        assert sum(row["payment"] for row in rows) + D(summary["upfront_fee"]) == D(summary["total_paid"])
        for row in rows:
            assert row["interest"] == quantize(row["balance_start"] * row["rate"])
            assert row["payment"] == row["interest"] - row["capitalized"] + row["amortization"] + row["extra"] + row["fees"]
            assert row["balance_end"] == row["balance_start"] + row["capitalized"] - row["amortization"] - row["extra"]
    out, _ = run("payoff", {**hybrid, "payoff_at": 3, "page": 2, "page_size": 2})
    assert out["payoff"]["payment"] == out["rows"][0]["payment"] and out["payoff"]["period"] == 3
    assert out["page"]["total_rows"] == 3
    out, _ = run("compare", {"proposals": [{**contract(), "method": "price"}, {**contract(), "method": "sac"}]})
    assert out["least_total_cost_proposals"] == [2]

    dated, proof = run("effective_cost", {**hybrid, "extra_policy": "reduce_payment"})
    actual_rate = D(dated["effective_cost"])
    funded = D(dated["summary"]["principal"]) - D(dated["summary"]["upfront_fee"])
    day0 = date.fromisoformat(hybrid["start_date"])
    future = [(D(row["payment"]), D((date.fromisoformat(row["date"]) - day0).days) / 365) for row in dated["rows"]]
    residual = funded - sum(payment / (1 + actual_rate) ** time for payment, time in future)
    assert abs(residual) < D("0.000000001")
    assert proof["exactness"] == "approximate" and dated["cost_kind"] == "economic_estimate"
    out, _ = run("price", {**contract("100000", "0.005", 360), "page": 9, "rounding_scope": "per_row"})
    assert len(out["rows"]) == 40 and out["rows"][-1]["period"] == 360 and out["summary"]["balance_end"] == "0.00"

    for operation, request, code in [
        ("price", contract(rate="-0.01"), "domain"), ("sac", contract(periods=0), "domain"),
        ("sac", contract(periods=601), "limit"), ("bullet", {**contract(), "first_date": "2027-01-01"}, "domain"),
        ("uniform", {**contract(), "payment": "0"}, "domain"), ("price", {**contract(), "page_size": 41}, "limit"),
        ("price", {**contract(), "extra": [{"period": 4, "amount": "1"}]}, "domain"),
        ("price", {**contract(), "rates": [{"period": 2, "rate": "0.02"}] * 2}, "invalid_input"),
        ("effective_cost", {**contract(), "method": "price", "upfront_fee": "1000"}, "domain"),
    ]:
        run(operation, request, error=code, category="loans.errors")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    args = parser.parse_args()
    oracle, generator = Oracle(args.executable), random.Random(SEED)
    financial(oracle, generator)
    loans(oracle, generator)
    with oracle.executable.open("rb") as executable:
        executable_sha256 = hashlib.file_digest(executable, "sha256").hexdigest()
    print(json.dumps({"status": "pass", "seed": SEED, "cli_sha256": executable_sha256,
                      "total": oracle.checks.total(), "checks": dict(sorted(oracle.checks.items()))}, indent=2))


if __name__ == "__main__":
    main()
