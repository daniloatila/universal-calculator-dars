use super::*;

fn scenario(operation: &str, input: Value, currency: &str) -> Value {
    json!({ "operation": operation, "input": input.to_string(), "options": { "currency": currency } })
}

fn request(module: &str, input: &Value) -> Value {
    json!({ "schema": 1, "module": module, "operation": "scenario_compare", "input": input.to_string() })
}

fn run(module: &str, reference: Value, alternative: Value, metric: Option<&str>) -> (Value, Value) {
    let mut input = json!({"reference": reference, "alternative": alternative});
    if let Some(metric) = metric {
        input["metric"] = json!(metric);
    }
    let result: Value = serde_json::from_str(&crate::evaluate_tool_json(
        &request(module, &input).to_string(),
    ))
    .unwrap();
    assert_eq!(result["ok"], true, "{result}");
    let proof = result["proof"].clone();
    (
        serde_json::from_str(proof["result"].as_str().unwrap()).unwrap(),
        proof,
    )
}

#[cfg(feature = "loans")]
#[test]
fn approximate_loan_cost_comparisons_respect_solver_resolution() {
    let cost = |rate: &str, fee: &str| {
        scenario(
            "effective_cost",
            json!({
                "principal":"1000000", "periods":1, "start_date":"2026-01-01",
                "method":"single_payment", "rate":rate, "upfront_fee":fee
            }),
            "BRL",
        )
    };
    let a = cost("0.010000000000", "0");
    let b = cost("0.010000000001", "0");
    let (result, proof) = run("loans", a.clone(), b, Some("effective_cost"));
    let details = &result["selected"];
    assert_eq!(details["status"], "direct");
    assert_eq!(details["precision_source"], "canonical_approximate");
    assert_eq!(details["precision_warning"], "solver_resolution");
    assert_eq!(details["reference"]["solver_tolerance"], "0.000000000001");
    assert_eq!(details["alternative"]["solver_tolerance"], "0.000000000001");
    assert_eq!(
        details["precision_used"]["combined_solver_tolerance"],
        "0.000000000002"
    );
    assert_eq!(details["precision_used"]["difference_decimal_places"], 11);
    // For a single payment after 31 days, an independent high-precision
    // evaluation of (1+r)^(365/31)-1 places the difference near 1.31066e-11.
    assert_eq!(details["absolute_difference"], "0.00000000001");
    assert!(proof["error_bound"].is_null());

    let (result, _) = run(
        "loans",
        a,
        cost("0.010000000000", "0.000000000001"),
        Some("effective_cost"),
    );
    let details = &result["selected"];
    assert_eq!(details["precision_warning"], "within_solver_resolution");
    assert_eq!(details["relative_reason"], "within_solver_resolution");
    assert!(details["absolute_difference"].is_null());
    assert!(details["percentage_points"].is_null());
    assert!(details["relative_percent"].is_null());

    let (result, _) = run(
        "loans",
        cost("0", "0.000000000001"),
        cost("0.01", "0"),
        Some("effective_cost"),
    );
    let details = &result["selected"];
    assert_eq!(details["precision_warning"], "solver_resolution");
    assert_eq!(details["relative_reason"], "reference_solver_resolution");
    assert!(details["absolute_difference"].is_string());
    assert!(details["relative_percent"].is_null());

    let (result, _) = run(
        "loans",
        cost("0", "0"),
        cost("0.01", "0"),
        Some("effective_cost"),
    );
    let details = &result["selected"];
    assert!(details["reference"]["solver_tolerance"].is_null());
    assert_eq!(details["relative_reason"], "zero_reference");
}

#[cfg(feature = "financial")]
#[test]
fn reproduces_equivalent_and_nominal_rates_from_their_exact_origins() {
    let equivalent = |rate: &str, from: u16, to: u16| {
        scenario(
            "equivalent_rate",
            json!({"rate":rate,"from_periods_per_year":from,"to_periods_per_year":to}),
            "BRL",
        )
    };
    let a = equivalent("0.10", 2, 2);
    let b = equivalent("0.10", 2, 1);
    let (summary, _) = run("financial", a.clone(), b.clone(), None);
    assert_eq!(summary["items"][0]["status"], "normalized");
    assert!(summary["selected"].is_null());
    let (result, proof) = run("financial", a, b, Some("rate"));
    let detail = &result["selected"];
    assert_eq!(detail["status"], "normalized");
    assert_eq!(detail["reference"]["value"], "1/10");
    assert_eq!(detail["alternative"]["value"], "21/100");
    assert_eq!(detail["normalization"]["reference"]["value"], "21/100");
    assert_eq!(detail["normalization"]["alternative"]["value"], "21/100");
    assert_eq!(detail["common_basis"]["periods_per_year"], 1);
    assert_eq!(detail["exact_difference"], "0");
    assert_eq!(detail["absolute_difference"], "0.0000000000000000");
    assert_eq!(detail["percentage_points"], "0.00000000000000");
    assert_eq!(detail["relative_percent"], "0.0000000000");
    assert_eq!(proof["algorithm_version"], "finance-comparison/2");

    // Replaying the canonical recipe cannot rely on any trusted display numbers.
    let canonical = parse(proof["normalized"].as_str().unwrap()).unwrap();
    let replay: Value = parse(&crate::evaluate_tool_json(
        &request("financial", &canonical).to_string(),
    ))
    .unwrap();
    assert_eq!(replay["proof"]["result"], proof["result"]);

    let nominal = |rate: &str, compounds: u16, direction| {
        scenario(
            "nominal_effective",
            json!({"rate":rate,"compounds":compounds,"direction":direction}),
            "BRL",
        )
    };
    let (mixed, _) = run(
        "financial",
        nominal("0.21", 12, "effective_to_nominal"),
        nominal("0.20", 2, "nominal_to_effective"),
        Some("rate"),
    );
    assert_eq!(mixed["selected"]["status"], "normalized");
    assert_eq!(mixed["selected"]["exact_difference"], "0");
    assert_eq!(
        mixed["selected"]["normalization"]["reference"]["original_basis"]["compounds_per_year"],
        12
    );
    assert_eq!(
        mixed["selected"]["normalization"]["reference"]["original_basis"]["periods_per_year"],
        1
    );

    let (compound, _) = run(
        "financial",
        nominal("0.21", 12, "effective_to_nominal"),
        nominal("0.21", 2, "effective_to_nominal"),
        Some("rate"),
    );
    assert_eq!(compound["selected"]["status"], "normalized");
    assert_eq!(compound["selected"]["exact_difference"], "0");

    let (direct, _) = run(
        "financial",
        equivalent("0.10", 1, 1),
        equivalent("0.12", 1, 1),
        Some("rate"),
    );
    assert_eq!(direct["selected"]["status"], "direct");
    assert_eq!(direct["selected"]["exact_difference"], "1/50");
    assert_eq!(direct["selected"]["percentage_points"], "2.00000000000000");
    assert_eq!(direct["selected"]["relative_percent"], "20.0000000000");
}

#[cfg(feature = "financial")]
#[test]
fn missing_frequencies_and_dated_conventions_do_not_invent_equivalence() {
    let unknown = scenario(
        "rate",
        json!({"present":"100","future":"110","periods":1}),
        "BRL",
    );
    let rate = scenario(
        "equivalent_rate",
        json!({"rate":"0.10","from_periods_per_year":1,"to_periods_per_year":1}),
        "BRL",
    );
    let (result, _) = run("financial", unknown, rate, Some("rate"));
    assert_eq!(result["selected"]["reason"], "context_missing");
    assert!(result["selected"]["absolute_difference"].is_null());

    let periodic = scenario(
        "mirr",
        json!({"flows":["-100","110"],"finance_rate":"0","reinvest_rate":"0"}),
        "BRL",
    );
    let dated_inputs = |day_count| json!({"flows":["-100","110"],"dates":["2026-01-01","2027-01-01"],"day_count":day_count,"finance_rate":"0","reinvest_rate":"0"});
    let dated = scenario("mirr", dated_inputs("act_365f"), "BRL");
    let (result, _) = run("financial", periodic, dated.clone(), Some("mirr"));
    assert_eq!(result["selected"]["reason"], "context_missing");
    assert!(result["selected"]["normalization"].is_null());
    let (result, _) = run(
        "financial",
        dated,
        scenario("mirr", dated_inputs("act_360"), "BRL"),
        Some("mirr"),
    );
    assert_eq!(result["selected"]["reason"], "context_mismatch");
    assert!(
        result["selected"]["differences"]
            .as_array()
            .unwrap()
            .contains(&json!("day_count"))
    );
    assert!(result["selected"]["relative_percent"].is_null());
}

#[cfg(feature = "financial")]
#[test]
fn bounded_normalization_refuses_large_annual_growth_without_rounded_fallback() {
    let rate = |target| {
        scenario(
            "equivalent_rate",
            json!({"rate":"0.123456789012","from_periods_per_year":600,"to_periods_per_year":target}),
            "BRL",
        )
    };
    let (response, _) = run("financial", rate(600), rate(300), Some("rate"));
    let selected = &response["selected"];
    assert_eq!(selected["status"], "contextual");
    assert_eq!(selected["reason"], "normalization_unavailable");
    assert!(selected["normalization"].is_null());
    assert!(selected["absolute_difference"].is_null());
}

#[cfg(feature = "financial")]
#[test]
fn compares_canonical_money_below_minor_unit_and_treats_zero_and_negative_references() {
    let future = |amount: &str, rate: &str, currency| {
        scenario(
            "future_value",
            json!({"amount":amount,"rate":rate,"periods":1}),
            currency,
        )
    };
    let (close, _) = run(
        "financial",
        future("1.001", "0.01", "BRL"),
        future("1.001", "0.0101", "BRL"),
        Some("amount"),
    );
    let selected = &close["selected"];
    assert_eq!(
        selected["reference"]["presentation"],
        selected["alternative"]["presentation"]
    );
    assert_eq!(selected["exact_difference"], "1001/10000000");
    assert_eq!(selected["absolute_difference"], "0.0001001000000000");
    assert_eq!(selected["precision_source"], "canonical_exact");
    assert!(selected["percentage_points"].is_null());

    let (zero, _) = run(
        "financial",
        future("0", "0", "BRL"),
        future("20", "0", "BRL"),
        Some("amount"),
    );
    assert_eq!(zero["selected"]["absolute_difference"], "20.00");
    assert!(zero["selected"]["relative_percent"].is_null());
    assert_eq!(zero["selected"]["relative_reason"], "zero_reference");
    let (negative, _) = run(
        "financial",
        future("-50", "0", "BRL"),
        future("-25", "0", "BRL"),
        Some("amount"),
    );
    assert_eq!(
        negative["selected"]["relative_difference"],
        "0.500000000000"
    );
    assert_eq!(negative["selected"]["relative_percent"], "50.0000000000");

    let (currency, _) = run(
        "financial",
        future("20", "0", "BRL"),
        future("30", "0", "USD"),
        Some("amount"),
    );
    assert_eq!(currency["selected"]["reason"], "currency_mismatch");
    assert_eq!(currency["selected"]["status"], "incompatible");
    assert!(currency["selected"]["absolute_difference"].is_null());
}

#[cfg(feature = "financial")]
#[test]
fn bounded_replay_rejects_forged_scalar_nested_or_invalid_recipes() {
    let valid = scenario(
        "future_value",
        json!({"amount":"100","rate":"0","periods":1}),
        "BRL",
    );
    let scalar = json!({"reference":"0.10","alternative":"0.21","unit":"ratio"});
    let mut recursive = valid.clone();
    recursive["operation"] = json!("scenario_compare");
    let mut untrusted = valid.clone();
    untrusted["result"] = json!({"amount":"100000"});
    let mut unknown_currency = valid.clone();
    unknown_currency["options"]["currency"] = json!("XAU");
    let mut unsafe_payload = valid.clone();
    unsafe_payload["input"] = json!(" ".repeat(EXPRESSION_BYTES + 1));
    for (input, expected) in [
        (scalar, "invalid_input"),
        (
            json!({"reference":recursive,"alternative":valid}),
            "invalid_input",
        ),
        (
            json!({"reference":untrusted,"alternative":valid}),
            "invalid_input",
        ),
        (
            json!({"reference":unknown_currency,"alternative":valid}),
            "unsupported",
        ),
        (
            json!({"reference":unsafe_payload,"alternative":valid}),
            "limit",
        ),
        (
            json!({"reference":valid,"alternative":valid,"metric":"does_not_exist"}),
            "invalid_input",
        ),
    ] {
        let response: Value = parse(&crate::evaluate_tool_json(
            &request("financial", &input).to_string(),
        ))
        .unwrap();
        assert_eq!(response, json!({"ok": false, "code": expected}));
    }

    let mut larger = valid;
    larger["input"] = json!(format!(
        "{}{}",
        " ".repeat(2200),
        larger["input"].as_str().unwrap()
    ));
    let (response, proof) = run("financial", larger.clone(), larger, Some("amount"));
    assert_eq!(response["selected"]["exact_difference"], "0");
    assert!(proof["expression"].as_str().unwrap().len() > EXPRESSION_BYTES);
    assert!(proof["normalized"].as_str().unwrap().len() < EXPRESSION_BYTES);
}

#[cfg(feature = "loans")]
#[test]
fn loans_with_different_terms_expose_only_legitimate_partial_comparisons() {
    let a = scenario(
        "price",
        json!({"principal":"1000","rate":"0.01","periods":4,"start_date":"2027-01-31"}),
        "BRL",
    );
    let b = scenario(
        "sac",
        json!({"principal":"1100","rate":"0.01","periods":12,"start_date":"2027-01-31"}),
        "BRL",
    );
    let (result, _) = run("loans", a, b, Some("total_cost"));
    let items = result["items"].as_array().unwrap();
    assert_eq!(
        items.iter().find(|item| item["id"] == "principal").unwrap()["status"],
        "direct"
    );
    assert_eq!(result["selected"]["status"], "contextual");
    assert!(result["selected"]["absolute_difference"].is_null());
    assert!(
        result["selected"]["differences"]
            .as_array()
            .unwrap()
            .contains(&json!("principal_financed"))
    );
}

#[cfg(feature = "investment")]
#[test]
fn accumulation_of_different_horizons_does_not_become_a_rate_comparison() {
    let project = |periods, kind| {
        scenario(
            "project",
            json!({"initial":"1000","periods":periods,"rate":"0.01","period_kind":kind,"start_date":"2026-01-01"}),
            "BRL",
        )
    };
    let (short, _) = run(
        "investment",
        project(12, "month"),
        project(24, "month"),
        Some("simple_net_return"),
    );
    assert_eq!(short["selected"]["status"], "contextual");
    assert!(
        short["selected"]["differences"]
            .as_array()
            .unwrap()
            .contains(&json!("horizon"))
    );
    assert!(short["selected"]["normalization"].is_null());
    let (mixed, _) = run(
        "investment",
        project(24, "month"),
        project(2, "year"),
        Some("final_balance"),
    );
    assert_eq!(mixed["selected"]["status"], "contextual");
    assert!(
        mixed["selected"]["differences"]
            .as_array()
            .unwrap()
            .contains(&json!("periodicity"))
    );
    assert!(mixed["selected"]["reference"]["presentation"].is_string());
    assert!(mixed["selected"]["alternative"]["presentation"].is_string());
    assert!(mixed["selected"]["absolute_difference"].is_null());
}

#[cfg(feature = "tax")]
#[test]
fn tax_uses_tax_period_and_statutory_value_basis() {
    let request = |date, gross| {
        let mut result = scenario("br_inss", json!({"date":date,"gross":gross}), "BRL");
        result["options"]["rounding"] = json!("half_up");
        result
    };
    let original = request("2026-01-02", "2000");
    let (direct, _) = run(
        "tax",
        original.clone(),
        request("2026-01-30", "2500"),
        Some("inss"),
    );
    assert_eq!(direct["selected"]["status"], "direct");
    assert_eq!(
        direct["selected"]["precision_source"],
        "statutory_quantized"
    );
    let (other_month, _) = run("tax", original, request("2026-02-01", "2500"), Some("inss"));
    assert_eq!(other_month["selected"]["status"], "contextual");
    assert!(
        other_month["selected"]["differences"]
            .as_array()
            .unwrap()
            .contains(&json!("tax_period"))
    );
}

#[cfg(feature = "business")]
#[test]
fn business_undefined_markup_does_not_become_a_zero_delta() {
    let quote = |cost| {
        scenario(
            "price",
            json!({"unit_cost":cost,"selling_price":"100"}),
            "BRL",
        )
    };
    let (result, _) = run("business", quote("0"), quote("30"), Some("markup"));
    assert_eq!(result["selected"]["status"], "undefined");
    assert_eq!(result["selected"]["reason"], "undefined_value");
    assert!(result["selected"]["reference"]["value"].is_null());
    assert!(result["selected"]["absolute_difference"].is_null());
}
