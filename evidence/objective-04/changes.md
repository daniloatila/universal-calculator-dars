# Objective 04 design changes

[Português brasileiro](changes.pt-BR.md)

## Arithmetic and interoperability

Financial workspaces reuse `num-bigint` and `num-rational` for monetary amounts, discounting with integral exponents, internal balances and explicit minor-unit rounding. The common decimal grammar accepts at most 18 integral and 12 fractional digits. Canonical rates are fractions. The ISO 4217-backed currency subset includes currencies with zero, two and three fractional digits. The engine uses one selected currency per calculation. Conversion, exchange feeds and contractual cash rounding fall outside this contract. [ISO 4217 maintenance agency](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html)

`BigRational` keeps arithmetic exact until an operation selects a named approximation or explicit contractual monetary rounding. `bigdecimal` was considered and would add a parallel numeric type and a new rounding context for division. The existing `astro-float-num` provides non-integral powers and logarithms used by selected financial calculations. Precision, root intervals, bounded searches and uncertified completeness are reported where applicable. [Rational crate](https://docs.rs/num-rational/0.4.2/num_rational/) · [Multiprecision crate](https://docs.rs/astro-float-num/0.3.6/astro_float_num/)

Each finance module builds an independent WASM asset and runs through the existing single-active module registry, worker scheduler and cancellation path. The common editor keeps a separate locale for each nonempty numeric or dated field. It translates only digits and the field's decimal separator when preparing the canonical Rust input. The result display uses the current locale.

The schema-one Calculation Proof stays compatible with historical records. Each finance proof stores the original field drafts with their locales, the canonical structured input, the policy and the result. Result data is a structured JSON string inside the existing bounded record. The engine and viewer keep the historical 4 KiB expression, 32 KiB result and 128 KiB proof-file limits. Pagination covers larger schedules. Saved scenarios remain in memory, and the local version-one replay file is limited to 64 KiB and six requests. The application recalculates imported scenarios with Rust before treating them as reproduced. The standalone Proof viewer identifies records opened from disk as unverified.

## Scenario comparison

Scenario comparison is available inside the financial workspaces. Each local snapshot uses the calculation's original inputs and proof. Users can duplicate a scenario, reload its assumptions, edit its details and export the requests. The comparator displays matching engine outputs. Rust computes an absolute difference and a relative difference against the magnitude of the reference. A zero reference yields a null relative difference. Comparisons use the selected reported numbers and carry any original presentation rounding. The viewer displays a simple magnitude chart for the selected criterion.

## Scope decisions

- The financial workspace uses direct forms and ordered cash flows. RPN was evaluated as optional. The direct forms preserve the operation's inputs, timing and rates together in a replayable record.
- Brazilian investment projections use manual inputs and records of their source and date when appropriate. They model specified assumptions on the chosen horizon. Trading quotes, product-specific credit risk and market prices at a future sale are outside the model.
- The loan view offers a documented dated effective cost estimate. The contract interface does not establish the data required to claim a regulatory CET.
- The Tax module has a versioned Brazilian rule set with bounded applicability and official legal references. Cases outside a supported regime or period return a stable error. [Rule matrix](tax/rules.md)
