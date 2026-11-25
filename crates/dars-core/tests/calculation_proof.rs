use dars_core::{evaluate_value_json, evaluate_value_record_json};
use num_bigint::BigInt;
use serde_json::{Value, json};

fn record(expression: &str, bindings: &Value) -> Value {
    serde_json::from_str(&evaluate_value_record_json(
        expression,
        &bindings.to_string(),
    ))
    .unwrap()
}

fn legacy_result(mut response: Value) -> Value {
    response.as_object_mut().unwrap().remove("proof");
    response
}

#[test]
fn exact_proof_keeps_parser_input_and_replays_canonical_expression() {
    let input = "  (−6 ÷ 4) × 2 + √ (9) + .5  ";
    let response = record(input, &json!({}));
    let proof = &response["proof"];
    assert_eq!(proof["schema"], 1);
    assert_eq!(proof["module"], "standard");
    assert_eq!(proof["operation"], "evaluate");
    assert_eq!(proof["expression"], input);
    assert_eq!(proof["normalized"], "(-6/4)*2+√(9)+.5");
    assert_eq!(proof["domain"], "real");
    assert_eq!(proof["method"], "standard_rational_expression");
    assert_eq!(proof["result"], "1/2");
    assert_eq!(proof["exactness"], "exact");
    assert!(proof["precision"].is_null());
    assert!(proof["rounding"].is_null());
    assert!(proof["error_bound"].is_null());
    assert!(proof.get("standard_bindings").is_none());
    let replay = record(proof["normalized"].as_str().unwrap(), &json!({}));
    assert_eq!(legacy_result(replay), legacy_result(response));
}

#[test]
fn approximate_proof_reports_a_certified_absolute_display_error() {
    let response = record("sqrt(2)", &json!({}));
    let proof = &response["proof"];
    assert_eq!(proof["method"], "standard_certified_interval");
    assert_eq!(proof["exactness"], "approximate");
    assert_eq!(proof["precision"], 24);
    assert_eq!(proof["rounding"], "nearest_ties_even");
    assert_eq!(proof["error_bound"], "5e-24");
    assert_eq!(proof["result"], "1.41421356237309504880169");

    // Verify the bound against the exact radicand using integers in units of
    // 10^-24. Squaring gives an independent enclosure of the positive root.
    let digits = proof["result"].as_str().unwrap().replace('.', "");
    let center = BigInt::parse_bytes(digits.as_bytes(), 10).unwrap() * 10u8;
    let radicand = BigInt::from(10u8).pow(48) * 2u8;
    assert!((&center - 5u8).pow(2) < radicand);
    assert!((center + 5u8).pow(2) > radicand);

    let scaled = record("-sqrt(2)*10^100", &json!({}));
    assert_eq!(scaled["proof"]["error_bound"], "5e76");
    assert!(scaled["proof"]["result"].as_str().unwrap().starts_with('-'));
}

#[test]
fn proof_replays_only_the_used_opaque_values_without_rounding_them() {
    let root = record("sqrt(2)", &json!({}));
    let input = "(@7 − @7) + @4294967295";
    let bindings = json!({"7":"q:2/3", "4294967295": root["value"], "8":"unused"});
    let response = record(input, &bindings);
    let proof = &response["proof"];
    let used = &proof["standard_bindings"];
    assert_eq!(used, &json!({"7":"q:2/3", "4294967295": root["value"]}));
    assert_eq!(response["value"], root["value"]);
    let replay = record(proof["normalized"].as_str().unwrap(), used);
    assert_eq!(replay["proof"]["standard_bindings"], *used);
    assert_eq!(legacy_result(replay), legacy_result(response.clone()));
    assert_eq!(
        legacy_result(response),
        serde_json::from_str::<Value>(&evaluate_value_json(input, &bindings.to_string())).unwrap()
    );
}

#[test]
fn oversized_replay_context_keeps_the_result_and_reports_why_context_is_absent() {
    let opaque = format!("q:1{}1/1{}", "0".repeat(2398), "0".repeat(2399));
    let bindings: Value = (1..=21)
        .map(|id| (id.to_string(), Value::String(opaque.clone())))
        .collect::<serde_json::Map<_, _>>()
        .into();
    let zero_sum = |count| {
        (1..=count)
            .map(|id| format!("(@{id}-@{id})"))
            .collect::<Vec<_>>()
            .join("+")
    };
    let retained = record(&zero_sum(20), &bindings);
    let retained_proof = &retained["proof"];
    assert_eq!(
        retained_proof["standard_bindings"]
            .as_object()
            .unwrap()
            .len(),
        20
    );
    assert!(retained_proof.to_string().len() < 128 * 1024);
    let oversized = record(&zero_sum(21), &bindings);
    assert_eq!(oversized["exact"], "0");
    assert!(oversized["proof"].get("standard_bindings").is_none());
    assert_eq!(
        oversized["proof"]["constraints"],
        json!(["Replay bindings exceed the portable record size limit"])
    );
}

#[test]
fn legacy_errors_and_control_whitespace_behavior_stay_intact() {
    for (input, bindings) in [
        ("@1", "{}"),
        ("@1", r#"{"1":"q:2/2"}"#),
        ("@1", r#"{"1":"q:1/2","1":"q:1/3"}"#),
        ("1/0", "{}"),
        ("sqrt(-1)", "{}"),
        ("1 2", "{}"),
    ] {
        assert_eq!(
            evaluate_value_record_json(input, bindings),
            evaluate_value_json(input, bindings),
        );
    }
    let original = "\u{b}1+\u{85}2\u{c}";
    let response = record(original, &json!({}));
    assert_eq!(response["exact"], "3");
    assert_eq!(response["proof"]["expression"], " 1+ 2 ");
    assert_eq!(response["proof"]["normalized"], "1+2");
    assert_eq!(
        response["proof"]["constraints"],
        json!(["Nonportable control whitespace replaced in the recorded expression"])
    );
}
