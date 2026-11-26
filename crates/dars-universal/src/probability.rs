use crate::{Computation, Exactness, MathError, discrete_tail};
use serde::{Deserialize, Deserializer, Serialize, de};
use serde_json::{Map, Value, json};
use statrs::{distribution as d, statistics::Distribution};
use std::collections::BTreeMap;

type Checked<T> = Result<T, MathError>;
const MAX_MAGNITUDE: f64 = 1e100;
const MAX_COUNT: u64 = 1_000_000;
const MAX_HYPERGEOMETRIC: u64 = 5_000;
const SEARCH_INTEGER: i64 = 1_000_000_000_000_000;
const MAX_OUTPUT_SAMPLES: usize = 128;
const MAX_PLOT_POINTS: usize = 129;

pub(super) fn number(value: &Value) -> Checked<f64> {
    let number = value
        .as_f64()
        .or_else(|| {
            let text = value.as_str()?;
            (text.len() <= 96)
                .then(|| text.parse::<f64>().ok())
                .flatten()
        })
        .ok_or(MathError::InvalidInput)?;
    if !number.is_finite() {
        return Err(MathError::Domain);
    }
    if number.abs() > MAX_MAGNITUDE || (number != 0.0 && number.abs() < 1e-100) {
        return Err(MathError::Limit);
    }
    if number == 0.0
        && value.as_str().is_some_and(|text| {
            text.split(['e', 'E'])
                .next()
                .is_some_and(|digits| digits.bytes().any(|b| (b'1'..=b'9').contains(&b)))
        })
    {
        return Err(MathError::Limit);
    }
    Ok(number)
}

pub(super) fn integer(value: &Value, min: u64, max: u64) -> Checked<u64> {
    let value = value
        .as_u64()
        .or_else(|| value.as_str().filter(|text| text.len() <= 20)?.parse().ok())
        .ok_or(MathError::InvalidInput)?;
    if value < min {
        return Err(MathError::Domain);
    }
    if value > max {
        return Err(MathError::Limit);
    }
    Ok(value)
}

fn required<'a>(values: &'a Map<String, Value>, key: &str) -> Checked<&'a Value> {
    values.get(key).ok_or(MathError::InvalidInput)
}

pub(super) fn probability(value: f64) -> Checked<f64> {
    (0.0..=1.0)
        .contains(&value)
        .then_some(value)
        .ok_or(MathError::Domain)
}

fn positive(value: f64) -> Checked<f64> {
    (value > 0.0).then_some(value).ok_or(MathError::Domain)
}

fn shape(value: f64) -> Checked<f64> {
    let value = positive(value)?;
    if !(1e-4..=1e4).contains(&value) {
        return Err(MathError::Limit);
    }
    Ok(value)
}

/// The nested recipe is replayable and must not depend on duplicate-key precedence.
pub(super) struct Parameters(pub(super) Map<String, Value>);

impl<'de> Deserialize<'de> for Parameters {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Unique;
        impl<'de> de::Visitor<'de> for Unique {
            type Value = Parameters;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("unique distribution parameters")
            }
            fn visit_map<M: de::MapAccess<'de>>(self, mut map: M) -> Result<Parameters, M::Error> {
                let mut result = Map::new();
                while let Some((key, value)) = map.next_entry()? {
                    if result.len() >= 3 || result.insert(key, value).is_some() {
                        return Err(de::Error::custom(
                            "too many or duplicate distribution parameters",
                        ));
                    }
                }
                Ok(Parameters(result))
            }
        }
        deserializer.deserialize_map(Unique)
    }
}

fn density_at_zero(shape: f64, rate: f64) -> f64 {
    if shape < 1.0 {
        f64::INFINITY
    } else if shape == 1.0 {
        rate
    } else {
        0.0
    }
}

fn tail_member(tails: (f64, f64), upper: bool) -> f64 {
    if upper { tails.1 } else { tails.0 }
}

fn small_gamma_tail(shape: f64, x: f64, upper: bool) -> f64 {
    if x == 0.0 {
        return f64::from(upper);
    }
    // P(a,x)=exp(a log(x)-x-lgamma(a+1)) * sum x^n/(a+1)_n.
    // This branch avoids the library's epsilon-to-zero shortcut near x=0.
    let mut correction = 0.0;
    let mut term = 1.0;
    for j in 1..=8 {
        term *= x / (shape + f64::from(j));
        correction += term;
    }
    let log_p =
        (shape * libm::log(x) - x - libm::lgamma(shape + 1.0) + libm::log1p(correction)).min(0.0);
    if upper {
        -libm::expm1(log_p)
    } else {
        libm::exp(log_p)
    }
}

trait RealLaw: d::Continuous<f64, f64> + d::ContinuousCDF<f64, f64> + Distribution<f64> {}
impl<T> RealLaw for T where
    T: d::Continuous<f64, f64> + d::ContinuousCDF<f64, f64> + Distribution<f64>
{
}

trait CountLaw: d::Discrete<u64, f64> + d::DiscreteCDF<u64, f64> {}
impl<T> CountLaw for T where T: d::Discrete<u64, f64> + d::DiscreteCDF<u64, f64> {}

enum Law {
    Real(Box<dyn RealLaw>),
    Count {
        law: Box<dyn CountLaw>,
        mean: Option<f64>,
        variance: Option<f64>,
    },
    Integer {
        lo: i64,
        hi: i64,
    },
}

enum Sampling {
    Inverse,
    Binomial {
        n: u64,
        p: f64,
    },
    NegativeBinomial {
        r: f64,
        p: f64,
    },
    Poisson(f64),
    Normal {
        mean: f64,
        sd: f64,
    },
    LogNormal {
        mean: f64,
        sd: f64,
    },
    Exponential(f64),
    Gamma {
        shape: f64,
        rate: f64,
    },
    Beta(f64, f64),
    Weibull {
        shape: f64,
        scale: f64,
    },
    Student(f64),
    F(f64, f64),
    Bernoulli(f64),
    Geometric(f64),
    Uniform(f64, f64),
    Hypergeometric {
        population: u64,
        successes: u64,
        draws: u64,
    },
}

pub(super) struct Model {
    law: Law,
    sampling: Sampling,
}

impl Model {
    fn count(law: impl CountLaw + Distribution<f64> + 'static, sampling: Sampling) -> Self {
        Self {
            law: Law::Count {
                mean: law.mean(),
                variance: law.variance(),
                law: Box::new(law),
            },
            sampling,
        }
    }

    pub(super) fn new(name: &str, params: &Map<String, Value>) -> Checked<Self> {
        let v = |key| number(required(params, key)?);
        let p = || probability(v("p")?);
        let i = |key, max| integer(required(params, key)?, 0, max);
        let real = |law: Box<dyn RealLaw>, sampling| Self {
            law: Law::Real(law),
            sampling,
        };
        let point = |x| Self {
            law: Law::Integer { lo: x, hi: x },
            sampling: Sampling::Inverse,
        };
        macro_rules! law {
            ($type:ident ($($argument:expr),* $(,)?)) => {
                Box::new(d::$type::new($($argument),*).map_err(|_| MathError::Domain)?)
            };
        }
        let (model, expected) = match name {
            "bernoulli" => {
                let p = p()?;
                let model = if p == 0.0 || p == 1.0 {
                    point(p as i64)
                } else {
                    Self::count(*law!(Binomial(p, 1)), Sampling::Bernoulli(p))
                };
                (model, 1)
            }
            "binomial" => {
                let (n, p) = (i("n", MAX_COUNT)?, p()?);
                let model = if n == 0 || p == 0.0 {
                    point(0)
                } else if p == 1.0 {
                    point(n as i64)
                } else {
                    Self::count(*law!(Binomial(p, n)), Sampling::Binomial { n, p })
                };
                (model, 2)
            }
            "negative_binomial" => {
                let (r, p) = (shape(v("r")?)?, positive(p()?)?);
                let model = if p == 1.0 {
                    point(0)
                } else {
                    let law = Law::Count {
                        law: law!(NegativeBinomial(r, p)),
                        mean: Some(r * (1.0 - p) / p),
                        variance: Some(r * (1.0 - p) / (p * p)),
                    };
                    Self {
                        law,
                        sampling: Sampling::NegativeBinomial { r, p },
                    }
                };
                (model, 2)
            }
            "geometric" => {
                let p = positive(p()?)?;
                (
                    if p == 1.0 {
                        point(1)
                    } else {
                        Self::count(*law!(Geometric(p)), Sampling::Geometric(p))
                    },
                    1,
                )
            }
            "poisson" => {
                let lambda = v("lambda")?;
                if lambda > MAX_COUNT as f64 {
                    return Err(MathError::Limit);
                }
                (
                    if lambda == 0.0 {
                        point(0)
                    } else {
                        Self::count(*law!(Poisson(positive(lambda)?)), Sampling::Poisson(lambda))
                    },
                    1,
                )
            }
            "hypergeometric" => {
                let population = i("population", MAX_HYPERGEOMETRIC)?;
                let successes = i("successes", MAX_HYPERGEOMETRIC)?;
                let draws = i("draws", MAX_HYPERGEOMETRIC)?;
                if successes > population || draws > population || population == 0 {
                    return Err(MathError::Domain);
                }
                let sampler = Sampling::Hypergeometric {
                    population,
                    successes,
                    draws,
                };
                (
                    if population == 1 {
                        point((successes * draws) as i64)
                    } else {
                        Self::count(*law!(Hypergeometric(population, successes, draws)), sampler)
                    },
                    3,
                )
            }
            "discrete_uniform" => {
                let (lo, hi) = (v("minimum")?, v("maximum")?);
                if lo.fract() != 0.0 || hi.fract() != 0.0 || lo > hi {
                    return Err(MathError::Domain);
                }
                if lo.abs().max(hi.abs()) > 1e9 {
                    return Err(MathError::Limit);
                }
                (
                    Self {
                        law: Law::Integer {
                            lo: lo as i64,
                            hi: hi as i64,
                        },
                        sampling: Sampling::Inverse,
                    },
                    2,
                )
            }
            "uniform" => {
                let (lo, hi) = (v("minimum")?, v("maximum")?);
                if lo >= hi {
                    return Err(MathError::Domain);
                }
                (real(law!(Uniform(lo, hi)), Sampling::Uniform(lo, hi)), 2)
            }
            "normal" => {
                let (mean, sd) = (v("mean")?, positive(v("sd")?)?);
                if mean != 0.0 && sd / mean.abs() < f64::EPSILON {
                    return Err(MathError::Limit);
                }
                (
                    real(law!(Normal(mean, sd)), Sampling::Normal { mean, sd }),
                    2,
                )
            }
            "lognormal" => {
                let (mean, sd) = (v("log_mean")?, positive(v("log_sd")?)?);
                if mean.abs() > 100.0 || sd > 50.0 {
                    return Err(MathError::Limit);
                }
                (
                    real(law!(LogNormal(mean, sd)), Sampling::LogNormal { mean, sd }),
                    2,
                )
            }
            "exponential" => {
                let rate = positive(v("rate")?)?;
                (real(law!(Exp(rate)), Sampling::Exponential(rate)), 1)
            }
            "gamma" => {
                let (shape, rate) = (shape(v("shape")?)?, positive(v("rate")?)?);
                (
                    real(law!(Gamma(shape, rate)), Sampling::Gamma { shape, rate }),
                    2,
                )
            }
            "beta" => {
                let (a, b) = (shape(v("alpha")?)?, shape(v("beta")?)?);
                (real(law!(Beta(a, b)), Sampling::Beta(a, b)), 2)
            }
            "weibull" => {
                let (shape, scale) = (shape(v("shape")?)?, positive(v("scale")?)?);
                (
                    real(
                        law!(Weibull(shape, scale)),
                        Sampling::Weibull { shape, scale },
                    ),
                    2,
                )
            }
            "student_t" => {
                let df = shape(v("df")?)?;
                (
                    real(law!(StudentsT(0.0, 1.0, df)), Sampling::Student(df)),
                    1,
                )
            }
            "chi_squared" => {
                let df = shape(v("df")?)?;
                (
                    real(
                        law!(ChiSquared(df)),
                        Sampling::Gamma {
                            shape: df / 2.0,
                            rate: 0.5,
                        },
                    ),
                    1,
                )
            }
            "fisher_f" => {
                let (df1, df2) = (shape(v("df1")?)?, shape(v("df2")?)?);
                (
                    real(law!(FisherSnedecor(df1, df2)), Sampling::F(df1, df2)),
                    2,
                )
            }
            _ => return Err(MathError::Unsupported),
        };
        if params.len() != expected {
            return Err(MathError::InvalidInput);
        }
        Ok(model)
    }

    fn bounds(&self) -> (f64, f64) {
        match &self.law {
            Law::Real(law) => (law.min(), law.max()),
            Law::Count { law, .. } => (
                law.min() as f64,
                if law.max() == u64::MAX {
                    f64::INFINITY
                } else {
                    law.max() as f64
                },
            ),
            Law::Integer { lo, hi } => (*lo as f64, *hi as f64),
        }
    }

    fn discrete(&self) -> bool {
        !matches!(self.law, Law::Real(_))
    }

    pub(super) fn moments(&self) -> (Option<f64>, Option<f64>) {
        let (mean, variance) = match &self.law {
            Law::Real(law) => (law.mean(), law.variance()),
            Law::Count { mean, variance, .. } => (*mean, *variance),
            Law::Integer { lo, hi } => {
                let width = (hi - lo + 1) as f64;
                (
                    Some((*lo + *hi) as f64 / 2.0),
                    Some((width * width - 1.0) / 12.0),
                )
            }
        };
        (
            mean.filter(|x| x.is_finite()),
            variance.filter(|x| x.is_finite()),
        )
    }

    fn density(&self, x: f64) -> f64 {
        let (lo, hi) = self.bounds();
        if x < lo || x > hi || (self.discrete() && x.fract() != 0.0) {
            return 0.0;
        }
        match self.sampling {
            Sampling::Weibull { shape, scale } => {
                if x == 0.0 {
                    return density_at_zero(shape, 1.0 / scale);
                }
                let log_scaled = libm::log(x) - libm::log(scale);
                let power = libm::exp(shape * log_scaled);
                return libm::exp(
                    libm::log(shape) - libm::log(scale) + (shape - 1.0) * log_scaled - power,
                );
            }
            Sampling::Gamma { shape, rate } => {
                if x == 0.0 {
                    return density_at_zero(shape, rate);
                }
                let log_scaled = libm::log(x) + libm::log(rate);
                return libm::exp(
                    libm::log(rate) + (shape - 1.0) * log_scaled - x * rate - libm::lgamma(shape),
                );
            }
            Sampling::F(a, _) if x == 0.0 => return density_at_zero(a / 2.0, 1.0),
            _ => {}
        }
        match &self.law {
            Law::Real(law) => law.pdf(x),
            Law::Count { law, .. } => law.pmf(x as u64),
            Law::Integer { lo, hi } => 1.0 / (hi - lo + 1) as f64,
        }
    }

    fn tail(&self, x: f64, upper: bool) -> Checked<f64> {
        let (lo, hi) = self.bounds();
        if self.discrete() && !hi.is_finite() && x.is_finite() && x > SEARCH_INTEGER as f64 {
            return Err(MathError::Limit);
        }
        let y = if x < lo {
            f64::from(upper)
        } else if x >= hi {
            f64::from(!upper)
        } else {
            match (&self.law, &self.sampling) {
                (_, Sampling::Weibull { shape, scale }) => {
                    let power = libm::pow(x / scale, *shape);
                    if upper {
                        libm::exp(-power)
                    } else {
                        -libm::expm1(-power)
                    }
                }
                (_, Sampling::Gamma { shape, rate }) if x * rate <= 1e-4 => {
                    small_gamma_tail(*shape, x * rate, upper)
                }
                (_, Sampling::F(a, b)) => discrete_tail::fisher_tail(*a, *b, x, upper)?,
                (_, Sampling::Student(df)) => discrete_tail::student_tail(*df, x, upper)?,
                (_, Sampling::Beta(a, b)) => {
                    tail_member(discrete_tail::beta_tails(*a, *b, x, 1.0 - x)?, upper)
                }
                (_, Sampling::Binomial { n, p }) => {
                    tail_member(discrete_tail::binomial_tails(*n, *p, x as u64)?, upper)
                }
                (_, Sampling::NegativeBinomial { r, p }) => tail_member(
                    discrete_tail::beta_tails(*r, x.floor() + 1.0, *p, 1.0 - p)?,
                    upper,
                ),
                (_, Sampling::Bernoulli(p)) => {
                    if upper {
                        *p
                    } else {
                        1.0 - p
                    }
                }
                (Law::Real(law), _) => {
                    if upper {
                        law.sf(x)
                    } else {
                        law.cdf(x)
                    }
                }
                (Law::Count { law, .. }, _) => {
                    if upper {
                        law.sf(x as u64)
                    } else {
                        law.cdf(x as u64)
                    }
                }
                (Law::Integer { lo, hi }, _) => {
                    let count = if upper {
                        *hi - x.floor() as i64
                    } else {
                        x.floor() as i64 - *lo + 1
                    };
                    count as f64 / (*hi - *lo + 1) as f64
                }
            }
        };
        if !y.is_finite() || !(-1e-12..=1.0 + 1e-12).contains(&y) {
            return Err(MathError::NoConvergence);
        }
        Ok(y.clamp(0.0, 1.0))
    }

    fn quantile(&self, p: f64) -> Checked<f64> {
        let (min, max) = self.bounds();
        if p == 0.0 {
            return Ok(min);
        }
        if p == 1.0 {
            return Ok(max);
        }
        if p == 0.5 {
            match self.sampling {
                Sampling::Normal { mean, .. } => return Ok(mean),
                Sampling::Student(_) => return Ok(0.0),
                Sampling::LogNormal { mean, .. } => return Ok(libm::exp(mean)),
                _ => {}
            }
        }
        let upper = p > 0.5;
        let target = if upper { 1.0 - p } else { p };
        let reached = |x| {
            self.tail(x, upper)
                .map(|q| if upper { q <= target } else { q >= target })
        };
        if self.discrete() {
            let mut low = min as i64;
            let mut high = if max.is_finite() {
                max as i64
            } else {
                low.max(1)
            };
            while !reached(high as f64)? {
                if high == SEARCH_INTEGER {
                    return Err(MathError::Limit);
                }
                high = (high * 2).min(SEARCH_INTEGER);
            }
            while low < high {
                let middle = low + (high - low) / 2;
                if reached(middle as f64)? {
                    high = middle;
                } else {
                    low = middle + 1;
                }
            }
            return Ok(high as f64);
        }
        // A normal-style center and scale avoid wasting iterations for narrow large-scale laws.
        let (mean, variance) = self.moments();
        let center = mean.unwrap_or(0.0).clamp(min, max);
        let scale = variance.map(f64::sqrt).filter(|x| *x > 0.0).unwrap_or(1.0);
        let mut radius = scale;
        let mut low = (center - radius).max(min);
        let mut high = (center + radius).min(max);
        for _ in 0..1024 {
            if reached(high)? && !reached(low)? {
                break;
            }
            if min.is_finite() && low == min && reached(low)? {
                return Ok(min);
            }
            radius *= 2.0;
            low = (center - radius).max(min);
            high = (center + radius).min(max);
            if !low.is_finite() || !high.is_finite() {
                return Err(MathError::Limit);
            }
        }
        if !reached(high)? || reached(low)? {
            return Err(MathError::NoConvergence);
        }
        for _ in 0..1100 {
            let middle = low / 2.0 + high / 2.0;
            if middle == low || middle == high {
                if (self.tail(high, upper)? - target).abs() > target * 1e-7 {
                    return Err(MathError::Limit);
                }
                return Ok(high);
            }
            if reached(middle)? {
                high = middle;
            } else {
                low = middle;
            }
        }
        Err(MathError::NoConvergence)
    }

    pub(super) fn sample_work(&self) -> usize {
        match self.sampling {
            Sampling::Binomial { n, p } => 64 + ((n as f64) * p * (1.0 - p)).sqrt() as usize,
            Sampling::NegativeBinomial { r, p } => 64 + (r * (1.0 - p)).sqrt() as usize,
            Sampling::Poisson(lambda) => 64 + lambda.sqrt() as usize,
            Sampling::Hypergeometric { draws, .. } => draws.max(1) as usize,
            _ => 1,
        }
    }

    pub(super) fn sample(&self, rng: &mut Pcg) -> Checked<f64> {
        let x = match self.sampling {
            Sampling::Inverse
            | Sampling::Binomial { .. }
            | Sampling::NegativeBinomial { .. }
            | Sampling::Poisson(_) => self.quantile(rng.open())?,
            Sampling::Normal { mean, sd } => mean + sd * rng.normal(),
            Sampling::LogNormal { mean, sd } => libm::exp(mean + sd * rng.normal()),
            Sampling::Exponential(rate) => -libm::log(rng.open()) / rate,
            Sampling::Gamma { shape, rate } => libm::exp(rng.log_gamma(shape)? - libm::log(rate)),
            Sampling::Beta(a, b) => {
                let log_ratio = rng.log_gamma(b)? - rng.log_gamma(a)?;
                if log_ratio > 0.0 {
                    let r = libm::exp(-log_ratio);
                    r / (1.0 + r)
                } else {
                    1.0 / (1.0 + libm::exp(log_ratio))
                }
            }
            Sampling::Weibull { shape, scale } => {
                scale * libm::pow(-libm::log(rng.open()), 1.0 / shape)
            }
            Sampling::Student(df) => {
                let z = rng.normal();
                z * libm::exp((libm::log(df / 2.0) - rng.log_gamma(df / 2.0)?) / 2.0)
            }
            Sampling::F(a, b) => {
                libm::exp(rng.log_gamma(a / 2.0)? - rng.log_gamma(b / 2.0)? + libm::log(b / a))
            }
            Sampling::Bernoulli(p) => f64::from(rng.open() < p),
            Sampling::Geometric(p) => {
                let x = (libm::log(rng.open()) / libm::log1p(-p)).ceil().max(1.0);
                if x > SEARCH_INTEGER as f64 {
                    return Err(MathError::Limit);
                }
                x
            }
            Sampling::Uniform(lo, hi) => lo + (hi - lo) * rng.open(),
            Sampling::Hypergeometric {
                mut population,
                mut successes,
                draws,
            } => {
                let mut hits = 0u64;
                for _ in 0..draws {
                    if successes == 0 {
                        break;
                    }
                    if rng.open() < successes as f64 / population as f64 {
                        hits += 1;
                        successes -= 1;
                    }
                    population -= 1;
                }
                hits as f64
            }
        };
        x.is_finite().then_some(x).ok_or(MathError::Limit)
    }
}

/// PCG XSH-RR 64/32 with stream 54 and reference two-step seeding. Apache-2.0.
/// https://www.pcg-random.org/download.html
pub(super) struct Pcg(u64);

impl Pcg {
    pub(super) const ALGORITHM: &str = "pcg32-xsh-rr/1";

    pub(super) fn new(seed: u64) -> Self {
        let mut rng = Self(0);
        rng.next();
        rng.0 = rng.0.wrapping_add(seed);
        rng.next();
        rng
    }

    fn next(&mut self) -> u32 {
        let previous = self.0;
        self.0 = previous
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(109);
        let xorshifted = (((previous >> 18) ^ previous) >> 27) as u32;
        xorshifted.rotate_right((previous >> 59) as u32)
    }

    // Uniform over 2^52 representable midpoints in (0,1), using two generator words.
    pub(super) fn open(&mut self) -> f64 {
        let bits = (u64::from(self.next()) << 20) | (u64::from(self.next()) >> 12);
        (bits as f64 + 0.5) / 4_503_599_627_370_496.0
    }

    pub(super) fn normal(&mut self) -> f64 {
        libm::sqrt(-2.0 * libm::log(self.open())) * libm::cos(std::f64::consts::TAU * self.open())
    }

    fn log_gamma(&mut self, a: f64) -> Checked<f64> {
        let shift = if a < 1.0 {
            libm::log(self.open()) / a
        } else {
            0.0
        };
        let d = a.max(a + f64::from(a < 1.0)) - 1.0 / 3.0;
        let c = 1.0 / libm::sqrt(9.0 * d);
        for _ in 0..128 {
            let z = self.normal();
            let v = 1.0 + c * z;
            if v <= 0.0 {
                continue;
            }
            let cube = v * v * v;
            let u = self.open();
            if u < 1.0 - 0.0331 * z.powi(4)
                || libm::log(u) < z * z / 2.0 + d * (1.0 - cube + libm::log(cube))
            {
                return Ok(libm::log(d) + libm::log(cube) + shift);
            }
        }
        Err(MathError::NoConvergence)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    distribution: String,
    parameters: Parameters,
    x: Option<Value>,
    lower: Option<Value>,
    upper: Option<Value>,
    probability: Option<Value>,
    sample_count: Option<Value>,
    seed: Option<Value>,
    plot_points: Option<Value>,
}

#[derive(Serialize)]
struct Point {
    x: f64,
    y: Option<f64>,
}

fn distribution(input: &str) -> Checked<(Value, Vec<String>, BTreeMap<String, String>)> {
    let request: Request = serde_json::from_str(input).map_err(|_| MathError::InvalidInput)?;
    let model = Model::new(&request.distribution, &request.parameters.0)?;
    let mut undefined = Map::new();
    let (mean, variance) = model.moments();
    if mean.is_none() {
        undefined.insert("mean".into(), json!("not_finite_or_undefined"));
    }
    if variance.is_none() {
        undefined.insert("variance".into(), json!("not_finite_or_undefined"));
    }
    let mut result = json!({"distribution":request.distribution, "kind":if model.discrete() { "discrete" } else { "continuous" }, "mean":mean, "variance":variance});
    let mut constraints = vec!["CDF = P(X <= x); survival = P(X > x). For continuous laws, a density is not a point probability.".into()];
    let mut variables = BTreeMap::from([("distribution".into(), request.distribution)]);
    if let Some(x) = request.x.as_ref().map(number).transpose()? {
        let y = model.density(x);
        let key = if model.discrete() { "mass" } else { "density" };
        if !y.is_finite() {
            undefined.insert(key.into(), json!("not_finite_or_undefined_at_x"));
        }
        let mut point =
            json!({"x":x, "cdf":model.tail(x, false)?, "survival":model.tail(x, true)?});
        point[key] = json!(y);
        result["point"] = point;
    }
    match (&request.lower, &request.upper) {
        (Some(lo), Some(hi)) => {
            let (lo, hi) = (number(lo)?, number(hi)?);
            if lo > hi {
                return Err(MathError::Domain);
            }
            let before = if model.discrete() {
                lo.ceil() - 1.0
            } else {
                lo
            };
            let lower_cdf = model.tail(before, false)?;
            let mass = if lower_cdf > 0.5 {
                model.tail(before, true)? - model.tail(hi, true)?
            } else {
                model.tail(hi, false)? - lower_cdf
            };
            if !(-1e-12..=1.0 + 1e-12).contains(&mass) {
                return Err(MathError::NoConvergence);
            }
            result["interval"] = json!({"lower":lo,"upper":hi,"probability":mass.clamp(0.0,1.0)});
            constraints.push(
                "Interval bounds are inclusive. Upper-tail intervals subtract survival functions."
                    .into(),
            );
        }
        (None, None) => {}
        _ => return Err(MathError::InvalidInput),
    }
    if let Some(p) = request.probability.as_ref().map(number).transpose()? {
        let x = model.quantile(probability(p)?)?;
        if !x.is_finite() {
            undefined.insert("quantile".into(), json!("infinite_support_endpoint"));
        }
        result["quantile"] = json!({"probability":p,"value":x});
        constraints.push("Quantile uses the generalized inverse of the CDF; integer quantiles use the first support point meeting the target.".into());
    }
    match (&request.sample_count, &request.seed) {
        (Some(count), Some(seed)) => {
            let count = integer(count, 1, MAX_OUTPUT_SAMPLES as u64)?;
            let seed = integer(seed, 0, u64::MAX)?;
            let mut rng = Pcg::new(seed);
            let samples = (0..count)
                .map(|_| model.sample(&mut rng))
                .collect::<Checked<Vec<_>>>()?;
            result["samples"] = json!(samples);
            variables.insert("rng".into(), Pcg::ALGORITHM.into());
            variables.insert("seed".into(), seed.to_string());
            variables.insert("sample_count".into(), count.to_string());
        }
        (None, None) => {}
        _ => return Err(MathError::InvalidInput),
    }
    if let Some(points) = &request.plot_points {
        let n = integer(points, 2, MAX_PLOT_POINTS as u64)? as usize;
        let (lo, hi) = model.bounds();
        let mut points = Vec::new();
        if model.discrete() {
            let length = hi - lo + 1.0;
            let (left, right) = if length <= n as f64 {
                (lo, hi)
            } else {
                (model.quantile(0.005)?, model.quantile(0.995)?)
            };
            let step = ((right - left + 1.0) / n as f64).ceil().max(1.0);
            for i in 0..n {
                let x = left + i as f64 * step;
                if x > right {
                    break;
                }
                let y = model.density(x);
                points.push(Point {
                    x,
                    y: y.is_finite().then_some(y),
                });
            }
            result["plot"] = json!({"kind":"mass","stride":step,"points":points});
            constraints.push("Mass plot may stride over wide support. Each displayed bar is one point mass, not an aggregated bin.".into());
        } else {
            let (left, right) = (model.quantile(0.005)?, model.quantile(0.995)?);
            for i in 0..n {
                let x = left + (right - left) * (i as f64 / (n - 1) as f64);
                let y = model.density(x);
                points.push(Point {
                    x,
                    y: y.is_finite().then_some(y),
                });
            }
            result["plot"] = json!({"kind":"density","points":points});
            constraints
                .push("Density plot samples the central 99% quantile span; it omits tails.".into());
        }
    }
    result["undefined"] = json!(undefined);
    Ok((result, constraints, variables))
}

fn events(input: &str) -> Checked<Value> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Events {
        p_a: Value,
        p_b: Value,
        p_ab: Value,
    }
    let request: Events = serde_json::from_str(input).map_err(|_| MathError::InvalidInput)?;
    let (a, b, joint) = (
        probability(number(&request.p_a)?)?,
        probability(number(&request.p_b)?)?,
        probability(number(&request.p_ab)?)?,
    );
    let floor = (a - (1.0 - b)).max(0.0);
    let ceil = a.min(b);
    if joint < floor - 4.0 * f64::EPSILON
        || joint > ceil
        || (joint == 0.0 && floor > 4.0 * f64::EPSILON)
    {
        return Err(MathError::Domain);
    }
    let product = a * b;
    let difference = (product - joint).abs();
    let scale = product.max(joint);
    Ok(
        json!({"p_a":a,"p_b":b,"intersection":joint,"union":(a + (b - joint)).min(1.0),
        "complement_a":1.0-a,"complement_b":1.0-b,"a_given_b":(b>0.0).then(||joint/b),
        "b_given_a":(a>0.0).then(||joint/a),"independent":difference <= 4.0*f64::EPSILON*scale,
        "bayes_a_given_b":(b>0.0 && a>0.0).then(||(joint/a)*a/b)}),
    )
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Checked<Computation> {
    if !options.is_empty() {
        return Err(MathError::InvalidInput);
    }
    let (result, constraints, variables, method, formula) = match operation {
        "distribution" => {
            let (result, constraints, variables) = distribution(input)?;
            (result, constraints, variables, "distribution_tails_and_bracketed_quantiles", None)
        }
        "events" => (events(input)?, vec!["Intersection must satisfy the Frechet bounds. Conditionals with a zero-probability condition are undefined. Independence uses a four-epsilon relative equality check.".into()], BTreeMap::new(), "event_probability_identities", Some("P(A|B)=P(A and B)/P(B); P(A or B)=P(A)+P(B)-P(A and B)")),
        _ => return Err(MathError::Unsupported),
    };
    Ok(Computation {
        result: result.to_string(),
        normalized: input.trim().into(),
        method,
        formula,
        domain: "probability_binary64",
        exactness: Exactness::Approximate,
        precision: Some(15),
        tolerance: None,
        error_bound: None,
        constraints,
        variables,
        units: BTreeMap::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pcg_matches_reference_words() {
        let mut rng = Pcg::new(42);
        let expected = [
            0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e,
        ];
        for x in expected {
            assert_eq!(rng.next(), x);
        }
    }

    #[test]
    fn normal_tail_does_not_subtract_from_one() {
        let params = json!({"mean":0,"sd":1});
        let model = Model::new("normal", params.as_object().unwrap()).unwrap();
        assert_eq!(model.tail(0.0, false).unwrap(), 0.5);
        assert_eq!(model.tail(12.0, false).unwrap(), 1.0);
        assert!((model.tail(12.0, true).unwrap() / 1.776_482_112_077_679e-33 - 1.0).abs() < 1e-10);
    }
}
