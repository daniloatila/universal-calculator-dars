"""Independent, offline oracles for DARS Investment and Business CLI results.

Use Python Decimal and Fraction for expectations. Only the standard library
is needed. The BCB published savings examples are fixed in investment_cases.
"""

import argparse
from collections import Counter
from decimal import Decimal, ROUND_HALF_EVEN, ROUND_HALF_UP, getcontext
from fractions import Fraction
import json
from pathlib import Path
import subprocess


getcontext().prec = 96
D = Decimal
ONE = D(1)
BCB_EXAMPLES = (
    "https://www3.bcb.gov.br/CALCIDADAO/publico/metodologiaCorrigirPelaPoupanca.do"
    "?method=metodologiaCorrigirPelaPoupanca"
)


def shown(value, places=2, rounding=ROUND_HALF_EVEN):
    if isinstance(value, Fraction):
        value = D(value.numerator) / D(value.denominator)
    value = D(value).quantize(ONE.scaleb(-places), rounding=rounding)
    return format(value.copy_abs() if value.is_zero() else value, "f")


def subset(actual, expected, path="result"):
    if isinstance(expected, dict):
        assert isinstance(actual, dict) and (expected or not actual), (path, actual, expected)
        for key, expected_value in expected.items():
            subset(actual[key], expected_value, f"{path}.{key}")
    elif isinstance(expected, list):
        assert len(actual) == len(expected), (path, actual, expected)
        for offset, (actual_item, expected_item) in enumerate(zip(actual, expected)):
            subset(actual_item, expected_item, f"{path}[{offset}]")
    else:
        assert actual == expected, (path, actual, expected)


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.counts = {"investment": Counter(), "business": Counter()}

    def request(self, module, operation, fields, options):
        raw = fields if isinstance(fields, str) else json.dumps(fields, separators=(",", ":"))
        command = {
            "schema": 1, "module": module, "operation": operation,
            "input": raw, "options": options,
        }
        completed = subprocess.run(
            [self.executable, "tool", json.dumps(command, separators=(",", ":"))],
            capture_output=True, encoding="utf-8", timeout=12, check=False,
        )
        assert completed.stdout.strip(), (command, completed.returncode, completed.stderr)
        result = json.loads(completed.stdout)
        assert completed.returncode == (0 if result["ok"] else 1), (command, result)
        return raw, result

    def check(self, module, operation, category, fields, expected, *, options=None, approximate=False):
        options = options or {}
        raw, answer = self.request(module, operation, fields, options)
        assert answer["ok"], (module, operation, fields, answer)
        proof = answer["proof"]
        subset(proof, {
            "schema": 1, "expression": raw, "module": module, "operation": operation,
            "exactness": "approximate" if approximate else "exact",
            "options": options, "units": {"currency": options.get("currency", "BRL")},
            "variables": {"rounding_policy": options.get("rounding", "half_even")},
        }, "proof")
        assert json.loads(proof["normalized"]) == fields, proof
        assert proof["method"] and proof["formula"] and proof["references"] and proof["engine_version"], proof
        assert proof["algorithm_version"].startswith(f"{module}/"), proof
        if approximate:
            assert proof["precision"] == 18 and proof["error_bound"] is None, proof
        result = json.loads(proof["result"])
        subset(result, expected)
        assert len(proof["result"].encode("utf-8")) <= 32_768, proof["method"]
        self.counts[module][category] += 1
        return result

    def reject(self, module, operation, fields, code, options=None):
        _, result = self.request(module, operation, fields, options or {})
        assert result == {"ok": False, "code": code}, (module, operation, fields, result, code)
        self.counts[module]["rejected"] += 1


def investment_cases(oracle):
    def check(category, fields, expected, **keyword):
        return oracle.check("investment", "project", category, fields, expected, **keyword)

    # Closed forms for equal end/start payments, independently of the engine's
    # per-period ledger. Includes a negative and a zero effective rate.
    for opening in ("1000", "315.99"):
        for rate in ("0.01", "0", "-0.035"):
            for timing in ("start", "end"):
                n, deposit = 5, D("65.25")
                growth = ONE + D(rate)
                annuity = n if rate == "0" else (growth**n - 1) / D(rate)
                end = D(opening) * growth**n + deposit * annuity * (growth if timing == "start" else 1)
                check("fixed_cash_flow", {
                    "initial": opening, "periods": n, "rate": rate,
                    "contribution": str(deposit), "timing": timing, "page_size": 1,
                }, {
                    "final_balance": shown(end), "gross_final_balance": shown(end),
                    "net_profit": shown(end - D(opening) - deposit * n),
                    "contributions": shown(deposit * n), "next_page": 2, "rows": [{"period": 1}],
                })

    end = (D(1000) * D("1.10") + 100) * D("0.90") - 80
    inflation = D("1.02") * D("1.03")
    real_invested = 1000 + 100 / D("1.02")
    real_profit = (end + 80) / inflation - real_invested
    check("variable_cash_flow", {
        "initial": "1000", "periods": 2, "rate": "0.10", "inflation": "0.02",
        "contribution": "100", "page_start": 2,
        "overrides": [{"period": 2, "rate": "-0.10", "contribution": "0",
                       "withdrawal": "80", "inflation": "0.03"}],
    }, {
        "final_balance": shown(end), "net_profit": shown(end + 80 - 1100),
        "real_final_balance": shown(end / inflation), "contributions": "100.00",
        "real_net_profit": shown(real_profit), "simple_real_net_return": shown(real_profit / real_invested, 18),
        "withdrawals": "80.00", "next_page": None, "rows": [{"period": 2}],
    })
    check("nominal_and_real", {"initial": "1200", "periods": 8, "rate": "0.034", "inflation": "0.034"}, {
        "real_final_balance": "1200.00", "real_net_profit": "0.00", "simple_real_net_return": shown(0, 18),
        "final_balance": shown(1200 * D("1.034")**8),
    })

    # One-period fee and tax settlement, then a loss when distributions are
    # enabled. Derive each expected figure explicitly.
    initial = D(1000)
    interest = initial * D("0.10")
    fee = (initial + interest) * D("0.01") + 4
    tax = interest * D("0.20")
    for reinvest in (False, True):
        distributed = D(0) if reinvest else interest - tax
        check("fees_tax_reinvestment", {
            "initial": "1000", "periods": 1, "rate": "0.1", "fee_rate": "0.01",
            "fixed_fee": "4", "tax_rate": "0.2", "reinvest": reinvest,
        }, {
            "fees": shown(fee), "taxes": shown(tax), "distributions": shown(distributed),
            "final_balance": shown(initial + interest - fee - tax - distributed),
            "gross_distributions": shown(0 if reinvest else interest),
            "net_profit": shown(interest - fee - tax),
            "simple_gross_return": shown(interest / initial, 18),
            "simple_net_return": shown((interest - fee - tax) / initial, 18),
            "simple_real_net_return": shown((interest - fee - tax) / initial, 18),
        })
    check("fees_tax_reinvestment", {
        "initial": "100", "periods": 1, "rate": "-0.1", "tax_rate": "0.2", "reinvest": False,
    }, {"final_balance": "90.00", "taxes": "0.00", "distributions": "0.00"})

    daily = Fraction(4, 10_000) * Fraction(105, 100)
    for product in ("cdb", "rdb", "lci", "lca"):
        check("b3_di_participation", {
            "initial": "1000", "periods": 2, "rate": "1.05", "index_rate": "0.0004",
            "rate_basis": "daily_di", "product": product, "start_date": "2026-01-09",
            "source": "Synthetic effective daily DI", "reference_date": "2026-01-09",
            "holidays": ["2026-01-12"],
        }, {
            "final_balance": shown(1000 * (1 + daily)**2),
            "rows": [{"date": "2026-01-13", "effective_rate": shown(daily, 18)}, {"date": "2026-01-14"}],
            "policy": {"basis": "daily_di", "data_mode": "manual_offline"},
        })

    check("treasury_maturity", {"initial": "100", "periods": 1, "rate": "0.1", "product": "treasury_fixed"}, {
        "final_balance": "110.00", "policy": {"valuation": "maturity_projection_no_market_valuation"},
    })
    for product, spread, index in (("treasury_selic", "0.001", "0.02"), ("treasury_ipca", "0.05", "0.04")):
        final = 500 * (ONE + D(spread)) * (ONE + D(index))
        check("treasury_maturity", {
            "initial": "500", "periods": 1, "rate": spread, "index_rate": index, "product": product,
            "source": "Synthetic index", "reference_date": "2026-01-01",
        }, {
            "final_balance": shown(final),
            "real_final_balance": shown(final / (ONE + D(index)) if product == "treasury_ipca" else final),
            "policy": {"valuation": "maturity_projection_no_market_valuation"},
        })

    # Banco Central Calculadora do Cidadão methodology examples, transcribed
    # numerically with publication and rate basis pinned in the request.
    published = {
        "product": "savings", "source": BCB_EXAMPLES, "reference_date": "2002-08-30",
    }
    check("bcb_published_savings", {
        **published, "reference_date": "2001-03-31", "initial": "500", "rate": "0.005",
        "periods": 1, "start_date": "2001-03-01", "end_date": "2001-03-31",
    }, {"final_balance": "500.00", "elapsed_periods": 0, "rows": []})
    historical = check("bcb_published_savings", {
        **published, "initial": "10000", "rate": "0.006683", "periods": 4,
        "start_date": "2002-05-17", "end_date": "2002-08-30",
        "overrides": [{"period": 2, "rate": "0.007516"}, {"period": 3, "rate": "0.007826"}],
    }, {
        "final_balance": "10221.87", "elapsed_periods": 3,
        "rows": [{"date": "2002-06-17"}, {"date": "2002-07-17"}, {"date": "2002-08-17"}],
        "policy": {"basis": "savings_anniversary", "data_mode": "manual_offline", "source": BCB_EXAMPLES},
    })
    assert BCB_EXAMPLES in historical["policy"]["rule_references"], historical["policy"]
    for end_date, elapsed, final, rows in (
        ("2024-02-29", 0, "500.00", []), ("2024-03-01", 1, "502.50", [{"date": "2024-03-01"}]),
    ):
        check("bcb_anniversary_at_month_end", {
            **published, "reference_date": "2024-01-31", "initial": "500", "rate": "0.005", "periods": 2,
            "start_date": "2024-01-31", "end_date": end_date,
        }, {"final_balance": final, "elapsed_periods": elapsed, "rows": rows})

    for selic in ("0", "0.084999", "0.085", "0.085001", "0.10"):
        target, tr = D(selic), D("0.0020")
        additional_factor = D("1.005") if target > D("0.085") else (ONE + target * D("0.7"))**(ONE / 12)
        check("savings_selic_threshold", {
            "initial": "10000", "periods": 1, "rate": selic, "index_rate": str(tr),
            "product": "savings", "rate_basis": "savings_selic_tr", "start_date": "2024-01-02",
            "source": "Synthetic Selic and TR", "reference_date": "2024-01-02",
        }, {"final_balance": shown(10000 * (ONE + tr) * additional_factor)},
            approximate=0 < target <= D("0.085"))

    check("rounding_presentation", {"initial": "1000.5", "rate": "0", "periods": 1}, {"final_balance": "1000"},
          options={"currency": "JPY", "rounding": "half_even"})
    check("rounding_presentation", {"initial": "1000.5", "rate": "0", "periods": 1}, {"final_balance": "1001"},
          options={"currency": "JPY", "rounding": "half_up"})
    check("zero_denominator", {"initial": "0", "rate": "0.1", "periods": 5}, {
        "final_balance": "0.00", "simple_net_return": None, "simple_gross_return": None, "simple_real_net_return": None,
    })
    check("calendar_periods", {
        "initial": "1000", "rate": "0.02", "periods": 4, "period_kind": "month",
        "start_date": "2024-01-31", "end_date": "2024-04-29",
    }, {"elapsed_periods": 2, "final_balance": "1040.40", "rows": [{"date": "2024-02-29"}, {"date": "2024-03-31"}]})

    large = {
        "initial": "1000000", "rate": "10", "periods": 252, "page_start": 200, "page_size": 40,
    }
    first = check("bounded_page", large, {"elapsed_periods": 252})
    count = len(first["rows"])
    assert 0 < count < 40 and first["next_page"] == 200 + count, first["next_page"]
    assert [row["period"] for row in first["rows"]] == list(range(200, 200 + count))
    check("bounded_page", {**large, "page_start": first["next_page"]}, {
        "final_balance": first["final_balance"],
    })

    base = {"initial": "1000", "rate": "0", "periods": 2}
    for fields, code in (
        ({"rate": "-1"}, "domain"), ({"withdrawal": "1001"}, "domain"),
        ({"tax_rate": "1.01"}, "domain"), ({"contribution": "1,23"}, "invalid_input"),
        ({"extra": "0"}, "invalid_input"), ({"periods": 253}, "limit"),
        ({"rate_basis": "daily_di", "index_rate": "0.01"}, "invalid_input"),
        ({"overrides": [{"period": 1}, {"period": 1}]}, "invalid_input"),
        ({"product": "treasury_fixed", "rate_basis": "daily_di"}, "unsupported"),
        ({"start_date": "2025-02-29", "period_kind": "day"}, "invalid_input"),
    ):
        oracle.reject("investment", "project", {**base, **fields}, code)


def business_cases(oracle):
    def check(operation, category, fields, expected, **keyword):
        return oracle.check("business", operation, category, fields, expected, **keyword)

    for cost, markup in ((D(100), D("0.25")), (D("99.95"), D("0.275")), (D(140), D("-0.2"))):
        price = cost * (1 + markup)
        margin = (price - cost) / price
        check("price", "pricing", {"unit_cost": str(cost), "markup": str(markup)}, {
            "price": shown(price), "markup": shown(markup, 12), "margin": shown(margin, 12),
        })
        check("price", "pricing", {"unit_cost": str(cost), "selling_price": str(price), "sales_cost_rate": "0.08"}, {
            "price": shown(price), "contribution": shown(price * D("0.92") - cost),
            "contribution_margin": shown(margin - D("0.08"), 12),
        })
    check("price", "pricing", {"unit_cost": "100", "margin": "0.2"}, {"price": "125.00", "markup": "0.250000000000"})
    check("price", "undefined_base", {"unit_cost": "0", "selling_price": "10"}, {
        "price": "10.00", "markup": None, "markup_undefined": True, "margin": "1.000000000000",
    })
    for rounding, price, expected_margin in (
        ("half_even", "100", "0.000000000000"), ("half_up", "101", shown(Fraction(1, 101), 12)),
    ):
        check("price", "quote_rounding", {
            "unit_cost": "100", "selling_price": "100.5", "quote_to_minor": True,
        }, {"price": price, "margin": expected_margin}, options={"currency": "JPY", "rounding": rounding})
    check("price", "quote_rounding", {"unit_cost": "100", "selling_price": "100.5"}, {
        "price": "100", "price_exact": "201/2", "margin": shown(Fraction(1, 201), 12),
    }, options={"currency": "JPY"})

    waterfall = {
        "revenue": "200", "cogs": "100", "variable_cogs": "80", "variable_expenses": "20",
        "fixed_expenses": "10", "depreciation": "5", "net_finance_cost": "3", "income_tax": "7",
    }
    check("margins", "accrual_margins", waterfall, {
        "gross_profit": "100.00", "contribution": "100.00", "ebit": "65.00", "ebitda": "70.00", "net_profit": "55.00",
        "gross_margin": shown(Fraction(100, 200), 12), "operating_margin": shown(Fraction(65, 200), 12),
        "net_margin": shown(Fraction(55, 200), 12),
    })
    check("margins", "undefined_base", {**waterfall, "revenue": "0", "net_finance_cost": "-5"}, {
        "net_profit": "-137.00", "gross_margin": None, "operating_margin": None, "margin_undefined": True,
    })

    for fixed in (300, 301, 0):
        cash_fixed = fixed - min(50, fixed) + 10
        accounting = Fraction(fixed, 25)
        financial = Fraction(cash_fixed, 25)
        check("break_even", "break_even", {
            "unit_price": "125", "variable_unit_cost": "100", "fixed_accounting": str(fixed),
            "non_cash_fixed": str(min(50, fixed)), "fixed_cash_extra": "10",
        }, {
            "accounting": {"units": shown(accounting, 12), "whole_units": str(-(-fixed // 25)), "sales": shown(accounting * 125)},
            "financial": {"units": shown(financial, 12), "whole_units": str(-(-cash_fixed // 25)), "sales": shown(financial * 125)},
        })
    check("break_even", "break_even", {"unit_price": "10", "variable_unit_cost": "10", "fixed_accounting": "25"}, {
        "accounting": {"status": "unreachable_positive_fixed_cost", "units": None},
        "financial": {"status": "unreachable_positive_fixed_cost", "units": None},
    })

    indicators = {
        "net_profit": "20", "initial_assets": "100", "final_assets": "120", "initial_equity": "50",
        "final_equity": "60", "nopat": "25", "average_invested_capital": "90", "current_assets": "48",
        "current_liabilities": "20", "inventory": "10", "prepaid": "3", "total_liabilities": "60",
        "total_assets": "120", "investment_cost": "100", "investment_proceeds": "125",
    }
    check("ratios", "indicators", indicators, {
        "roe": shown(Fraction(20, 55), 12), "roa": shown(Fraction(20, 110), 12), "roi": shown(Fraction(25, 100), 12),
        "roic": shown(Fraction(25, 90), 12), "quick_ratio": shown(Fraction(35, 20), 12),
        "current_ratio": shown(Fraction(48, 20), 12), "liabilities_to_assets": "0.500000000000",
        "working_capital": "28.00", "undefined": {},
    })
    check("ratios", "undefined_base", {
        **indicators, "initial_equity": "-10", "current_liabilities": "0", "average_invested_capital": "-1",
    }, {
        "roe": None, "roic": None, "current_ratio": None, "quick_ratio": None, "working_capital": "48.00",
        "undefined": {"roe": "nonpositive_endpoint_equity", "roic": "nonpositive_denominator",
                      "current_ratio": "nonpositive_denominator", "quick_ratio": "nonpositive_denominator"},
    })
    check("ratios", "indicators", {**indicators, "net_profit": "-10", "current_assets": "40", "current_liabilities": "60"}, {
        "roa": shown(Fraction(-10, 110), 12), "roe": shown(Fraction(-10, 55), 12), "working_capital": "-20.00",
    })

    check("ebitda", "cvm_156", {"net_income": "12", "income_tax": "4", "net_finance_cost": "3", "depreciation": "2", "revenue": "100"}, {
        "ebit": "19.00", "ebitda": "21.00", "ebitda_margin": "0.210000000000", "convention": "cvm_156_article_3_unadjusted",
    })
    check("ebitda", "cvm_156", {"net_income": "-12", "income_tax": "-4", "net_finance_cost": "-3", "depreciation": "2", "revenue": "0"}, {
        "ebit": "-19.00", "ebitda": "-17.00", "ebit_margin": None,
    })

    cycle = {
        "days": 365, "average_inventory": "20", "cogs": "100", "average_receivables": "30",
        "credit_sales": "150", "average_payables": "20", "credit_purchases": "110",
    }
    check("cycle", "cash_cycle", cycle, {
        "inventory_days": shown(Fraction(365 * 20, 100), 12),
        "receivables_days": shown(Fraction(365 * 30, 150), 12),
        "payables_days": shown(Fraction(365 * 20, 110), 12),
        "operating_cycle_days": shown(146, 12), "financial_cycle_days": shown(146 - Fraction(365 * 20, 110), 12),
    })
    check("cycle", "cash_cycle", {**cycle, "credit_purchases": "40"}, {"financial_cycle_days": "-36.500000000000"})
    check("cycle", "undefined_base", {**cycle, "cogs": "0"}, {
        "inventory_days": None, "operating_cycle_days": None, "financial_cycle_days": None,
        "undefined_due_to_zero_volume": ["inventory_days", "operating_cycle_days", "financial_cycle_days"],
    })

    plan = {
        "periods": 3, "revenue": "100", "revenue_growth": "0.10", "cost": "40", "expenses": "20",
        "initial_cash": "25", "cash_receipts": "90", "cash_payments": "65", "discount_rate": "0.01",
        "initial_investment": "10", "sensitivity_step": "0.05",
        "overrides": [{"period": 1, "realized_revenue": "95", "realized_cost": "39", "realized_expenses": "22"},
                      {"period": 2, "revenue": "108"}],
    }
    npv = -10 + sum(Fraction(25) / Fraction(101, 100)**i for i in (1, 2, 3))
    check("plan", "budget_cash_and_sensitivity", {**plan, "page_size": 1}, {
        "revenue": "329.00", "profit": "149.00", "cash_close": "90.00", "minimum_cash": "15.00",
        "net_present_value": shown(npv), "npv_sign": "positive", "next_page": 2,
        "rows": [{"realized": {"revenue": "95.00", "cost": "39.00", "expenses": "22.00"},
                  "realized_minus_projection": {"revenue": "-5.00", "cost": "-1.00", "expenses": "2.00"}}],
        "sensitivity": {
            "lower_revenue_growth_profit": shown(100 + 108 + 100 * D("1.05")**2 - 180),
            "higher_revenue_growth_profit": shown(100 + 108 + 100 * D("1.15")**2 - 180),
        },
    })
    check("plan", "budget_cash_and_sensitivity", {**plan, "page_start": 2, "cash_receipts": "0"}, {
        "cash_close": "-180.00", "minimum_cash": "-180.00", "npv_sign": "negative", "next_page": None,
        "rows": [{"period": 2, "revenue": "108.00"}, {"period": 3, "revenue": "121.00"}],
    })
    check("plan", "budget_cash_and_sensitivity", {
        **plan, "cash_receipts": "65", "initial_investment": "0", "discount_rate": "0",
    }, {"net_present_value": "0.00", "npv_sign": "zero"})
    last = check("plan", "bounded_page", {
        **plan, "revenue_growth": "10", "cost_growth": "10", "expense_growth": "10", "receipt_growth": "10",
        "payment_growth": "10", "sensitivity_step": None, "periods": 120, "page_start": 81, "page_size": 40,
    }, {"npv_sign": "positive"})
    count = len(last["rows"])
    assert 0 < count < 40 and last["next_page"] == 81 + count, last["next_page"]
    assert [row["period"] for row in last["rows"]] == list(range(81, 81 + count))

    for operation, fields, code in (
        ("price", {"unit_cost": "100", "markup": "0.25", "margin": "0.20"}, "invalid_input"),
        ("price", {"unit_cost": "100", "margin": "1"}, "domain"),
        ("price", {"unit_cost": "100", "markup": "-1"}, "domain"),
        ("margins", {**waterfall, "variable_cogs": "101"}, "domain"),
        ("break_even", {"unit_price": "100", "variable_unit_cost": "5", "fixed_accounting": "10", "non_cash_fixed": "11"}, "domain"),
        ("ratios", {}, "invalid_input"),
        ("ratios", {"current_assets": "1", "inventory": "2", "prepaid": "0"}, "domain"),
        ("plan", {**plan, "page_size": 41}, "limit"),
        ("plan", {**plan, "overrides": [{"period": 1}, {"period": 1}]}, "invalid_input"),
    ):
        oracle.reject("business", operation, fields, code)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", type=Path)
    args = parser.parse_args()
    oracle = Oracle(args.executable.resolve(strict=True))
    investment_cases(oracle)
    business_cases(oracle)
    print(json.dumps({
        "ok": True, "total": sum(counts.total() for counts in oracle.counts.values()),
        "checks": {key: {"count": counts.total(), "categories": counts} for key, counts in oracle.counts.items()},
    }, sort_keys=True))


if __name__ == "__main__":
    main()
