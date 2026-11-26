"""Independent comparison checks through the public CLI request envelope."""

import argparse
import hashlib
import json
import subprocess
from decimal import Decimal, localcontext
from fractions import Fraction
from pathlib import Path


def recipe(operation, inputs, currency="BRL", rounding="half_even"):
    return {
        "operation": operation,
        "input": json.dumps(inputs, separators=(",", ":")),
        "options": {"currency": currency, "rounding": rounding},
    }


def equivalent(rate, source, target):
    return recipe("equivalent_rate", {
        "rate": rate,
        "from_periods_per_year": source,
        "to_periods_per_year": target,
    })


def scenario_case(name, module, left, right, metric, status, **checks):
    inputs = {"reference": left, "alternative": right}
    if metric is not None:
        inputs["metric"] = metric
    return {
        "name": name,
        "request": {"schema": 1, "module": module, "operation": "scenario_compare",
                    "input": json.dumps(inputs, separators=(",", ":")), "options": {}},
        "status": status,
        **checks,
    }


def money_case(name, left, right, difference, **checks):
    return scenario_case(name, "financial", left, right, "interest", "direct",
                         difference=str(difference), **checks)


def interest(principal, rate, currency="BRL"):
    return recipe("simple_interest", {"principal": principal, "rate": rate, "periods": 1}, currency)


def single_payment_cost(rate, fee="0"):
    return recipe("effective_cost", {
        "method": "single_payment", "principal": "1000000", "rate": rate,
        "periods": 1, "start_date": "2026-01-01", "upfront_fee": fee,
    })


def independently_annualized_cost(rate, fee):
    with localcontext() as context:
        context.prec = 70
        principal = Decimal("1000000")
        payback = principal * (1 + Decimal(rate))
        return (payback / (principal - Decimal(fee))) ** (Decimal(365) / 31) - 1


def check_catalog_cases():
    """A recipe compared with itself cannot require a basis conversion."""
    amount = {"amount": "1000", "rate": "0.02", "periods": 3}
    annuity = {"payment": "100", "rate": "0.02", "periods": 3, "timing": "end"}
    flows = {"flows": ["-100", "75", "60"], "rate": "0.025"}
    loan = {"principal": "1000", "rate": "0.01", "periods": 3, "start_date": "2026-01-31"}
    date = "2026-11-25"
    investment_tax = {"product": "cdb", "purchase_date": "2026-09-01", "redemption_date": "2026-09-14",
                      "principal": "1000", "redemption": "1100"}
    operations = {
        "financial": {
            "compound_interest": {"principal": "1000", "rate": "0.02", "periods": 3},
            "nominal_effective": {"rate": "0.12", "compounds": 12, "direction": "nominal_to_effective"},
            "present_value": amount, "future_value": amount,
            "annuity_present_value": annuity, "annuity_future_value": annuity,
            "annuity_payment": {"principal": "100", "rate": "0.02", "periods": 3, "timing": "end"},
            "periods": {"present": "100", "future": "135", "rate": "0.02"},
            "discount": {**amount, "convention": "rational_compound"}, "npv": flows,
            "discounted_payback": flows, "profitability_index": flows,
            "irr": {"flows": ["-100", "230", "-132"]},
        },
        "investment": {
            "project": {"initial": "1000", "periods": 3, "rate": "0.02", "contribution": "100",
                        "withdrawal": "6", "inflation": "0.003", "fee_rate": "0.001",
                        "fixed_fee": "0.02", "tax_rate": "0.20", "period_kind": "month", "start_date": "2026-01-01"},
        },
        "loans": {
            "price": loan, "sac": {**loan, "extra": [{"period": 1, "amount": "100"}], "extra_policy": "reduce_payment"},
            "uniform": {**loan, "payment": "400"}, "bullet": loan, "single_payment": loan,
            "payoff": {**loan, "method": "sac", "payoff_at": 2},
            "effective_cost": {**loan, "method": "price", "upfront_fee": "10"},
        },
        "tax": {
            "br_irrf": {"date": date, "gross": "6000", "legal_deductions": "649.60"},
            "br_inss": {"date": date, "gross": "10000"},
            "br_irpf": {"date": "2026-12-31", "gross": "78000"},
            "br_payroll": {"date": date, "gross": "6000"},
            "br_investment_tax": investment_tax, "br_iof": investment_tax,
            "br_icms": {"date": date, "gross": "1000"},
            "br_ibs_cbs": {"date": date, "base": "1000", "ancillary_obligations_met": False},
        },
        "business": {
            "price": {"unit_cost": "100", "markup": "0.25"},
            "margins": {"revenue": "200", "cogs": "100", "variable_cogs": "80", "variable_expenses": "20",
                        "fixed_expenses": "10", "depreciation": "5", "net_finance_cost": "3", "income_tax": "7"},
            "break_even": {"unit_price": "125", "variable_unit_cost": "100", "fixed_accounting": "300",
                           "non_cash_fixed": "50"},
            "ratios": {"net_profit": "20", "initial_assets": "100", "final_assets": "120", "initial_equity": "50",
                       "final_equity": "60", "nopat": "25", "average_invested_capital": "90", "current_assets": "48",
                       "current_liabilities": "20", "inventory": "10", "prepaid": "3",
                       "total_liabilities": "60", "total_assets": "120", "investment_cost": "100", "investment_proceeds": "125"},
            "ebitda": {"net_income": "12", "income_tax": "4", "net_finance_cost": "3", "depreciation": "2"},
            "cycle": {"days": 365, "average_inventory": "20", "cogs": "100", "average_receivables": "30",
                      "credit_sales": "150", "average_payables": "20", "credit_purchases": "110"},
            "plan": {"periods": 3, "revenue": "100", "revenue_growth": "0.10", "cost": "40", "expenses": "20",
                     "initial_cash": "25", "cash_receipts": "90", "cash_payments": "65",
                     "discount_rate": "0.01", "initial_investment": "10"},
        },
    }
    output = []
    for module, scenarios in operations.items():
        for operation, inputs in scenarios.items():
            scenario = recipe(operation, inputs, rounding="half_up" if module == "tax" else "half_even")
            output.append(scenario_case(f"catalog:{module}:{operation}", module, scenario, scenario, None, None))
    return output


def cases():
    result = []
    for frequency in (2, 3, 4, 6, 12):
        for rate in ("-0.025", "0", "0.012345678901", "0.10"):
            theoretical = (1 + Fraction(rate)) ** frequency - 1
            result.append(scenario_case(
                f"equivalent:{frequency}:{rate}", "financial",
                equivalent(rate, frequency, frequency), equivalent(rate, frequency, 1),
                "rate", "normalized", difference="0", percentage_points="0",
                normalized=str(theoretical),
            ))
    result.append(scenario_case(
        "nominal_to_effective", "financial",
        recipe("nominal_effective", {"rate": "0.21", "compounds": 2, "direction": "effective_to_nominal"}),
        equivalent("0.10", 2, 1), "rate", "normalized",
        difference="0", percentage_points="0", normalized="0.21",
    ))
    result.extend([
        scenario_case("different_percentage_points_and_relative", "financial",
                      equivalent("0.10", 1, 1), equivalent("0.12", 1, 1), "rate", "direct",
                      difference="0.02", percentage_points="2", relative_percent="20"),
        scenario_case("zero_reference", "financial", equivalent("0", 1, 1), equivalent("0.12", 1, 1),
                      "rate", "direct", difference="0.12", percentage_points="12", relative_percent=None),
        scenario_case("negative_reference", "financial", equivalent("-0.10", 1, 1), equivalent("-0.08", 1, 1),
                      "rate", "direct", difference="0.02", percentage_points="2", relative_percent="20"),
        scenario_case("unknown_period", "financial",
                      recipe("rate", {"present": "100", "future": "121", "periods": 2}),
                      equivalent("0.10", 2, 1), "rate", ("incompatible", "contextual")),
        scenario_case("periodic_and_dated_mirr", "financial",
                      recipe("mirr", {"flows": ["-100", "35", "85"], "finance_rate": "0.05", "reinvest_rate": "0.06"}),
                      recipe("mirr", {"flows": ["-100", "35", "85"], "finance_rate": "0.05", "reinvest_rate": "0.06",
                                      "dates": ["2026-01-01", "2026-07-01", "2027-01-01"], "day_count": "act_365f"}),
                      "mirr", ("incompatible", "contextual")),
        scenario_case("periods_and_years_payback", "financial",
                      recipe("payback", {"flows": ["-100", "110"]}),
                      recipe("payback", {"flows": ["-100", "110"], "dates": ["2026-01-01", "2027-01-01"]}),
                      "payback", ("incompatible", "contextual")),
        scenario_case("money_currency_mismatch", "financial", interest("100", "0.1", "BRL"), interest("100", "0.1", "USD"),
                      "interest", "incompatible"),
        money_case("sub_cent", interest("1", "0.001"), interest("1", "0.002"), Fraction(1, 1000),
                   presentations=["0.00", "0.00"]),
        money_case("exact_nonzero_at_zero_display_resolution", interest("0.000000000001", "0"),
                   interest("0.000000000001", "0.000000000001"), Fraction(1, 10**24),
                   displayed_difference="0", relative_percent=None),
        money_case("high_precision", interest("123456789012345678", "0.000000000031"),
                   interest("123456789012345678", "0.000000000032"),
                   Fraction(123456789012345678, 10**12)),
    ])
    start = {"initial": "1000", "rate": "0.01", "start_date": "2026-01-01"}
    left = recipe("project", {**start, "periods": 12, "period_kind": "month"})
    longer = recipe("project", {**start, "periods": 24, "period_kind": "month"})
    annual = recipe("project", {**start, "periods": 2, "period_kind": "year"})
    result.extend([
        scenario_case("different_investment_horizons", "investment", left, longer,
                      "final_balance", "contextual"),
        scenario_case("cumulative_investment_return_different_horizon", "investment", left, longer,
                      "simple_net_return", ("incompatible", "contextual")),
        scenario_case("monthly_and_annual_accumulations", "investment", longer, annual,
                      "simple_net_return", ("incompatible", "contextual")),
        scenario_case("differences_in_loan_amount_and_term", "loans",
                      recipe("price", {"principal": "1000", "rate": "0.01", "periods": 3, "start_date": "2026-01-31"}),
                      recipe("sac", {"principal": "2000", "rate": "0.01", "periods": 6, "start_date": "2026-01-31"}),
                      "total_cost", "contextual"),
        scenario_case("same_rule_different_tax_events", "tax",
                      recipe("br_irrf", {"date": "2026-10-25", "gross": "6000"}, rounding="half_up"),
                      recipe("br_irrf", {"date": "2026-11-25", "gross": "6000"}, rounding="half_up"),
                      "withholding_tax", ("incompatible", "contextual")),
        scenario_case("different_tax_jurisdiction", "tax",
                      recipe("br_icms", {"date": "2026-11-25", "gross": "6000"}, rounding="half_up"),
                      recipe("br_irrf", {"date": "2026-11-25", "gross": "6000"}, rounding="half_up"),
                      None, None),
        scenario_case("unsupported_tax_period", "tax",
                      recipe("br_irrf", {"date": "2026-11-25", "gross": "6000"}, rounding="half_up"),
                      recipe("br_irrf", {"date": "2027-11-25", "gross": "6000"}, rounding="half_up"),
                      None, None, error=("unsupported", "domain", "invalid_input")),
        scenario_case("undefined_indicator", "business",
                      recipe("ratios", {"current_assets": "48", "current_liabilities": "20"}),
                      recipe("ratios", {"current_assets": "48", "current_liabilities": "0"}),
                      "current_ratio", "undefined"),
        scenario_case("markup_and_margin_remain_distinct", "business",
                      recipe("price", {"unit_cost": "100", "markup": "0.25"}),
                      recipe("price", {"unit_cost": "100", "margin": "0.20"}),
                      None, None),
        scenario_case("reject_recursive_comparison", "financial",
                      recipe("scenario_compare", {}), equivalent("0.10", 1, 1), None, None,
                      error=("unsupported", "invalid_input")),
        scenario_case("reject_injected_value", "financial",
                      {"value": "10000", **equivalent("0.10", 1, 1)}, equivalent("0.10", 1, 1), None, None,
                      error=("invalid_input",)),
        scenario_case("reject_untrusted_metric_name", "financial",
                      equivalent("0.10", 1, 1), equivalent("0.10", 1, 1), "__proto__", None,
                      error=("invalid_input", "unsupported")),
    ])
    result.append({"name": "reject_legacy_bare_values", "error": ("invalid_input",), "status": None,
                   "request": {"schema": 1, "module": "financial", "operation": "scenario_compare",
                               "input": '{"unit":"rate","reference":"0.10","alternative":"0.21"}', "options": {}}})
    for compatible in (False, True):
        proposals = [
            {"method": "price", "principal": "1000", "periods": 3, "rate": "0.01", "start_date": "2026-01-31"},
            {"method": "sac", "principal": "1000" if compatible else "2000",
             "periods": 3 if compatible else 6, "rate": "0.01", "start_date": "2026-01-31"},
        ]
        result.append({
            "name": "loan_nominal_selection_comparable" if compatible else "loan_nominal_selection_contextual",
            "request": {"schema": 1, "module": "loans", **recipe("compare", {"proposals": proposals})},
            "nominal_status": "direct_compatible" if compatible else "loan_nominal_basis_mismatch",
            "lowest_nominal_proposal": [2] if compatible else [],
        })
    for rate, fee in (("0.010000000001", "0"), ("0.01", "0.000000000001")):
        reference = "0.01"
        with localcontext() as context:
            context.prec = 70
            change = independently_annualized_cost(rate, fee) - independently_annualized_cost(reference, "0")
        result.append(scenario_case(
            f"dated_loan_cost_resolution:{rate}:{fee}", "loans",
            single_payment_cost(reference), single_payment_cost(rate, fee), "effective_cost", "direct",
            approximate_difference=change,
        ))
    return result + check_catalog_cases()


def call(executable, command):
    result = subprocess.run([executable, "tool", json.dumps(command, separators=(",", ":"))],
                            text=True, encoding="utf-8", capture_output=True, timeout=12)
    assert result.returncode in (0, 1), result.stderr
    return json.loads(result.stdout)


def numeric(value):
    return Fraction(str(value))


def verify_comparison_result(fixture, result):
    name = fixture["name"]
    assert result["schema"] == 1 and isinstance(result["items"], list), (name, result)
    assert len({item["id"] for item in result["items"]}) == len(result["items"]), (name, result)
    selected = result["selected"]
    if fixture["status"] is None:
        assert selected is None, (name, result)
        if name == "different_tax_jurisdiction":
            assert result["items"] and not any(item["status"] in ("direct", "normalized") for item in result["items"]), result
        if name == "markup_and_margin_remain_distinct":
            assert {"markup", "margin"} <= {item["key"] for item in result["items"]}, result
        if name.startswith("catalog:"):
            if name == "catalog:financial:irr":
                assert not result["items"], result
            else:
                assert result["items"], (name, result)
                assert {item["status"] for item in result["items"]} <= {"direct", "contextual", "undefined"}, (name, result)
        return
    permitted = fixture["status"] if isinstance(fixture["status"], tuple) else (fixture["status"],)
    assert selected["status"] in permitted, (name, permitted, selected)
    assert any(item["id"] == selected["id"] and item["status"] == selected["status"] for item in result["items"])
    for side in ("reference", "alternative"):
        operand = selected[side]
        if operand is not None:
            assert operand["semantic_id"] and operand["context"] and operand["source"], (name, operand)
    if "approximate_difference" in fixture:
        expected = fixture["approximate_difference"]
        assert expected > 0 and selected["exact_difference"] is None, (name, selected)
        assert selected["precision_source"] == "canonical_approximate", (name, selected)
        assert all(Decimal(selected[side]["solver_tolerance"]) == Decimal("1e-12")
                   for side in ("reference", "alternative")), (name, selected)
        used = selected["precision_used"]
        combined = Decimal(used["combined_solver_tolerance"])
        assert combined == Decimal("2e-12"), (name, selected)
        if expected <= combined:
            assert selected["precision_warning"] == "within_solver_resolution", (name, selected)
            assert all(selected[field] is None for field in
                       ("absolute_difference", "percentage_points", "relative_percent")), (name, selected)
        else:
            assert selected["precision_warning"] == "solver_resolution", (name, selected)
            places = used["difference_decimal_places"]
            assert Decimal(10) ** -places >= combined, (name, selected)
            assert abs(Decimal(selected["absolute_difference"]) - expected) <= Decimal(10) ** -places, (name, selected)
        return
    if "difference" not in fixture:
        assert selected["absolute_difference"] is None and selected["relative_percent"] is None, (name, selected)
        return
    assert numeric(selected["exact_difference"]) == numeric(fixture["difference"]), (name, selected)
    assert numeric(selected["absolute_difference"]) == numeric(fixture.get("displayed_difference", fixture["difference"])), (name, selected)
    assert selected["formula"] and selected["precision_source"], (name, selected)
    for field in ("percentage_points", "relative_percent"):
        if field in fixture:
            expected = fixture[field]
            actual = selected[field]
            assert (actual is None if expected is None else numeric(actual) == numeric(expected)), (name, field, selected)
    if fixture.get("presentations"):
        assert [selected[s]["presentation"] for s in ("reference", "alternative")] == fixture["presentations"], (name, selected)
    if "normalized" in fixture:
        assert selected["common_basis"] == {"periods_per_year": 1, "capitalization": "compound", "nature": "effective"}, (name, selected)
        for side in ("reference", "alternative"):
            normalized = selected["normalization"][side]
            assert numeric(normalized["value"]) == numeric(fixture["normalized"]), (name, selected)
            assert normalized["original_basis"] and normalized["formula"], (name, normalized)


def verify(executable, fixture):
    command = fixture["request"]
    reply = call(executable, command)
    if "error" in fixture:
        assert reply["ok"] is False and reply["code"] in fixture["error"], (fixture["name"], reply)
        return False
    assert reply["ok"] is True, (fixture["name"], reply)
    proof = reply["proof"]
    assert proof["operation"] == command["operation"]
    result = json.loads(proof["result"])
    if command["operation"] == "compare":
        assert result["nominal_cost_comparison"] == fixture["nominal_status"], result
        assert result["least_total_cost_proposals"] == fixture["lowest_nominal_proposal"], result
        assert len(result["proposals"]) == 2
    else:
        verify_comparison_result(fixture, result)
    replay = {**command, "input": proof["normalized"]}
    replayed = call(executable, replay)
    assert replayed["ok"] and replayed["proof"]["result"] == proof["result"], fixture["name"]
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path, nargs="?")
    parser.add_argument("--requests", action="store_true")
    args = parser.parse_args()
    fixtures = cases()
    if args.requests:
        print(json.dumps([row["request"] for row in fixtures], separators=(",", ":")))
        return
    if args.executable is None:
        parser.error("Pass the audited native tool executable")
    executable = args.executable.resolve()
    replays = sum(verify(executable, fixture) for fixture in fixtures)
    print(json.dumps({"suite": "financial-semantic-comparison", "passed": len(fixtures),
                      "independent_proof_replays": replays,
                      "cli_sha256": hashlib.sha256(executable.read_bytes()).hexdigest(),
                      "failed": 0}))


if __name__ == "__main__":
    main()
