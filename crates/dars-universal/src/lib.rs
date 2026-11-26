//! Bounded mathematical tool requests and deterministic execution records.

use serde::{Deserialize, Deserializer, Serialize, de};
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

#[cfg(feature = "algebra")]
mod algebra;
#[cfg(feature = "calculus")]
mod calculus;
#[cfg(feature = "converter")]
mod converter;
#[cfg(feature = "date-time")]
mod date_time;
#[cfg(feature = "discrete-mathematics")]
mod discrete_mathematics;
#[cfg(feature = "finance")]
mod finance;
#[cfg(feature = "geometry")]
mod geometry;
#[cfg(feature = "linear_algebra")]
mod linear_algebra;
#[cfg(feature = "programmer")]
mod programmer;
#[cfg(feature = "scientific")]
mod scientific;

#[cfg(feature = "data-lab")]
pub mod data_lab;
#[cfg(feature = "graph-lab")]
mod graph_lab;
#[cfg(feature = "optimization")]
mod optimization;
#[cfg(feature = "physics-engineering")]
mod physics_engineering;
#[cfg(feature = "probability")]
mod probability;
#[cfg(feature = "simulation")]
mod simulation;
#[cfg(feature = "statistics")]
mod statistics;

#[cfg(any(feature = "statistics", feature = "probability"))]
mod discrete_tail;

const SCHEMA: u8 = 1;
const REQUEST_BYTES: usize = 24 * 1024;
const EXPRESSION_BYTES: usize = 4096;
#[cfg(feature = "finance")]
const COMPARISON_BYTES: usize = 18 * 1024;
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
    Singular,
    AmbiguousLocalTime,
    NonexistentLocalTime,
    Limit,
    Unsupported,
    NoConvergence,
}

impl MathError {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidInput => "invalid_input",
            Self::Domain => "domain",
            Self::Singular => "singular",
            Self::AmbiguousLocalTime => "ambiguous_local_time",
            Self::NonexistentLocalTime => "nonexistent_local_time",
            Self::Limit => "limit",
            Self::Unsupported => "unsupported",
            Self::NoConvergence => "no_convergence",
        }
    }
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
    pub tolerance: Option<String>,
    pub error_bound: Option<String>,
    pub constraints: Vec<String>,
    pub variables: BTreeMap<String, String>,
    pub units: BTreeMap<String, String>,
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

fn valid_proof_map(fields: &BTreeMap<String, String>) -> bool {
    fields.len() <= PROOF_MAP_COUNT
        && fields.iter().all(|(name, value)| {
            !name.is_empty()
                && valid_text(name, 32)
                && !matches!(name.as_str(), "__proto__" | "constructor" | "prototype")
                && valid_text(value, PROOF_VALUE_BYTES)
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
        #[cfg(feature = "calculus")]
        "calculus" => Ok((
            calculus::evaluate(
                &request.operation,
                &request.input,
                &Value::Object(request.options.clone()),
            )?,
            "calculus/1",
            &["https://dlmf.nist.gov/1.4", "https://dlmf.nist.gov/3.5"],
        )),
        #[cfg(feature = "converter")]
        "converter" => {
            let references: &[&str] = if request.operation == "currency" {
                &[
                    "https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html",
                ]
            } else {
                &[
                    "https://www.bipm.org/en/publications/si-brochure",
                    "https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors",
                ]
            };
            Ok((
                converter::evaluate(
                    &request.operation,
                    &request.input,
                    &Value::Object(request.options.clone()),
                )?,
                "converter/1",
                references,
            ))
        }
        #[cfg(feature = "date-time")]
        "date-time" => {
            let references: &[&str] = match request.operation.as_str() {
                "timezone" => &["https://www.iana.org/time-zones/releases/2026f"],
                "duration" => &["https://www.rfc-editor.org/rfc/rfc3339.html"],
                _ => &[
                    "https://www.iso.org/iso-8601-date-and-time-format.html",
                    "https://aa.usno.navy.mil/faq/leap_years",
                ],
            };
            Ok((
                date_time::evaluate(
                    &request.operation,
                    &request.input,
                    &Value::Object(request.options.clone()),
                )?,
                "date-time/1",
                references,
            ))
        }
        #[cfg(feature = "discrete-mathematics")]
        "discrete-mathematics" => Ok((
            discrete_mathematics::evaluate(
                &request.operation,
                &request.input,
                &Value::Object(request.options.clone()),
            )?,
            "discrete-mathematics/1",
            &[
                "https://dlmf.nist.gov/26",
                "https://arxiv.org/abs/1509.00864",
            ],
        )),
        #[cfg(feature = "geometry")]
        "geometry" => Ok((
            geometry::evaluate(
                &request.operation,
                &request.input,
                &Value::Object(request.options.clone()),
            )?,
            "geometry/1",
            &[
                "https://openstax.org/books/prealgebra/pages/c-geometric-formulas",
                "https://people.eecs.berkeley.edu/~jrs/papers/robustr.pdf",
            ],
        )),
        #[cfg(feature = "linear_algebra")]
        "linear_algebra" => Ok((
            linear_algebra::evaluate(
                &request.operation,
                &request.input,
                &Value::Object(request.options.clone()),
            )?,
            "linear_algebra/1",
            &["https://docs.rs/nalgebra/0.35.0/nalgebra/linalg/index.html"],
        )),
        #[cfg(feature = "programmer")]
        "programmer" => Ok((
            programmer::evaluate(
                &request.operation,
                &request.input,
                &Value::Object(request.options.clone()),
            )?,
            "programmer/1",
            &["https://doc.rust-lang.org/reference/expressions/operator-expr.html"],
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
        #[cfg(feature = "finance")]
        module if finance::MODULES.contains(&module) => {
            finance::dispatch(module, &request.operation, &request.input, &request.options)
        }
        #[cfg(feature = "statistics")]
        "statistics" => Ok((
            statistics::evaluate(&request.operation, &request.input, &request.options)?,
            "statistics/1",
            &["https://www.itl.nist.gov/div898/handbook/"],
        )),
        #[cfg(feature = "probability")]
        "probability" => Ok((
            probability::evaluate(&request.operation, &request.input, &request.options)?,
            "probability/1",
            &["https://docs.rs/statrs/0.18.0/statrs/distribution/"],
        )),
        #[cfg(feature = "simulation")]
        "simulation" => Ok((
            simulation::evaluate(&request.operation, &request.input, &request.options)?,
            "simulation/1",
            &["https://www.pcg-random.org/"],
        )),
        #[cfg(feature = "optimization")]
        "optimization" => Ok((
            optimization::evaluate(&request.operation, &request.input, &request.options)?,
            "optimization/1",
            &["https://docs.scipy.org/doc/scipy/reference/optimize.html"],
        )),
        #[cfg(feature = "physics-engineering")]
        "physics-engineering" => Ok((
            physics_engineering::evaluate(&request.operation, &request.input, &request.options)?,
            "physics-engineering/1",
            &[
                "https://www.bipm.org/en/si-brochure-9",
                "https://physics.nist.gov/cuu/pdf/JPCRD2022CODATA.pdf",
            ],
        )),
        #[cfg(feature = "graph-lab")]
        "graph-lab" => Ok((
            graph_lab::evaluate(&request.operation, &request.input, &request.options)?,
            "graph-lab/1",
            &["https://dlmf.nist.gov/3.3"],
        )),
        #[cfg(feature = "data-lab")]
        "data-lab" => Ok((
            data_lab::evaluate(&request.operation, &request.input, &request.options)?,
            "data-lab/1",
            &["https://www.rfc-editor.org/rfc/rfc4180"],
        )),
        _ => Err(MathError::Unsupported),
    }
}

fn parse_request(input: &str) -> Result<(Request, usize), MathError> {
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
    let bounds = (EXPRESSION_BYTES, NORMALIZED_BYTES);
    #[cfg(feature = "finance")]
    let bounds = if request.operation == "scenario_compare"
        && finance::MODULES.contains(&request.module.as_str())
    {
        (COMPARISON_BYTES, COMPARISON_BYTES)
    } else {
        bounds
    };
    let (input_limit, normalized_limit) = bounds;
    if request.input.len() > input_limit || original.len() > input_limit {
        return Err(MathError::Limit);
    }
    if !valid_text(&request.input, input_limit)
        || !valid_text(original, input_limit)
        || !valid_options(&request.options)
    {
        return Err(MathError::InvalidInput);
    }
    Ok((request, normalized_limit))
}

fn execute(input: &str) -> Result<Value, MathError> {
    execute_allowed(input, None)
}

fn execute_allowed(input: &str, allowed: Option<&[&str]>) -> Result<Value, MathError> {
    let (request, normalized_limit) = parse_request(input)?;
    if allowed.is_some_and(|modules| !modules.contains(&request.module.as_str())) {
        return Err(MathError::Unsupported);
    }
    let (result, algorithm, references) = dispatch(&request)?;
    proof_response(&request, normalized_limit, result, algorithm, references)
}

fn proof_response(
    request: &Request,
    normalized_limit: usize,
    result: Computation,
    algorithm: &str,
    references: &[&str],
) -> Result<Value, MathError> {
    let original = request.original_input.as_deref().unwrap_or(&request.input);
    if result.normalized.len() > normalized_limit
        || result.result.len() > RESULT_BYTES
        || !valid_proof_map(&result.variables)
        || !valid_proof_map(&result.units)
        || result.constraints.len() > PROOF_CONSTRAINT_COUNT
        || result
            .constraints
            .iter()
            .any(|entry| !valid_text(entry, PROOF_CONSTRAINT_BYTES))
    {
        return Err(MathError::Limit);
    }
    let assumptions = if result.exactness == Exactness::Approximate
        && result.precision.is_some()
        && result.error_bound.is_none()
    {
        &["Working precision is not a certified error bound."][..]
    } else {
        &[]
    };
    let mut units = result.units;
    let rounds_significant_digits = matches!(request.module.as_str(), "scientific" | "converter");
    let mut rounding = (rounds_significant_digits && result.exactness == Exactness::Approximate)
        .then_some("nearest, ties to even");
    if matches!(result.domain, "financial_decimal" | "brazil_tax_simulation") {
        rounding = match result.variables.get("rounding_policy").map(String::as_str) {
            Some("half_even") => Some("monetary presentation: nearest, ties to even"),
            Some("half_up") => Some("monetary presentation: nearest, ties away from zero"),
            Some("toward_zero") => Some("monetary presentation: toward zero"),
            _ => None,
        };
    }
    if request.module == "scientific" {
        let angle = request
            .options
            .get("angle")
            .and_then(Value::as_str)
            .unwrap_or("rad");
        units.insert("angle".to_owned(), angle.to_owned());
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
        tolerance: result.tolerance.as_deref(),
        rounding,
        error_bound: result.error_bound.as_deref(),
        assumptions,
        constraints: &result.constraints,
        engine_version: env!("CARGO_PKG_VERSION"),
        algorithm_version: algorithm,
        references,
    } }))
}

#[cfg(feature = "simulation")]
pub struct SimulationTask {
    request: Request,
    normalized_limit: usize,
    run: simulation::SimulationRun,
}

#[cfg(feature = "simulation")]
impl SimulationTask {
    pub fn new(input: &str) -> Result<Self, MathError> {
        let (request, normalized_limit) = parse_request(input)?;
        if request.module != "simulation" || request.operation != "monte_carlo" {
            return Err(MathError::Unsupported);
        }
        let run = simulation::SimulationRun::begin(&request.input, &request.options)?;
        Ok(Self {
            request,
            normalized_limit,
            run,
        })
    }

    pub fn step(&mut self, max_batch: usize) -> Result<String, MathError> {
        serde_json::to_string(&self.run.step(max_batch)?).map_err(|_| MathError::InvalidInput)
    }

    pub fn finish(self) -> Result<String, MathError> {
        Ok(proof_response(
            &self.request,
            self.normalized_limit,
            self.run.finish()?,
            "simulation/1",
            &["https://www.pcg-random.org/"],
        )?
        .to_string())
    }
}

/// Restrict a packaged worker to its public module, even when it reuses another engine internally.
pub fn evaluate_worker_json(input: &str, allowed: &[&str]) -> String {
    execute_allowed(input, Some(allowed))
        .unwrap_or_else(|code| json!({"ok":false,"code":code}))
        .to_string()
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
