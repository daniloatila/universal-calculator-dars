# Scientific dependency inventory

[Português brasileiro](dependencies.pt-BR.md)

| Component | Decision and boundary |
| --- | --- |
| nalgebra 0.35.0, Apache-2.0 | Retained existing native/WASM linear algebra support for regression. Conditioning and rank are checked before interpreting a fit. |
| num-bigint, num-rational and num-traits, MIT/Apache-2.0 | Retained lockfile versions for exact statistics, data aggregation and linear programming. Bounded input and intermediate sizes constrain allocation. |
| astro-float-num, MIT | Retained for existing precision-controlled workspaces. Scientific modules declare binary64 working precision or exact rational arithmetic explicitly. |
| statrs 0.18.0, MIT | Default features disabled. Selected distribution functions support general inferential models. Independent comparisons and native/WASM tests cover the declared numerical domains. No BLAS runtime or sampling feature is required. |
| libm 0.2.16, MIT | Pinned portable mathematical primitives for reproducible distribution sampling. |
| rand, rand_chacha, rand_distr | Considered for sampling. The scientific worker uses a fixed, versioned PCG32 sequence with an explicit seed and a fixed accumulation order, avoiding target entropy and runtime changes in sampling conventions. |
| uom | Considered for dimensional quantities. Reusing the existing Converter preserves its public unit choices and exact SI conversions. |
| csv 1.4.0, Unlicense/MIT | Streaming delimited record parser for UTF-8 input after explicit decoding. Supports quoted fields and escaped delimiters in desktop and WASM builds. |
| calamine | Evaluated as an XLSX reader. Its public cell types include a floating-point numeric variant. Reading raw SpreadsheetML lexemes meets the DARS precision contract for imported monetary values and long integers. [Cell representations](https://docs.rs/calamine/latest/calamine/enum.Data.html) |
| zip 9.8.2, MIT, and quick-xml 0.42.0, MIT | Only stored/deflate spreadsheet parts and UTF-8 XML are needed. The reader validates member bounds, worksheet relationships, row/cell dimensions and XML depth. No extraction to disk or external entity resolution. |
| sha2 0.10.9, MIT/Apache-2.0 | SHA-256 binds a selected input to its manifest. |
| Three.js, uPlot and WebGL2 | Evaluated as rendering options. The validated graph sizes fit on-demand Canvas rendering. The resulting 2D and projected 3D views use existing browser APIs and ship no new JavaScript dependency. |

Rust dependencies are pinned by Cargo.lock. The existing lockfile also fixes transitive dependencies. Cargo audit checks the RustSec database and npm audit checks the frontend lockfile. Actual WASM sizes and timings belong to the measurement ledgers. Python, NumPy, SciPy, SymPy and mpmath run only in verification. [Cargo manifest](../../crates/dars-universal/Cargo.toml) · [Verification workflow](../../.github/workflows/ci.yml)
