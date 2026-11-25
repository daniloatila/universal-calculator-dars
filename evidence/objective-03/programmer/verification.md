# Programmer · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Word model and resource limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Stage plan](../PLAN.md) · [Test ledger](tests.json)

These results cover the Programmer stage of Objective 03, including exact base conversion, fixed-width bit operations, signed interpretation, local calculation records and regression checks for previously delivered modules.

## Verified locally

| Verification | Observed result |
| --- | --- |
| Independent Python reference on the Windows CLI | 368 passed, 0 failed on final optimized and instrumented builds with Python 3.14.7. The suite covers all 11 operations, 51 structured rejections, six replays with identical calculation records and one original-input provenance check. [Independent oracle](../../../tests/verify-programmer.py) |
| Programmer CLI and WASM | 36 complete responses matched. Six additional module-isolation checks passed. [Parity runner](../../../tests/check-programmer-targets.mjs) |
| Rust tests for default workspace members | 67 passed across the Standard core (16) and Universal engine (51). Rust formatting and default-member Clippy passed. |
| Web Node tests | 65 passed, 0 failed. |
| Installed Chrome on Windows | 74 passed on the final distribution, including all seven Programmer tests. [Browser observations](browser.json) · [Browser capture](browser.png) |
| Offline and lazy locales | 10 standalone checks passed on the final distribution. The Programmer browser case additionally checked module isolation and offline calculation. [Offline runner](../../../tests/verify-web-offline.mjs) |
| Standard regressions | 157 independent rational and decimal cases, 20 CLI/WASM comparisons and 291 structured value cases passed. [Independent oracle](../../../tests/oracle.py) · [Parity runner](../../../tests/check-targets.mjs) · [Structured oracle](../../../crates/dars-core/tests/structured-oracle.py) |
| Earlier advanced modules | Independent references for Scientific, Algebra, Calculus, Linear Algebra, Geometry and Discrete Mathematics passed 177, 184, 210, 223, 159 and 289 cases, respectively. Their CLI/WASM runs matched 19, 28, 27, 30, 32 and 38 records, respectively. [Scientific](../scientific/verification.md) · [Algebra](../algebra/verification.md) · [Calculus](../calculus/verification.md) · [Linear Algebra](../linear-algebra/verification.md) · [Geometry](../geometry/verification.md) · [Discrete Mathematics](../discrete-mathematics/verification.md) |
| Line coverage | Instrumented Rust tests and native CLI oracles covered 521/523 Programmer lines (99.62%), 8,442/8,688 Universal engine lines (97.17%) and 613/620 Standard core lines (98.87%). [Test ledger](tests.json) |
| Locked Windows release | The optimized CLI ran the independent oracle. The normal desktop release completed its WebView2 run under the existing Windows security policy. [Windows measurements](windows-benchmark.json) |

The independent suite uses Python arbitrary-precision integers, floor division for arithmetic right shifts and bit-string slicing for rotations. It checks binary, octal, decimal and hexadecimal output simultaneously, including fixed-width padding. Its fixtures include the 8, 16, 32, 64 and 128-bit presets and selected widths spanning 1 to 1,024 bits, including widths that do not align with octal or hexadecimal digits. The tests check that reversing a rotation recovers the word, rotations preserve the count of one bits, and NOT, XOR and two's complement obey their fixed-width identities. [Independent oracle](../../../tests/verify-programmer.py)

The focused browser suite checked all 11 operations, rendering of the integer `9007199254740993` and a 1,024-bit word preview with 64 bits per page. It verified the localized workspace in seven languages and a 320 px Arabic RTL layout with left-to-right bit positions. It also downloaded and passively reimported the exact rotation record, confirmed that only the Programmer WASM was prepared, tested calculation after an offline reload and observed pending-worker cancellation with draft recovery. [Programmer browser tests](../../../apps/web/tests/programmer.spec.ts)

The browser capture shows the navy theme, the four output bases and the highlighted sign bit for hexadecimal `80A2` at width 16. Signed decimal output is `-32606`. The capture SHA-256 is `59587873d668ea5af202a4d03ef327f519716a41ef6fc8e8ff4897c68da17105`. [Browser capture](browser.png)

## Representation and boundary checks

| Fixture | Observed result |
| --- | --- |
| Signless hexadecimal `FF` at width 8 with signed display | Binary `11111111`, octal `377`, decimal `-1` and hexadecimal `FF`. |
| Hexadecimal `80` shifted right by one at width 8 with unsigned display | Logical shift gives hexadecimal `40` and decimal `64`. Arithmetic shift extends the high bit and gives hexadecimal `C0` and decimal `192`. |
| Two's complement of decimal `-128` with signed width 8 | The fixed-width pattern remains `80` in hexadecimal. The record explains why the minimum signed value retains its pattern. |
| Rotate hexadecimal `1001` left at width 13 by `10^1023+57` | The record gives effective count `4`. The result is binary `0000000011000`, octal `00030`, decimal `24` and hexadecimal `0018`. |

The independent fixtures also check input bounds for signed decimal and raw patterns, counts at and above word width, zero-filled logical shifts, high-bit extension on arithmetic shifts and the maximum admitted 1,024-digit decimal count. Replayed records preserve the width, source base, decimal interpretation and applicable shift or wrap conditions. [Independent oracle](../../../tests/verify-programmer.py) · [Word evaluator](../../../crates/dars-universal/src/programmer.rs)

## Dependency and security checks

Programmer uses the existing arbitrary-precision Rust integer types. The Rust and npm lockfiles match the accepted Discrete Mathematics snapshot. Bounded digit and option grammars govern operands and counts, and the record retains the original display text separately from the parsed operands. The stage CI definition includes the independent reference and parity runner, and its run follows publication of the stage commit. [Request and record bounds](../../../crates/dars-universal/src/lib.rs) · [CI definition](../../../.github/workflows/ci.yml)

## Direct WASM timing

The Node runner measured initialized Programmer WASM, including Rust request decoding and calculation record serialization. Across 120 interactions after 10 warmups per expression, p50/p95/p99 were **0.0143 / 0.0512 / 0.0596 ms**. Initialization took **14.24 ms**. The WASM measured **280,291 bytes**, with observed linear memory capacity of **1,179,648 bytes**. Browser scheduling, worker startup and DOM rendering fall outside this measure. The WASM SHA-256 was `d4a788f9fc311ca77e55dc3bb675faa0703d67677906880dc1afc5e103484084`. [Parity and timing runner](../../../tests/check-programmer-targets.mjs) · [Test ledger](tests.json)

## Windows interaction and resources

With a fresh profile, the desktop reached the checked Standard result in **619.83 ms**. Selecting Programmer took **23.89 ms** to reach its visible panel. Across 39 checked conversion, XOR and left-shift interactions, p50/p95/p99 were **60.98 / 73.37 / 75.92 ms**. These times include filling the operation's fields, clicking Calculate, the worker lifecycle, computation and observation of the DOM result. All **44** observed workers closed. Win32 minimization and restoration preserved the two XOR operands and checked result, Standard retained `0.3` on return, and post-close samples showed zero descendant processes. [Windows runner](../../../benchmarks/windows-programmer.mjs) · [Measured phases](windows-benchmark.json)

The run used Windows **10.0.26200**, WebView2 **158.0.4370.33** and 20 logical processors. Each phase had six samples over about five seconds. The memory columns report median MiB for the process tree / DARS host / WebView2 auxiliaries. CPU is the sampled rate relative to one logical processor, and workers were counted at the end of each phase.

| Phase | Private resident MiB | Private commit MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visible | 98.03 / 4.33 / 93.70 | 233.52 / 6.35 / 227.18 | 0.31% | 1 |
| Programmer workload | 123.39 / 4.27 / 119.12 | 261.11 / 6.37 / 254.74 | 57.95% | 0 |
| Programmer idle | 150.88 / 4.27 / 146.61 | 285.45 / 6.37 / 279.09 | 0.00% | 0 |
| Programmer minimized | 92.49 / 4.28 / 88.21 | 253.99 / 6.37 / 247.62 | 3.38% | 0 |
| Programmer restored | 107.32 / 4.31 / 103.01 | 281.90 / 6.37 / 275.53 | 0.31% | 0 |
| After close | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00% | 0 |

Short-lived workers opened and closed between phase endpoints. Private resident memory fell during minimization. The highest median private commit occurred during the idle phase and was concentrated in WebView2. The measurement covers one short cycle. The incremental 100 MB physical-memory target and longer-cycle retention remain open. [Memory debt and protocol](../../objective-02/revision-02/memory-debt.md)

The executable SHA-256 was `3c40f2029a91b2713a16b78e3603b6bdedbe71a32d1fdd90d3bfde6ff8004615`. The Windows capture SHA-256 was `ff40cf2c2b990800ce21d49c2466d226d68c7f2b3057d1e65367b9ab9b94eeda`. Visual inspection confirmed the navy theme, the XOR inputs `170` and `85` and the exact width-8 result `255` in decimal and `FF` in hexadecimal. [Windows capture](windows.png)

## Reproduction

Use the pinned Rust and Node toolchains from the repository root. The Programmer oracle uses the Python standard library. If Playwright Chromium is unavailable, set `DARS_CHROME_EXECUTABLE` to the installed browser executable for the standalone offline script.

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -B tests/verify-programmer.py target/release/dars.exe
node tests/check-programmer-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-programmer.mjs target/release/dars-desktop.exe
```
