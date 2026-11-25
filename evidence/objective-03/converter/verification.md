# Converter · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Units, methods and resource limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Stage plan](../PLAN.md) · [Test ledger](tests.json)

These results cover the Converter stage of Objective 03, including exact and symbolic unit conversion, nominal rounding, manual currency arithmetic, quote dates and regression checks for previously delivered modules.

## Verified locally

| Verification | Observed result |
| --- | --- |
| Independent references on the Windows CLI | 342 passed, 0 failed on the optimized and instrumented builds with Python `Fraction`, `Decimal` and SymPy 1.14.0. The suite includes canonical units and their supported aliases, 68 structured rejections and eight replays with identical records. [Independent oracle](../../../tests/verify-converter.py) |
| Converter CLI and WASM | 46 complete responses matched. Seven additional module-isolation checks passed. [Parity runner](../../../tests/check-converter-targets.mjs) |
| Rust tests for default workspace members | 75 passed across the Standard core (16) and Universal engine (59). |
| Web Node tests | 65 passed, 0 failed. |
| Installed Chrome on Windows | 81 passed on the final distribution, including all seven Converter tests. [Browser observations](browser.json) · [Browser capture](browser.png) |
| Offline and lazy locales | 10 standalone checks passed on the final distribution. The Converter browser case also verified module isolation and manual currency calculation offline. [Offline runner](../../../tests/verify-web-offline.mjs) |
| Standard regressions | 157 independent rational and decimal cases, 20 CLI/WASM comparisons and 291 structured value cases passed. [Independent oracle](../../../tests/oracle.py) · [Parity runner](../../../tests/check-targets.mjs) · [Structured oracle](../../../crates/dars-core/tests/structured-oracle.py) |
| Earlier advanced modules | Independent references for Scientific through Programmer passed 177, 184, 210, 223, 159, 289 and 368 cases. Their CLI/WASM runs matched 19, 28, 27, 30, 32, 38 and 36 records, respectively. [Scientific](../scientific/verification.md) · [Algebra](../algebra/verification.md) · [Calculus](../calculus/verification.md) · [Linear Algebra](../linear-algebra/verification.md) · [Geometry](../geometry/verification.md) · [Discrete Mathematics](../discrete-mathematics/verification.md) · [Programmer](../programmer/verification.md) |
| Line coverage | The raw merged LLVM report recorded 742/799 Converter lines (92.87%), 9,198/9,501 Universal engine lines (96.81%) and 613/620 Standard core lines (98.87%). [Test ledger](tests.json) |
| Locked Windows release | The optimized CLI ran the independent oracle. The desktop launch, Converter interaction, restoration and worker and process teardown were measured on WebView2. [Windows measurements](windows-benchmark.json) |

The oracle derives compound units from base definitions, uses rational inverses within exact compatible families and checks symbolic angle expressions independently. It also checks decimal and binary prefixes, all 17 physical categories, absolute temperatures near zero kelvin, signed temperature spans and reciprocal fuel conversions. The manual currency fixtures use synthetic rates and independent Gregorian date comparisons. [Independent oracle](../../../tests/verify-converter.py) · [BIPM SI Brochure](https://www.bipm.org/en/publications/si-brochure) · [NIST conversion factors](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors) · [NIST binary prefixes](https://pml.nist.gov/cuu/Units/binary.html)

The scoped browser tests exercised all 17 physical categories, domain messages, unit swapping, seven languages and an accessible 320 px Arabic RTL layout. The manual-rate test used a URL-like source as literal text and observed zero external requests while checking the four status labels. Other cases verified passive reimport of a manual record with all dates, isolated loading of the Converter WASM, manual currency after an offline reload and pending-worker cancellation with draft recovery. [Converter browser tests](../../../apps/web/tests/converter.spec.ts)

The LLVM line report lists 37 of the Converter's uncovered lines in seven helper functions used to construct the unit table at compile time. These are `Ratio::{times,over,power}` and `Entry::{linear,affine,angle,fuel}`. Runtime tests exercise the resulting table. With those 37 compile-time-only lines excluded, the runtime-oriented coverage is 742/762 (97.38%). [Unit registry](../../../crates/dars-universal/src/converter/units.rs) · [Test ledger](tests.json)

The browser capture shows the navy theme and the synthetic example `25 USD` → `125 BRL`, marked expired relative to `2024-02-01`. The rate source and dates appear alongside the result. The capture SHA-256 is `5ff2a7919d2d7cbf9276af4bc8e86a71cd84f6de4d24e9f2b0270c5cd3623777`. [Browser capture](browser.png)

## Representative conversion and quote checks

| Fixture | Observed result |
| --- | --- |
| `1 in` to `cm` | Exact `127/50`. Squared and cubed customary lengths were checked against independently derived area and volume scales. |
| `180 deg` to `rad` | Symbolic `pi`. The reverse direction accepts rational radians and returns the exact expression involving `1/pi`. |
| `-273.149999999999999999999999 degC` to `K` | Exact `10^-24 K`. A value the same distance below absolute zero returns a domain error. |
| `1 mmHg` to `Pa` | Approximate `133.3224`, seven significant digits, with a structured ties-to-even rounding field and null certified error bound. Independent decimal references also checked halfway values. |
| `8 L/100km` to `km/L` | Exact reciprocal result `25/2`. A zero reciprocal input returns a domain error. |
| Synthetic `USD` to `BRL` quote dated `2024-02-29` and ending `2024-03-03` | The exact product under the entered rate remains available. A reference date of `2024-03-03` is within validity and `2024-03-04` is expired. The record retains both the amount and the date status. |

The browser and CLI use the same arithmetic. The recorded currency result describes the product for the supplied manual quote and its validity at the selected reference date. [Independent oracle](../../../tests/verify-converter.py) · [Manual quote implementation](../../../crates/dars-universal/src/converter/currency.rs)

## Dependency and security checks

The Converter uses the existing Num rational types and a bounded unit registry. The Rust and npm lockfiles match the accepted Programmer snapshot. The manual exchange operation runs offline and keeps source text and dates in the local calculation record. The stage CI definition includes the independent conversion reference and parity runner, and its run follows publication of the stage commit. [Request and record bounds](../../../crates/dars-universal/src/lib.rs) · [CI definition](../../../.github/workflows/ci.yml)

## Direct WASM timing

The Node runner measured initialized Converter WASM, including Rust request decoding and calculation record serialization. Across 120 interactions after 10 warmups per expression, p50/p95/p99 were **0.0181 / 0.0315 / 0.0701 ms**. Initialization took **12.13 ms**. The WASM measured **349,947 bytes**, with observed linear memory capacity of **1,179,648 bytes**. Browser scheduling, worker startup and DOM rendering fall outside this measure. The WASM SHA-256 was `11b22623e6cb3397874641f3bf0a783e4cc8b684bc4c2b630315e08e6d2d2265`. [Parity and timing runner](../../../tests/check-converter-targets.mjs) · [Test ledger](tests.json)

## Windows interaction and resources

The locked release ran on Windows `10.0.26200` with WebView2 `158.0.4370.33`. Startup took **606.88 ms**, and selecting Converter took **31.66 ms**. Across **43 sustained interactions**, p50/p95/p99 were **64.35 / 66.37 / 81.21 ms**. The workload selected the category and units, entered the amount, invoked the worker and verified the DOM result for exact length conversions and the Celsius to Fahrenheit offset. The executable SHA-256 was `fd965a0eafb37cabc1e490da550b372c6ebb576968637523836847b71f7d22f9`. [Windows runner](../../../benchmarks/windows-converter.mjs) · [Measured phases](windows-benchmark.json)

All 48 workers opened by the benchmark closed. After Win32 minimize and restore, the app retained the category, both units, the amount and the checked result. Returning to Standard retained `0.3`. The completed close phase observed zero descendants. [Measured phases](windows-benchmark.json)

| Phase | Process tree private resident (MiB) | Process tree private commit (MiB) |
| --- | ---: | ---: |
| Standard visible | 100.20 | 235.75 |
| Converter load | 125.99 | 262.22 |
| Converter idle | 156.41 | 289.69 |
| Minimized | 87.56 | 243.25 |
| Restored | 107.58 | 337.51 |
| After close | 0.00 | 0.00 |

Each row is the median of six samples in a short phase. Private resident memory fell during minimize. The highest private commit occurred after restore, with 331.64 MiB in auxiliary processes. The 100 MB desktop memory target and retention over longer cycles remain open. The capture shows `1.25 m` → `125 cm` in the default navy theme. Its SHA-256 is `35946ef5ea41e9c57ecd949584967873e1ea40b79ae68d068570c0c4c4624e1c`. [Measured phases](windows-benchmark.json) · [Windows capture](windows.png) · [Memory debt and protocol](../../objective-02/revision-02/memory-debt.md)

The first attempt reached restoration and then encountered a read error in the first process snapshot after closing. A separate inventory afterward found zero app and profile descendants. The harness now waits up to five seconds for an observation of zero descendants after the host exits, then collects the six close samples. A persistent descendant still fails the run. The successful rerun used the same executable and Windows security settings. [Windows benchmark harness](../../../benchmarks/windows-tool.mjs)

## Reproduction

Use the pinned Rust and Node toolchains from the repository root. Install the test-only mathematical references in a separate environment. If Playwright Chromium is unavailable, set `DARS_CHROME_EXECUTABLE` to the installed browser executable for the standalone offline script. [Oracle requirements](../../../tests/math-oracle-requirements.txt)

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-converter.py target/release/dars.exe
node tests/check-converter-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-converter.mjs target/release/dars-desktop.exe
```
