//! Exact rational arithmetic and certified real approximations.
//!
//! Expressions contain decimal literals, parentheses, unary signs, arithmetic
//! operators, postfix percentages, and the real root functions. The parser and
//! all arithmetic run without network, files, evaluation hooks, or global state.

#![forbid(unsafe_code)]

mod arithmetic;
mod parser;

use serde::Serialize;

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
    match parser::parse(input).and_then(|expression| expression.evaluate()?.display()) {
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
    // All fields use infallible JSON data types and a String destination.
    serde_json::to_string(&evaluate(input)).expect("serializing a DARS result")
}
