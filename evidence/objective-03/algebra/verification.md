# Algebra · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Mathematical and resource limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Stage plan](../PLAN.md) · [Test ledger](tests.json)

These results cover the Algebra stage of Objective 03, including its interaction with Standard, Scientific, the worker lifecycle and the calculation record.

## Verified locally

| Verification | Observed result |
| --- | --- |
| Independent SymPy oracle on the optimized Windows CLI | 184 passed, 0 failed with SymPy 1.14.0. All nine operations were covered. The total includes 37 structured rejection cases and seven CLI replays whose complete records matched. [Oracle](../../../tests/verify-algebra.py) |
| Algebra CLI and WASM | 28 complete responses agreed, with one additional module-isolation check and zero failures. [Parity runner](../../../tests/check-algebra-targets.mjs) |
| Rust tests for default workspace members | 32 passed, 0 failed across Standard (16) and the Universal engine (16). |
| Web Node tests | 65 passed, 0 failed. |
| Installed Chrome on Windows | Full verification passed 39 cases before the final Rust formatting change. The final distribution passed a focused set of 12 tests (five Algebra, five Scientific and two calculation record). [Browser observations](browser.json) · [Browser capture](browser.png) |
| Web offline and lazy locales | The standalone verification passed 10 checks. The focused browser suite independently checked Algebra cache isolation and offline calculation. [Offline runner](../../../tests/verify-web-offline.mjs) · [Algebra browser suite](../../../apps/web/tests/algebra.spec.ts) |
| Standard regressions | 157 independent rational and decimal cases, 20 CLI/WASM comparisons and 291 structured value cases passed. [Independent oracle](../../../tests/oracle.py) · [Parity runner](../../../tests/check-targets.mjs) · [Structured oracle](../../../crates/dars-core/tests/structured-oracle.py) |
| Scientific regression | The SymPy/mpmath oracle passed 102 cases and the separate complex mpmath oracle passed 75. The CLI/WASM run matched 19 records and passed one module-isolation check. [Scientific oracles](../../../tests/verify-scientific.py) · [Complex reference](../../../tests/verify-scientific-complex.py) · [Parity runner](../../../tests/check-scientific-targets.mjs) |
| Line coverage | Algebra 1,425/1,480 (96.28%). Universal engine including the shared envelope, Scientific and Algebra 3,246/3,375 (96.18%). Standard core 613/620 (98.87%). Results combine the instrumented Rust tests and native CLI oracles. |
| Locked Windows release | The optimized CLI and desktop builds compiled under the existing security policy. The CLI ran the independent oracle and the desktop completed its WebView2 verification. [Windows measurements](windows-benchmark.json) |

The browser tests check all nine operations in the DOM, including the `x != 0` guard for `x/x`, domain selection, localized input, an Arabic RTL layout at 320 px and termination of an active worker on module change. The Algebra offline test observes no advanced requests or cached assets at launch, prepares Algebra without fetching Scientific and checks a result after offline reload. The shared calculation-record browser suite covers local JSON export, passive import, invalid and oversized input, and literal rendering of imported markup. [Algebra browser suite](../../../apps/web/tests/algebra.spec.ts) · [Shared calculation-record browser suite](../../../apps/web/tests/calculation-proof.spec.ts)

The CLI oracle validates real and complex solutions, multiplicities, exact interval endpoints, original exclusions, partial substitution and family constraints. A normalized `x/x=1` request retains the original exclusion through replay. Verification at `x=0` returns `false`, and the engine enforces the request and record limits before issuing the record. [Oracle](../../../tests/verify-algebra.py) · [Request bounds](../../../crates/dars-universal/src/lib.rs)

Algebra uses the already locked exact-arithmetic dependencies. The Rust and npm lockfiles match the accepted Scientific snapshot. The Scientific verification documents npm audit, RustSec findings and the local registry and Windows policy limits. All four Scientific CI jobs completed successfully. Algebra CI includes the independent oracle and parity runners, and its current run follows publication of the stage commit. [Scientific security evidence](../scientific/verification.md#local-checks) · [Scientific CI record](../scientific/ci.json) · [CI definition](../../../.github/workflows/ci.yml)

## Direct WASM timing

The Node runner measured initialized Algebra WASM, including Rust request decoding and proof serialization. Across 120 measured interactions after 10 warmups per expression, p50/p95/p99 were **0.045 / 0.070 / 0.078 ms**. Initialization took **14.30 ms**. The artifact measured **623,789 bytes**, and the observed linear memory capacity was **1,179,648 bytes**. This measurement excludes browser scheduling, worker start and DOM rendering. The measured WASM SHA-256 was `5749e62ed3fc844efb7dbfb8f6d1437eb2918e35511788de285521cb9595b1f1`. [Parity and timing runner](../../../tests/check-algebra-targets.mjs)

The local reports used here are `artifacts/objective-03/algebra/parity.json` and `artifacts/objective-03/algebra/coverage-final.json`. The coverage file retains machine-local tooling metadata. Keep it local and publish only the sanitized counts.

## Windows interaction and resources

The desktop opened with a fresh profile and reached the checked Standard result in **565.42 ms**. Selecting Algebra took **25.22 ms** to reach the visible panel. The 40 checked Algebra interactions recorded p50/p95/p99 of **49.06 / 63.90 / 64.22 ms**. This interval includes the Playwright actions, worker lifecycle, computation and observation of the result in the DOM. All **46** observed Algebra workers closed. The Win32 minimization and restoration cycle preserved the Algebra input and result, Standard retained `0.3` on return, and the process tree had zero descendants in the post-close samples. [Windows runner](../../../benchmarks/windows-algebra.mjs) · [Measured phases](windows-benchmark.json)

The run used Windows **10.0.26200**, WebView2 **158.0.4370.33** and 20 logical processors. Each phase had six samples over about five seconds. The memory columns report median MiB for the process tree / DARS host / WebView2 auxiliaries. CPU is the sampled rate relative to one logical processor, and workers were counted at the end of each phase.

| Phase | Private resident MiB | Private commit MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visible | 101.26 / 4.41 / 96.86 | 238.09 / 6.38 / 231.71 | 2.77% | 1 |
| Algebra workload | 118.54 / 4.11 / 114.43 | 254.38 / 5.68 / 248.70 | 51.81% | 0 |
| Algebra idle | 138.80 / 4.11 / 134.70 | 266.01 / 5.68 / 260.33 | 0.31% | 0 |
| Algebra minimized | 90.29 / 4.11 / 86.18 | 240.54 / 5.68 / 234.86 | 2.45% | 0 |
| Algebra restored | 106.16 / 4.14 / 102.02 | 319.20 / 5.91 / 313.30 | 0.00% | 0 |
| After close | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00% | 0 |

Short-lived workers opened and closed between phase endpoints. Private resident memory decreased during minimization. The restored private commit exceeded the workload and idle medians and was concentrated in WebView2. This measurement covers one short cycle. The incremental 100 MB target and longer-cycle retention remain open. [Memory debt and protocol](../../objective-02/revision-02/memory-debt.md)

The release executable SHA-256 was `2e3cf84e4e0f68a2226fa41b722942a7659bd5707a3d97aa848cf103d6cac28b`. The Windows capture SHA-256 was `ec3d4d1a4155532912480e47c19ffe58c73c83438bb1eeb3f30c7bbfc1974b3d`. Visual inspection confirmed the navy theme, the selected system solver and the exact result `x=2; y=1`, with the calculation record collapsed. [Windows capture](windows.png)

## Reproduction

From the repository root, use the pinned Rust and Node toolchains and install the test-only oracle dependencies with hashes. For the standalone offline script, set `DARS_CHROME_EXECUTABLE` to the installed browser executable if Playwright Chromium is unavailable. [Oracle requirements](../../../tests/math-oracle-requirements.txt)

```powershell
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-algebra.py target/release/dars.exe
node tests/check-algebra-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-algebra.mjs target/release/dars-desktop.exe
```
