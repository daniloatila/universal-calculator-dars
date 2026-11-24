use dars_core::{combine_values_json, evaluate_json, evaluate_value_json};
use num_bigint::BigInt;
use serde_json::{Value, json};

fn calculate(expression: &str, bindings: Value) -> Value {
    serde_json::from_str(&evaluate_value_json(expression, &bindings.to_string())).unwrap()
}

fn stored(expression: &str) -> Value {
    let result = calculate(expression, json!({}));
    assert_eq!(result["ok"], true, "{expression}: {result}");
    result
}

fn wire(result: &Value) -> &str {
    result["value"].as_str().unwrap()
}

fn combine(left: Option<&Value>, right: &Value, subtract: bool) -> Value {
    serde_json::from_str(&combine_values_json(
        left.map_or("", wire),
        wire(right),
        subtract,
    ))
    .unwrap()
}

fn failure(code: &str) -> Value {
    json!({"ok": false, "code": code})
}

#[test]
fn stores_percent_values_without_reinterpreting_their_context() {
    let base = stored("100");
    let percent = stored("sqrt(2)%");
    assert_eq!(percent["exact"], Value::Null);
    assert_eq!(percent["approximate"], "0.0141421356237309504880169");

    let added = combine(Some(&base), &percent, false);
    assert_eq!(added["exact"], Value::Null);
    assert_eq!(added["approximate"], "100.014142135623730950488");
    assert_eq!(calculate("100+(@1)", json!({"1": wire(&percent)})), added);
    assert_eq!(calculate("@1", json!({"1": wire(&added)})), added);
    assert_eq!(
        combine(Some(&base), &percent, true)["approximate"],
        "99.985857864376269049512"
    );

    // Only an explicit percentage operator at the new call site is relative.
    let ten = stored("10");
    assert_eq!(
        calculate("200+@1%", json!({"1": wire(&ten)}))["exact"],
        "220"
    );
    assert_eq!(
        calculate("@1+10%", json!({"1": wire(&base)}))["exact"],
        "110"
    );
    assert_eq!(stored("200+10%")["exact"], "220");
    assert_eq!(
        stored("100+(sqrt(2)%)")["approximate"],
        "101.414213562373095048802"
    );
}

#[test]
fn round_trips_internal_intervals_beyond_the_display_digits() {
    let base = stored("100");
    let increment = stored("sqrt(2)%");
    let mut sum = base.clone();
    for _ in 0..20 {
        sum = combine(Some(&sum), &increment, false);
    }
    assert_eq!(sum["approximate"], "100.28284271247461900976");
    let remainder = combine(Some(&sum), &base, true);
    assert_eq!(remainder["approximate"], "0.282842712474619009760338");
    assert_eq!(remainder["exact"], Value::Null);
    assert_eq!(calculate("@7", json!({"7": wire(&remainder)})), remainder);
    assert_eq!(combine(None, &increment, false), increment);
    assert_eq!(
        combine(None, &increment, true)["approximate"],
        "-0.0141421356237309504880169"
    );

    // Enclosures alone do not establish equality of independently stored values.
    assert_eq!(
        combine(Some(&increment), &increment, true),
        failure("precision_limit")
    );
    assert_eq!(
        calculate("@7-@7", json!({"7": wire(&increment)}))["exact"],
        "0"
    );
    let large = stored("10^40");
    let large_sum = combine(Some(&large), &increment, false);
    assert_eq!(
        combine(Some(&large_sum), &large, true),
        failure("precision_limit")
    );
}

#[test]
fn retains_exact_fractions_negative_values_and_large_operands() {
    let third = stored("1/3");
    let negative = stored("-5/6");
    let sum = combine(Some(&third), &negative, false);
    assert_eq!(sum["exact"], "-1/2");
    assert_eq!(combine(None, &negative, true)["exact"], "5/6");
    assert_eq!(calculate("2 * @7", json!({"7": wire(&sum)}))["exact"], "-1");
    assert_eq!(
        calculate("2^@7", json!({"7": wire(&stored("-3"))}))["exact"],
        "1/8"
    );
    assert_eq!(
        calculate("root(81,@7)", json!({"7": wire(&stored("4"))}))["exact"],
        "3"
    );
    let large = stored("2^8191/(2^8191-1)");
    assert!(large["exact"].as_str().unwrap().len() > 4096);
    assert_eq!(
        calculate("@4294967295", json!({"4294967295": wire(&large)})),
        large
    );
    assert_eq!(combine(Some(&large), &large, true)["exact"], "0");
}

#[test]
fn rejects_missing_malformed_duplicate_and_oversized_input() {
    assert_eq!(calculate("@1", json!({})), failure("missing_binding"));
    for invalid_reference in ["@", "@0", "@01", "@4294967296", "@-1", "@١"] {
        assert_eq!(
            calculate(invalid_reference, json!({})),
            failure("invalid_reference")
        );
    }
    for invalid_map in [
        "null",
        "[]",
        r#"{"0":"q:1/1"}"#,
        r#"{"01":"q:1/1"}"#,
        r#"{"1":"q:1/1","1":"q:2/1"}"#,
        r#"{"1":{"kind":"q"}}"#,
        r#"{"4294967296":"q:1/1"}"#,
    ] {
        assert_eq!(
            serde_json::from_str::<Value>(&evaluate_value_json("@1", invalid_map)).unwrap(),
            failure("invalid_bindings"),
            "{invalid_map}"
        );
    }
    for malformed_value in [
        "",
        "q:01/1",
        "q:-0/1",
        "q:1/-1",
        "q:1/0",
        "q:2/4",
        "q:+1/1",
        "q:1/1/1",
        "i:2/1:1/1",
        "i:2/1:2/1",
        "i:1/1:2/1:3/1",
        "q:@1/1",
    ] {
        assert_eq!(
            calculate("@1", json!({"1": malformed_value})),
            failure("invalid_value")
        );
        assert_eq!(
            serde_json::from_str::<Value>(&combine_values_json("", malformed_value, false))
                .unwrap(),
            failure("invalid_value")
        );
    }
    assert_eq!(
        calculate("@1", json!({"1":"i:0/1:1/1"})),
        failure("precision_limit")
    );
    let beyond_magnitude = BigInt::from(1) << 8192usize;
    assert_eq!(
        calculate("@1", json!({"1": format!("q:{beyond_magnitude}/1")})),
        failure("invalid_value")
    );
    let many = json!(
        (1..=257)
            .map(|id| (id.to_string(), "q:1/1"))
            .collect::<std::collections::BTreeMap<_, _>>()
    );
    assert_eq!(calculate("@1", many), failure("invalid_bindings"));
    assert_eq!(
        calculate("@1", json!({"1": "8".repeat(10001)})),
        failure("input_limit")
    );
    assert_eq!(
        serde_json::from_str::<Value>(&evaluate_value_json("@1", &" ".repeat(3_000_000))).unwrap(),
        failure("input_limit")
    );
}

#[test]
fn recalled_intervals_keep_domain_checks_in_roots_and_powers() {
    let interval = stored("sqrt(2)");
    let negative = combine(None, &interval, true);
    assert_eq!(
        calculate("2^@1", json!({"1": wire(&interval)})),
        failure("unsupported_exponent")
    );
    assert_eq!(
        calculate("sqrt(@1)", json!({"1": wire(&negative)})),
        failure("domain_error")
    );
    assert_eq!(
        calculate("cbrt(@1)", json!({"1": wire(&negative)}))["approximate"],
        "-1.12246204830937298143353"
    );
}

#[test]
fn legacy_json_schema_and_reference_syntax_stay_unchanged() {
    assert_eq!(
        evaluate_json("0.1+0.2"),
        r#"{"ok":true,"exact":"3/10","approximate":"0.3"}"#
    );
    assert_eq!(
        evaluate_json("sqrt(2)"),
        r#"{"ok":true,"exact":null,"approximate":"1.41421356237309504880169"}"#
    );
    assert_eq!(
        evaluate_json("@1"),
        r#"{"ok":false,"code":"invalid_character"}"#
    );
    assert_eq!(
        evaluate_json("1/0"),
        r#"{"ok":false,"code":"division_by_zero"}"#
    );
}
