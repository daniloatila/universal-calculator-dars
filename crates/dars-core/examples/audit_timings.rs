use dars_core::{Evaluation, evaluate, evaluate_value_json};
use serde_json::{Value, json};
use std::{hint::black_box, time::Instant};

const EXPRESSIONS: &[(&str, &str)] = &[
    ("0.1+0.2", "0.3"),
    ("200+10%", "220"),
    ("sqrt(2)", "1.41421356237309504880169"),
    ("(110+7)*3-2", "349"),
    ("1/3", "0.333333333333333333333333"),
];

fn summarize(mut times: Vec<u128>) -> Value {
    times.sort_unstable();
    let q = |percent: usize| times[(times.len() * percent).div_ceil(100) - 1];
    json!({"count": times.len(), "p50": q(50), "p95": q(95), "p99": q(99)})
}

fn main() {
    let prepared: Vec<_> = EXPRESSIONS
        .iter()
        .map(|(input, expected)| {
            let result = evaluate(input);
            let Evaluation::Value { approximate, .. } = &result else {
                panic!("Unexpected evaluation error")
            };
            assert_eq!(approximate, expected);
            result
        })
        .collect();

    let mut core = Vec::new();
    let mut serialization = Vec::new();
    let mut structured = Vec::new();

    for index in 0..3600 {
        let sample = index % EXPRESSIONS.len();
        let input = EXPRESSIONS[sample].0;
        let start = Instant::now();
        black_box(evaluate(black_box(input)));
        let core_ns = start.elapsed().as_nanos();
        let start = Instant::now();
        black_box(serde_json::to_vec(black_box(&prepared[sample])).unwrap());
        let serial_ns = start.elapsed().as_nanos();
        let start = Instant::now();
        black_box(evaluate_value_json(black_box(input), "{}"));
        let structured_ns = start.elapsed().as_nanos();
        if index >= 600 {
            core.push(core_ns);
            serialization.push(serial_ns);
            structured.push(structured_ns);
        }
    }

    println!(
        "{}",
        json!({
            "unit": "nanoseconds",
            "warmup": 600,
            "typed_core_parse_evaluate_display": summarize(core),
            "encode_precomputed_legacy_response": summarize(serialization),
            "structured_evaluation_with_wire_representation": summarize(structured),
        })
    );
}
