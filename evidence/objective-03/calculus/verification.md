# Calculus · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Mathematical and resource limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Stage plan](../PLAN.md) · [Test ledger](tests.json)

These results cover the Calculus stage of Objective 03, its interactions with the Standard, Scientific and Algebra modules, and the calculation record.

## Verified locally

| Verification | Observed result |
| --- | --- |
| Independent mathematical references on the optimized Windows CLI | 210 passed, 0 failed with SymPy 1.14.0 and mpmath 1.3.0. The total covers all six operations, 60 structured rejections, six complete record replays and one original-input provenance case. [Oracle](../../../tests/verify-calculus.py) |
| Calculus CLI and WASM | 27 complete responses matched, with two additional module-isolation checks and zero failures. [Parity runner](../../../tests/check-calculus-targets.mjs) |
| Rust tests for default workspace members | 38 passed across Standard (16) and the Universal engine (22). |
| Web Node tests | 65 passed, 0 failed. |
| Installed Chrome on Windows | 45 passed, including the six Calculus tests. [Browser observations](browser.json) · [Browser capture](browser.png) |
| Offline and lazy locales | 10 standalone checks passed. The Calculus browser case also verified cache isolation and offline calculation. [Offline runner](../../../tests/verify-web-offline.mjs) |
| Standard regressions | 157 independent rational and decimal cases, 20 CLI/WASM comparisons and 291 structured value cases passed. [Independent oracle](../../../tests/oracle.py) · [Parity runner](../../../tests/check-targets.mjs) · [Structured oracle](../../../crates/dars-core/tests/structured-oracle.py) |
| Scientific regressions | The general SymPy/mpmath oracle passed 102 cases and the dedicated complex mpmath oracle passed 75. CLI/WASM matched 19 records and passed one module-isolation check. [Scientific oracles](../../../tests/verify-scientific.py) · [Complex reference](../../../tests/verify-scientific-complex.py) · [Parity runner](../../../tests/check-scientific-targets.mjs) |
| Algebra regressions | The independent SymPy reference passed 184 cases. CLI/WASM matched 28 records and passed one module-isolation check. [Algebra oracle](../../../tests/verify-algebra.py) · [Parity runner](../../../tests/check-algebra-targets.mjs) |
| Line coverage | Instrumented Rust unit tests and native CLI oracles covered 1,777/1,839 Calculus lines (96.63%), 5,032/5,223 Universal engine lines (96.34%) and 613/620 Standard core lines (98.87%). [Test ledger](tests.json) |
| Locked Windows release | The optimized CLI and normal desktop builds compiled under the existing Windows security policy. The CLI ran the independent oracle and the desktop completed the native WebView2 verification. [Windows measurements](windows-benchmark.json) |

The CLI oracle checks 27 derivatives, 15 antiderivatives by differentiation, 23 definite integrals, 39 limits, 20 Taylor expansions and 19 numerical integrals. The exact cases include cancellations that retain the original domain, removable limits, unequal limits from opposite sides, infinite behavior and exact radii for the supported Taylor examples. The rejection cases include a closed interval with a pole, a narrow peak outside the supported quadrature range and a case where binary64 arithmetic could not reach the requested tolerance. [Oracle](../../../tests/verify-calculus.py)

The browser tests exercise the six operations, seven languages, localized numeric parameters and the Arabic RTL layout at 320 px. The suite checks a structured numerical record through download and passive local import. The record carries the result, tolerance and uncertified estimate and has a null certified error bound. The offline test observes an empty advanced cache at launch, a Calculus-only WASM after the first computation and a checked derivative after offline reload. The worker test switches modules while a Calculus worker is pending, verifies termination and checks draft recovery. [Calculus browser tests](../../../apps/web/tests/calculus.spec.ts) · [Shared calculation-record tests](../../../apps/web/tests/calculation-proof.spec.ts)

The browser capture shows the navy theme and the approximate Gaussian result `0.746824132812621` at tolerance `1e-9`, with the estimate labeled uncertified. Its SHA-256 is `c289e92300a8f4a799aa22a16cc795581b6c33018453c9fcf561e1700121045e`. [Browser capture](browser.png)

The Rust and npm lockfiles match the accepted Algebra snapshot. The parser applies the bounded expression grammar to the canonical input and retains display text as provenance. The preceding verification records document the security scans and applicable local constraints. All four Algebra CI jobs passed. Calculus CI includes the independent oracle and parity runners, and its run follows publication of the stage commit. [Calculation request boundary](../../../crates/dars-universal/src/lib.rs) · [Algebra security evidence](../algebra/verification.md#verified-locally) · [Algebra CI record](../algebra/ci.json) · [CI definition](../../../.github/workflows/ci.yml)

## Independent quadrature checks

The optimized CLI results below are from [0, 1]. Independent references were evaluated at 85 decimal digits. The reported estimates are adaptive Simpson diagnostics. The observed errors are discrepancies between the returned result and the independent reference for these inputs. The calculation record keeps the certified error bound null. [Oracle](../../../tests/verify-calculus.py) · [Quadrature implementation](../../../crates/dars-universal/src/calculus/numeric.rs)

| Integrand | Requested tolerance | Observed result | Observed absolute error | Reported uncertified estimate |
| --- | ---: | ---: | ---: | ---: |
| `exp(-x^2)` | `1e-10` | `0.746824132812499` | `7.19746005326e-14` | `2.905442420218322e-11` |
| `cos(25.132741228718345*x)` | `1e-9` | `-3.729655473350135e-17` | `1.18027363206e-18` | `2.2233699760844715e-10` |

The references are `sqrt(pi)*erf(1)/2` for the Gaussian and `sin(k)/k` for `cos(k*x)`. The cosine argument is close to four full cycles. The five samples used by one Simpson panel and its two halves all round to `1.0` at 16 significant digits. The implementation subdivides the initial panels using rational enclosures of the trigonometric arguments, and the observed result agrees with the near-zero integral within the requested tolerance.

## Direct WASM timing

The Node runner measured initialized WASM, including Rust request decoding and record serialization. Across 120 measured interactions after 10 warmups per expression, p50/p95/p99 were **0.0444 / 0.1487 / 0.1906 ms**. Initialization took **17.09 ms**. The WASM artifact measured **612,178 bytes** and the observed linear memory capacity was **1,179,648 bytes**. Browser worker start, scheduling and DOM rendering fall outside these times. The WASM SHA-256 was `419b3355b3e2695a91c484bed1dd3bcab2a77c29176a52628ac8bebf0429cbce`. [Parity and timing runner](../../../tests/check-calculus-targets.mjs) · [Test ledger](tests.json)

## Windows interaction and resources

The desktop opened with a fresh profile and reached the checked Standard result in **567.71 ms**. Selecting Calculus took **27.61 ms** to reach its visible panel. Across 40 checked interactions with a derivative, a definite integral and a removable limit, p50/p95/p99 were **54.60 / 63.27 / 63.77 ms**. This interval includes Playwright actions, worker lifecycle, computation and observation of the result in the DOM. All **46** observed Calculus workers closed. Win32 minimization and restoration preserved the Calculus input and result, Standard retained `0.3` on return, and post-close samples showed zero descendant processes. [Windows runner](../../../benchmarks/windows-calculus.mjs) · [Measured phases](windows-benchmark.json)

The run used Windows **10.0.26200**, WebView2 **158.0.4370.33** and 20 logical processors. Each phase had six samples over about five seconds. The memory columns report median MiB for the process tree / DARS host / WebView2 auxiliaries. CPU is the sampled rate relative to one logical processor, and workers were counted at the end of each phase.

| Phase | Private resident MiB | Private commit MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visible | 100.11 / 4.04 / 96.06 | 235.55 / 5.61 / 229.94 | 2.15% | 1 |
| Calculus workload | 120.67 / 4.18 / 116.49 | 264.07 / 6.42 / 257.66 | 62.99% | 0 |
| Calculus idle | 144.95 / 4.18 / 140.77 | 281.98 / 6.42 / 275.56 | 0.00% | 0 |
| Calculus minimized | 90.28 / 4.18 / 86.09 | 247.08 / 6.42 / 240.66 | 3.38% | 0 |
| Calculus restored | 106.22 / 4.19 / 102.04 | 327.57 / 6.42 / 321.16 | 0.00% | 0 |
| After close | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00% | 0 |

Short-lived workers opened and closed between phase endpoints. Private resident memory fell during minimization. The restored private commit was highest in this run and was concentrated in WebView2. This measurement covers one short cycle. The incremental 100 MB target and longer-cycle retention remain open. [Memory debt and protocol](../../objective-02/revision-02/memory-debt.md)

The executable SHA-256 was `38e9ef1df9196bc3aa626fd72a53d683176ae0137f83ad1e939ae506c8e6659f`. The Windows capture SHA-256 was `e4f508d9849be44319070b468cfe8ea5e03f09cbfb176986e686511301cb28e4`. Visual inspection confirmed the navy theme, the definite integral of `x^2` from `0` to `1`, and the exact result `1/3` with the calculation record collapsed. [Windows capture](windows.png)

## Reproduction

From the repository root, use the pinned Rust and Node toolchains and install the test-only mathematical dependencies with hashes. For the standalone offline script, set `DARS_CHROME_EXECUTABLE` to your installed browser executable if Playwright Chromium is unavailable. [Oracle requirements](../../../tests/math-oracle-requirements.txt)

```powershell
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-calculus.py target/release/dars.exe
node tests/check-calculus-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-calculus.mjs target/release/dars-desktop.exe
```
