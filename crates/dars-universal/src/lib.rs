//! Bounded mathematical tool requests and deterministic execution records.

use serde::{Deserialize, Deserializer, Serialize, de};
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

#[cfg(feature = "algebra")]
mod algebra;
#[cfg(feature = "scientific")]
mod scientific;

const SCHEMA: u8 = 1;
const REQUEST_BYTES: usize = 24 * 1024;
const EXPRESSION_BYTES: usize = 4096;
const NORMALIZED_BYTES: usize = 8192;
const RESULT_BYTES: usize = 32 * 1024;
const OPTION_COUNT: usize = 16;
const PROOF_MAP_COUNT: usize = 16;
const PROOF_VALUE_BYTES: usize = 256;
const PROOF_CONSTRAINT_COUNT: usize = 32;
const PROOF_CONSTRAINT_BYTES: usize = 2048;
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MathError {
    InvalidInput,
    Domain,
    Limit,
    Unsupported,
    NoConvergence,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Exactness {
    Exact,
    Symbolic,
    Approximate,
}

pub struct Computation {
    pub result: String,
    pub exactness: Exactness,
    pub normalized: String,
    pub method: &'static str,
    pub domain: &'static str,
    pub formula: Option<&'static str>,
    pub precision: Option<u32>,
    pub error_bound: Option<String>,
    pub constraints: Vec<String>,
    pub variables: BTreeMap<String, String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    schema: u8,
    module: String,
    operation: String,
    input: String,
    original_input: Option<String>,
    #[serde(default, deserialize_with = "unique_options")]
    options: Map<String, Value>,
}

fn unique_options<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Map<String, Value>, D::Error> {
    struct Options;
    impl<'de> de::Visitor<'de> for Options {
        type Value = Map<String, Value>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("a map of unique tool options")
        }

        fn visit_map<A: de::MapAccess<'de>>(self, mut input: A) -> Result<Self::Value, A::Error> {
            let mut options = Map::new();
            while let Some((key, value)) = input.next_entry()? {
                if options.len() == OPTION_COUNT || options.insert(key, value).is_some() {
                    return Err(de::Error::custom("too many or duplicate options"));
                }
            }
            Ok(options)
        }
    }
    deserializer.deserialize_map(Options)
}

#[derive(Serialize)]
struct Proof<'a> {
    schema: u8,
    module: &'a str,
    operation: &'a str,
    expression: &'a str,
    normalized: &'a str,
    variables: BTreeMap<String, String>,
    units: BTreeMap<String, String>,
    options: &'a Map<String, Value>,
    domain: &'a str,
    method: &'a str,
    formula: Option<&'a str>,
    result: &'a str,
    exactness: Exactness,
    precision: Option<u32>,
    tolerance: Option<&'a str>,
    rounding: Option<&'a str>,
    error_bound: Option<&'a str>,
    assumptions: &'a [&'a str],
    constraints: &'a [String],
    engine_version: &'a str,
    algorithm_version: &'a str,
    references: &'a [&'a str],
}

fn identifier(text: &str, limit: usize) -> bool {
    text.len() <= limit
        && text.as_bytes().first().is_some_and(u8::is_ascii_lowercase)
        && text
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_')
}

fn valid_text(text: &str, limit: usize) -> bool {
    text.len() <= limit
        && text.chars().all(|c| {
            (!c.is_control() || matches!(c, '\t' | '\r' | '\n'))
                && !matches!(c, '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
}

fn valid_options(options: &Map<String, Value>) -> bool {
    options.len() <= OPTION_COUNT
        && options.iter().all(|(key, value)| {
            identifier(key, 32)
                && !matches!(key.as_str(), "constructor" | "prototype")
                && match value {
                    Value::Bool(_) => true,
                    Value::Number(number) => number
                        .as_i64()
                        .is_some_and(|n| (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&n)),
                    Value::String(text) => valid_text(text, 256),
                    _ => false,
                }
        })
}

fn dispatch(
    request: &Request,
) -> Result<(Computation, &'static str, &'static [&'static str]), MathError> {
    match request.module.as_str() {
        #[cfg(feature = "algebra")]
        "algebra" => Ok((
            algebra::evaluate(
                &request.operation,
                &request.input,
                &Value::Object(request.options.clone()),
            )?,
            "algebra/1",
            &["https://dlmf.nist.gov/1.11"],
        )),
        #[cfg(feature = "scientific")]
        "scientific" => Ok((
            scientific::evaluate(
                &request.operation,
                &request.input,
                &Value::Object(request.options.clone()),
            )?,
            "scientific/1",
            &[
                "https://dlmf.nist.gov/4",
                "https://docs.rs/astro-float-num/0.3.6/astro_float_num/",
            ],
        )),
        _ => Err(MathError::Unsupported),
    }
}

fn execute(input: &str) -> Result<Value, MathError> {
    if input.len() > REQUEST_BYTES {
        return Err(MathError::Limit);
    }
    let request: Request = serde_json::from_str(input).map_err(|_| MathError::InvalidInput)?;
    if request.schema != SCHEMA
        || !identifier(&request.operation, 64)
        || !identifier(&request.module, 32)
    {
        return Err(MathError::InvalidInput);
    }
    let original = request.original_input.as_deref().unwrap_or(&request.input);
    if request.input.len() > EXPRESSION_BYTES || original.len() > EXPRESSION_BYTES {
        return Err(MathError::Limit);
    }
    if !valid_text(&request.input, EXPRESSION_BYTES)
        || !valid_text(original, EXPRESSION_BYTES)
        || !valid_options(&request.options)
    {
        return Err(MathError::InvalidInput);
    }
    let (result, algorithm, references) = dispatch(&request)?;
    if result.normalized.len() > NORMALIZED_BYTES
        || result.result.len() > RESULT_BYTES
        || result.variables.len() > PROOF_MAP_COUNT
        || result.variables.iter().any(|(name, value)| {
            name.is_empty()
                || !valid_text(name, 32)
                || matches!(name.as_str(), "__proto__" | "constructor" | "prototype")
                || !valid_text(value, PROOF_VALUE_BYTES)
        })
        || result.constraints.len() > PROOF_CONSTRAINT_COUNT
        || result
            .constraints
            .iter()
            .any(|entry| !valid_text(entry, PROOF_CONSTRAINT_BYTES))
    {
        return Err(MathError::Limit);
    }
    let assumptions = if result.exactness == Exactness::Approximate && result.error_bound.is_none()
    {
        &["Working precision is not a certified error bound."][..]
    } else {
        &[]
    };
    let mut units = BTreeMap::new();
    let mut rounding = None;
    if request.module == "scientific" {
        let angle = request
            .options
            .get("angle")
            .and_then(Value::as_str)
            .unwrap_or("rad");
        units.insert("angle".to_owned(), angle.to_owned());
        if result.exactness == Exactness::Approximate {
            rounding = Some("nearest, ties to even");
        }
    }
    Ok(json!({ "ok": true, "proof": Proof {
        schema: SCHEMA,
        module: &request.module,
        operation: &request.operation,
        expression: original,
        normalized: &result.normalized,
        variables: result.variables,
        units,
        options: &request.options,
        domain: result.domain,
        method: result.method,
        formula: result.formula,
        result: &result.result,
        exactness: result.exactness,
        precision: result.precision,
        tolerance: None,
        rounding,
        error_bound: result.error_bound.as_deref(),
        assumptions,
        constraints: &result.constraints,
        engine_version: env!("CARGO_PKG_VERSION"),
        algorithm_version: algorithm,
        references,
    } }))
}

/// Evaluate a schema-one request locally. Both native and WASM consumers use this envelope.
pub fn evaluate_tool_json(input: &str) -> String {
    execute(input)
        .unwrap_or_else(|code| json!({ "ok": false, "code": code }))
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_malformed_oversized_and_incompatible_requests() {
        assert_eq!(execute("null"), Err(MathError::InvalidInput));
        assert_eq!(
            execute(&" ".repeat(REQUEST_BYTES + 1)),
            Err(MathError::Limit)
        );
        let base = json!({"schema":1,"module":"unimplemented","operation":"evaluate","input":"1"});
        assert_eq!(execute(&base.to_string()), Err(MathError::Unsupported));
        assert_eq!(
            execute(
                r#"{"schema":1,"module":"scientific","operation":"evaluate","input":"1","options":{"precision":8,"precision":80}}"#
            ),
            Err(MathError::InvalidInput)
        );
        for (key, value) in [
            ("schema", json!(2)),
            ("operation", json!("eval(1)")),
            ("unknown", json!(true)),
            ("input", json!("2\u{202e}+1")),
            ("options", json!({"precision":{"nested": true}})),
            ("options", json!({"precision":9007199254740992_i64})),
        ] {
            let mut request = base.clone();
            request[key] = value;
            assert_eq!(execute(&request.to_string()), Err(MathError::InvalidInput));
        }
    }
}
