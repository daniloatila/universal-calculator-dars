# Objective 04 correction review

[Português brasileiro](REPORT.pt-BR.md) · [Comparison contract](comparison-contract.md)

The independent assessment awarded 91/100 to the 0.4.0 candidate and deferred approval. This revision addresses two reproduced comparison issues within the Objective 04 review branch. [Findings](findings.json)

- The 0.4.0 Windows application showed a 0.11 difference and 110% relative variation between 10% per semester and 21% per year. The archived proof contained the two displayed numbers without the original rates' financial periods. [Original proof and display](before-windows.json)
- The original Loans comparison returned proposal 1 as the minimum nominal-cost result even though the two loans had different principals and maturities. The corrected adapter restricts the selection to proposals with compatible principal, duration, payment dates and settlement conventions. [Original CLI proof](loan-selection-v040.json)

The new Rust comparison derives explicit financial context by recalculating the operands. Eligible rate conversions preserve the exact effective annual anchor. In this fixture both annual rates equal 21/100, so the difference is exactly zero. The five module catalogs distinguish currencies, periods, horizons, cash-flow basis, tax rules and gross, net, nominal or real returns where relevant. [Compatibility matrix](compatibility-matrix.json) · [Reproduction](reproduction.md)
