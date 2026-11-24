use wasm_bindgen::prelude::*;

/// Evaluate a Standard expression with the same result schema as the native CLI.
#[wasm_bindgen]
pub fn evaluate_json(expression: &str) -> String {
    dars_core::evaluate_json(expression)
}

/// Evaluate an expression with opaque values keyed by numeric binding ID.
#[wasm_bindgen]
pub fn evaluate_value_json(expression: &str, bindings_json: &str) -> String {
    dars_core::evaluate_value_json(expression, bindings_json)
}

/// Add or subtract two opaque values, using zero when the left value is absent.
#[wasm_bindgen]
pub fn combine_values_json(left: &str, right: &str, subtract: bool) -> String {
    dars_core::combine_values_json(left, right, subtract)
}
