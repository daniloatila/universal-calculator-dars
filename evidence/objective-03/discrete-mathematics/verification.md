# Discrete Mathematics · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Mathematical and resource limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Stage plan](../PLAN.md) · [Test ledger](tests.json)

These results cover the Discrete Mathematics stage of Objective 03, including exact arithmetic, propositional logic, bounded primality and factorization, calculation records and regression checks for previously delivered modules.

## Verified locally

| Verification | Observed result |
| --- | --- |
| Independent references on the Windows CLI | 289 passed, 0 failed on both final optimized and instrumented builds with Python and SymPy 1.14.0. The suite covers all 16 operations, 59 structured rejections, ten replays with identical calculation records and one original-input provenance check. [Independent oracle](../../../tests/verify-discrete-mathematics.py) |
| Discrete Mathematics CLI and WASM | 38 complete responses matched. Five additional module-isolation checks passed. [Parity runner](../../../tests/check-discrete-mathematics-targets.mjs) |
| Rust tests for default workspace members | 60 passed across the Standard core (16) and Universal engine (44). Rust formatting passed. |
| Web Node tests | 65 passed, 0 failed. |
| Installed Chrome on Windows | 67 passed on the final distribution, including all eight Discrete Mathematics tests. [Browser observations](browser.json) · [Browser capture](browser.png) |
| Offline and lazy locales | 10 standalone checks passed on the final distribution. The focused Discrete Mathematics browser case also checked module isolation and offline calculation. [Offline runner](../../../tests/verify-web-offline.mjs) |
| Standard regressions | 157 independent rational and decimal cases, 20 CLI/WASM comparisons and 291 structured value cases passed. [Independent oracle](../../../tests/oracle.py) · [Parity runner](../../../tests/check-targets.mjs) · [Structured oracle](../../../crates/dars-core/tests/structured-oracle.py) |
| Earlier advanced modules | Scientific, Algebra, Calculus, Linear Algebra and Geometry references passed 177, 184, 210, 223 and 159 cases, respectively. Their CLI/WASM runs matched 19, 28, 27, 30 and 32 records, respectively. [Scientific](../scientific/verification.md) · [Algebra](../algebra/verification.md) · [Calculus](../calculus/verification.md) · [Linear Algebra](../linear-algebra/verification.md) · [Geometry](../geometry/verification.md) |
| Line coverage | Instrumented Rust tests and native CLI oracles covered 1,073/1,099 Discrete Mathematics lines (97.63%), 7,914/8,158 Universal engine lines (97.01%) and 613/620 Standard core lines (98.87%). [Test ledger](tests.json) |
| Locked Windows release | The optimized CLI ran the independent oracle. The normal desktop release completed its WebView2 run under the existing Windows security policy. [Windows measurements](windows-benchmark.json) |

The reference uses Python `math` and `itertools` for ordinary and repeated selections, native set operations for identities and membership, and explicit Boolean predicates for truth rows. It compares counts and arbitrary-size values, including `4096!`, a valid 65,536-bit integer result and modular power at its admitted 1,024-bit exponent and 2,048-bit modulus boundaries. For eight variables it checks all 256 assignments in false-first order. The suite also reconstructs the signed factorization, verifies multiplicities and checks sequence terms through independent formulas. [Independent oracle](../../../tests/verify-discrete-mathematics.py)

The focused browser suite checked all 16 operations, displayed integers beyond the JavaScript safe integer range and a 256-row truth table with 16 rows per page. It verified localization in seven languages and a 320 px Arabic RTL layout, both primality labels and passive import of an exported `probable_prime` record. The worker tests confirmed cancellation of an unfinished request, draft recovery after switching modules and calculation after an offline reload with only the Discrete Mathematics WASM prepared. [Browser suite](../../../apps/web/tests/discrete-mathematics.spec.ts)

The browser capture shows the navy theme, columns for eight variables and the second page of the exact truth table, labeled `Rows 17–32 of 256`. Its SHA-256 is `8c806744f99f6fb60bb30fb123665507a489710c460da7dcc90dbd1ba28f1019`. [Browser capture](browser.png)

## Primality evidence

| Fixture | Observed result |
| --- | --- |
| `18446744073709551557` | `prime` with exact classification and the unsigned 64-bit deterministic method. |
| `2^127−1` | `probable_prime` with approximate classification. The record states that all 12 fixed strong probable-prime tests passed, with null precision, tolerance and error bound. |
| `(2^61−1)(2^31−1)` | `composite` with exact classification and witness base `2`. The Python oracle independently verifies the failed strong test at the recorded base. |
| `-360` | Exact factor list `[-1,2,2,2,3,3,5]`, including sign and repeated prime factors. |

The reference independently checks the selected Mersenne number with Lucas–Lehmer. The application retains its `probable_prime` classification for the larger value and assigns no probability to a pass with fixed bases. [Independent primality checks](../../../tests/verify-discrete-mathematics.py) · [Primality and factorization engine](../../../crates/dars-universal/src/discrete_mathematics/number_theory.rs)

## Dependency and security checks

The module uses the previously locked Num integer crates. The Rust and npm lockfiles match the accepted Geometry snapshot. The typed Boolean parser evaluates only admitted operators and rejects variable names reserved by the calculation record. The set and integer entry points use bounded lexical grammars. All four Geometry CI jobs passed. Discrete Mathematics CI includes the independent reference and parity runners, and its run follows publication of the stage commit. [Integer parser](../../../crates/dars-universal/src/discrete_mathematics/integer.rs) · [Boolean parser](../../../crates/dars-universal/src/discrete_mathematics/logic.rs) · [Geometry CI record](../geometry/ci.json) · [CI definition](../../../.github/workflows/ci.yml)

## Direct WASM timing

The Node runner measured initialized Discrete Mathematics WASM, including Rust request decoding and calculation record serialization. Across 120 interactions after 10 warmups per expression, p50/p95/p99 were **0.0151 / 0.0383 / 0.0441 ms**. Initialization took **14.20 ms**. The WASM measured **448,172 bytes**, with observed linear memory capacity of **1,179,648 bytes**. Browser scheduling, worker startup and DOM rendering fall outside this measure. The WASM SHA-256 was `5c67295ada054af8254eb44510f2473f5f6d357a8a13ffd40adbab55600359da`. [Parity and timing runner](../../../tests/check-discrete-mathematics-targets.mjs) · [Test ledger](tests.json)

## Windows interaction and resources

With a fresh profile, the desktop reached the checked Standard result in **679.45 ms**. Selecting Discrete Mathematics took **27.75 ms** to reach its visible panel. Across 37 checked permutation, arrangement and combination interactions, p50/p95/p99 were **62.04 / 80.22 / 87.51 ms**. These times include filling the operation's fields, clicking Calculate, the worker lifecycle, computation and observation of the DOM result. All **42** observed workers closed. Win32 minimization and restoration preserved `n`, `k` and the checked combination count, Standard retained `0.3` on return, and post-close samples showed zero descendant processes. [Windows runner](../../../benchmarks/windows-discrete-mathematics.mjs) · [Measured phases](windows-benchmark.json)

The run used Windows **10.0.26200**, WebView2 **158.0.4370.33** and 20 logical processors. Each phase had six samples over about five seconds. The memory columns report median MiB for the process tree / DARS host / WebView2 auxiliaries. CPU is the sampled rate relative to one logical processor, and workers were counted at the end of each phase.

| Phase | Private resident MiB | Private commit MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visible | 97.79 / 3.61 / 94.18 | 233.90 / 5.23 / 228.66 | 5.83% | 1 |
| Discrete Mathematics workload | 117.65 / 3.65 / 114.00 | 271.63 / 5.30 / 266.33 | 52.12% | 0 |
| Discrete Mathematics idle | 137.48 / 3.65 / 133.83 | 284.90 / 5.30 / 279.60 | 0.61% | 0 |
| Discrete Mathematics minimized | 90.36 / 3.65 / 86.70 | 223.66 / 5.34 / 218.32 | 3.69% | 0 |
| Discrete Mathematics restored | 102.27 / 3.68 / 98.59 | 326.32 / 5.33 / 320.99 | 0.92% | 0 |
| After close | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00% | 0 |

Short-lived workers opened and closed between phase endpoints. Private resident memory fell during minimization. The highest private commit occurred after restoration and was concentrated in WebView2. The measurement covers one short cycle. The incremental 100 MB physical-memory target and longer-cycle retention remain open. [Memory debt and protocol](../../objective-02/revision-02/memory-debt.md)

The executable SHA-256 was `44d59ab8fc98fdb6edb0d9584db40da066e689a41a3235f08b1f33fd1f5f7474`. The Windows capture SHA-256 was `f05afac29b1e7348b95a51e6b5a6d27cfacf22f275376aa0f54aa8cc4011c65e`. Visual inspection confirmed the navy theme, the inputs `n=10` and `k=3`, and the exact combination count `120`. [Windows capture](windows.png)

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
& $oraclePython -B tests/verify-discrete-mathematics.py target/release/dars.exe
node tests/check-discrete-mathematics-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-discrete-mathematics.mjs target/release/dars-desktop.exe
```
