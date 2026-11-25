# Objective 03 · Regression against approved 0.2.2

[Português brasileiro](regression.pt-BR.md) · [Integrated report](REPORT.md) · [Test ledger](tests.json) · [Reproduction](reproduction.md)

The owner accepted 0.2.2 at 95/100. Its tested source was `d3c5a95d9c059fceb19e6f4f50e7c4dd38be2fad`. The ledger counted 594 carried checks and eight additions, reaching **602 distinct checks**. This map preserves those existing assertions by suite or by an explicitly tracked equivalent. Advanced-tool tests, repetitions under instrumented executables and duplicate runs in CI have separate counts. [Owner approval](../objective-02/approval.json) · [0.2.2 ledger](../objective-02/revision-02/tests.json)

| Baseline suite ID | Checks mapped | Objective 03 path |
| --- | ---: | --- |
| `rust_core` | 16 | Standard mathematical core tests with locked dependencies. [Core suite](../../crates/dars-core/src/lib.rs) |
| `cli_independent_oracle` | 157 | Existing Python rational and decimal references on the optimized CLI. [Oracle](../../tests/oracle.py) |
| `wasm_structured_independent_oracle` | 291 | Existing independent Python structured-value oracle on the generated Standard WASM. [Oracle](../../crates/dars-core/tests/structured-oracle.py) |
| `cli_wasm_parity` | 20 | Existing Standard CLI/WASM target pairs. [Parity runner](../../tests/check-targets.mjs) |
| `typescript_node` | 57 | Existing Standard state, worker, module manager, Adaptive and scheduler Node test entry points. Calculation-record additions are counted in the current run only. [Node test command](../../apps/web/package.json) |
| `physical_windows_chrome` | 27 | Existing Windows Chrome paths for Standard interaction, percentage storage/continuation, operations, fixture-based resource behavior, Adaptive and the real shell worker recovery. [Browser suites](../../apps/web/tests) |
| `browser_explicit_offline` | 10 | Existing standalone production web offline and lazy-locale assertions. [Offline runner](../../tests/verify-web-offline.mjs) |
| `native_windows_webview2_ui` | 17 | Existing Windows production Standard/Operations UI checks passed against the integrated executable, using the `--objective-03` mode of the same runner. [Desktop runner](../../scripts/verify-desktop.mjs) · [Native UI results](windows-ui.json) |
| `native_windows_provider_credentials` | 2 | Existing Windows Credential Manager identifier/size validation and synthetic protected-store round trip/deletion. The identifier/size check is counted once. [Credential tests](../../apps/desktop/src/credentials.rs) |
| `native_windows_sensor_rust` | 5 | Existing Windows native payload/sensor unit assertions. The live capability run corroborates native behavior separately. [Native sensor source](../../apps/desktop/src/capabilities.rs) · [Live runner](../../scripts/verify-native-capabilities.mjs) |
| **Total** | **602** | **All 602 baseline checks passed on the integrated candidate.** [Test ledger](tests.json) |

## Recovery and Standard invariants

The old scheduler failure allowed a hung callback to occupy the active slot after its deadline and abort. The 0.2.2 tests required a valid successor for all five profiles. The corresponding browser fixture and Node scheduler checks remain in the current suites and cover deadline expiry, cancellation, stale completion, module switching and disposal. In the production Standard supervisor, a worker that stalls, emits a malformed result or fails to start must give way to a fresh worker within the bounded policy. [Historical reproduction and proof](../objective-02/revision-02/recovery.md) · [Scheduler suite](../../apps/web/tests/module-work.test.mts) · [Real browser shell suite](../../apps/web/tests/module-shell.spec.ts) · [Standard supervisor tests](../../apps/web/tests/worker.test.mts)

Standard retains the rational and certified interval types, relative and absolute percentage semantics, memory operations, stored values and continuation. Base CLI and WASM responses retain their structured contract. The calculation-record route is opt-in and is tested separately from the 602 checks. [Standard browser regressions](../../apps/web/tests/standard-revision.spec.ts) · [Calculation record contract](calculation-proof/contract.md)

## Advanced and repeated measurements

Independent mathematical suites cover each advanced module. CLI/WASM parity verifies result and error contracts on both targets and module-isolated bundles. Line coverage combines Rust tests and instrumented reference cases. Per-module outcomes, exactness and tolerance policies, isolated timing, and raw versus runtime-oriented Converter line counts are linked in the integrated report. [Module evidence](REPORT.md#module-validation) · [Test ledger](tests.json)
