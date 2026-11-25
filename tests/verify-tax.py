"""Independent Brazilian tax oracle for `dars tool`, using only Python's standard library.

The legal snapshots and citations are recorded in evidence/objective-04/tax/rules.md.
The official RFB monthly fixtures below reproduce the agency's example inputs.
The other generated cases use independent Decimal arithmetic and civil dates.
"""

import argparse
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP, getcontext
import json
from pathlib import Path
import subprocess


getcontext().prec = 64
D = Decimal
ZERO = D(0)
CENT = D("0.01")
EVENT = "2026-11-25"
YEAR_END = "2026-12-31"
VERSION = "BR-2026.1"
ESOCIAL = ((D("1621.00"), D("0.075")), (D("2902.84"), D("0.09")),
           (D("4354.27"), D("0.12")), (D("8475.55"), D("0.14")))
MONTHLY = [
    ("2428.81", "0.075", "182.16"), ("2826.66", "0.15", "394.16"),
    ("3751.06", "0.225", "675.49"), ("4664.69", "0.275", "908.73"),
]
ANNUAL = [
    ("29145.61", "0.075", "2185.92"), ("33919.81", "0.15", "4729.91"),
    ("45012.61", "0.225", "8105.85"), ("55976.17", "0.275", "10904.66"),
]
IOF_ANNEX = [
    96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50,
    46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0,
]
RULES = {
    "br_inss": ("br_inss_employee_2026", "BR", "www.gov.br/esocial/"),
    "br_irrf": ("br_irrf_monthly_2026", "BR", "l15270.htm"),
    "br_irpf": ("br_irpf_annual_2026", "BR", "l15270.htm"),
    "br_payroll": ("br_payroll_employee_2026", "BR", "www.gov.br/esocial/"),
    "br_investment_tax": ("br_fixed_income_resident_2026", "BR", "l11033.htm"),
    "br_iof": ("br_iof_selected_redemption_2026", "BR", "d6306compilado.htm"),
    "br_icms": ("br_sp_icms_internal_general_2026", "BR-SP", "legislacao.fazenda.sp.gov.br"),
    "br_ibs_cbs": ("br_ibs_cbs_2026_test_transition", "BR", "lcp214compilado.htm"),
}


def cent(value, rounding=ROUND_HALF_UP):
    return value.quantize(CENT, rounding=rounding)


def cash(value):
    return format(cent(value), "f")


def contribution(gross):
    lower = ZERO
    payroll_lines = []
    for upper, rate in ESOCIAL:
        band_base = max(ZERO, min(gross, upper) - lower)
        payroll_lines.append(cent(band_base * rate, ROUND_DOWN))
        lower = upper
    return sum(payroll_lines)


def income_tax(gross, legal, annual=False):
    deduction = min(gross, max(legal, min(D("17640"), cent(gross / 5)) if annual else D("607.20")))
    table = ANNUAL if annual else MONTHLY
    base = gross - deduction
    rate, rebate = next(((D(rate), D(rebate)) for first, rate, rebate in reversed(table) if base >= D(first)),
                        (ZERO, ZERO))
    before_relief = max(ZERO, cent(base * rate - rebate))
    lower, upper, cap, offset, factor = [D(value) for value in (
        ("60000", "88200", "2694.15", "8429.73", "0.095575") if annual else
        ("5000", "7350", "312.89", "978.62", "0.133145"))]
    permitted_relief = cap if gross <= lower else (cent(offset - factor * gross) if gross <= upper else ZERO)
    discount = min(before_relief, permitted_relief)
    after_relief = before_relief - discount
    return {
        "deduction": cash(deduction), "taxable_basis": cash(base),
        "tax_before_relief": cash(before_relief), "tax_relief": cash(discount),
        "tax_after_relief": cash(after_relief),
    }


def fixed_income(quote, principal, elapsed, exempt=False):
    profit = quote - principal
    taxable = max(ZERO, profit)
    iof = ZERO
    if elapsed <= len(IOF_ANNEX) and not exempt:
        days_limit = quote * D(elapsed) / 100
        gain_limit = taxable * D(IOF_ANNEX[elapsed - 1]) / 100
        iof = cent(min(days_limit, gain_limit))

    # Reverse order makes each statutory cutoff the start of the next bracket.
    rates = [(721, "0.15"), (361, "0.175"), (181, "0.20"), (1, "0.225")]
    rate = next(D(rate) for first, rate in rates if elapsed >= first)
    tax_base = ZERO if exempt else taxable - iof
    income_tax = cent(tax_base * rate)
    return {
        "holding_days": elapsed, "gross_gain": cash(profit), "iof": cash(iof),
        "income_tax_basis": cash(tax_base), "income_tax": cash(income_tax),
        "net_redemption": cash(quote - iof - income_tax), "net_gain": cash(profit - iof - income_tax),
    }


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.checks = Counter()

    def request(self, operation, data, options=None, original=None):
        payload = {"schema": 1, "module": "tax", "operation": operation, "input": data,
                   "options": options or {}}
        if original is not None:
            payload["original_input"] = original
        process = subprocess.run([self.executable, "tool", json.dumps(payload)],
                                 capture_output=True, encoding="utf-8", timeout=12)
        assert process.stdout.strip(), (payload, process.returncode, process.stderr)
        response = json.loads(process.stdout)
        assert process.returncode == (0 if response["ok"] else 1), (payload, response, process.stderr)
        return response

    def check(self, operation, fields, expected, *, options=None, original=None, category=None):
        raw = json.dumps(fields, separators=(",", ":"))
        response = self.request(operation, raw, options, original)
        assert response["ok"], (operation, fields, response)
        proof = response["proof"]
        method, jurisdiction, source = RULES[operation]
        event = fields.get("date", fields.get("redemption_date"))
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, "tax", operation), proof
        assert (proof["domain"], proof["method"], proof["exactness"]) == ("brazil_tax_simulation", method, "exact"), proof
        assert proof["expression"] == (raw if original is None else original), proof
        assert json.loads(proof["normalized"]) == fields, proof
        assert proof["options"] == (options or {}) and proof["units"]["currency"] == "BRL", proof
        assert proof["algorithm_version"].startswith("tax/") and proof["engine_version"], proof
        assert proof["formula"] and proof["references"], proof
        assert any(source in entry for entry in [*proof["constraints"], *proof["references"]]), proof
        variables = proof["variables"]
        assert variables["jurisdiction"] == jurisdiction and variables["regime"] == method, variables
        assert variables["rule_version"] == VERSION and variables["event_date"] == event, variables
        assert (variables["effective_from"], variables["supported_through"], variables["last_verified"]) == (
            "2026-01-01", "2026-12-31", "2026-11-25"), variables
        assert variables["minor_unit_scale"] == "2" and variables["rounding_policy"], variables
        result = json.loads(proof["result"])
        assert result["currency"] == "BRL" and result["rule_version"] == VERSION and result["event_date"] == event
        for key, value in expected.items():
            assert result[key] == value, (operation, fields, key, value, result[key])
        self.checks[category or operation] += 1

    def reject(self, operation, fields, code, options=None):
        data = fields if isinstance(fields, str) else json.dumps(fields)
        assert self.request(operation, data, options) == {"ok": False, "code": code}, (operation, data, code)
        self.checks["rejected"] += 1


def payroll_cases(oracle):
    # Published Receita examples, including the independent deductions it supplies.
    for gross, legal, base, preliminary, relief, withheld in [
        ("4000.00", "373.41", "3392.80", "114.76", "114.76", "0.00"),
        ("5000.00", "509.60", "4392.80", "312.89", "312.89", "0.00"),
        ("6000.00", "649.60", "5350.40", "562.63", "179.75", "382.88"),
        ("7607.20", "0", "7000.00", "1016.27", "0.00", "1016.27"),
    ]:
        oracle.check("br_irrf", {"date": "2026-01-02", "gross": gross, "legal_deductions": legal}, {
            "taxable_basis": base, "tax_before_relief": preliminary, "tax_relief": relief,
            "withholding_tax": withheld,
        }, category="receita_official_fixtures")

    spreads = [D(value) for value in ("-0.01", "0", "0.01")]
    income_amounts = {D("0"), D("1"), D("3000"), D("6000"), D("9000"), D("100000000.00")}
    for upper, _ in ESOCIAL:
        income_amounts.update(upper + offset for offset in spreads)
    income_amounts.update(D(value) + offset for value in ("5000", "7350") for offset in spreads)
    income_amounts.update(D(first) + D("607.20") + offset for first, _, _ in MONTHLY for offset in spreads)
    for gross in sorted(income_amounts):
        social = contribution(gross)
        oracle.check("br_inss", {"date": EVENT, "gross": cash(gross)}, {
            "inss": cash(social), "contribution_basis": cash(min(gross, ESOCIAL[-1][0])),
        })
        dependents = 0 if gross < 5000 else 1
        breakdown = income_tax(gross, social + D("189.59") * dependents)
        assessed = D(breakdown["tax_after_relief"])
        withheld = assessed if assessed > 10 else ZERO
        oracle.check("br_payroll", {"date": EVENT, "gross": cash(gross), "dependents": dependents}, {
            **breakdown, "inss": cash(social), "withholding_tax": cash(withheld),
            "net_after_inss_and_irrf": cash(gross - social - withheld),
        })

    for eligible, expected in [("607.21", "0.00"), ("607.20", "10.01")]:
        oracle.check("br_irrf", {"date": EVENT, "gross": "5027.94", "legal_deductions": eligible},
                     {"withholding_tax": expected}, options={"currency": "BRL", "rounding": "half_up"})


def annual_cases(oracle):
    incomes = {D("0"), D("50000"), D("72000"), D("200000"), D("600000")}
    incomes.update(D(value) + offset for value in ("60000", "88200")
                   for offset in (D("-0.01"), ZERO, D("0.01")))
    for gross in sorted(incomes):
        for deductions in range(2):
            legal, dependents, education, withheld = ((D("17000"), 1, D("4500.00"), D("120.35"))
                                                     if deductions and gross else (ZERO, 0, ZERO, ZERO))
            allowable_education = min(education, D("3561.50"))
            calculated = income_tax(gross, legal + D("2275.08") * dependents + allowable_education, annual=True)
            balance = D(calculated["tax_after_relief"]) - withheld
            oracle.check("br_irpf", {"date": YEAR_END, "gross": cash(gross), "legal_deductions": cash(legal),
                                     "dependents": dependents, "education_expenses": cash(education),
                                     "withheld_tax": cash(withheld)}, {
                **calculated, "eligible_education_expense": cash(allowable_education),
                "tax_due": cash(max(ZERO, balance)), "refund": cash(max(ZERO, -balance)),
                "calendar_year": 2026, "assessment_year": 2027,
            })


def investment_cases(oracle):
    settled = date(2026, 11, 25)
    for days in (*range(1, 32), 179, 180, 181, 359, 360, 361, 719, 720, 721, 730):
        purchased = settled - timedelta(days=days)
        product = ["cdb", "rdb", "tesouro"][days % 3]
        for quote in [D("899.23"), D("1002.34"), D("1300.00")]:
            fields = {"product": product, "principal": "1000.00", "redemption": cash(quote),
                      "purchase_date": purchased.isoformat(), "redemption_date": settled.isoformat()}
            expected = fixed_income(quote, D("1000.00"), days)
            oracle.check("br_investment_tax", fields, expected)
            if days <= 31:
                oracle.check("br_iof", fields, {key: expected[key] for key in ("holding_days", "gross_gain", "iof")})

    for product in ["lci", "lca", "savings"]:
        fields = {"product": product, "principal": "1000", "redemption": "1025.47",
                  "purchase_date": "2026-01-01", "redemption_date": "2026-11-25"}
        elapsed = (settled - date(2026, 1, 1)).days
        oracle.check("br_investment_tax", fields, fixed_income(D("1025.47"), D("1000"), elapsed, exempt=True))
    oracle.check("br_investment_tax", {"product": "lci", "principal": "1000", "redemption": "1025.47",
                                       "purchase_date": "2025-08-31", "redemption_date": "2026-02-28"}, {
        "income_tax": "0.00", "iof": "0.00", "net_gain": "25.47",
    })


def consumption_cases(oracle):
    for amount in ("0", "0.05", "0.56", "5.00", "1000.00", "1728.19", "70000.30"):
        value = D(amount)
        icms = cent(value * D("0.18"))
        oracle.check("br_icms", {"date": EVENT, "gross": amount}, {
            "included_icms": cash(icms), "price_less_icms": cash(value - icms),
        }, original=f"SP base BRL {amount}")

        for met in [True, False]:
            cbs, ibs = cent(value * D("0.009")), cent(value * D("0.001"))
            oracle.check("br_ibs_cbs", {"date": EVENT, "base": amount, "ancillary_obligations_met": met}, {
                "nominal_ibs_state": cash(ibs), "nominal_ibs_municipal": "0.00", "nominal_cbs": cash(cbs),
                "total_nominal": cash(cbs + ibs), "payment_status": "dispensed" if met else "undetermined",
                "payable_ibs_cbs": "0.00" if met else None,
            })


def rejection_cases(oracle):
    for unsupported in ("2025-12-31", "2027-01-01"):
        oracle.reject("br_payroll", {"date": unsupported, "gross": "1000"}, "unsupported")
        oracle.reject("br_ibs_cbs", {"date": unsupported, "base": "1000", "ancillary_obligations_met": True}, "unsupported")
    oracle.reject("br_inss", {"date": EVENT, "gross": "0.001"}, "domain")
    oracle.reject("br_inss", {"date": EVENT, "gross": "-0.01"}, "domain")
    oracle.reject("br_inss", {"date": EVENT, "gross": 100}, "invalid_input")
    oracle.reject("br_inss", {"date": "2026-02-29", "gross": "100"}, "invalid_input")
    oracle.reject("br_inss", {"date": EVENT, "gross": "100"}, "unsupported", {"currency": "USD"})
    oracle.reject("br_inss", {"date": EVENT, "gross": "100"}, "unsupported", {"rounding": "half_even"})
    oracle.reject("br_irpf", {"date": YEAR_END, "gross": "600000.01"}, "unsupported")
    oracle.reject("br_irrf", {"date": EVENT, "gross": "100", "legal_deductions": "100.01"}, "domain")
    oracle.reject("br_irrf", {"date": EVENT, "gross": "100", "dependents": 31}, "domain")
    oracle.reject("br_icms", {"date": EVENT, "gross": "100", "state": "MG"}, "invalid_input")
    oracle.reject("br_ibs_cbs", {"date": EVENT, "base": "100"}, "invalid_input")
    io = {"product": "cdb", "purchase_date": EVENT, "redemption_date": EVENT, "principal": "100", "redemption": "120"}
    oracle.reject("br_iof", io, "domain")
    oracle.reject("br_iof", {**io, "product": "lci", "purchase_date": "2026-01-01"}, "unsupported")
    oracle.reject("br_investment_tax", {**io, "product": "lca", "purchase_date": "2026-11-01"}, "unsupported")
    oracle.reject("br_investment_tax", {**io, "product": "lca", "purchase_date": "2025-05-25"}, "unsupported")
    oracle.reject("br_inss", f'{{"date":"{EVENT}","gross":"100","gross":"100"}}', "invalid_input")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    args = parser.parse_args()
    oracle = Oracle(args.executable.resolve(strict=True))
    for group in (payroll_cases, annual_cases, investment_cases, consumption_cases, rejection_cases):
        group(oracle)
    print(json.dumps({"ok": True, "count": oracle.checks.total(), "checks": oracle.checks}, sort_keys=True))


if __name__ == "__main__":
    main()
