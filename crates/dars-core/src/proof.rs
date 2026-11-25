use std::{borrow::Cow, collections::BTreeMap};

use serde::Serialize;

use crate::{
    ValueDisplay,
    arithmetic::{DISPLAY_DIGITS, Value},
    json,
    stored_value::Bindings,
};

// Reserve room within the 128 KiB interchange limit for the original and
// normalized expressions, the rational result and the remaining proof fields.
const MAX_REPLAY_BINDINGS_BYTES: usize = 96 * 1024;

#[derive(Serialize)]
struct Proof<'a> {
    schema: u8,
    module: &'static str,
    operation: &'static str,
    expression: Cow<'a, str>,
    normalized: String,
    variables: BTreeMap<&'static str, &'static str>,
    units: BTreeMap<&'static str, &'static str>,
    options: BTreeMap<&'static str, &'static str>,
    domain: &'static str,
    method: &'static str,
    formula: Option<&'static str>,
    result: &'a str,
    exactness: &'static str,
    precision: Option<i32>,
    tolerance: Option<&'static str>,
    rounding: Option<&'static str>,
    error_bound: Option<String>,
    assumptions: &'static [&'static str],
    constraints: Vec<&'static str>,
    references: &'static [&'static str],
    engine_version: &'static str,
    algorithm_version: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    standard_bindings: Option<BTreeMap<u32, &'a str>>,
}

#[derive(Serialize)]
struct RecordedValue<'a> {
    #[serde(flatten)]
    value: &'a ValueDisplay,
    proof: Proof<'a>,
}

pub(crate) fn record(
    input: &str,
    bindings: &Bindings<'_>,
    value: &Value,
    display: ValueDisplay,
) -> String {
    let mut constraints = Vec::new();
    let standard_bindings = match replay_bindings(bindings) {
        Some(values) if values.is_empty() => None,
        Some(values) => Some(values),
        None => {
            constraints.push("Replay bindings exceed the portable record size limit");
            None
        }
    };
    let expression = if input.chars().any(nonportable_whitespace) {
        constraints.push("Nonportable control whitespace replaced in the recorded expression");
        Cow::Owned(
            input
                .chars()
                .map(|character| {
                    if nonportable_whitespace(character) {
                        ' '
                    } else {
                        character
                    }
                })
                .collect(),
        )
    } else {
        Cow::Borrowed(input)
    };
    let (result, exactness, method) = match &display.exact {
        Some(exact) => (exact.as_str(), "exact", "standard_rational_expression"),
        None => (
            display.approximate.as_str(),
            "approximate",
            "standard_certified_interval",
        ),
    };
    let approximate = display.exact.is_none();
    json(&RecordedValue {
        value: &display,
        proof: Proof {
            schema: 1,
            module: "standard",
            operation: "evaluate",
            expression,
            normalized: normalize(input),
            variables: BTreeMap::new(),
            units: BTreeMap::new(),
            options: BTreeMap::new(),
            domain: "real",
            method,
            formula: None,
            result,
            exactness,
            precision: approximate.then_some(DISPLAY_DIGITS),
            tolerance: None,
            rounding: approximate.then_some("nearest_ties_even"),
            error_bound: value.certified_display_error_bound(),
            assumptions: &[],
            constraints,
            references: &[
                "https://docs.rs/num-rational/0.4.2/num_rational/type.BigRational.html",
                "https://dlmf.nist.gov/3.1",
            ],
            engine_version: env!("CARGO_PKG_VERSION"),
            algorithm_version: "standard/1",
            standard_bindings,
        },
    })
}

fn replay_bindings<'a>(bindings: &Bindings<'a>) -> Option<BTreeMap<u32, &'a str>> {
    let mut values = BTreeMap::new();
    let mut bytes = 2;
    for (id, encoded) in bindings.used_values() {
        // Decimal ID and canonical value are safe ASCII with no JSON escapes.
        let separators = if values.is_empty() { 5 } else { 6 };
        bytes += id.ilog10() as usize + 1 + encoded.len() + separators;
        if bytes > MAX_REPLAY_BINDINGS_BYTES {
            return None;
        }
        values.insert(id, encoded);
    }
    Some(values)
}

fn normalize(input: &str) -> String {
    // Successful input has no adjacent tokens that need a separating space.
    // Preserve the parser's grouping, reference IDs and number spellings.
    input
        .chars()
        .filter(|character| !character.is_whitespace())
        .map(|character| match character {
            '−' => '-',
            '×' => '*',
            '÷' => '/',
            _ => character,
        })
        .collect()
}

fn nonportable_whitespace(character: char) -> bool {
    matches!(character, '\u{b}' | '\u{c}' | '\u{85}')
}
