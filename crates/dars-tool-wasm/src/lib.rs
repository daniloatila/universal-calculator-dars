use wasm_bindgen::prelude::*;

const MODULES: &[&str] = &[
    #[cfg(feature = "scientific")]
    "scientific",
    #[cfg(feature = "algebra")]
    "algebra",
    #[cfg(feature = "calculus")]
    "calculus",
    #[cfg(feature = "linear_algebra")]
    "linear_algebra",
    #[cfg(feature = "geometry")]
    "geometry",
    #[cfg(feature = "discrete-mathematics")]
    "discrete-mathematics",
    #[cfg(feature = "programmer")]
    "programmer",
    #[cfg(feature = "converter")]
    "converter",
    #[cfg(feature = "date-time")]
    "date-time",
    #[cfg(feature = "financial")]
    "financial",
    #[cfg(feature = "investment")]
    "investment",
    #[cfg(feature = "loans")]
    "loans",
    #[cfg(feature = "tax")]
    "tax",
    #[cfg(feature = "business")]
    "business",
    #[cfg(feature = "statistics")]
    "statistics",
    #[cfg(feature = "probability")]
    "probability",
    #[cfg(feature = "simulation")]
    "simulation",
    #[cfg(feature = "optimization")]
    "optimization",
    #[cfg(feature = "physics-engineering")]
    "physics-engineering",
    #[cfg(feature = "graph-lab")]
    "graph-lab",
    #[cfg(feature = "data-lab")]
    "data-lab",
];

/// Use a separate build for each feature so inactive modules have no initial WASM cost.
#[wasm_bindgen]
pub fn evaluate_tool_json(request: &str) -> String {
    dars_universal::evaluate_worker_json(request, MODULES)
}

#[cfg(feature = "simulation")]
#[wasm_bindgen]
pub struct SimulationTask(Option<dars_universal::SimulationTask>);

#[cfg(feature = "simulation")]
#[wasm_bindgen]
impl SimulationTask {
    #[wasm_bindgen(constructor)]
    pub fn new(request: &str) -> Result<SimulationTask, JsValue> {
        dars_universal::SimulationTask::new(request)
            .map(|task| Self(Some(task)))
            .map_err(science_error)
    }
    pub fn step(&mut self, max_batch: usize) -> Result<String, JsValue> {
        self.0
            .as_mut()
            .ok_or_else(|| JsValue::from_str("invalid_input"))?
            .step(max_batch)
            .map_err(science_error)
    }
    pub fn finish(&mut self) -> Result<String, JsValue> {
        self.0
            .take()
            .ok_or_else(|| JsValue::from_str("invalid_input"))?
            .finish()
            .map_err(science_error)
    }
}

#[cfg(any(feature = "simulation", feature = "data-lab"))]
fn science_error(code: dars_universal::MathError) -> JsValue {
    JsValue::from_str(code.as_str())
}

#[cfg(feature = "data-lab")]
#[wasm_bindgen]
pub struct LocalDataset(dars_universal::data_lab::Dataset);

#[cfg(feature = "data-lab")]
#[wasm_bindgen]
impl LocalDataset {
    #[wasm_bindgen(constructor)]
    pub fn open(bytes: &[u8], settings: &str) -> Result<LocalDataset, JsValue> {
        dars_universal::data_lab::Dataset::open(bytes, settings)
            .map(Self)
            .map_err(science_error)
    }
    pub fn replay(bytes: &[u8], descriptor: &str) -> Result<LocalDataset, JsValue> {
        dars_universal::data_lab::Dataset::replay(bytes, descriptor)
            .map(Self)
            .map_err(science_error)
    }
    pub fn resource_diagnostics(&self) -> String {
        self.0.resource_diagnostics()
    }

    pub fn reserve_browser_response(&self, bytes: usize) -> Result<(), JsValue> {
        self.0
            .reserve_browser_response(bytes)
            .map_err(science_error)
    }
    pub fn page(&self, offset: usize, length: usize) -> Result<String, JsValue> {
        self.0.page(offset, length).map_err(science_error)
    }
    pub fn proof(&self) -> Result<String, JsValue> {
        self.0.proof().map_err(science_error)
    }
    pub fn export_csv(&self, protected: bool) -> Result<Vec<u8>, JsValue> {
        self.0.export_csv(protected).map_err(science_error)
    }
}
