# Objective 04 correction review

[Português brasileiro](REPORT.pt-BR.md) · [Comparison contract](comparison-contract.md)

The independent assessment awarded 91/100 to the 0.4.0 candidate and deferred approval. This revision addresses the scenario comparison issue and three additional findings reproduced during the review. [Findings](findings.json)

- The 0.4.0 Windows application showed a 0.11 difference and 110% relative variation between 10% per semester and 21% per year. The archived proof contained the two displayed numbers without the original rates' financial periods. [Original proof and display](before-windows.json)
- The original Loans comparison returned proposal 1 as the minimum nominal-cost result even though the two loans had different principals and maturities. The corrected adapter restricts the selection to proposals with compatible principal, duration, payment dates and settlement conventions. [Original CLI proof](loan-selection-v040.json)
- An intermediate 0.4.1 build displayed a nonzero exact difference of 10⁻²⁴ as zero at 16 decimal places. The comparison now displays `≈0` and the proof retains the exact fraction. [Precision regression](../../../apps/web/tests/finance-comparison.spec.ts)
- An intermediate build displayed a dated loan cost difference to 16 decimal places despite each solver stopping at 10⁻¹². The comparison proof now reports the stopping tolerances and limits displayed precision. Differences too small to resolve are withheld. [Original estimate and independent calculation](approximation-intermediate.json)

The new Rust comparison derives explicit financial context by recalculating the operands. Eligible rate conversions preserve the exact effective annual anchor. In this fixture both annual rates equal 21/100, so the difference is exactly zero. The five module catalogs distinguish currencies, periods, horizons, cash-flow basis, tax rules and gross, net, nominal or real returns where relevant. [Compatibility matrix](compatibility-matrix.json) · [Reproduction](reproduction.md)
