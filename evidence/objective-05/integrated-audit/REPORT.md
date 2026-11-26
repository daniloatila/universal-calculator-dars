# Integrated audit · Objective 05

[Português brasileiro](REPORT.pt-BR.md) · [Objective report](../REPORT.md)

**DARS 0.5.0 · READY_FOR_REVIEW**

The audited source is `50225fb5dccb677b10653058f81d89c168a5743c`. Its production browser asset-set SHA-256 is `9e19135cd5e85d01f60ae30c0a2b891de49ca696ec252c2cc61ec42889f1b491`. The GitHub Actions run `45860076452` passed four jobs. The verified package ran on physical Windows with WebView2. The [acceptance ledger](../acceptance.json) maps all 27 criteria from Section 19 of the owner's authorization. [Artifact inventory](artifacts.json) · [Hosted jobs](ci.json) · [GitHub Actions run](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45860076452)

## Numerical and operational checks

| Workspace | Independent local validation | Native/WASM or contract comparison |
| --- | ---: | ---: |
| Statistics | 213 | 20 |
| Probability | 277 across 17 distribution families | 57 |
| Simulation | 57 | 11 plus 36 same-target batch replays |
| Optimization | 39 plus 2 boundary cases | 17 |
| Physics & Engineering | 47 | 14 |
| Graph Lab | 25 plus 10 boundary cases | 16 |
| Data Lab | 55 independent import checks | 20 |

The test ledger preserves the binary and WASM hashes emitted by each suite. Those receipts can cover overlapping workflows and use different local binaries. The 21 Standard Rust integration tests, 133 Universal Rust tests and 70 Node checks are recorded separately. LLVM covered 5,734 of 5,983 included Rust source lines (95.84%) both locally and on hosted Ubuntu, across seven modules and the two shared scientific kernels. The Rust crates, workspace manifest, lockfile and toolchain pin are identical from the recorded local numerical source `1c816567d91524430779c93cf3c90984dfdcc99a` to the audited source. Independent comparisons and measured behavior establish correctness within their admitted ranges. [Test ledger](../tests.json) · [Local coverage](../coverage.json) · [Hosted coverage](coverage-linux.json)

Simulation uses a versioned PCG32 stream and records the seed, workload and aggregation. The local browser and numerical oracles distinguish VaR 56 at `0.56` from VaR 57 at `0.560000000000000000000001` for the same 100 observations. Both display the approximate level 0.56. The exact decimal in the proof preserves the distinction. The separate signed-loss check retains small financial losses and gains even when rounded wealth equals the invested capital. [Simulation](../simulation/REPORT.md) · [Browser ledger](browser.json)

## Production web and regression

Local Chrome 158.0.8127.38 passed 224 tests, including all 172 inherited checks and 52 scientific checks. Hosted Ubuntu Chromium also passed 224 tests. Browser evidence includes rendering 2D and 3D graphs, preserving the mathematical proof across the five resource profiles, inspecting graphs by keyboard, processing tabular data, replaying a pipeline and recovering after cancellation in Simulation, Optimization and Data Lab. Renderer recovery was exercised by dispatching context events on the real Canvas. The full notation matrix records 420 mathematical, 210 financial and 294 scientific proof comparisons across 42 directed language pairs. Scientific labels were checked in all seven languages and Arabic RTL at 320 CSS pixels. [Browser ledger](browser.json) · [Language matrix](../locale-transition-matrix.json) · [Hosted jobs](ci.json)

All seven science workspaces calculated after a warmed offline reload, with zero requests outside the preview origin during the observed browser checks. Separate production suites ran 10 offline web checks and five offline financial examples. The inherited mapping accounts for 602 checks, including 17 physical Windows checks, two hosted credential checks and five hosted capability checks. It also tracks 2,355 advanced mathematical oracle cases, 305 advanced mathematical CLI/WASM checks, 577 independent financial cases, 49 baseline financial CLI/WASM checks and two semantic comparison suites of 84 cases each, with 79 proof replays per suite. [Regression mapping](../regression.md) · [Windows regression](windows-regression.json) · [Hosted jobs](ci.json)

## Physical Windows

The verified AMD64 executable came from hosted artifact `15137777779`. The verifier matched the archive digest, the executable digest and the source metadata. Physical WebView2 158.0.4370.33 read back all 22 packaged WASM assets and matched the hosted manifest. The candidate ran all seven science workspaces offline and revisited Graph Lab and Data Lab in three cycles. All 11 science workers closed, and the candidate process tree reached zero after exit. The separate native financial suite passed its five offline examples. The comparator normalized both historical rates to `21/100` with exact difference zero and reproduced the imported scenario. [Artifact receipt](windows-artifact.json) · [Physical execution](windows-candidate.json) · [Offline finance](windows-finance-offline.json) · [Comparator replay](windows-finance-comparison.json)

## Performance, memory and security

Local Node WASM benchmarks record initialized request-to-proof latency and linear allocation. The separate native Simulation benchmark records end-to-end process time for 100,000 normal draws and for two-million-step random-walk and financial workloads. Data Lab exercised synthetic three-column CSV imports at 1,000, 10,000, 100,000 and 200,000 rows. At 200,000 rows, a 3,000,015-byte CSV took about 169 ms to import and 149 ms to profile in the independent Node process. The receipt preserves input size, value types, RSS, JavaScript heap, peak RSS and WASM linear capacity. [Benchmarks](../benchmarks.json) · [Data volume measurements](../data-lab/benchmarks.json)

In one paired Windows session, startup to the first checked Standard result was 591.84 ms for 0.4.1 and 603.52 ms for 0.5.0. The median private resident memory of the visible Standard process tree was 99.82 MiB and 98.45 MiB respectively, with six samples per version. Private commit, process working sets and whole-system memory remain distinct measurements. The less-than-100-MB incremental physical RAM target remains open for the full attribution and retention protocol. [Windows method](windows-method.md) · [Paired observations](../benchmarks.json) · [Memory debt protocol](../../objective-02/revision-02/memory-debt.md)

The Price benchmark reran matched 360- and 600-period cases on the candidate WASM. The two 600-period final-rounding comparison samples were 9.29 and 9.38 seconds under the 15-second worker budget. The 0.4.1 samples were 10.71 and 11.04 seconds. The runs use the same CPU model and scenario settings, with different Node versions, host activity and binaries. [Price comparison](finance-price.json)

The local Cargo advisory snapshot reported zero vulnerability-class entries and three inherited informational advisories. npm audit reported zero vulnerabilities. The exact-source GitHub Actions security job passed. Malformed and oversized files, workbook formula caches, HTML-like data and protected CSV export are exercised by local fixtures. The audited modules process these inputs inside the local worker and WASM environment. [Security receipt](security.json) · [File and privacy checks](../security.md)

The audited source and evidence accompany the dedicated review-branch delivery. The branch's final evidence commit is verified by Git readback outside these records. The owner approval gate remains in effect for Objective 06. [Acceptance](../acceptance.json)
