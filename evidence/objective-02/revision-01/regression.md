# Objective 02 revision regression record

[Revision report](REPORT.md) · [0.2.1 test ledger](tests.json) · [0.2.0 test ledger](../tests.json) · [Compatibility](compatibility.md)

## Repeat the accepted suites

The 0.2.0 ledger counted 576 passed checks. The table maps each recorded suite to its 0.2.1 repeat. It includes the local Windows UI and operating-system credential verification. The live sensor scenario, performance measurements and CI repetitions have their own evidence. [Revision test ledger](tests.json) · [Verified CI run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45511054525)

| Suite | 0.2.0 | 0.2.1 | Reproduction |
| --- | ---: | ---: | --- |
| Rust mathematical core | 16 | 16 passed | `cargo test --locked --workspace` |
| Independent CLI oracle | 157 | 157 passed | `python -B tests/oracle.py target/release/dars.exe` |
| Independent structured WASM oracle | 291 | 291 passed | `python -B crates/dars-core/tests/structured-oracle.py` |
| CLI/WASM parity | 20 | 20 passed | `node tests/check-targets.mjs target/release/dars.exe` |
| TypeScript unit and integration | 40 | 51 passed | `npm test --prefix apps/web` |
| Production and fixture Chrome | 23 | 25 passed | `npm run test:e2e --prefix apps/web` |
| Production offline and lazy locale | 10 | 10 passed | `node tests/verify-web-offline.mjs` |
| Native Windows WebView2 interface | 17 | 17 passed | `node scripts/verify-desktop.mjs --objective-02-revision` |
| Windows Credential Manager | 2 | 2 passed | `cargo test --locked -p dars-desktop --lib -- --include-ignored` |
| Windows sensor Rust tests | 0 | 5 passed | `cargo test --locked --workspace` |

The repeated suites account for **589 passed checks**, covering all **576 previous equivalents** and 13 new TypeScript and Chrome cases. The five new native Rust cases bring the distinct count to **594**. The isolated credential verification covers the protected store round-trip and confirmed deletion of a synthetic entry. The credential identifier and size check also ran in the workspace command and is counted once. [Revision test ledger](tests.json)

The mathematical core coverage readback reported **613/620 lines (98.87%)**, **711/743 regions (95.69%)** and **57/57 functions (100%)**. The independent oracles cover separate inputs and precision rules. [Mathematical core](../../../crates/dars-core) · [Independent CLI oracle](../../../tests/oracle.py) · [Structured WASM oracle](../../../crates/dars-core/tests/structured-oracle.py)

Run the commands at the repository root after producing the locked CLI, WASM and web builds on `1183df897d8042f01fdc3f43947ebcc27cd48c7e`. Use `target/release/dars` for the CLI on Unix. The local browser suite used the installed Chrome channel on Windows. The four CI jobs passed on the same source. The Ubuntu recipe installs Chromium and uses the same Playwright sources. [Reproduction](reproduction.md) · [Platform workflow](../../../.github/workflows/ci.yml) · [Verified CI run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45511054525)

## What was exercised

| Area | Evidence and behavior |
| --- | --- |
| Standard mathematics | The suites repeat exact decimals and fractions, percentages in absolute and relative positions, stored irrational values, continuation, negative and large operands, roots, structured interval bounds and well-formed error contracts. The sequence `MS 100 → sqrt(2)% → M+ → MR → =` continues to display `100.014142135623730950488`, and `200+10%` displays `220`. [Standard regressions](../../../apps/web/tests/standard-revision.spec.ts) · [Worker tests](../../../apps/web/tests/worker.test.mts) |
| Session and asynchronous work | The original regressions cover history, undo, late outcomes, cancellation, retries and worker recovery. Manager tests cover switching during a stalled import or activation, the shared startup deadline, cleanup of late runtimes after retry, and a global clear that completes even when a selection is queued behind it. [Module manager tests](../../../apps/web/tests/module-manager.test.mts) |
| Production shell contract | The two new Chrome cases run the real `App`, policy adapter and privacy controls with a test-only catalogue. The note module owns text and requires no worker. The chart module owns a point array, a real Worker and an optional resource policy. The cases verify lazy imports, one workspace at a time, policy delivery, suspension and resumption, per-module termination, global clear of active and suspended data, startup timeout, worker closure, stale runtime disposal, and recovery after a workspace render error. [Chrome shell results](module-shell.json) · [Chrome shell tests](../../../apps/web/tests/module-shell.spec.ts) |
| Adaptive policy and scheduling | Node cases verify manual budgets, browser and native signal decoding, unsupported values, critical protection, sustained-CPU decisions and hysteresis. The scheduler cases cover essential and rendering requests under Ultra Light, bounded wait, queue saturation, prioritization, deadline expiry, request cancellation and discarded late results. [Adaptive tests](../../../apps/web/tests/adaptive.test.mts) · [Task tests](../../../apps/web/tests/module-work.test.mts) |
| Real web resource effects | Chrome counts actual worker retirement and restart, samples allocated WASM linear memory and observes real Canvas draws under adaptive policies. Graphics are demand-driven and continue at reduced cadence in Ultra Light. Separate fixture cases verify release of workers, cached buffers and graphics handles when the active scope ends. [Operations tests](../../../apps/web/tests/operations.spec.ts) · [Graphics cadence test](../../../apps/web/tests/module-frames.spec.ts) · [Worker and cache fixture](../../../apps/web/tests/module-manager.spec.ts) |
| Appearance, localization and privacy | Tests cover the navy Dark default, remembered themes and preferences, seven locales, Arabic RTL, localized numerical output, 320 px Operations layout, local session and preference clearing and the service worker's explicit cache-only policy. The controlled browser journeys observe actual network requests. [Operations tests](../../../apps/web/tests/operations.spec.ts) · [Offline harness](../../../tests/verify-web-offline.mjs) |
| Live native adaptation | On the packaged Windows candidate, actual Win32 minimization changed Automatic from Balanced to Ultra Light, suspended Standard, and released its worker. WebView2 read back its Low memory target. Restore read back Normal, returned to Balanced and rechecked the displayed decimal expansion of `1/3`. A bounded CPU fixture produced a mean increase of 2.761 percentage points in reported load. The fixture stayed below critical pressure. [Native sensor harness](../../../scripts/verify-native-capabilities.mjs) · [Compatibility](compatibility.md) |

The shell exercises compile their alternate entry in memory using Vite and route it inside the local test browser. Only the test entry imports the two fixture descriptors. The production entry uses the product registry, which registers Standard. Later modules can register their view, state type and optional policy capabilities through the same interface. Verification covers the reusable contract through these two different implementations. Expansion to the planned 25 modules remains future work. [Product registration](../../../apps/web/src/module-registry.ts) · [Fixture entry](../../../apps/web/tests/fixtures/module-shell/main.tsx)
