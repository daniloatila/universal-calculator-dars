# Objective 05 · Science, engineering and data

[Português brasileiro](REPORT.pt-BR.md) · [Acceptance](acceptance.json) · [Reproduction](reproduction.md)

**READY_FOR_REVIEW.** The audited source is `50225fb5dccb677b10653058f81d89c168a5743c`. All 602 inherited checks were reconciled against their original suites and the current runs. Hosted Chromium passed 224 tests on Ubuntu and Linux instrumented line coverage also reached 95.84%. All four jobs passed on the audited source. Objective 05 awaits the owner’s decision on the review branch. [GitHub Actions](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45860076452) · [Integrated audit](integrated-audit/REPORT.md)

DARS 0.5.0 adds seven workspaces and brings the shared Windows and browser interface to 22 modules. Objective 04 was approved at 95/100. Its approved 0.4.1 code and evidence were fast-forwarded into main, preserving both commits and the original review branch. Objective 05 is delivered on its own review branch. Objective 06 remains NOT_STARTED. [Owner authorization record](../objective-04/approval.json)

| Workspace | Behavior established by independent checks |
| --- | --- |
| [Statistics](statistics/REPORT.md) | On 1, 2, 3, 4, 5, the mean and median are 3, population variance is 2 and sample variance is 5/2. The suite exercises descriptive statistics, inference, correlation and regression, including missing values and degenerate models. |
| [Probability](probability/REPORT.md) | All 17 distribution families are exercised. The standard normal CDF at zero is 0.5 and Binomial(10, 0.5) has mass 0.24609375 at five. The audit includes tails, quantiles and central counts in a million trials. |
| [Simulation](simulation/REPORT.md) | The seed, PCG32 version, sample counts, distributions and aggregation are recorded. Thirty-six chunked runs matched the one-shot proof byte for byte. Exact decimal risk levels select distinct empirical ranks across a decimal boundary. |
| [Optimization](optimization/REPORT.md) | Root and extremum methods report residual, tolerance and stopping status. Nonconvex, discontinuous and cancellation-sensitive inputs are covered. Bounded, infeasible and unbounded linear programs have separate outcomes. |
| [Physics & Engineering](physics-engineering/REPORT.md) | Dimension checks precede calculation. Applying 12 V across 6 Ω gives 2 A and 24 W. Exact unit relationships and measured constants are distinguished. |
| [Graph Lab](graph-lab/REPORT.md) | The real browser renders 2D and 3D, including a gap at a singularity, keyboard inspection, camera movement and local exports. All five adaptive profiles preserve the associated numerical proof. |
| [Data Lab](data-lab/REPORT.md) | CSV, TSV, flat JSON and XLSX were imported locally. Tests cover exact long numbers, stored formula caches, sparse cells, typed pipelines, hash-bound proofs and explicit CSV protection. |

## Integrated evidence

Physical Chrome passed 224 cases, including the 172 inherited tests. The matrix contains 924 proof comparisons across 42 directed language transitions and 22 modules. The standalone warmed finance examples and all seven new modules were exercised offline. The operations include worker cancellation followed by a successful successor. The Rust and Node checks and inherited mathematical, finance and proof-replay workloads are recorded separately to avoid double-counting. [Browser](integrated-audit/browser.json) · [Language matrix](locale-transition-matrix.json) · [Regression](regression.md) · [Test ledger](tests.json)

Local LLVM instrumentation covered 5,734 of 5,983 included Rust source lines (95.84%). The individual reports retain each module's denominator. Coverage excludes the UI and complements analytical oracles and device tests. In a fresh Node process per size, an exact three-column CSV profile was checked at 1,000, 10,000, 100,000 and 200,000 rows. At 200,000 rows the 3,000,015-byte file took about 169 ms to import and 149 ms to profile on this machine. [Coverage](coverage.json) · [Benchmarks](benchmarks.json) · [Data measurements](data-lab/benchmarks.json)

The graph context-recovery check dispatched context events on the actual Canvas renderer. The independent evidence does not include a physical GPU fault, a mobile-device benchmark or a signed distribution release. The extended Windows memory-retention study remains assigned to the pre-1.0 audit. [Compatibility](compatibility.md) · [Security](security.md) · [Dependency selections](dependencies.md) · [Corrections](changes.md)

On physical Windows all seven workspaces calculated offline and all 22 packaged WASM hashes were read back from the executable. Standard reached its first checked answer in 592 ms on 0.4.1 and 604 ms on 0.5.0, one observation per version. Median private working set at idle was 119,242,752 and 117,948,416 bytes respectively. All 11 scientific workers closed across three cycles of graphing and data work. Both process trees reached zero after exit. [Windows 0.5.0](integrated-audit/windows-candidate.json) · [Paired 0.4.1 run](integrated-audit/windows-baseline.json) · [Memory follow-up](../objective-02/revision-02/memory-debt.md)
