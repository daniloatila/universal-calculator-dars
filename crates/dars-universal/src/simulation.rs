use crate::probability::{Model, Parameters, Pcg, integer, number};
use crate::{Computation, Exactness, MathError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json, value::RawValue};
use std::collections::BTreeMap;

type Checked<T> = Result<T, MathError>;
const MAX_SAMPLES: u64 = 100_000;
const MAX_WORK: usize = 2_000_000;
const MAX_STEPS: u64 = 1_000;
const MAX_BATCH: usize = 4_096;
const MAX_MAGNITUDE: f64 = 1e140;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Recipe {
    model: String,
    seed: Option<Value>,
    samples: Option<Value>,
    threshold: Option<Value>,
    confidence_level: Option<Value>,
    bins: Option<Value>,
    distribution: Option<String>,
    parameters: Option<Parameters>,
    start: Option<Value>,
    initial: Option<Value>,
    contribution: Option<Value>,
    drift: Option<Value>,
    sd: Option<Value>,
    volatility: Option<Value>,
    shock: Option<Value>,
    steps: Option<Value>,
    risk_level: Option<Box<RawValue>>,
    losses: Option<Vec<Value>>,
    currency: Option<String>,
}

#[derive(Serialize)]
pub(super) struct Progress {
    completed: usize,
    total: usize,
    done: bool,
}

enum Source {
    Distribution(Model),
    Walk {
        start: f64,
        drift: f64,
        sd: f64,
        steps: usize,
        shock: f64,
    },
    Finance {
        initial: f64,
        contribution: f64,
        drift: f64,
        volatility: f64,
        steps: usize,
        shock: f64,
        currency: String,
    },
    Historical(Vec<f64>),
}

struct Draw {
    outcome: f64,
    sensitivity_delta: Option<f64>,
    loss: Option<f64>,
}

impl Source {
    fn work(&self) -> usize {
        match self {
            Self::Distribution(model) => model.sample_work(),
            Self::Walk { steps, .. } | Self::Finance { steps, .. } => *steps,
            Self::Historical(_) => 1,
        }
    }

    fn draw(&self, rng: &mut Pcg, index: usize) -> Checked<Draw> {
        let (outcome, sensitivity_delta, loss) = match self {
            Self::Distribution(model) => (model.sample(rng)?, None, None),
            Self::Historical(losses) => (losses[index], None, None),
            Self::Walk {
                start,
                drift,
                sd,
                steps,
                shock,
            } => {
                let mut increments = Sum::default();
                for _ in 0..*steps {
                    increments.add(*drift + *sd * rng.normal());
                }
                (
                    *start + increments.value(),
                    Some(*shock * *steps as f64),
                    None,
                )
            }
            Self::Finance {
                initial,
                contribution,
                drift,
                volatility,
                steps,
                shock,
                ..
            } => {
                let mut terminal = *initial;
                let mut difference = 0.0;
                let mut profit = Sum::default();
                let adjustment = libm::expm1(*shock);
                for _ in 0..*steps {
                    let log_return = *drift + *volatility * rng.normal();
                    let factor = libm::exp(log_return);
                    profit.add(terminal * libm::expm1(log_return));
                    difference = factor * (difference * (1.0 + adjustment) + terminal * adjustment);
                    terminal = terminal * factor + *contribution;
                    if !terminal.is_finite() || !difference.is_finite() {
                        return Err(MathError::Limit);
                    }
                }
                (terminal, Some(difference), Some(-profit.value()))
            }
        };
        if !valid_outcome(outcome)
            || sensitivity_delta.is_some_and(|x| !valid_outcome(x))
            || loss.is_some_and(|x| !valid_outcome(x))
        {
            return Err(MathError::Limit);
        }
        Ok(Draw {
            outcome,
            sensitivity_delta,
            loss,
        })
    }
}

fn valid_outcome(x: f64) -> bool {
    x.is_finite() && x.abs() <= MAX_MAGNITUDE
}

fn required(value: &Option<Value>) -> Checked<&Value> {
    value.as_ref().ok_or(MathError::InvalidInput)
}

fn default_number(value: &Option<Value>, default: f64) -> Checked<f64> {
    value
        .as_ref()
        .map(number)
        .transpose()
        .map(|x| x.unwrap_or(default))
}

fn level(value: &Option<Value>, default: f64) -> Checked<f64> {
    let x = default_number(value, default)?;
    if !(0.5..=0.9999).contains(&x) {
        return Err(MathError::Domain);
    }
    Ok(x)
}

struct RiskLevel {
    display: f64,
    exact: String,
    index: usize,
    full_tail: usize,
    fractional_tail: f64,
}

impl RiskLevel {
    fn new(raw: Option<&RawValue>, count: usize) -> Checked<Self> {
        let raw = raw.map_or("0.95", RawValue::get);
        let exact: String = if raw.starts_with('"') {
            serde_json::from_str(raw).map_err(|_| MathError::InvalidInput)?
        } else {
            raw.to_owned()
        };
        if exact.len() > 64 {
            return Err(MathError::Limit);
        }
        if exact.starts_with('-') {
            return Err(MathError::Domain);
        }
        let digits = exact.strip_prefix('+').unwrap_or(&exact);
        let (body, exponent) = match digits.split_once(['e', 'E']) {
            Some((body, exponent)) => (
                body,
                exponent
                    .parse::<i32>()
                    .map_err(|_| MathError::InvalidInput)?,
            ),
            None => (digits, 0),
        };
        let (left, right) = body.split_once('.').unwrap_or((body, ""));
        let len = left.len() + right.len();
        if len == 0
            || !left
                .bytes()
                .chain(right.bytes())
                .all(|b| b.is_ascii_digit())
        {
            return Err(MathError::InvalidInput);
        }
        if len > 32 || exponent.unsigned_abs() > 32 {
            return Err(MathError::Limit);
        }
        let scale = right.len() as i32 - exponent;
        if scale <= 0 {
            return Err(MathError::Domain);
        }
        if scale > 32 {
            return Err(MathError::Limit);
        }
        let numerator = format!("{left}{right}")
            .parse::<u128>()
            .map_err(|_| MathError::InvalidInput)?;
        let denominator = 10u128.pow(scale as u32);
        if 2 * numerator < denominator || 10_000 * numerator > 9_999 * denominator {
            return Err(MathError::Domain);
        }
        let count = count as u128;
        let index = (count * numerator).div_ceil(denominator) as usize - 1;
        let tail = count * (denominator - numerator);
        let full_tail = (tail / denominator) as usize;
        let fractional_tail = (tail % denominator) as f64 / denominator as f64;
        let display = exact.parse::<f64>().map_err(|_| MathError::InvalidInput)?;
        Ok(Self {
            display,
            exact,
            index,
            full_tail,
            fractional_tail,
        })
    }

    fn shortfall(&self, losses: impl Iterator<Item = f64>) -> f64 {
        let mut sum = Sum::default();
        for (i, loss) in losses
            .take(self.full_tail + usize::from(self.fractional_tail > 0.0))
            .enumerate()
        {
            sum.add(
                loss * if i == self.full_tail {
                    self.fractional_tail
                } else {
                    1.0
                },
            );
        }
        sum.value() / (self.full_tail as f64 + self.fractional_tail)
    }
}

fn normal_critical(confidence: f64) -> f64 {
    let mut lo = 0.0;
    let mut hi = 10.0;
    for _ in 0..55 {
        let mid = (lo + hi) / 2.0;
        if libm::erfc(mid / std::f64::consts::SQRT_2) > 1.0 - confidence {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    (lo + hi) / 2.0
}

#[derive(Default)]
struct Sum {
    sum: f64,
    compensation: f64,
}

impl Sum {
    fn add(&mut self, value: f64) {
        // Neumaier correction preserves cancellations across signed paths.
        let next = self.sum + value;
        self.compensation += if self.sum.abs() >= value.abs() {
            (self.sum - next) + value
        } else {
            (value - next) + self.sum
        };
        self.sum = next;
    }

    fn value(&self) -> f64 {
        self.sum + self.compensation
    }
}

pub(super) struct SimulationRun {
    input: String,
    source: Source,
    model: String,
    distribution: Option<String>,
    seed: Option<u64>,
    rng: Pcg,
    values: Vec<f64>,
    losses: Vec<f64>,
    total: usize,
    bins: usize,
    threshold: Option<f64>,
    confidence: f64,
    risk_level: Option<RiskLevel>,
    event_count: usize,
    delta: Sum,
    failure: Option<MathError>,
}

impl SimulationRun {
    pub(super) fn begin(input: &str, options: &Map<String, Value>) -> Checked<Self> {
        if !options.is_empty() {
            return Err(MathError::InvalidInput);
        }
        let request: Recipe = serde_json::from_str(input).map_err(|_| MathError::InvalidInput)?;
        let active = serde_json::from_str::<Map<String, Value>>(input)
            .map_err(|_| MathError::InvalidInput)?;
        let allowed = match request.model.as_str() {
            "distribution" => &["distribution", "parameters"][..],
            "random_walk" => &["start", "drift", "sd", "steps", "shock"],
            "finance" => &[
                "initial",
                "contribution",
                "drift",
                "volatility",
                "steps",
                "risk_level",
                "shock",
                "currency",
            ],
            "historical_risk" => &["losses", "risk_level"],
            _ => return Err(MathError::Unsupported),
        };
        let mut common = vec!["model", "threshold", "confidence_level", "bins"];
        if request.model != "historical_risk" {
            common.extend(["seed", "samples"]);
        }
        if active
            .keys()
            .any(|name| !allowed.contains(&name.as_str()) && !common.contains(&name.as_str()))
        {
            return Err(MathError::InvalidInput);
        }
        let steps = || integer(required(&request.steps)?, 1, MAX_STEPS).map(|x| x as usize);
        let seed = request
            .seed
            .as_ref()
            .map(|v| integer(v, 0, u64::MAX))
            .transpose()?;
        let source = match request.model.as_str() {
            "distribution" => Source::Distribution(Model::new(
                request
                    .distribution
                    .as_deref()
                    .ok_or(MathError::InvalidInput)?,
                &request
                    .parameters
                    .as_ref()
                    .ok_or(MathError::InvalidInput)?
                    .0,
            )?),
            "random_walk" => {
                let sd = number(required(&request.sd)?)?;
                if sd < 0.0 {
                    return Err(MathError::Domain);
                }
                Source::Walk {
                    start: default_number(&request.start, 0.0)?,
                    drift: default_number(&request.drift, 0.0)?,
                    sd,
                    steps: steps()?,
                    shock: default_number(&request.shock, 0.01)?,
                }
            }
            "finance" => {
                let initial = number(required(&request.initial)?)?;
                let contribution = default_number(&request.contribution, 0.0)?;
                let drift = number(required(&request.drift)?)?;
                let volatility = number(required(&request.volatility)?)?;
                let shock = default_number(&request.shock, 0.01)?;
                let currency = request.currency.unwrap_or_else(|| "BRL".into());
                if initial < 0.0 || contribution < 0.0 || volatility < 0.0 {
                    return Err(MathError::Domain);
                }
                if drift.abs() > 2.0 || volatility > 2.0 || shock.abs() > 2.0 {
                    return Err(MathError::Limit);
                }
                if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
                    return Err(MathError::InvalidInput);
                }
                Source::Finance {
                    initial,
                    contribution,
                    drift,
                    volatility,
                    steps: steps()?,
                    shock,
                    currency,
                }
            }
            "historical_risk" => {
                let losses = request.losses.ok_or(MathError::InvalidInput)?;
                if losses.len() < 2 {
                    return Err(MathError::Domain);
                }
                if losses.len() > 512 {
                    return Err(MathError::Limit);
                }
                Source::Historical(losses.iter().map(number).collect::<Checked<Vec<_>>>()?)
            }
            _ => return Err(MathError::Unsupported),
        };
        let total = if let Source::Historical(losses) = &source {
            losses.len()
        } else {
            if seed.is_none() {
                return Err(MathError::InvalidInput);
            }
            integer(required(&request.samples)?, 2, MAX_SAMPLES)? as usize
        };
        if total * source.work() > MAX_WORK {
            return Err(MathError::Limit);
        }
        let confidence = level(&request.confidence_level, 0.95)?;
        let risk_level = matches!(source, Source::Finance { .. } | Source::Historical(_))
            .then(|| RiskLevel::new(request.risk_level.as_deref(), total))
            .transpose()?;
        let bins = request
            .bins
            .as_ref()
            .map(|v| integer(v, 1, 64))
            .transpose()?
            .unwrap_or(20) as usize;
        let threshold = request.threshold.as_ref().map(number).transpose()?;
        let losses = if matches!(&source, Source::Finance { .. }) {
            Vec::with_capacity(total)
        } else {
            Vec::new()
        };
        Ok(Self {
            input: input.trim().into(),
            source,
            model: request.model,
            distribution: request.distribution,
            seed,
            rng: Pcg::new(seed.unwrap_or_default()),
            values: Vec::with_capacity(total),
            losses,
            total,
            bins,
            threshold,
            confidence,
            risk_level,
            event_count: 0,
            delta: Sum::default(),
            failure: None,
        })
    }

    pub(super) fn step(&mut self, max_batch: usize) -> Checked<Progress> {
        if let Some(failure) = self.failure {
            return Err(failure);
        }
        if !(1..=MAX_BATCH).contains(&max_batch) {
            return Err(MathError::Limit);
        }
        // A unit is one path step or one bounded distribution-tail operation.
        let batch = max_batch.min((32_768 / self.source.work()).max(1));
        let end = self.total.min(self.values.len() + batch);
        while self.values.len() < end {
            let draw = self
                .source
                .draw(&mut self.rng, self.values.len())
                .inspect_err(|error| {
                    self.failure = Some(*error);
                })?;
            if self
                .threshold
                .is_some_and(|threshold| draw.outcome >= threshold)
            {
                self.event_count += 1;
            }
            if let Some(change) = draw.sensitivity_delta {
                self.delta.add(change);
            }
            if let Some(loss) = draw.loss {
                self.losses.push(loss);
            }
            self.values.push(draw.outcome);
        }
        Ok(Progress {
            completed: end,
            total: self.total,
            done: end == self.total,
        })
    }

    pub(super) fn finish(mut self) -> Checked<Computation> {
        if let Some(failure) = self.failure {
            return Err(failure);
        }
        if self.values.len() != self.total {
            return Err(MathError::InvalidInput);
        }
        let n = self.total as f64;
        let first = self.values[0];
        let mut shifted = Sum::default();
        for &x in &self.values {
            shifted.add(x - first);
        }
        let center = shifted.value() / n;
        let mean = first + center;
        let mut squares = Sum::default();
        for &x in &self.values {
            let delta = (x - first) - center;
            squares.add(delta * delta);
        }
        let variance = squares.value() / (n - 1.0);
        let sd = libm::sqrt(variance);
        let published_se = match &self.source {
            Source::Historical(_) => false,
            Source::Distribution(model) => model.moments().1.is_some(),
            _ => true,
        };
        let standard_error = published_se.then(|| sd / libm::sqrt(n));
        let z = normal_critical(self.confidence);
        let interval = standard_error.filter(|_| self.total >= 30)
            .map(|se| json!({"level":self.confidence,"lower":mean-z*se,"upper":mean+z*se,"method":"clt_normal"}));
        self.values.sort_unstable_by(f64::total_cmp);
        let values = &self.values;
        let event = self.threshold.map(|threshold| {
            let p = self.event_count as f64 / n;
            let (lower, upper) = wilson(p, n, z);
            let confidence_interval = self.seed.map(|_| json!({"level":self.confidence,"lower":lower,"upper":upper,"method":"wilson"}));
            json!({"comparison":">=","threshold":threshold,"count":self.event_count,"probability":p,"confidence_interval":confidence_interval})
        });
        let sensitivity = match &self.source {
            Source::Walk { shock, .. } | Source::Finance { shock, .. } => Some(
                json!({"parameter":"drift","shock":shock,"mean_change":self.delta.value()/n,"method":"paired_common_random_numbers"}),
            ),
            _ => None,
        };
        let mut units = BTreeMap::new();
        let risk = if let Some(level) = &self.risk_level {
            let (value_at_risk, expected_shortfall, basis) = match &self.source {
                Source::Historical(_) => (
                    values[level.index],
                    level.shortfall(values.iter().rev().copied()),
                    "observed_losses",
                ),
                Source::Finance { currency, .. } => {
                    units.insert("currency".into(), currency.clone());
                    self.losses.sort_unstable_by(f64::total_cmp);
                    (
                        self.losses[level.index],
                        level.shortfall(self.losses.iter().rev().copied()),
                        "initial_plus_contributions_minus_terminal",
                    )
                }
                _ => return Err(MathError::InvalidInput),
            };
            Some(
                json!({"level":level.display,"level_exact":level.exact,"value_at_risk":value_at_risk,"expected_shortfall":expected_shortfall,"basis":basis,"var_method":"empirical_type1","es_method":"fractional_upper_tail_mean"}),
            )
        } else {
            None
        };
        let mut constraints = vec![
            "Empirical quantiles use linear interpolation (Hyndman–Fan type 7); variance uses n−1. Constant series have one histogram bin.".into(),
            "Binary64 working arithmetic; estimation error, sampling variability and presentation precision are distinct.".into(),
        ];
        let mut variables = BTreeMap::from([
            (String::from("samples"), self.total.to_string()),
            (String::from("model"), self.model.clone()),
            (
                String::from("aggregation"),
                String::from("two_pass_shifted_neumaier"),
            ),
            (String::from("termination"), String::from("requested_count")),
        ]);
        if let Some(seed) = self.seed {
            variables.insert("rng".into(), Pcg::ALGORITHM.into());
            variables.insert("seed".into(), seed.to_string());
            variables.insert("stream".into(), "54".into());
            variables.insert("parallelism".into(), "serial_order_fixed".into());
            constraints.push("One ordered PCG32 stream, serial paths, no platform entropy; batching preserves generator order. This is a simulation generator.".into());
            constraints.push("Mean interval uses a normal CLT approximation when n ≥ 30 and finite model variance is available; coverage can be poor for skewed or heavy-tailed distributions.".into());
        }
        if let Some(name) = &self.distribution {
            variables.insert("distribution".into(), name.clone());
        }
        if let Source::Finance { .. } = &self.source {
            constraints.push("Hypothetical independent lognormal gross returns, fixed end-of-step contributions, no taxes or fees. Signed losses use compensated sums of step losses. Projection is not a forecast or guarantee.".into());
        }
        if matches!(&self.source, Source::Historical(_)) {
            constraints.push("Historical loss sample is summarized directly; its empirical distribution is not a future loss model.".into());
        }
        if risk.is_some() {
            constraints.push("Positive loss is adverse. Exact decimal risk levels determine the empirical rank of VaR and the fractional boundary mass in ES. Path values and loss aggregates use binary64.".into());
        }
        let result = json!({"model":self.model,"distribution":self.distribution,"seed":self.seed.map(|x|x.to_string()),"samples":self.total,
            "mean":mean,"variance":variance,"standard_deviation":sd,"standard_error":standard_error,"confidence_interval":interval,
            "quantiles":{"p05":quantile(values,1,20),"p25":quantile(values,1,4),"p50":quantile(values,1,2),"p75":quantile(values,3,4),"p95":quantile(values,19,20)},
            "histogram":histogram(values,self.bins),"event":event,"loss_risk":risk,"sensitivity":sensitivity,
            "rng":self.seed.map(|_|Pcg::ALGORITHM),"termination":"requested_count"});
        Ok(Computation {
            result: result.to_string(),
            exactness: Exactness::Approximate,
            normalized: self.input,
            method: "serial_monte_carlo_and_empirical_summary",
            domain: "simulation_binary64",
            formula: None,
            precision: Some(15),
            tolerance: None,
            error_bound: None,
            constraints,
            variables,
            units,
        })
    }
}

fn wilson(p: f64, n: f64, z: f64) -> (f64, f64) {
    let scale = 1.0 + z * z / n;
    let center = (p + z * z / (2.0 * n)) / scale;
    let half = z * libm::sqrt(p * (1.0 - p) / n + z * z / (4.0 * n * n)) / scale;
    ((center - half).max(0.0), (center + half).min(1.0))
}

fn quantile(values: &[f64], numerator: usize, denominator: usize) -> f64 {
    let index = numerator * (values.len() - 1);
    let lo = index / denominator;
    let weight = (index % denominator) as f64 / denominator as f64;
    let (a, b) = (values[lo], values[(lo + 1).min(values.len() - 1)]);
    if a < 0.0 && b > 0.0 {
        (1.0 - weight) * a + weight * b
    } else {
        a + weight * (b - a)
    }
}

fn histogram(values: &[f64], requested_bins: usize) -> Value {
    let left = values[0];
    let right = values[values.len() - 1];
    let mut edges = vec![left];
    for i in 1..requested_bins {
        let edge = left + (right - left) * i as f64 / requested_bins as f64;
        if edge > edges[edges.len() - 1] && edge < right {
            edges.push(edge);
        }
    }
    edges.push(right);
    let mut counts = vec![0usize; edges.len() - 1];
    let mut index = 0;
    for &x in values {
        while index + 1 < counts.len() && x >= edges[index + 1] {
            index += 1;
        }
        counts[index] += 1;
    }
    json!({"edges":edges,"counts":counts,"requested_bins":requested_bins,"bin_rule":"left_closed_right_open_last_closed"})
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Checked<Computation> {
    if operation != "monte_carlo" {
        return Err(MathError::Unsupported);
    }
    let mut run = SimulationRun::begin(input, options)?;
    while !run.step(MAX_BATCH)?.done {}
    run.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_and_different_batches_have_byte_identical_proofs() {
        let input = r#"{"model":"finance","initial":1000,"contribution":20,"drift":0.02,"volatility":0.1,"steps":12,"seed":"18446744073709551615","samples":100,"threshold":1500}"#;
        let mut run = SimulationRun::begin(input, &Map::new()).unwrap();
        while !run.step(7).unwrap().done {}
        assert_eq!(
            run.finish().unwrap().result,
            evaluate("monte_carlo", input, &Map::new()).unwrap().result
        );
    }

    #[test]
    fn historical_empirical_tail_integrates_fractional_boundary() {
        let input = r#"{"model":"historical_risk","losses":[1,2,3,4,5],"risk_level":0.7}"#;
        let result: Value =
            serde_json::from_str(&evaluate("monte_carlo", input, &Map::new()).unwrap().result)
                .unwrap();
        assert_eq!(result["loss_risk"]["value_at_risk"], json!(4.0));
        assert!(
            (result["loss_risk"]["expected_shortfall"].as_f64().unwrap() - 14.0 / 3.0).abs()
                < 1e-13
        );
        assert!(result["confidence_interval"].is_null());
    }

    #[test]
    fn exact_risk_level_keeps_adjacent_decimal_ranks_distinct() {
        let recipe = |level: &str| {
            let losses = json!((1..=100).collect::<Vec<_>>());
            let input =
                format!(r#"{{"model":"historical_risk","risk_level":{level},"losses":{losses}}}"#);
            serde_json::from_str::<Value>(
                &evaluate("monte_carlo", &input, &Map::new()).unwrap().result,
            )
            .unwrap()
        };
        let base = recipe("0.56");
        assert_eq!(base["loss_risk"]["value_at_risk"], json!(56.0));
        assert_eq!(base["loss_risk"]["expected_shortfall"], json!(78.5));
        let above = recipe("0.560000000000000000000001");
        assert_eq!(above["loss_risk"]["value_at_risk"], json!(57.0));
        assert_eq!(
            above["loss_risk"]["level_exact"],
            "0.560000000000000000000001"
        );
    }

    #[test]
    fn finance_preserves_loss_when_displayed_wealth_rounds_to_funding() {
        let input = r#"{"model":"finance","initial":"1e100","drift":"1e-22","volatility":0,"steps":1,"seed":"42","samples":3}"#;
        let result: Value =
            serde_json::from_str(&evaluate("monte_carlo", input, &Map::new()).unwrap().result)
                .unwrap();
        assert_eq!(result["mean"], json!(1e100));
        let risk = result["loss_risk"]["value_at_risk"].as_f64().unwrap();
        assert!((risk / (-1e78) - 1.0).abs() < 1e-14);
    }
}
