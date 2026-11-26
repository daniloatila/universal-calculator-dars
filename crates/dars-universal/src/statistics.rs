mod inference;
mod regression;

use crate::{Computation, Exactness, MathError};
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, ToPrimitive, Zero};
use serde::{Deserialize, Deserializer, de};
use serde_json::{Map, Value, json, value::RawValue};
use std::collections::BTreeMap;

type Checked<T> = Result<T, MathError>;
type Rational = BigRational;
type Raw = Box<RawValue>;
const MAX_ROWS: usize = 512;

struct Fields(BTreeMap<String, Raw>);

impl<'de> Deserialize<'de> for Fields {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Unique;
        impl<'de> de::Visitor<'de> for Unique {
            type Value = Fields;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("unique statistic inputs")
            }
            fn visit_map<M: de::MapAccess<'de>>(self, mut items: M) -> Result<Fields, M::Error> {
                let mut fields = BTreeMap::new();
                while let Some((key, value)) = items.next_entry()? {
                    if fields.len() >= 8 || fields.insert(key, value).is_some() {
                        return Err(de::Error::custom("too many or duplicate statistic inputs"));
                    }
                }
                Ok(Fields(fields))
            }
        }
        deserializer.deserialize_map(Unique)
    }
}

impl Fields {
    fn restrict(&self, allowed: &[&str]) -> Checked<()> {
        if self.0.keys().any(|key| !allowed.contains(&key.as_str())) {
            return Err(MathError::InvalidInput);
        }
        Ok(())
    }
    fn get(&self, key: &str) -> Checked<&RawValue> {
        self.optional(key).ok_or(MathError::InvalidInput)
    }
    fn optional(&self, key: &str) -> Option<&RawValue> {
        self.0.get(key).map(Box::as_ref)
    }
}

fn decode<T: serde::de::DeserializeOwned>(raw: &RawValue) -> Checked<T> {
    serde_json::from_str(raw.get()).map_err(|_| MathError::InvalidInput)
}

fn decimal(source: &str) -> Checked<Rational> {
    if source.len() > 72 {
        return Err(MathError::Limit);
    }
    let negative = source.starts_with('-');
    let text = source.strip_prefix(['+', '-']).unwrap_or(source);
    let (body, exponent) = if let Some((body, exponent)) = text.split_once(['e', 'E']) {
        if exponent.is_empty()
            || !exponent
                .trim_start_matches(['+', '-'])
                .bytes()
                .all(|b| b.is_ascii_digit())
        {
            return Err(MathError::InvalidInput);
        }
        (body, exponent.parse::<i32>().map_err(|_| MathError::Limit)?)
    } else {
        (text, 0)
    };
    let (whole, fraction) = body.split_once('.').unwrap_or((body, ""));
    let count = whole.len() + fraction.len();
    if count == 0
        || !whole
            .bytes()
            .chain(fraction.bytes())
            .all(|b| b.is_ascii_digit())
    {
        return Err(MathError::InvalidInput);
    }
    if count > 48 || exponent.unsigned_abs() > 100 {
        return Err(MathError::Limit);
    }
    let numerator = BigInt::parse_bytes(format!("{whole}{fraction}").as_bytes(), 10)
        .ok_or(MathError::InvalidInput)?;
    let signed = if negative { -numerator } else { numerator };
    let power = exponent - fraction.len() as i32;
    let factor = BigInt::from(10).pow(power.unsigned_abs());
    let value = if power < 0 {
        Rational::new(signed, factor)
    } else {
        Rational::from_integer(signed * factor)
    };
    if value.abs() > Rational::from_integer(BigInt::from(10).pow(100)) {
        return Err(MathError::Limit);
    }
    Ok(value)
}

fn scalar(raw: &RawValue) -> Checked<Rational> {
    if raw.get().starts_with('"') {
        decimal(&decode::<String>(raw)?)
    } else {
        decimal(raw.get())
    }
}

fn whole(raw: &RawValue, limit: u64) -> Checked<u64> {
    let value = scalar(raw)?;
    if value.is_negative() || !value.is_integer() {
        return Err(MathError::Domain);
    }
    value
        .to_integer()
        .to_u64()
        .filter(|x| *x <= limit)
        .ok_or(MathError::Limit)
}

fn rational(n: usize) -> Rational {
    Rational::from_integer(BigInt::from(n))
}
fn float(value: &Rational) -> Checked<f64> {
    value
        .to_f64()
        .filter(|x| x.is_finite() && (*x != 0.0 || value.is_zero()))
        .ok_or(MathError::Limit)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Missing {
    Reject,
    Omit,
}

fn missing(options: &Map<String, Value>) -> Checked<Missing> {
    match options.get("missing") {
        None => Ok(Missing::Reject),
        Some(v) if v == "reject" => Ok(Missing::Reject),
        Some(v) if v == "omit" => Ok(Missing::Omit),
        _ => Err(MathError::InvalidInput),
    }
}

fn options_allowed(options: &Map<String, Value>, allowed: &[&str]) -> Checked<()> {
    if options.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(MathError::InvalidInput);
    }
    Ok(())
}

fn vector(raw: &RawValue, policy: Missing, max: usize) -> Checked<Vec<Option<Rational>>> {
    let source: Vec<Raw> = decode(raw)?;
    if source.len() > max {
        return Err(MathError::Limit);
    }
    source
        .iter()
        .map(|part| match part.get() {
            "null" if policy == Missing::Omit => Ok(None),
            "null" => Err(MathError::InvalidInput),
            _ => scalar(part).map(Some),
        })
        .collect()
}

fn paired(
    x: Vec<Option<Rational>>,
    y: Vec<Option<Rational>>,
) -> Checked<(Vec<Rational>, Vec<Rational>, usize)> {
    if x.len() != y.len() {
        return Err(MathError::Domain);
    }
    let n = x.len();
    let (x, y): (Vec<_>, Vec<_>) = x
        .into_iter()
        .zip(y)
        .filter_map(|(x, y)| Some((x?, y?)))
        .unzip();
    let dropped = n - x.len();
    Ok((x, y, dropped))
}

fn stripped(values: Vec<Option<Rational>>) -> (Vec<Rational>, usize) {
    let n = values.len();
    let present: Vec<_> = values.into_iter().flatten().collect();
    let dropped = n - present.len();
    (present, dropped)
}

struct Moments {
    mean: Rational,
    sum_squares: Rational,
    centered: Vec<Rational>,
}

fn moments(values: &[Rational]) -> Checked<Moments> {
    if values.is_empty() {
        return Err(MathError::Domain);
    }
    let mean = values.iter().sum::<Rational>() / rational(values.len());
    let centered: Vec<_> = values.iter().map(|value| value - &mean).collect();
    let sum_squares = centered.iter().map(|v| v * v).sum();
    Ok(Moments {
        mean,
        sum_squares,
        centered,
    })
}

fn sample_variance(moments: &Moments, n: usize) -> Checked<Rational> {
    if n < 2 {
        return Err(MathError::Domain);
    }
    Ok(&moments.sum_squares / rational(n - 1))
}

fn ranks(values: &[Rational]) -> (Vec<Rational>, Vec<usize>) {
    let mut order: Vec<_> = (0..values.len()).collect();
    order.sort_unstable_by(|a, b| values[*a].cmp(&values[*b]));
    let mut ranks = vec![Rational::zero(); values.len()];
    let mut ties = Vec::new();
    for group in order.chunk_by(|a, b| values[*a] == values[*b]) {
        let previous = ties.iter().sum::<usize>();
        let rank = rational(2 * previous + group.len() + 1) / rational(2);
        for &i in group {
            ranks[i] = rank.clone();
        }
        ties.push(group.len());
    }
    (ranks, ties)
}

fn quantile(values: &[Rational], p: &Rational, step: bool) -> Checked<Rational> {
    if p < &Rational::zero() || p > &Rational::one() {
        return Err(MathError::Domain);
    }
    if step {
        let index = (p * rational(values.len()))
            .ceil()
            .to_integer()
            .to_usize()
            .ok_or(MathError::Limit)?;
        return Ok(values[index.saturating_sub(1)].clone());
    }
    let index = p * rational(values.len() - 1);
    let lo = index.to_integer().to_usize().ok_or(MathError::Limit)?;
    let weight = index - rational(lo);
    Ok(&values[lo] + weight * (&values[(lo + 1).min(values.len() - 1)] - &values[lo]))
}

fn fraction(numerator: i64, denominator: i64) -> Rational {
    Rational::new(numerator.into(), denominator.into())
}

struct Output {
    result: Value,
    method: &'static str,
    formula: Option<&'static str>,
    constraints: Vec<String>,
    variables: BTreeMap<String, String>,
}

impl Output {
    fn new(
        result: Value,
        method: &'static str,
        formula: &'static str,
        constraints: &[&str],
    ) -> Self {
        Self {
            result,
            method,
            formula: Some(formula),
            constraints: constraints.iter().map(ToString::to_string).collect(),
            variables: BTreeMap::new(),
        }
    }
}

fn weighted(
    values: &[(usize, Rational)],
    weights: Vec<Option<Rational>>,
) -> Checked<Option<Rational>> {
    if weights.iter().flatten().any(Signed::is_negative) {
        return Err(MathError::Domain);
    }
    let mut total = Rational::zero();
    let mut sum = Rational::zero();
    for (index, value) in values {
        if let Some(weight) = &weights[*index] {
            total += weight;
            sum += value * weight;
        }
    }
    if total.is_zero() {
        return Err(MathError::Domain);
    }
    Ok(Some(sum / total))
}

fn descriptive(fields: &Fields, options: &Map<String, Value>) -> Checked<Output> {
    fields.restrict(&["values", "weights", "percentiles"])?;
    options_allowed(options, &["population", "quantile", "missing", "kurtosis"])?;
    let policy = missing(options)?;
    let population = options
        .get("population")
        .map(|v| v.as_bool().ok_or(MathError::InvalidInput))
        .transpose()?
        .unwrap_or(false);
    let step = match options.get("quantile") {
        None => false,
        Some(v) if v == "type7" => false,
        Some(v) if v == "type1" => true,
        _ => return Err(MathError::InvalidInput),
    };
    let excess = match options.get("kurtosis") {
        None => true,
        Some(v) if v == "excess" => true,
        Some(v) if v == "pearson" => false,
        _ => return Err(MathError::InvalidInput),
    };
    let raw = vector(fields.get("values")?, policy, MAX_ROWS)?;
    let len = raw.len();
    let indexed: Vec<_> = raw
        .into_iter()
        .enumerate()
        .filter_map(|(i, v)| v.map(|x| (i, x)))
        .collect();
    let mut sorted: Vec<_> = indexed.iter().map(|(_, x)| x.clone()).collect();
    sorted.sort_unstable();
    let n = sorted.len();
    let m = moments(&sorted)?;
    let weighted_mean = if let Some(raw) = fields.optional("weights") {
        let weights = vector(raw, policy, MAX_ROWS)?;
        if len != weights.len() {
            return Err(MathError::Domain);
        }
        weighted(&indexed, weights)?
    } else {
        None
    };
    let mut exact = Map::new();
    let mut result = json!({"count":n,"missing":len-n,"population":population,"quantile_method":if step {"type1"} else {"type7"},
        "kurtosis_convention":if excess {"excess"} else {"pearson"}});
    let mut put = |name: &str, value: Option<&Rational>| -> Checked<()> {
        result[name] = json!(value.map(float).transpose()?);
        if let Some(value) = value {
            exact.insert(name.to_owned(), json!(value.to_string()));
        }
        Ok(())
    };
    let positive = sorted[0].is_positive();
    let harmonic =
        positive.then(|| rational(n) / sorted.iter().map(Rational::recip).sum::<Rational>());
    let variance =
        (population || n > 1).then(|| &m.sum_squares / rational(n - usize::from(!population)));
    let median = quantile(&sorted, &fraction(1, 2), false)?;
    let q1 = quantile(&sorted, &fraction(1, 4), step)?;
    let q3 = quantile(&sorted, &fraction(3, 4), step)?;
    let iqr = &q3 - &q1;
    let mut deviations: Vec<_> = sorted.iter().map(|x| (x - &median).abs()).collect();
    deviations.sort_unstable();
    let mad = quantile(&deviations, &fraction(1, 2), false)?;
    let average_deviation = m.centered.iter().map(Signed::abs).sum::<Rational>() / rational(n);
    let low = &q1 - fraction(3, 2) * &iqr;
    let high = &q3 + fraction(3, 2) * &iqr;
    let min = &sorted[0];
    let max = &sorted[n - 1];
    for (name, value) in [
        ("mean", Some(&m.mean)),
        ("weighted_mean", weighted_mean.as_ref()),
        ("harmonic_mean", harmonic.as_ref()),
        ("variance", variance.as_ref()),
        ("median", Some(&median)),
        ("q1", Some(&q1)),
        ("q3", Some(&q3)),
        ("iqr", Some(&iqr)),
        ("mad", Some(&mad)),
        ("mean_absolute_deviation", Some(&average_deviation)),
        ("minimum", Some(min)),
        ("maximum", Some(max)),
        ("range", Some(&(max - min))),
        ("lower_fence", Some(&low)),
        ("upper_fence", Some(&high)),
    ] {
        put(name, value)?;
    }
    let geometric = if positive {
        let logs = sorted
            .iter()
            .map(|x| float(x).map(f64::ln))
            .collect::<Checked<Vec<_>>>()?;
        Some((logs.iter().sum::<f64>() / n as f64).exp())
    } else if min.is_zero() {
        Some(0.0)
    } else {
        None
    };
    let sd = variance.as_ref().map(float).transpose()?.map(f64::sqrt);
    let coefficient = if m.mean.is_positive() {
        sd.map(|value| value / float(&m.mean).unwrap_or(f64::INFINITY))
    } else {
        None
    };
    let mut skewness = None;
    let mut kurtosis = None;
    if !m.sum_squares.is_zero() {
        let m2 = &m.sum_squares / rational(n);
        let n_float = n as f64;
        if population || n >= 3 {
            let m3 = m.centered.iter().map(|x| x.pow(3)).sum::<Rational>() / rational(n);
            let sign = if m3.is_negative() { -1.0 } else { 1.0 };
            let g1 = sign * float(&(m3.pow(2) / m2.pow(3)))?.sqrt();
            let adjustment = if population {
                1.0
            } else {
                (n_float * (n_float - 1.0)).sqrt() / (n_float - 2.0)
            };
            skewness = Some(g1 * adjustment);
        }
        if population || n >= 4 {
            let m4 = m.centered.iter().map(|x| x.pow(4)).sum::<Rational>() / rational(n);
            let g2 = float(&(m4 / m2.pow(2)))? - 3.0;
            let adjusted = if population {
                g2
            } else {
                (n_float - 1.0) * ((n_float + 1.0) * g2 + 6.0) / ((n_float - 2.0) * (n_float - 3.0))
            };
            kurtosis = Some(adjusted + if excess { 0.0 } else { 3.0 });
        }
    }
    let mode_count = sorted
        .chunk_by(|a, b| a == b)
        .map(<[_]>::len)
        .max()
        .unwrap_or(1);
    let modes = sorted
        .chunk_by(|a, b| a == b)
        .filter(|g| g.len() == mode_count && mode_count > 1)
        .map(|g| float(&g[0]))
        .collect::<Checked<Vec<_>>>()?;
    let outliers = indexed
        .iter()
        .filter(|(_, x)| x < &low || x > &high)
        .map(|(i, x)| Ok(json!({"index":i,"value":float(x)?,"exact":x.to_string()})))
        .collect::<Checked<Vec<_>>>()?;
    let percentiles = if let Some(raw) = fields.optional("percentiles") {
        let points: Vec<_> = vector(raw, Missing::Reject, 32)?
            .into_iter()
            .flatten()
            .collect();
        points.iter().map(|p|{
            let value = quantile(&sorted,p,step)?;
            Ok(json!({"probability":float(p)?,"value":float(&value)?,"exact":value.to_string()}))
        }).collect::<Checked<Vec<_>>>()?
    } else {
        Vec::new()
    };
    for (key, value) in [
        ("geometric_mean", json!(geometric)),
        ("standard_deviation", json!(sd)),
        ("coefficient_of_variation", json!(coefficient)),
        ("skewness", json!(skewness)),
        ("kurtosis", json!(kurtosis)),
        ("modes", json!(modes)),
        ("outliers", json!(outliers)),
        ("percentiles", json!(percentiles)),
        ("exact", json!(exact)),
    ] {
        result[key] = value;
    }
    Ok(Output::new(
        result,
        "exact_decimal_centering_and_order_statistics",
        "variance = sum((x - mean)^2) / (n - ddof)",
        &[
            "Decimal inputs, centering, squared deviations, and order-statistic interpolation use exact rationals where indicated by the exact result fields.",
            "Sample variance uses n−1; population variance uses n. Sample skewness uses adjusted Fisher–Pearson; sample kurtosis uses the bias-corrected fourth-moment coefficient.",
            "Median and raw MAD use midpoint interpolation. Quartiles/percentiles use selected Hyndman–Fan type 1 (inverse empirical CDF) or type 7 (linear). Outliers are Tukey 1.5 IQR flags.",
            "Geometric mean requires nonnegative data; harmonic mean and coefficient of variation require strictly positive data or mean respectively. No repeated observations gives no mode.",
            "With omission, only null is missing. Weights apply to the weighted mean only and require nonnegative complete-pair weights with positive sum.",
        ],
    ))
}

fn correlation(x: &Moments, y: &Moments) -> Checked<(Rational, Option<f64>)> {
    let cross: Rational = x.centered.iter().zip(&y.centered).map(|(a, b)| a * b).sum();
    let product = &x.sum_squares * &y.sum_squares;
    if product.is_zero() {
        return Ok((cross, None));
    }
    let r = float(&(cross.pow(2) / product))?.sqrt() * if cross.is_negative() { -1.0 } else { 1.0 };
    Ok((cross, Some(r)))
}

fn relationship(fields: &Fields, options: &Map<String, Value>) -> Checked<Output> {
    fields.restrict(&["x", "y"])?;
    options_allowed(options, &["population", "missing"])?;
    let population = options
        .get("population")
        .map(|v| v.as_bool().ok_or(MathError::InvalidInput))
        .transpose()?
        .unwrap_or(false);
    let policy = missing(options)?;
    let (x, y, missing) = paired(
        vector(fields.get("x")?, policy, MAX_ROWS)?,
        vector(fields.get("y")?, policy, MAX_ROWS)?,
    )?;
    let n = x.len();
    if n < 2 {
        return Err(MathError::Domain);
    }
    let (a, b) = (moments(&x)?, moments(&y)?);
    let (cross, pearson) = correlation(&a, &b)?;
    let covariance = cross / rational(n - usize::from(!population));
    let (_, spearman) = correlation(&moments(&ranks(&x).0)?, &moments(&ranks(&y).0)?)?;
    let result = json!({"count":n,"missing":missing,"population":population,"covariance":float(&covariance)?,
        "pearson":pearson,"spearman":spearman,"exact":{"covariance":covariance.to_string()}});
    Ok(Output::new(
        result,
        "centered_covariance_and_average_ranks",
        "r = Sxy / sqrt(Sxx Syy)",
        &[
            "Centering and cross products are exact rational. Spearman is Pearson on average ranks with ties.",
            "Aligned pairs are removed together under the omission policy. A constant variable makes the correlations undefined.",
            "Correlation describes association; causal interpretation requires independent study design and evidence.",
        ],
    ))
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Checked<Computation> {
    let fields: Fields = serde_json::from_str(input).map_err(|_| MathError::InvalidInput)?;
    let out = match operation {
        "descriptive" => descriptive(&fields, options)?,
        "relationship" => relationship(&fields, options)?,
        "regression" => regression::evaluate(&fields, options)?,
        "mean_test"
        | "difference_test"
        | "proportion_test"
        | "chi_square"
        | "chi_square_independence"
        | "anova"
        | "rank_test"
        | "sign_test" => inference::evaluate(operation, &fields, options)?,
        _ => return Err(MathError::Unsupported),
    };
    Ok(Computation {
        result: out.result.to_string(),
        normalized: input.trim().into(),
        method: out.method,
        formula: out.formula,
        domain: "statistics_real_finite",
        exactness: Exactness::Approximate,
        precision: Some(15),
        tolerance: None,
        error_bound: None,
        constraints: out.constraints,
        variables: out.variables,
        units: BTreeMap::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn large_decimal_offsets_keep_exact_dispersion() {
        let raw = r#"{"values":[10000000000000000.1,"10000000000000000.2",10000000000000000.3]}"#;
        let result = descriptive(&serde_json::from_str(raw).unwrap(), &Map::new())
            .unwrap()
            .result;
        assert_eq!(result["exact"]["variance"], "1/100");
        assert_eq!(result["exact"]["mean"], "50000000000000001/5");
        assert_eq!(result["standard_deviation"], 0.1);
    }

    #[test]
    fn rank_ties_use_average_position() {
        let values = [rational(1), rational(1), rational(2)];
        assert_eq!(
            ranks(&values).0,
            [fraction(3, 2), fraction(3, 2), rational(3)]
        );
    }
}
