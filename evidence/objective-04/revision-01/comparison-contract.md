# Financial comparison contract

[Português brasileiro](comparison-contract.pt-BR.md) · [Compatibility matrix](compatibility-matrix.json)

The local Rust engine evaluates both scenarios before making a comparison. A scenario supplies only its operation, canonical input and accepted calculator options. The operation belongs to the selected finance module. The engine derives the resulting metrics, their values and their financial contexts. A supplied scalar value, metric definition or context cannot substitute for a calculation.

```json
{
  "reference": {
    "operation": "equivalent_rate",
    "input": "{\"rate\":\"0.10\",\"from_periods_per_year\":2,\"to_periods_per_year\":2}",
    "options": { "currency": "BRL", "rounding": "half_even" }
  },
  "alternative": {
    "operation": "equivalent_rate",
    "input": "{\"rate\":\"0.10\",\"from_periods_per_year\":2,\"to_periods_per_year\":1}",
    "options": { "currency": "BRL", "rounding": "half_even" }
  },
  "metric": "rate"
}
```

Wrap that JSON as the `input` string of an ordinary tool request with `schema: 1`, `module: "financial"`, `operation: "scenario_compare"` and empty outer `options`. The comparison enumerates the derived metrics. Selecting a metric adds both operands, checked context, comparison decision, transformation and arithmetic to the Calculation Proof. Replay uses the proof's normalized input. The separate scenario export retains the recipes and selected indices within the existing 64 KiB file limit. A schema-one scenario file is recalculated with its saved recipes, and any cached comparison proof has historical status.

## Eligibility and normalization

| Classification | Calculation behavior |
| --- | --- |
| Direct | Equal semantic identity and compatible required financial context allow a difference. Independent scenario assumptions can differ when the measure remains meaningful. |
| Normalized | Known nominal or effective discrete compounding bases can share an effective annual base. For an effective periodic rate use `(1 + i)^m - 1`. For a nominal yearly rate use `(1 + j/m)^m - 1`. The source rate and frequency of a rate conversion provide the annual anchor and avoid feeding a rounded display rate back into compounding. |
| Contextual | The two amounts or measures can be inspected alongside the reasons for withholding a financial difference. Examples include unlike maturity amounts and accumulated returns over different horizons. |
| Incompatible or undefined | Mismatched currencies, unrelated metrics, or values outside the defining domain withhold a difference. Some operations provide no comparable scalar, such as a set of multiple IRR roots. |

Periodic MIRR with no calendar frequency stays distinct from annual MIRR. Discounted flows carry reference, horizon and day count. A simple cumulative investment return has its own nominal or real and gross or net identity. Payback periods remain distinct from elapsed years. The legacy Loans proposal selection is limited to contracts with matching principal, term and payment dates and a compatible settlement basis. Its result is a minimum nominal cost within that set. [Compound rate formulas](https://openstax.org/books/contemporary-mathematics/pages/6-4-compound-interest) · [Discounted cash flows](https://nvlpubs.nist.gov/nistpubs/hb/2025/NIST.HB.135e2025.pdf)

## Numerical provenance

Operands report their semantic ID, displayed value, canonical value when available, unit, precision source and context. Operations capture the canonical amount before formatting when supported. Monetary deltas use those internal values and can expose a sub-minor-unit difference between two rounded display amounts. A display-only operand limits the effective precision and is identified in the proof. The interface uses `≈0` when a nonzero difference rounds to zero at the display resolution or when approximate operand data prevents establishing exact equality. The engine distinguishes quantities, monetary amounts, dimensionless ratios and fractional rates.

For a rate change from 10% to 12%, the difference between fractional rates is 0.02, the percentage point change is 2 and the relative change is 20%. The relative denominator is the absolute value of the reference. For zero reference, the relative percentage is undefined. No percentage point value is generated for a monetary difference or a ratio such as current assets divided by current liabilities.

For approximate operands with a declared numerical stopping tolerance, the proof reports the original tolerances and their sum. The displayed step is at least the summed tolerance. A point difference within that resolution is unavailable. Relative estimates account for the sensitivity to the reference denominator and can be unavailable even when a point difference is displayed. These stopping criteria describe the resolution of the method, and the proof leaves certified error bounds unset.

Ordinary operations retain the existing proof schema and parser bounds. The two-recipe comparison has an 18 KiB input and normalized-field budget within the existing 24 KiB request envelope. Each enclosed recipe retains the ordinary 4 KiB limit. The 32 KiB result and 128 KiB portable proof limits remain in force.
