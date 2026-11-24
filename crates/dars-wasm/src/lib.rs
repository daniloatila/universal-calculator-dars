use wasm_bindgen::prelude::*;

/// Evaluate a Standard expression with the same result schema as the native CLI.
#[wasm_bindgen]
pub fn evaluate_json(expression: &str) -> String {
    dars_core::evaluate_json(expression)
}
