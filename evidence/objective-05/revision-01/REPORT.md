# Data Lab corrective review 0.5.1

[Português brasileiro](REPORT.pt-BR.md) · [Acceptance ledger](acceptance.json) · [Findings](findings.json)

**Objective 05 — READY_FOR_REVIEW.** The independent assessment rated 0.5.0 at 89/100 and requested three corrections. This revision confirmed all three findings. Objectives 01 through 04 remain approved. Objective 06 requires separate authorization.

| Finding | Observed in 0.5.0 | Observed in 0.5.1 |
| --- | --- | --- |
| Mixed JSON under comma notation | Only the string `"2,50"` contributed. One observation, sum and mean 5/2. | The native number `1.25` and the string are valid. Two observations, exact sum 15/4 and mean 15/8. |
| A direct date and a stored formula date | Formula origin displaced date classification. The cached serial entered a requested decimal sum. | Both cells retain format, epoch and date. Formula and cache state remain inspectable. Neither date enters a decimal sum. |
| Resource admission | File size and individual limits left materialized data and output allocations unaccounted for. A byte-budget option was unrecognized. | Import, transforms, analysis and outputs share an allowance. Small ordinary inputs were refused at low budgets and recovery succeeded. |

Both receipts preserve the same synthetic bytes, cell views and proofs. Version 2 replays bind SHA-256 and recorded configuration to the source. Migrating a version 1 proof requires explicit confirmation. [Before](before.json) · [After](after.json) · [Reproduction](reproduction.md) · [Data contract](data-type-contract.md) · [Compatibility](compatibility.md)

### Verification

The matrix maps the 23 requested behaviors. The Python oracle ran 23 case groups and compared 31 native and WASM requests. Decimal and Fraction supplied exact references. pandas and openpyxl opened both calendar fixtures. For serial 60.5 in the 1900 system, openpyxl returned February 28 at noon. DARS preserves the serial and marks the fictitious date as lacking a Gregorian representation. [Test matrix](tests.json) · [Oracle and reader versions](oracle.json)

The regression maps all 602 historical checks, 2,355 advanced mathematics cases, 305 mathematics CLI/WASM comparisons, 577 financial cases, 84 independent financial comparisons, 84 financial CLI/WASM comparisons and 79 comparative proof replays. All 36 chunked simulations reproduced the one-shot proof. Hosted Chromium passed 232 tests. The locale matrix exercised 924 transitions across 22 modules. The physical Windows test passed its 17 historical checks, five offline finance examples and seven offline science examples. [Regression](regression.md) · [Chrome](browser.json) · [Locales](locale-transition-matrix.json) · [Windows](windows-method.md)

Scientific line coverage on Linux reached **96.00%** (6822/7106). Data Lab reached 95.38% and Optimization reached 93.69%. Some defensive loop exits and coefficient parsing paths remain uncovered in Optimization. New tests exercised temporal keys, exact arithmetic limits, output admission and linear-program constraint scaling. [File-level coverage](coverage.json)

### Performance and limits

Sequential bounded child processes ran each workload three times. Both versions returned exact sums on every admitted workload. The 0.5.1 default 192 MiB allowance admitted 100,000 rows. It rejected 200,000 three-column rows. At an explicit allowance of 256 MiB, the same data imported, grouped and profiled in full. The receipt distinguishes open time, estimated extra grouping time, analysis, RSS, private memory, linear WASM memory and modeled operating costs. [Benchmarks](benchmarks.json) · [Resource model](resource-budget.md)

Medians of three processes per workload, in milliseconds. Each pair shows 0.5.0 → 0.5.1. The extra grouping column is the difference between median open times with and without grouping.

| Rows × columns | Import and initial typing | Estimated extra grouping | Profile and proof | Peak RSS (MiB) |
| --- | ---: | ---: | ---: | ---: |
| 1000 × 3 | 5.4 → 5.6 | 4.4 → 4.5 | 5.9 → 6.2 | 52.9 → 60.2 |
| 10000 × 3 | 16.0 → 18.0 | 12.2 → 8.7 | 10.8 → 10.9 | 59.0 → 64.8 |
| 100000 × 3 | 82.3 → 93.3 | 70.7 → 65.5 | 68.8 → 68.4 | 96.6 → 101.2 |
| 200000 × 3 | 180.8 → 181.5 | 137.5 → 133.3 | 140.8 → 129.9 | 132.4 → 135.5 |
| 1000 × 12 | 7.6 → 7.7 | 4.7 → 5.0 | 6.4 → 6.3 | 53.5 → 61.3 |
| 10000 × 12 | 36.4 → 34.9 | 14.4 → 10.0 | 15.1 → 11.9 | 65.3 → 72.1 |
| 1000 × 4 | 23.7 → 19.8 | 4.3 → 3.7 | 7.3 → 6.2 | 55.3 → 63.0 |

At visible basic-mode idle, the process-tree private working-set median was 121,049,088 bytes on 0.5.0 and 119,152,640 bytes on 0.5.1. The target of less than 100 MB incremental physical RAM remains open. The paired measurements and system-wide deltas cannot attribute all shared pages. Spreadsheet formulas use stored caches, which may be stale. [Windows measurement](windows-candidate.json) · [RAM follow-up](../../objective-02/revision-02/memory-debt.md) · [Security](security.md)

All four jobs passed on the source commit. The final evidence commit receives a separate run on this branch. Objective 05 now awaits a new independent review. [Audited code](https://github.com/daniloatila/universal-calculator-dars/commit/cda90d89ada0be4974655ccf746c78e3e61bc3bc) · [Source CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45889156643)
