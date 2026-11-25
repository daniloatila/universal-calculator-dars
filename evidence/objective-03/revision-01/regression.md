# Objective 03 revision 01 · Regression

[Relatório em português](REPORT.pt-BR.md) · [Historical map](../regression.md) · [Test ledger](tests.json) · [Reproduction](reproduction.md)

The **602** checks belong to the accepted 0.2.2 baseline. The 0.3.1 revision also carries forward all **2,355** independent advanced checks and **305** complete CLI/WASM comparisons recorded for 0.3.0. Instrumented runs, alternate browser runs and CI repeats corroborate the same checks and remain outside these historical counts. [0.2.2 ledger](../../objective-02/revision-02/tests.json) · [0.3.0 ledger](../tests.json)

| Historical suite | Mapped checks | Revision path |
| --- | ---: | --- |
| `rust_core` | 16 | Original Standard core suites carried in the current Rust test set |
| `cli_independent_oracle` | 157 | Independent rational and decimal reference on the release CLI |
| `wasm_structured_independent_oracle` | 291 | Independent structured-value reference on Standard WASM |
| `cli_wasm_parity` | 20 | Standard result and error contract comparisons |
| `typescript_node` | 57 | Editor, worker, module manager, adaptive profiles and scheduler |
| `physical_windows_chrome` | 27 | Standard, operations, shell state and scheduler recovery on installed Chrome |
| `browser_explicit_offline` | 10 | Assets prepared for offline use, lazy locale loading and offline execution |
| `native_windows_webview2_ui` | 17 | Passed on local Windows 11 with the verified hosted 0.3.1 executable, including the real WebView2 runtime and the same interface checks. [Local result](windows-ui.json) |
| `native_windows_provider_credentials` | 2 | Passed in the exact hosted Windows job, including bounds and Windows Credential Manager round trip with a synthetic entry |
| `native_windows_sensor_rust` | 5 | Passed in the exact hosted Windows job for load, power and local Windows capability signals |
| **Total** | **602** | **602 passed across the mapped local and hosted runs.** |

Existing localization tests that type a new expression after a language change explicitly clear the field where required. The original assertions still require correct calculation in the supported formats. The added cases leave the entry untouched during a change and compare canonical input and mathematical result. [Scientific](../../../apps/web/tests/scientific.spec.ts) · [Algebra](../../../apps/web/tests/algebra.spec.ts) · [Calculus](../../../apps/web/tests/calculus.spec.ts) · [Directional matrix](locale-transition-matrix.json)

The transition checks cover pending work, inactive and suspended drafts, history, worker recovery, existing records and canonical replay. The measurements and coverage track the change at the UI boundary and the Rust calculation scope. [Record contract](../calculation-proof/contract.md) · [Scheduler](../../../apps/web/tests/module-work.test.mts) · [Historical report](../REPORT.md)
