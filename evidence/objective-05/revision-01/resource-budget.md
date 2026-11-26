# Data Lab resource budget

[Português brasileiro](resource-budget.pt-BR.md)

Data Lab 0.5.1 uses `data-lab-estimated-live-v1` to admit work before growing data and buffers. The resource policy is part of a version 2 dataset recipe. The limit is an estimate applied to one dataset session and its current operation. Measured process resident memory, process private commit, JavaScript heap and WASM linear capacity have separate accounting scopes.

| Limit | Value |
| --- | --- |
| Explicit `resource_budget_bytes` | Integer from 65,536 to 268,435,456 bytes. Native and low-level WASM default 192 MiB. |
| DARS Adaptive ceilings | Ultra Light 32 MiB, Efficiency 64 MiB, Balanced 128 MiB, Performance 192 MiB, Maximum 256 MiB. An explicit smaller cap remains part of the selected recipe. |
| Source and configuration | 16 MiB source, 16 KiB UTF-8 configuration. Ingress admits up to `min(16 MiB, floor((limit − 32768 − 8 × settings_bytes)/3))`. Rust uses the larger of submitted and normalized configuration sizes for ingress. |
| Structure | 200,000 data rows, 64 columns, 1,200,000 cells, 4,096 UTF-8 bytes per cell field, 32 pipeline steps and 12,000,000 cell visits over the pipeline. |
| Workbook | 256 ZIP entries. Declared expanded parts up to 24 MiB each and 48 MiB combined, XML nesting up to 32, and up to 4,096 formatting definitions or indices. |
| Preview, proof and export | Up to 100 rows and 4 MiB per preview page, 4 KiB replay descriptor, 32 KiB proof result and 128 KiB proof envelope, 32 MiB generated CSV. Available resource budget applies at each boundary. |

The ledger carries three estimated source copies, eight modeled bytes per UTF-8 byte of normalized configuration, and 32 KiB for bounded bookkeeping. Portable structural charges cover vector slots, reallocation overlap, retained text, formulas and metadata. The ordinary table model uses 80 bytes per row, 256 bytes per cell and 192 bytes per column, with additional checks based on retained vector capacities. Nonempty text carries three times its UTF-8 length plus 32 bytes. Workbook metadata and shared text references are charged as the records that use them are retained. Read and transform work can reach their own limits before the structural caps.

| Stage | Allocations checked |
| --- | --- |
| Ingress | CLI reads at most the admitted length plus one sentinel. The active frontend checks `File.size`, the configuration and its current profile before reading or transferring source bytes. Rust repeats admission for the normalized configuration. |
| Import | Decoding and parser buffers, CSV record dimensions before reader growth, JSON token scratch and row mappings, and compressed archive metadata. XLSX checks declarations before decoding a part and reserves twice its declared content plus a 96 KiB decoder allowance, with per-event XML workspaces and per-cell charges before shared text, formula metadata, or sparse cell slots are materialized. |
| Cast and transform | The current table plus simultaneous construction. Charges cover cloned cells, appended fields, replacement text, sort and deduplication keys, group accumulators, exact rational workspaces, join tables, and temporary vectors. The retained estimate is recalculated between steps. The next step includes the table produced by previous steps. |
| Analysis | Temporary rational sample storage, sort space and a finite exact-arithmetic workspace. Rational results are checked against the numerical domain limits and charged before conversion to result text. |
| Page, proof and export | Borrowed page serialization avoids a second materialized table. The output writer checks buffer growth, coexistence of old and new buffers, and a boundary copy before reserving capacity. Protected and literal CSV share this writer and cap. The browser worker reports its live response reserve back to Rust before producing the next output, which keeps an earlier result in the estimate throughout the remaining work. |

`resource_budget` identifies a configuration or operation whose estimated additional live storage would exceed the configured cap. `limit` identifies a hard source, shape, numerical or output cap. A failed import or pipeline produces no dataset. A rejected preview or export leaves the dataset available for a smaller request. Existing precision, row counts and exact results are unchanged for admitted work. The resource policy is recorded in the proof. Stable replay charges the normalized configuration, verifies the source hash and uses the recorded limit. A lower host profile can require an explicit new run.

`resource_diagnostics()` reports the configured and base bytes, highest admitted estimate, the stage with the largest estimate, and per-stage estimates. It can include reservations from a request rejected later. Diagnostics are outside Calculation Proof and describe model estimates. WASM pages may remain committed within a live worker after a Rust allocation is freed. Browser cancellation and module termination reclaim the worker. Other application processes, host allocator fragmentation and native runtime overhead are measured in the performance and desktop evidence.

Run `cargo test --locked -p dars-universal --no-default-features --features data-lab budget_tests` from the repository root. The nine resource tests use small ordinary workbooks and tables with reduced budget settings. They check the canonical replay boundary, quoted CSV records, repeated shared notes, replacement and lookup allocations, grouping, cumulative text transformations, exact analysis and sorting workspace, combined browser responses, and successful smaller operations after output refusal. [Security audit](security.md)
