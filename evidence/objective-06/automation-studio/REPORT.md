# Automation Studio

Choose an example, inspect its inputs and edit the flow definition before pressing **Run**. A separate control selects a local CSV, TSV, JSON or XLSX file. Opening a .darsflow or exported proof stages it for review. When replaying a proof, supply its original data file. The new trace, hashes and outputs must match. Exporting a flow or proof requires a click. The export instruction inside a flow selects data for the result and performs no file write.

| Example | Connected operations | Observed result |
| --- | --- | --- |
| Finance | Two compound-interest scenarios, Rust semantic comparison, exact difference and branch | BRL 11,268.25 versus 11,956.18 over 12 equal periods. The comparator classified the future values as directly comparable. |
| Business | Typed local table, row iteration, spreads, margins, markup and aggregate | Gain 70. Weighted margin 14/45. |
| Statistics | Data Lab v2 parser, explicit fill rule, descriptive statistics and histogram | Four source observations, sum 12, original file hash retained. |
| Science | 512 normal draws with seed 42, extraction of three quantiles and statistical analysis | Both executions produced the same proofs and outputs. Simulation records retain their approximation indicators. |

[Run receipts and timings](execution.json) · [Four portable definitions](../../../apps/web/src/automation-examples) · [JSON Schema](../../../schemas/automation-flow-v1.schema.json)

The v1 parser accepts at most 128 KiB per flow, 32 inputs, 16 outputs, 96 static steps and four nested branch levels. It checks backward references, disallows duplicate keys, and treats exact decimal or fractional input as strings. Source-locale decimal input retains its original digits and separator. Unit-bearing arithmetic checks dimensions. Formula calls bind an ID and version. The demonstrated 1.0.0 simple-interest declaration returns BRL 1,200 and records all three tests.

One flow can consume up to 240 operations, 64 iterations per loop, 200,000 cumulative imported source rows and 60 seconds. A Data Lab stage receives the remaining adaptive byte budget. Intermediate results, engine proofs and dataset peaks all contribute to the shared charge. Aggregate calculations cover the full table. A row loop requires a complete materialized page, otherwise it fails visibly. Splitting the same source over several steps consumes the allowance again. Flow documents only authorize local engine work. An abort, invalid reference or exhausted budget produces a failed or cancelled receipt and clears result values.

The completion message describes the flow. Each actual Rust calculation has its own proof and exactness. A visible notice accompanies any flow that uses an approximate input or result, including a descriptive summary computed from simulated quantiles. A flow that only selects existing values displays a completion message without an engine-verification claim.
