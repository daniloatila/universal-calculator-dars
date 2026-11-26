//! Scenario recipes are executed before any metric is compared.

use std::collections::{BTreeMap, BTreeSet};

use num_bigint::BigInt;
use num_traits::{Signed, Zero};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use super::{
    Rational, decimal, display, evaluate_scenario,
    metric_catalog::{Metric, RateRecipe, RawMetrics, catalog},
    money, number, parse,
};
use crate::{
    Computation, EXPRESSION_BYTES, Exactness, MathError, identifier, unique_options, valid_options,
    valid_text,
};

const FORMULA: &str = "Delta = alternative - reference; percentage points = 100 * Delta for fractional rates; relative percentage = 100 * Delta / abs(reference)";
const ANNUAL_FORMULA: &str = "Effective annual rate = (1 + effective periodic rate)^periods_per_year - 1; effective annual rate = (1 + nominal annual rate/periods_per_year)^periods_per_year - 1";
const MAX_RATE_PERIODS: i64 = 600;
const RATE_BITS: u64 = 16_384;
const MAX_PROOF_FRACTION_BYTES: usize = 6 * 1024;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Recipe {
    operation: String,
    input: String,
    #[serde(default, deserialize_with = "unique_options")]
    options: Map<String, Value>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Comparison {
    reference: Recipe,
    alternative: Recipe,
    #[serde(skip_serializing_if = "Option::is_none")]
    metric: Option<String>,
}

struct Scenario {
    recipe: Recipe,
    input: Map<String, Value>,
    metrics: Vec<Metric>,
    working_precision: Option<u32>,
}

impl Scenario {
    fn recompute(module: &str, mut recipe: Recipe) -> Result<Self, MathError> {
        if recipe.input.len() > EXPRESSION_BYTES {
            return Err(MathError::Limit);
        }
        if recipe.operation == "scenario_compare"
            || !identifier(&recipe.operation, 64)
            || !valid_text(&recipe.input, EXPRESSION_BYTES)
            || !valid_options(&recipe.options)
        {
            return Err(MathError::InvalidInput);
        }
        let mut raw = RawMetrics::default();
        let calculation = evaluate_scenario(
            module,
            &recipe.operation,
            &recipe.input,
            &recipe.options,
            &mut raw,
        )?;
        let input = parse(&calculation.normalized)?;
        let metrics = catalog(
            module,
            &recipe.operation,
            &input,
            &parse(&calculation.result)?,
            &money(&recipe.options)?,
            &calculation,
            &raw,
        );
        recipe.input = calculation.normalized;
        Ok(Self {
            recipe,
            input,
            metrics,
            working_precision: calculation.precision,
        })
    }
}

struct Pair<'a> {
    id: String,
    key: &'static str,
    reference: Option<&'a Metric>,
    alternative: Option<&'a Metric>,
}

impl Pair<'_> {
    fn unit(&self) -> &'static str {
        self.reference
            .or(self.alternative)
            .expect("at least one metric")
            .unit
    }
}

fn pairs<'a>(reference: &'a Scenario, alternative: &'a Scenario) -> Vec<Pair<'a>> {
    // Match equal semantic identities before exposing same-label mismatches.
    let mut matches = vec![None; reference.metrics.len()];
    let mut taken = vec![false; alternative.metrics.len()];
    for semantic in [true, false] {
        for (left, matched) in reference.metrics.iter().zip(&mut matches) {
            if matched.is_some() {
                continue;
            }
            let found = alternative
                .metrics
                .iter()
                .enumerate()
                .position(|(position, right)| {
                    !taken[position]
                        && if semantic {
                            left.semantic_id == right.semantic_id
                        } else {
                            left.key == right.key
                        }
                });
            if let Some(position) = found {
                taken[position] = true;
                *matched = Some(position);
            }
        }
    }
    let mut items = reference
        .metrics
        .iter()
        .zip(matches)
        .map(|(metric, index)| Pair {
            id: metric.key.to_owned(),
            key: metric.key,
            reference: Some(metric),
            alternative: index.map(|index| &alternative.metrics[index]),
        })
        .collect::<Vec<_>>();
    for (metric, matched) in alternative.metrics.iter().zip(taken) {
        if !matched {
            let id = if items.iter().any(|item| item.id == metric.key) {
                format!("alternative_{}", metric.key)
            } else {
                metric.key.to_owned()
            };
            items.push(Pair {
                id,
                key: metric.key,
                reference: None,
                alternative: Some(metric),
            });
        }
    }
    items
}

struct Decision {
    status: &'static str,
    reason: &'static str,
    differences: Vec<&'static str>,
    normalized: Option<Normalized>,
}

impl Decision {
    fn new(status: &'static str, reason: &'static str) -> Self {
        Self {
            status,
            reason,
            differences: Vec::new(),
            normalized: None,
        }
    }
}

struct Normalized {
    reference: AnnualRate,
    alternative: AnnualRate,
}

struct AnnualRate {
    value: Rational,
    source: &'static str,
    formula: &'static str,
}

fn missing(value: Option<&Value>) -> bool {
    value.is_none_or(|value| {
        value.is_null() || matches!(value.as_str(), Some("" | "unknown" | "unspecified"))
    })
}

fn classify(pair: &Pair<'_>, reference: &Scenario, alternative: &Scenario) -> Decision {
    let (Some(left), Some(right)) = (pair.reference, pair.alternative) else {
        return Decision::new("contextual", "metric_missing");
    };
    if left.unit != right.unit || left.semantic_id != right.semantic_id {
        return Decision::new("incompatible", "semantic_mismatch");
    }
    if (left.unit == "money"
        || left.required_context.contains(&"currency")
        || right.required_context.contains(&"currency"))
        && let (Some(a), Some(b)) = (left.context.get("currency"), right.context.get("currency"))
        && !missing(Some(a))
        && !missing(Some(b))
        && a != b
    {
        return Decision {
            differences: vec!["currency"],
            ..Decision::new("incompatible", "currency_mismatch")
        };
    }
    if left.value.is_none() || right.value.is_none() {
        return Decision::new("undefined", "undefined_value");
    }
    let different_rate_basis = left.rate.zip(right.rate).filter(|(a, b)| a != b);
    let mut absent = Vec::new();
    let mut different = Vec::new();
    let keys = left
        .required_context
        .iter()
        .chain(right.required_context)
        .copied()
        .collect::<BTreeSet<_>>();
    for key in keys {
        if different_rate_basis.is_some()
            && matches!(
                key,
                "periodicity"
                    | "periods_per_year"
                    | "compounds_per_year"
                    | "nature"
                    | "rate_nature"
            )
        {
            continue;
        }
        let a = left.context.get(key);
        let b = right.context.get(key);
        if missing(a) || missing(b) {
            absent.push(key);
        } else if a != b {
            different.push(key);
        }
    }
    if !absent.is_empty() {
        absent.extend(different);
        return Decision {
            differences: absent,
            ..Decision::new("contextual", "context_missing")
        };
    }
    if !different.is_empty() {
        return Decision {
            differences: different,
            ..Decision::new("contextual", "context_mismatch")
        };
    }
    if let Some((left_basis, right_basis)) = different_rate_basis {
        match annual_rate(left, left_basis, reference).zip(annual_rate(
            right,
            right_basis,
            alternative,
        )) {
            Some((reference, alternative)) => Decision {
                normalized: Some(Normalized {
                    reference,
                    alternative,
                }),
                ..Decision::new("normalized", "normalized_compound_annual")
            },
            None => Decision::new("contextual", "normalization_unavailable"),
        }
    } else {
        Decision::new("direct", "direct_compatible")
    }
}

fn rate_basis(recipe: RateRecipe) -> Value {
    match recipe {
        RateRecipe::Effective { periods_per_year } => {
            json!({ "periods_per_year": periods_per_year, "capitalization": "compound", "nature": "effective" })
        }
        RateRecipe::Nominal { periods_per_year } => {
            json!({ "periods_per_year": 1, "compounds_per_year": periods_per_year, "capitalization": "compound", "nature": "nominal" })
        }
    }
}

fn compound_annual(rate: Rational, periods: i64) -> Option<Rational> {
    if !(1..=MAX_RATE_PERIODS).contains(&periods) {
        return None;
    }
    let factor = rate + number(1);
    let bits = factor.numer().bits().max(factor.denom().bits());
    if !factor.is_positive() || bits.saturating_mul(periods as u64) > RATE_BITS + periods as u64 {
        return None;
    }
    let result = factor.pow(periods as i32) - number(1);
    (result.numer().bits().max(result.denom().bits()) <= RATE_BITS).then_some(result)
}

fn annual_rate(metric: &Metric, basis: RateRecipe, scenario: &Scenario) -> Option<AnnualRate> {
    let input_rate = || decimal(scenario.input.get("rate")?.as_str()?).ok();
    if scenario.recipe.operation == "equivalent_rate" {
        let periods = scenario.input.get("from_periods_per_year")?.as_i64()?;
        return Some(AnnualRate {
            value: compound_annual(input_rate()?, periods)?,
            source: "canonical_exact",
            formula: "(1 + original effective rate)^original periods per year - 1",
        });
    }
    if scenario.recipe.operation == "nominal_effective"
        && scenario.input.get("direction").and_then(Value::as_str) == Some("effective_to_nominal")
    {
        return Some(AnnualRate {
            value: input_rate()?,
            source: "canonical_exact",
            formula: "Original annual effective rate, before conversion to a nominal quote",
        });
    }
    // Where there is no exact originating quote, never annualize a rounded display.
    if metric.exactness != Exactness::Exact {
        return None;
    }
    let value = metric.value.as_ref()?;
    let (periodic, periods, formula) = match basis {
        RateRecipe::Effective { periods_per_year } => (
            value.clone(),
            i64::from(periods_per_year),
            "(1 + effective periodic rate)^periods per year - 1",
        ),
        RateRecipe::Nominal { periods_per_year } if periods_per_year > 0 => (
            value / number(i64::from(periods_per_year)),
            i64::from(periods_per_year),
            "(1 + nominal annual rate/periods per year)^periods per year - 1",
        ),
        RateRecipe::Nominal { .. } => return None,
    };
    Some(AnnualRate {
        value: compound_annual(periodic, periods)?,
        source: "canonical_exact",
        formula,
    })
}

fn value_report(metric: &Metric, scenario: &Scenario) -> Value {
    let value = metric.value.as_ref().and_then(proof_fraction);
    json!({
        "operation": scenario.recipe.operation,
        "semantic_id": metric.semantic_id,
        "presentation": metric.presentation,
        "value_omitted": value.is_none() && metric.value.is_some(),
        "value": value,
        "source": metric.source,
        "exactness": metric.exactness,
        "decimal_places": metric.decimal_places,
        "working_precision_bits": scenario.working_precision,
        "context": metric.context,
    })
}

fn annual_report(rate: &AnnualRate, metric: &Metric) -> Value {
    let value = proof_fraction(&rate.value);
    json!({
        "value_omitted": value.is_none(),
        "value": value,
        "presentation": display(&rate.value, 16),
        "source": rate.source,
        "original_basis": metric.rate.map(rate_basis),
        "formula": rate.formula,
    })
}

fn proof_fraction(value: &Rational) -> Option<String> {
    let serialized = value.to_string();
    (serialized.len() <= MAX_PROOF_FRACTION_BYTES).then_some(serialized)
}

fn item(pair: &Pair<'_>, decision: &Decision) -> Value {
    json!({
        "id": pair.id,
        "key": pair.key,
        "status": decision.status,
        "reason": decision.reason,
        "unit": pair.unit(),
    })
}

fn detailed(
    pair: &Pair<'_>,
    decision: &Decision,
    reference: &Scenario,
    alternative: &Scenario,
) -> (Value, Exactness) {
    let mut result = item(pair, decision);
    result["reference"] = pair
        .reference
        .map_or(Value::Null, |m| value_report(m, reference));
    result["alternative"] = pair
        .alternative
        .map_or(Value::Null, |m| value_report(m, alternative));
    result["differences"] = json!(decision.differences);
    for key in [
        "common_basis",
        "formula",
        "normalization",
        "absolute_difference",
        "exact_difference",
        "percentage_points",
        "relative_difference",
        "relative_percent",
        "precision_source",
        "precision_used",
        "relative_reason",
    ] {
        result[key] = Value::Null;
    }
    if !matches!(decision.status, "direct" | "normalized") {
        return (result, Exactness::Exact);
    }
    let left = pair.reference.expect("compatible reference");
    let right = pair.alternative.expect("compatible alternative");
    let (a, b, source, scale) = if let Some(normalized) = &decision.normalized {
        result["common_basis"] =
            json!({ "periods_per_year": 1, "capitalization": "compound", "nature": "effective" });
        result["normalization"] = json!({
            "formula": ANNUAL_FORMULA,
            "reference": annual_report(&normalized.reference, left),
            "alternative": annual_report(&normalized.alternative, right),
        });
        (
            &normalized.reference.value,
            &normalized.alternative.value,
            "canonical_exact",
            16,
        )
    } else {
        let source = if [left, right]
            .iter()
            .any(|metric| metric.source == "presentation_rounded")
        {
            "presentation_rounded"
        } else if [left, right]
            .iter()
            .any(|metric| metric.exactness != Exactness::Exact)
        {
            "canonical_approximate"
        } else if [left, right]
            .iter()
            .any(|metric| metric.source == "statutory_quantized")
        {
            "statutory_quantized"
        } else {
            "canonical_exact"
        };
        let scale = if source == "canonical_exact" {
            16
        } else {
            [left.decimal_places, right.decimal_places]
                .into_iter()
                .flatten()
                .min()
                .unwrap_or(16)
        };
        (
            left.value.as_ref().expect("compatible value"),
            right.value.as_ref().expect("compatible value"),
            source,
            scale,
        )
    };
    let delta = b - a;
    let exact = matches!(source, "canonical_exact" | "statutory_quantized");
    let delta_scale = if pair.unit() == "money" && exact {
        let minor = money(&reference.recipe.options)
            .expect("validated currency")
            .scale;
        let minor_quantity = &delta * Rational::from_integer(BigInt::from(10).pow(minor));
        if minor_quantity.is_integer() {
            minor
        } else {
            scale
        }
    } else {
        scale
    };
    result["absolute_difference"] = json!(display(&delta, delta_scale));
    let exact_difference = exact.then(|| proof_fraction(&delta)).flatten();
    result["exact_difference_omitted"] = json!(exact && exact_difference.is_none());
    result["exact_difference"] = json!(exact_difference);
    result["percentage_points"] = json!(
        (pair.unit() == "rate").then(|| display(&(&delta * number(100)), scale.saturating_sub(2)))
    );
    result["formula"] = json!(FORMULA);
    result["precision_source"] = json!(source);
    result["precision_used"] = json!({
        "difference_decimal_places": delta_scale,
        "percentage_points_decimal_places": (pair.unit() == "rate").then_some(scale.saturating_sub(2)),
        "relative_decimal_places": scale.min(12),
        "relative_percent_decimal_places": scale.min(10),
        "rounding": "half_even",
        "exact_arithmetic_on_compared_values": true,
    });
    if a.is_zero() {
        result["relative_reason"] = json!("zero_reference");
    } else {
        let relative = &delta / a.abs();
        result["relative_difference"] = json!(display(&relative, scale.min(12)));
        result["relative_percent"] = json!(display(&(relative * number(100)), scale.min(10)));
    }
    (
        result,
        if exact {
            Exactness::Exact
        } else {
            Exactness::Approximate
        },
    )
}

pub(super) fn evaluate(
    module: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Result<Computation, MathError> {
    let request: Comparison = parse(input)?;
    if !options.is_empty()
        || request
            .metric
            .as_ref()
            .is_some_and(|id| !identifier(id, 64))
    {
        return Err(MathError::InvalidInput);
    }
    let reference = Scenario::recompute(module, request.reference)?;
    let alternative = Scenario::recompute(module, request.alternative)?;
    let pairs = pairs(&reference, &alternative);
    let decisions: Vec<_> = pairs
        .iter()
        .map(|pair| classify(pair, &reference, &alternative))
        .collect();
    let items: Vec<_> = pairs
        .iter()
        .zip(&decisions)
        .map(|(pair, decision)| item(pair, decision))
        .collect();
    let (selected, exactness) = if let Some(id) = &request.metric {
        let position = pairs
            .iter()
            .position(|pair| &pair.id == id)
            .ok_or(MathError::InvalidInput)?;
        detailed(
            &pairs[position],
            &decisions[position],
            &reference,
            &alternative,
        )
    } else {
        (Value::Null, Exactness::Exact)
    };
    let normalized = serde_json::to_string(&Comparison {
        reference: reference.recipe,
        alternative: alternative.recipe,
        metric: request.metric,
    })
    .map_err(|_| MathError::InvalidInput)?;
    Ok(Computation {
        result: json!({ "schema": 1, "items": items, "selected": selected }).to_string(),
        exactness,
        normalized,
        method: "semantic_scenario_comparison",
        domain: "financial_comparison",
        formula: Some(FORMULA),
        precision: None,
        tolerance: None,
        error_bound: None,
        constraints: vec![
            "Both canonical scenario recipes are recalculated in the same financial module. Supplied scalar results are not accepted.".to_owned(),
            "The comparison matches semantic identity, unit, required context and the precision source. Contextual results are side by side only, without ranking.".to_owned(),
            "Relative changes divide by the magnitude of the reference. A zero reference has no relative change.".to_owned(),
            "Annual compound normalization uses exact originated rates or exact quotes with a known period and capitalization. Approximate results carry no certified comparison error bound.".to_owned(),
            "The bounded proof may omit individual fractions beyond 6 KiB. The calculation still uses the original numerical value, which can be regenerated from the recipes.".to_owned(),
        ],
        variables: BTreeMap::from([("comparison_contract".to_owned(), "1".to_owned())]),
        units: BTreeMap::new(),
    })
}

#[cfg(test)]
mod tests;
