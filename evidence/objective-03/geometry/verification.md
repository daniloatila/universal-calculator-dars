# Geometry · Stage verification

[Português brasileiro](verification.pt-BR.md) · [Mathematical and resource limits](limits.md) · [Calculation record contract](../calculation-proof/contract.md) · [Stage plan](../PLAN.md) · [Test ledger](tests.json)

These results cover the Geometry stage of Objective 03, its exact and symbolic results, geometric constraints, calculation records and the regressions for previously delivered modules.

## Verified locally

| Verification | Observed result |
| --- | --- |
| Independent SymPy reference on the Windows CLI | 159 passed, 0 failed on optimized and instrumented builds with SymPy 1.14.0. The total covers all 11 operations, 46 structured rejections, six replays with identical calculation records and one original-input provenance check. [Independent oracle](../../../tests/verify-geometry.py) |
| Geometry CLI and WASM | 32 complete responses matched. Four additional module-isolation checks passed. [Parity runner](../../../tests/check-geometry-targets.mjs) |
| Rust tests for default workspace members | 52 passed across the Standard core (16) and Universal engine (36). Rust formatting and default-member Clippy passed. |
| Web Node tests | 65 passed, 0 failed. |
| Installed Chrome on Windows | 59 passed on the final distribution, including all seven Geometry tests. [Browser observations](browser.json) · [Browser capture](browser.png) |
| Offline and lazy locales | 10 standalone checks passed on the final distribution. The Geometry browser case also verified module isolation and offline calculation. [Offline runner](../../../tests/verify-web-offline.mjs) |
| Standard regressions | 157 independent rational and decimal cases, 20 CLI/WASM comparisons and 291 structured value cases passed. [Independent oracle](../../../tests/oracle.py) · [Parity runner](../../../tests/check-targets.mjs) · [Structured oracle](../../../crates/dars-core/tests/structured-oracle.py) |
| Scientific, Algebra, Calculus and Linear Algebra regressions | Independent references passed 177, 184, 210 and 223 cases, respectively. The CLI/WASM runs matched 19, 28, 27 and 30 records, respectively. [Scientific](../scientific/verification.md) · [Algebra](../algebra/verification.md) · [Calculus](../calculus/verification.md) · [Linear Algebra](../linear-algebra/verification.md) |
| Line coverage | Instrumented Rust tests and native CLI oracles covered 851/865 Geometry lines (98.38%), 6,829/7,047 Universal engine lines (96.91%) and 613/620 Standard core lines (98.87%). [Test ledger](tests.json) |
| Locked Windows release | The optimized CLI ran the independent oracle. The normal desktop release completed its WebView2 run under the existing Windows security policy. [Windows measurements](windows-benchmark.json) |

The independent suite uses exact rational coordinates, an oriented triangle fan for polygon measures and a separate linear-system calculation for segment intersections. It compares length, square and cubic units in the calculation record. It also checks whether rotation, translation, reflection and scaling preserve or change the expected quantities. The polygon cases include a valid 32-vertex boundary, a self-crossing boundary with nonzero signed area, backtracking and nonadjacent touching. The angle cases cover degrees, radians, 2D and 3D, and admissible collinear rays. [Independent oracle](../../../tests/verify-geometry.py) · [Cartesian engine](../../../crates/dars-universal/src/geometry/cartesian.rs)

The focused browser suite checked all 11 operations, seven locales, localized decimal input and the 320 px Arabic RTL layout. The diagram test observed reduced detail in the Ultra Light profile and full detail in Maximum, a painted Canvas, zero additional draws over a 280 ms idle interval and a released Canvas on return to Standard. The record test downloaded and passively reimported a sphere result with `cm^2` for surface area and `cm^3` for volume. Other cases verified one isolated Geometry WASM in the offline cache, a result after offline reload and worker termination with draft recovery on module switch. [Geometry browser suite](../../../apps/web/tests/geometry.spec.ts)

The browser capture shows the navy theme, a full-detail segment diagram and the exact crossing point `[2,2]` in centimeters. Its SHA-256 is `0e8f61cd1b40cf1bede1c0bb340e775a5c548b81566bc74d1efbcb3a0403c5cc`. [Browser capture](browser.png)

## Representative exact and symbolic checks

| Fixture | Observed result |
| --- | --- |
| Triangle with sides `3 4 5` in `cm` | Perimeter `12 cm`, area `6 cm^2`, scalene, right. |
| Rectangular polygon with adjacent side lengths `10^20` and `10^-20` | Exact area `1` in square units and counterclockwise orientation. |
| Two nearly collinear segments crossing with endpoint offsets of `10^-23` | Proper crossing at the exact point `[1/2,1/2]`. The result retains the coordinate unit. |
| Rays from the origin through `(1,0,1)` and `(0,1,1)` | Exact symbolic angle `pi/3` with the record unit `rad`. |

The oracle verifies these results as rationals or symbolic expressions. Precision, tolerance and certified error bounds remain null in the calculation records. [Independent oracle](../../../tests/verify-geometry.py) · [Calculation record contract](../calculation-proof/contract.md)

## Dependency and security checks

Geometry uses the existing Rust rational arithmetic types. The Rust and npm lockfiles match the accepted Linear Algebra snapshot. The earlier verification records the dependency scan and official registry check for the additions in that stage. All four Linear Algebra CI jobs passed. Geometry CI includes the independent SymPy and CLI/WASM runners, and its run follows publication of the stage commit. [Linear Algebra dependency and security evidence](../linear-algebra/verification.md#dependency-and-security-checks) · [Linear Algebra CI record](../linear-algebra/ci.json) · [CI definition](../../../.github/workflows/ci.yml)

## Direct WASM timing

The Node runner measured initialized Geometry WASM, including Rust request decoding and calculation record serialization. Across 120 interactions after 10 warmups per expression, p50/p95/p99 were **0.0293 / 0.1089 / 0.1215 ms**. Initialization took **12.90 ms**. The WASM measured **475,212 bytes**, with observed linear memory capacity of **1,179,648 bytes**. Browser scheduling, worker startup and DOM rendering fall outside this measure. The WASM SHA-256 was `ccc38b66a109d54e6e41d031d4920e82782b9147c6fb16f79c1c2144414d12c4`. [Parity and timing runner](../../../tests/check-geometry-targets.mjs) · [Test ledger](tests.json)

## Windows interaction and resources

With a fresh profile, the desktop reached the checked Standard result in **629.05 ms**. Selecting Geometry took **26.12 ms** to reach its visible panel. Across 36 checked rectangle and Cartesian distance interactions, p50/p95/p99 were **62.96 / 76.69 / 77.52 ms**. The interval includes filling the operation's fields, clicking Calculate, worker lifecycle, computation and observation of the DOM result. All **41** observed Geometry workers closed. Win32 minimization and restoration preserved both rectangle fields and the checked result, Standard retained `0.3` on return, and post-close samples showed zero descendant processes. [Windows runner](../../../benchmarks/windows-geometry.mjs) · [Measured phases](windows-benchmark.json)

The run used Windows **10.0.26200**, WebView2 **158.0.4370.33** and 20 logical processors. Each phase had six samples over about five seconds. The memory columns report median MiB for the process tree / DARS host / WebView2 auxiliaries. CPU is the sampled rate relative to one logical processor, and workers were counted at the end of each phase.

| Phase | Private resident MiB | Private commit MiB | CPU | Workers |
| --- | ---: | ---: | ---: | ---: |
| Standard visible | 101.20 / 3.58 / 97.63 | 236.59 / 5.20 / 231.39 | 1.23% | 1 |
| Geometry workload | 126.50 / 4.52 / 121.98 | 265.79 / 6.16 / 259.63 | 60.79% | 0 |
| Geometry idle | 148.46 / 4.52 / 143.95 | 286.55 / 6.16 / 280.39 | 0.00% | 0 |
| Geometry minimized | 90.54 / 3.61 / 86.93 | 233.20 / 5.50 / 227.71 | 2.47% | 0 |
| Geometry restored | 106.04 / 4.54 / 101.50 | 337.66 / 6.18 / 331.48 | 0.00% | 0 |
| After close | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00% | 0 |

Short-lived workers opened and closed between phase endpoints. Private resident memory fell during minimization. The highest private commit occurred after restoration and was concentrated in WebView2. The measurement covers one short cycle. The incremental 100 MB physical-memory target and longer-cycle retention remain open. [Memory debt and protocol](../../objective-02/revision-02/memory-debt.md)

The executable SHA-256 was `8d42a87a89e725232b24caa22c227280d95c0b25b71b2b5f2c07ff2992fa963b`. The Windows capture SHA-256 was `f6fec694b0976cac7cd9878f53d8c845bce5df0f235d1c658ed04bb6f7f55649`. Visual inspection confirmed the navy theme, the `3` by `4` rectangle and the displayed exact area `12 u²` and perimeter `14 u`. [Windows capture](windows.png)

## Reproduction

Use the pinned Rust and Node toolchains from the repository root. Install the test-only references in a separate environment. If Playwright Chromium is unavailable, set `DARS_CHROME_EXECUTABLE` to the installed browser executable for the standalone offline script. [Oracle dependencies](../../../tests/math-oracle-requirements.txt)

```powershell
cargo fmt --all -- --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --release -p dars-cli
node scripts/build-wasm.mjs
python -m venv .tooling/math-oracle-venv
$oraclePython = '.tooling/math-oracle-venv/Scripts/python.exe'
& $oraclePython -m pip install --only-binary=:all: --require-hashes -r tests/math-oracle-requirements.txt
& $oraclePython -B tests/verify-geometry.py target/release/dars.exe
node tests/check-geometry-targets.mjs target/release/dars.exe
npm run build --prefix apps/web
npm test --prefix apps/web
$env:DARS_BROWSER_CHANNEL = 'chrome'
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
cargo build --locked --release -p dars-desktop
node benchmarks/windows-geometry.mjs target/release/dars-desktop.exe
```
