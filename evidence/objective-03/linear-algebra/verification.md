# Linear Algebra · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Mathematical and resource limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Stage plan](../PLAN.md) · [Test ledger](tests.json)

These results cover the Linear Algebra stage of Objective 03, including exact and numerical operations, the matrix editor, the calculation record and regression checks for the previously delivered modules.

## Verified locally

| Verification | Observed result |
| --- | --- |
| Independent references on the Windows CLI | 223 passed, 0 failed on both optimized and instrumented builds with SymPy 1.14.0, NumPy 2.5.1 and SciPy 1.18.1. The total covers all 14 operations, 50 structured rejections, six replays with identical calculation records and one original-input provenance check. [Independent oracle](../../../tests/verify-linear-algebra.py) |
| Linear Algebra CLI and WASM | 30 complete responses matched. Three additional module-isolation checks passed. [Parity runner](../../../tests/check-linear-algebra-targets.mjs) |
| Rust tests for default workspace members | 45 passed across the Standard core (16) and Universal engine (29). Rust formatting and Clippy for the default workspace members passed. |
| Web Node tests | 65 passed, 0 failed. The shared calculation-record schema accepts the module identifier. |
| Installed Chrome on Windows | The full browser suite passed all 52 cases before the RTL scroll-start correction. The final distribution passed 25 focused tests across Linear Algebra, the earlier advanced modules and the calculation record. [Browser observations](browser.json) · [Browser capture](browser.png) |
| Offline and lazy locales | 10 standalone checks passed on the final distribution. The focused browser suite additionally checked module isolation and offline matrix calculation. [Offline runner](../../../tests/verify-web-offline.mjs) |
| Standard regressions | 157 independent rational and decimal cases, 20 CLI/WASM comparisons and 291 structured value cases passed. [Independent oracle](../../../tests/oracle.py) · [Parity runner](../../../tests/check-targets.mjs) · [Structured oracle](../../../crates/dars-core/tests/structured-oracle.py) |
| Scientific, Algebra and Calculus regressions | The independent references passed 177, 184 and 210 cases, respectively. Their CLI/WASM runs matched 19, 28 and 27 responses, respectively. [Scientific](../scientific/verification.md) · [Algebra](../algebra/verification.md) · [Calculus](../calculus/verification.md) |
| Line coverage | Instrumented Rust tests and native CLI references covered 921/934 Linear Algebra lines (98.61%), 5,960/6,164 Universal engine lines (96.69%) and 613/620 Standard core lines (98.87%). [Test ledger](tests.json) |
| Locked Windows release | The optimized CLI ran the full independent oracle. The normal desktop release completed its WebView2 run under the existing Windows security policy. [Windows measurements](windows-benchmark.json) |

The exact reference covers rational and rectangular matrices, row and column vectors, axial cross products, determinant and inverse, rank, and consistent, inconsistent and indeterminate systems. For a unique solution it verifies `A*x=b` exactly. For an indeterminate system it checks the particular solution and the full nullspace against SymPy. Singular inverse requests return `singular`. Inputs with malformed rows, unsupported nonsymmetric eigen problems and out-of-range numeric scales return structured errors. [Exact suite](../../../tests/verify-linear-algebra.py) · [Exact engine](../../../crates/dars-universal/src/linear_algebra/exact.rs)

The browser tests cover all 14 operations, keyboard editing, matrix paste and resizing, exact integer text beyond JavaScript's safe integer range, and numerical diagnostics in the exported calculation record. They exercise seven languages and a 320 px Arabic layout. The RTL correction makes the first matrix cell visible at the initial scroll position in wide grids. The suite also verifies that selecting Linear Algebra prepares only its WASM on the first calculation, that an offline reload can calculate again, and that switching modules terminates pending work and retains the draft. [Browser suite](../../../apps/web/tests/linear-algebra.spec.ts)

The browser capture shows the navy theme, a 3×2 matrix with approximate QR factors, the tolerance field and the observed diagnostics. Its SHA-256 is `8ecac7e8ecfefebd3dfe1d1b563b059fd1fb7bd2000b88cb0da4b5a2e234e846`. [Browser capture](browser.png)

## Numerical checks

The suite checks thin QR reconstruction and orthogonality, the sorted real symmetric spectrum and the full invariant subspace for repeated eigenvalues. It exercises matrices at scales `1e-20` and `1e90`, 12-row matrices, and repeated or nearly zero eigenvalues. It verifies `P*A=L*U` exactly for rational LU and also compares reconstruction with SciPy. The numerical checks use independent NumPy and SciPy calculations. [Independent oracle](../../../tests/verify-linear-algebra.py) · [Numerical engine](../../../crates/dars-universal/src/linear_algebra/numeric.rs)

| Fixture | Observed result |
| --- | --- |
| Thin QR of `1 2;3 4;5 7` with tolerance `1e-12` | The record reports a relative Frobenius reconstruction residual of `2.858e-16` and orthogonality error of `7.146e-16`. Independent reconstruction from the returned factors measured `2.889e-16` and `7.176e-16`, respectively. |
| QR of `diag(1,1e-10)` | Exact rank two. The estimated reciprocal 2-norm condition `1e-10` matches the NumPy reference. The record warns that the matrix is ill-conditioned. |
| Eigensystem of `2 1 1;1 2 1;1 1 2` | The sorted spectrum agrees with `(1,1,4)` at the requested tolerance. The combined two-dimensional eigenspace at the repeated value agrees with the SciPy projector and the record warns about clustered eigenvalues. |

The approximation record reports working precision, the requested tolerance and observed residuals. Certified error bounds remain null. The eigenvector test compares subspace projectors so the result can choose its own orthonormal basis for a repeated eigenvalue. [Calculation record contract](../calculation-proof/contract.md)

## Dependency and security checks

The numerical engine uses Nalgebra 0.35.0. The official sparse registry confirmed matching checksums and `yanked=false` for all 12 new locked Rust entries. RustSec scanned 443 entries and reported zero advisories classified as vulnerabilities. The three existing warnings are `chrono` 0.4.45 and `proc-macro-error` 1.0.4 (unmaintained), and `glib` 0.18.5 (`unsound`). [Registry verification](dependency-check.json) · [Cargo lockfile](../../../Cargo.lock) · [Earlier scan](../scientific/verification.md#local-checks)

NumPy and SciPy are test-only. Their binary wheels are pinned by version and SHA-256 for Windows x86-64 and glibc Linux x86-64 with CPython 3.12–3.14. All four Calculus CI jobs passed. Linear Algebra CI includes its own mathematical references and parity runner, and its run follows publication of the stage commit. [Oracle wheel requirements](../../../tests/linear-algebra-oracle-requirements.txt) · [Calculus CI record](../calculus/ci.json) · [CI definition](../../../.github/workflows/ci.yml)

## Direct WASM timing

The Node runner measured initialized Linear Algebra WASM, including Rust request decoding and calculation record serialization. Across 120 interactions after 10 warmups per expression, p50/p95/p99 were **0.0283 / 0.0389 / 0.0437 ms**. Initialization took **13.08 ms**. The WASM measured **523,769 bytes**, with observed linear memory capacity of **1,179,648 bytes**. Browser scheduling, worker startup and DOM rendering fall outside this measure. The WASM SHA-256 was `35611b767ba5b8a647969e090d60914641f45640c78d355ef2f2c771a92ca32c`. [Parity and timing runner](../../../tests/check-linear-algebra-targets.mjs) · [Test ledger](tests.json)

## Windows interaction and resources

The desktop opened with a fresh profile and reached the checked Standard result in **672.82 ms**. Selecting Linear Algebra took **36.81 ms** to reach its visible panel. Across 32 checked determinant, transpose and rank interactions, p50/p95/p99 were **87.58 / 106.93 / 107.33 ms**. This interval includes entering four matrix cells, clicking Calculate, worker lifecycle, computation and observation of the DOM result. All **37** observed Linear Algebra workers closed. Win32 minimization and restoration preserved the four cells and result, Standard retained `0.3` on return, and post-close samples showed zero descendant processes. [Windows runner](../../../benchmarks/windows-linear-algebra.mjs) · [Measured phases](windows-benchmark.json)

The run used Windows **10.0.26200**, WebView2 **158.0.4370.33** and 20 logical processors. Each phase had six samples over about five seconds. The memory columns report median MiB for the process tree / DARS host / WebView2 auxiliaries. CPU is the sampled rate relative to one logical processor, and workers were counted at the end of each phase.

| Phase | Private resident MiB | Private commit MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visible | 100.06 / 4.14 / 95.92 | 237.69 / 5.75 / 231.95 | 3.39% | 1 |
| Linear Algebra workload | 123.95 / 4.10 / 119.85 | 266.94 / 5.79 / 261.15 | 71.22% | 0 |
| Linear Algebra idle | 146.28 / 4.10 / 142.18 | 293.04 / 5.79 / 287.25 | 0.00% | 0 |
| Linear Algebra minimized | 86.32 / 4.10 / 82.21 | 235.33 / 5.80 / 229.54 | 3.99% | 0 |
| Linear Algebra restored | 106.18 / 4.14 / 102.04 | 328.25 / 5.80 / 322.45 | 0.00% | 0 |
| After close | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00% | 0 |

Short-lived workers opened and closed between phase endpoints. Private resident memory fell during minimization. The restored private commit was highest in this run and was concentrated in WebView2. This measurement covers one short cycle. The incremental 100 MB target and longer-cycle retention remain open. [Memory debt and protocol](../../objective-02/revision-02/memory-debt.md)

The executable SHA-256 was `39db702a8bb1cbe32958a25a20daeca90700953ccfae907864b8f94b78003670`. The Windows capture SHA-256 was `2e392f889eb91b8a2f691edfe29426eba8a8001b01eddde02db07096cd7ecd64`. Visual inspection confirmed the navy theme, the four retained matrix entries and the exact transpose `[[1,3],[2,4]]` with the calculation record collapsed. [Windows capture](windows.png)

## Reproduction

Use the pinned Rust and Node toolchains from the repository root. Install the test-only references in a separate environment. If Playwright Chromium is unavailable, set `DARS_CHROME_EXECUTABLE` to the installed browser executable for the standalone offline script. [Base oracle requirements](../../../tests/math-oracle-requirements.txt) · [Linear Algebra oracle wheels](../../../tests/linear-algebra-oracle-requirements.txt)

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt -r tests/linear-algebra-oracle-requirements.txt
& $oraclePython -B tests/verify-linear-algebra.py target/release/dars.exe
node tests/check-linear-algebra-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-linear-algebra.mjs target/release/dars-desktop.exe
```
