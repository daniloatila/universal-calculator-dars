# Objective 04 correction review

[Português brasileiro](REPORT.pt-BR.md) · [Comparison contract](comparison-contract.md)

The independent assessment awarded 91/100 to the 0.4.0 candidate and deferred approval. This revision addresses the scenario comparison issue and three additional findings reproduced during the review. [Findings](findings.json)

- The 0.4.0 Windows application showed a 0.11 difference and 110% relative variation between 10% per semester and 21% per year. The archived proof contained the two displayed numbers without the original rates' financial periods. [Original proof and display](before-windows.json)
- The original Loans comparison returned proposal 1 as the minimum nominal-cost result even though the two loans had different principals and maturities. The corrected adapter restricts the selection to proposals with compatible principal, duration, payment dates and settlement conventions. [Original CLI proof](loan-selection-v040.json)
- An intermediate 0.4.1 build displayed a nonzero exact difference of 10⁻²⁴ as zero at 16 decimal places. The comparison now displays `≈0` and the proof retains the exact fraction. [Precision regression](../../../apps/web/tests/finance-comparison.spec.ts)
- An intermediate build displayed a dated loan cost difference to 16 decimal places despite each solver stopping at 10⁻¹². The comparison proof now reports the stopping tolerances and limits displayed precision. Differences too small to resolve are withheld. [Original estimate and independent calculation](approximation-intermediate.json)

The new Rust comparison derives explicit financial context by recalculating the operands. Eligible rate conversions preserve the exact effective annual anchor. In this fixture both annual rates equal 21/100, so the difference is exactly zero. The five module catalogs distinguish currencies, periods, horizons, cash-flow basis, tax rules and gross, net, nominal or real returns where relevant. [Compatibility matrix](compatibility-matrix.json) · [Reproduction](reproduction.md)

## Verification

The independent Python oracle and native/WASM parity each passed 84 cases, including 79 proof replays. Chrome passed 172 tests, including 12 for the revised comparator. The language matrix verified 420 mathematical and 210 financial proof comparisons across 42 directed transitions in seven languages. The existing 2,355 advanced mathematical cases, 305 mathematical CLI/WASM cases and 577 financial cases also passed. The test ledger maps the inherited checks by suite. [Test ledger](tests.json) · [Language matrix](locale-transition-matrix.json) · [Regression mapping](regression.md)

Sixteen validated Price samples exercised 360 and 600 installments with final or per-row settlement in the local Windows WASM engine. The slowest measured request was a 600-installment detailed comparison at 11.04 seconds under the 15-second worker deadline. Per-row settlement was faster and produced different contractual totals. The benchmark uses two samples per path on one Windows host. [Measurements and limits](benchmarks.json)

The hosted Windows x64 executable ran on local WebView2 158.0.4370.33. The archive and executable matched the Actions digests, and the app served the 15 recorded WASM assets with matching hashes from its local origin. The unsigned review executable passed the 17 historical UI checks and the five offline finance examples. [Provenance and readback](windows-artifact.json) · [Historical UI checks](windows-regression.json) · [Offline examples](desktop.json)

The rate fixture produced an exact zero in the installed Windows runtime. Reopening the 0.4.0 scenario file rebuilt the same normalized input and result. The comparative proof used 6,008 bytes, compared with 3,128 bytes in 0.4.0, and the new recipe file used 1,081 bytes. One worker ran at a time. The audit observed zero external HTTP requests and no application descendants after closing. [Corrected interface](after-windows.png) · [Calculation Proof](comparison-proof.json) · [Windows result](after-windows.json)

The paired Standard run measured median private working set of 103.49 MB in 0.3.1 and 103.88 MB in 0.4.1. These are process measurements. The target for less than 100 MB of incremental physical RAM remains open. [Paired measurements](desktop.json) · [Memory follow-up](../../objective-02/revision-02/memory-debt.md)

All 602 mapped historical checks passed. The hosted Ubuntu job measured 97.26% financial line coverage across 6,208 instrumented lines. Ubuntu, Windows, macOS and security completed successfully on the audited source commit `5329e697a105685f3206d14adac9832224bcf53e`. [Coverage](coverage.json) · [CI](ci.json) · [GitHub Actions](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45846772329)

Objective 04 is `READY_FOR_REVIEW`. Objectives 01 through 03 are approved. Objective 05 remains `NOT_STARTED`. The branch awaits independent review and an explicit owner decision. [Acceptance](acceptance.json)
