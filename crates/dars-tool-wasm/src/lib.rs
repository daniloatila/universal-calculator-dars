use wasm_bindgen::prelude::*;

/// Use a separate build for each feature so inactive modules have no initial WASM cost.
#[wasm_bindgen]
pub fn evaluate_tool_json(request: &str) -> String {
    dars_universal::evaluate_tool_json(request)
}
