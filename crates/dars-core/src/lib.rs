//! Exact rational arithmetic and certified real approximations.
//!
//! Expressions contain decimal literals, parentheses, unary signs, arithmetic
//! operators, postfix percentages, and the real root functions. The parser and
//! all arithmetic run without network, files, evaluation hooks, or global state.

#![forbid(unsafe_code)]

mod arithmetic;
mod parser;
mod proof;
mod stored_value;

use arithmetic::{Operator, Value};
use serde::Serialize;
use stored_value::Bindings;

/// An expression failure. The serialized identifiers are stable at the engine boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Error {
    EmptyExpression,
    InvalidCharacter,
    InvalidNumber,
    UnexpectedToken,
    MissingParenthesis,
    DivisionByZero,
    DomainError,
    UnsupportedExponent,
    InputLimit,
    ComplexityLimit,
    MagnitudeLimit,
    PrecisionLimit,
    InvalidReference,
    MissingBinding,
    InvalidBindings,
    InvalidValue,
}

/// The engine's host-independent response. Decimal text always uses a dot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum Evaluation {
    Value {
        ok: bool,
        exact: Option<String>,
        approximate: String,
    },
    Failure {
        ok: bool,
        code: Error,
    },
}

/// Evaluate a bounded Standard expression without any implicit float conversion.
pub fn evaluate(input: &str) -> Evaluation {
    let result = parser::parse(input, false)
        .and_then(|expression| expression.evaluate(&mut Bindings::default())?.display());
    match result {
        Ok((exact, approximate)) => Evaluation::Value {
            ok: true,
            exact,
            approximate,
        },
        Err(code) => Evaluation::Failure { ok: false, code },
    }
}

/// Evaluate using the identical JSON contract on native and WebAssembly hosts.
pub fn evaluate_json(input: &str) -> String {
    json(&evaluate(input))
}

/// Evaluate with a bounded table of absolute values referenced as `@ID`.
/// The binding table is a JSON object with decimal IDs and opaque values
/// returned by this API. The legacy evaluator does not accept references.
pub fn evaluate_value_json(input: &str, bindings_json: &str) -> String {
    let result = parser::parse(input, true)
        .and_then(|expression| expression.evaluate(&mut Bindings::decode(bindings_json)?));
    display_value(result)
}

/// Evaluate once and append a portable Calculation Proof to the structured response.
pub fn evaluate_value_record_json(input: &str, bindings_json: &str) -> String {
    let evaluate = || {
        let expression = parser::parse(input, true)?;
        let mut bindings = Bindings::decode(bindings_json)?;
        let value = expression.evaluate(&mut bindings)?;
        let display = ValueDisplay::new(&value)?;
        Ok(proof::record(input, &bindings, &value, display))
    };
    match evaluate() {
        Ok(record) => record,
        Err(code) => json(&Evaluation::Failure { ok: false, code }),
    }
}

/// Add or subtract stored values independently of expression syntax.
/// An absent left value (empty string) selects the additive identity.
pub fn combine_values_json(left: &str, right: &str, subtract: bool) -> String {
    let combine = || {
        let b = stored_value::decode(right)?;
        if left.is_empty() {
            return Ok(if subtract { b.negate() } else { b });
        }
        let a = stored_value::decode(left)?;
        a.apply(
            if subtract {
                Operator::Subtract
            } else {
                Operator::Add
            },
            &b,
        )
    };
    display_value(combine())
}

#[derive(Serialize)]
struct ValueDisplay {
    ok: bool,
    exact: Option<String>,
    approximate: String,
    value: String,
}

impl ValueDisplay {
    fn new(value: &Value) -> Result<Self, Error> {
        let (exact, approximate) = value.display()?;
        Ok(Self {
            ok: true,
            exact,
            approximate,
            value: stored_value::encode(value),
        })
    }
}

fn display_value(result: Result<Value, Error>) -> String {
    match result.and_then(|value| ValueDisplay::new(&value)) {
        Ok(display) => json(&display),
        Err(code) => json(&Evaluation::Failure { ok: false, code }),
    }
}

fn json<T: Serialize>(value: &T) -> String {
    // All fields use infallible JSON data types and a String destination.
    serde_json::to_string(value).expect("serializing a DARS result")
}
