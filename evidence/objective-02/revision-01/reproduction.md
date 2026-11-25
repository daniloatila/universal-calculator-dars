# Reproduce Objective 02 revision 01

[Revision report](REPORT.md) · [Test ledger](tests.json) · [Measurements](benchmarks.json) · [Compatibility](compatibility.md)

The Windows validation used an interactive x64 session, the repository’s pinned Rust toolchain, Node 24.19.0, installed Chrome and the system WebView2 Runtime. Build in a clean checkout of `1183df897d8042f01fdc3f43947ebcc27cd48c7e`. Follow the platform prerequisites and install the pinned bindings before compiling the targets. Keep the application window open to the harness during native runs. [Build documentation](../../../docs/en/build.md)

```powershell
node scripts/install-wasm-bindgen.mjs
npm ci --prefix apps/web --ignore-scripts
node scripts/build-wasm.mjs
npm run build --prefix apps/web
cargo build --locked --release -p dars-cli -p dars-desktop
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo test --locked -p dars-desktop --lib -- --include-ignored
python -B tests/oracle.py target/release/dars.exe
python -B crates/dars-core/tests/structured-oracle.py
node tests/check-targets.mjs target/release/dars.exe
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
node scripts/verify-desktop.mjs --objective-02-revision
node scripts/verify-native-capabilities.mjs target/release/dars-desktop.exe
```

The ignored credential test uses a synthetic entry under the DARS prefix in the interactive user's Credential Manager. Its result includes deletion and confirmation of absence. Browser verification on Linux can use Playwright Chromium as in CI. The Windows sensor harness uses normal user permissions, temporary WebView2 test profiles, a bounded CPU fixture and a controlled native window transition. Its DevTools session and PowerShell Win32 controller exist in the harness. The shipped application samples with Win32 calls inside the host and its single scoped Tauri command. [Security boundaries](security.md)

With `cargo-llvm-cov` 0.9.2 and the pinned toolchain's `llvm-tools-preview` available, run the core test coverage command. Read `data.totals.lines`, `data.totals.regions` and `data.totals.functions` from the JSON. [Coverage results](tests.json)

```powershell
cargo llvm-cov --locked -p dars-core --json --summary-only --output-path coverage.json
```

## Historical baselines and timing layers

Build the 0.1.1 production web package and Windows host in an isolated checkout of `460c2f05049acaa75da0035444150f5f4eaed801`, with its locked dependencies and toolchain. The reconstructed web package matched all 15 published file hashes. The rebuilt Windows executable used here has a different digest than the historical 0.1.1 executable. The 0.2.0 reference is the preserved Windows executable with the SHA-256 recorded in its original report and the archived binding from the same delivery. When those bytes are unavailable, rebuild 0.2.0 from audited source `a90b6502fa4c723512844e5035e67459268e9e83` using its lockfiles and mark the result as a rebuild. Record the exact artifact hashes for comparisons. [0.1.1 evidence](../../objective-01/revision-01/REPORT.md) · [0.2.0 evidence](../REPORT.md)

```powershell
cargo run --locked --release -p dars-core --example audit_timings
node benchmarks/layers-audit-021.mjs path-to-wasm-0.1.1 path-to-wasm-0.2.0 apps/web/src/wasm
node benchmarks/windows-audit-021.mjs path-to-0.1.1.exe path-to-0.2.0.exe target/release/dars-desktop.exe
node benchmarks/windows-adaptive-cycles.mjs target/release/dars-desktop.exe
node benchmarks/windows-audit-021.mjs path-to-0.1.1.exe path-to-0.2.0.exe target/release/dars-desktop.exe --diagnostic-only
```

Use the full comparison and sustained runs sequentially on the same hardware. Avoid simultaneous build, browser and benchmark loads. Check every expected result, native window state and executable digest. The mirror order and fresh profiles address order effects within one Windows boot. They do not clear machine-wide file caches. The aggregate files retain sample counts, percentiles and measurement scopes. The measured supplemental renderer mode uses harness commit `9158f7727e40b9ec168c6ccd63901e239b9f04fe`. The main comparison used the earlier audited source in the first section. Use `--quick` for a harness smoke check. Raw measurements, process IDs and temporary profiles stay in the ignored artifacts directory. [Matched Windows protocol](../../../benchmarks/windows-audit-021.md) · [Sustained Windows cycle protocol](../../../benchmarks/windows-adaptive-cycles.md)
