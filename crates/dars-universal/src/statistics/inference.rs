use super::*;
use crate::discrete_tail::{binomial_tails, fisher_tail, log_binomial_mass, student_tail};
use statrs::distribution::{ChiSquared, ContinuousCDF, Normal};

#[derive(Clone, Copy)]
enum Alternative {
    TwoSided,
    Less,
    Greater,
}

impl Alternative {
    fn id(self) -> &'static str {
        match self {
            Self::TwoSided => "two_sided",
            Self::Less => "less",
            Self::Greater => "greater",
        }
    }
    fn tail_area(self, law: &impl ContinuousCDF<f64, f64>, statistic: f64) -> f64 {
        match self {
            Self::TwoSided => (2.0 * law.sf(statistic.abs())).min(1.0),
            Self::Less => law.cdf(statistic),
            Self::Greater => law.sf(statistic),
        }
    }
    fn interval(
        self,
        law: &impl ContinuousCDF<f64, f64>,
        alpha: f64,
        estimate: f64,
        se: f64,
    ) -> Checked<Value> {
        // Symmetry avoids rounding 1-alpha to 1 for a narrow upper-tail request.
        let cutoff = -law.inverse_cdf(self.alpha_tail(alpha));
        self.interval_cutoff(cutoff, alpha, estimate, se)
    }
    fn alpha_tail(self, alpha: f64) -> f64 {
        if matches!(self, Self::TwoSided) {
            alpha / 2.0
        } else {
            alpha
        }
    }
    fn student_p(self, df: f64, statistic: f64) -> Checked<f64> {
        match self {
            Self::TwoSided => student_tail(df, statistic.abs(), true).map(|x| 2.0 * x),
            Self::Less => student_tail(df, statistic, false),
            Self::Greater => student_tail(df, statistic, true),
        }
    }
    fn interval_cutoff(self, cutoff: f64, alpha: f64, estimate: f64, se: f64) -> Checked<Value> {
        if !cutoff.is_finite() {
            return Err(MathError::NoConvergence);
        }
        let half = cutoff * se;
        Ok(
            json!({"level":1.0-alpha,"lower":(!matches!(self,Self::Less)).then_some(estimate-half),
            "upper":(!matches!(self,Self::Greater)).then_some(estimate+half)}),
        )
    }
}

struct Test {
    alpha: f64,
    tail: Alternative,
    policy: Missing,
}

impl Test {
    fn new(options: &Map<String, Value>, tails: bool, missing_allowed: bool) -> Checked<Self> {
        let mut allowed = vec!["alpha"];
        if tails {
            allowed.push("alternative");
        }
        if missing_allowed {
            allowed.push("missing");
        }
        options_allowed(options, &allowed)?;
        let tail = match options.get("alternative") {
            None => Alternative::TwoSided,
            Some(value) if value == "two_sided" => Alternative::TwoSided,
            Some(value) if value == "less" => Alternative::Less,
            Some(value) if value == "greater" => Alternative::Greater,
            _ => return Err(MathError::InvalidInput),
        };
        let alpha = if let Some(value) = options.get("alpha") {
            float(&decimal(
                &value
                    .as_str()
                    .map_or_else(|| value.to_string(), ToString::to_string),
            )?)?
        } else {
            0.05
        };
        if !(1e-12..=0.5).contains(&alpha) {
            return Err(MathError::Domain);
        }
        Ok(Self {
            alpha,
            tail,
            policy: missing(options)?,
        })
    }

    fn result(&self, statistic: f64, p: f64, df: Value, alt: &str) -> Checked<Value> {
        if !statistic.is_finite() {
            return Err(MathError::Limit);
        }
        if !p.is_finite() || !(0.0..=1.0).contains(&p) {
            return Err(MathError::NoConvergence);
        }
        Ok(
            json!({"statistic":statistic,"p_value":p,"alpha":self.alpha,"alternative":alt,
            "reject_null":p<=self.alpha,"degrees_of_freedom":df}),
        )
    }

    fn vector(&self, f: &Fields, name: &str) -> Checked<(Vec<Rational>, usize)> {
        Ok(stripped(vector(f.get(name)?, self.policy, MAX_ROWS)?))
    }
}

fn student_critical(df: f64, tail: f64) -> Checked<f64> {
    if tail == 0.5 {
        return Ok(0.0);
    }
    let (mut left, mut right) = (0.0, 1.0);
    for _ in 0..64 {
        if student_tail(df, right, true)? <= tail {
            break;
        }
        right *= 2.0;
    }
    if student_tail(df, right, true)? > tail {
        return Err(MathError::NoConvergence);
    }
    for _ in 0..96 {
        let midpoint = (left + right) / 2.0;
        if midpoint == left || midpoint == right {
            break;
        }
        if student_tail(df, midpoint, true)? > tail {
            left = midpoint;
        } else {
            right = midpoint;
        }
    }
    Ok(right)
}
fn normal() -> Normal {
    Normal::standard()
}

fn output(
    mut result: Value,
    method: &'static str,
    formula: &'static str,
    assumptions: &[&str],
) -> Output {
    result["assumptions"] = json!(assumptions);
    let mut output = Output::new(result, method, formula, assumptions);
    output.constraints.push("A p-value is a tail probability under the null model and assumptions. Significance does not establish causality. Numerical tails may underflow in binary64.".to_owned());
    output
}

fn optional(fields: &Fields, key: &str) -> Checked<Rational> {
    fields
        .optional(key)
        .map(scalar)
        .transpose()
        .map(Option::unwrap_or_default)
}

fn mean_test(fields: &Fields, test: &Test) -> Checked<Output> {
    fields.restrict(&["values", "null_mean", "known_sd"])?;
    let (values, missing) = test.vector(fields, "values")?;
    let n = values.len();
    if n < 2 {
        return Err(MathError::Domain);
    }
    let data = moments(&values)?;
    let null = optional(fields, "null_mean")?;
    let difference = float(&(&data.mean - &null))?;
    let estimate = float(&data.mean)?;
    let (mut result, method, formula, assumption) = if let Some(sd) = fields.optional("known_sd") {
        let sd = float(&scalar(sd)?)?;
        if sd <= 0.0 {
            return Err(MathError::Domain);
        }
        let se = sd / (n as f64).sqrt();
        let statistic = difference / se;
        let distribution = normal();
        let mut result = test.result(
            statistic,
            test.tail.tail_area(&distribution, statistic),
            Value::Null,
            test.tail.id(),
        )?;
        result["confidence_interval"] =
            test.tail
                .interval(&distribution, test.alpha, estimate, se)?;
        result["effect_size"] =
            json!({"method":"known_sd_standardized_difference","value":difference/sd});
        (
            result,
            "one_sample_z",
            "z = (mean − mu0) / (known_sigma / sqrt(n))",
            "Independent observations, a known population standard deviation, and a normal sampling distribution of the mean (or a justified normal approximation).",
        )
    } else {
        let variance = sample_variance(&data, n)?;
        if variance.is_zero() {
            return Err(MathError::Domain);
        }
        let se = float(&(&variance / rational(n)))?.sqrt();
        let statistic = difference / se;
        let df = (n - 1) as f64;
        let mut result = test.result(
            statistic,
            test.tail.student_p(df, statistic)?,
            json!(n - 1),
            test.tail.id(),
        )?;
        result["confidence_interval"] = test.tail.interval_cutoff(
            student_critical(df, test.tail.alpha_tail(test.alpha))?,
            test.alpha,
            estimate,
            se,
        )?;
        result["effect_size"] =
            json!({"method":"cohen_d","value":difference/float(&variance)?.sqrt()});
        (
            result,
            "one_sample_t",
            "t = (mean − mu0) / (s / sqrt(n))",
            "Independent observations and an approximately normal population for exact small-sample inference. The sample standard deviation must be positive.",
        )
    };
    result["count"] = json!(n);
    result["missing"] = json!(missing);
    result["estimate"] = json!(estimate);
    result["null_mean"] = json!(float(&null)?);
    Ok(output(
        result,
        method,
        formula,
        &[
            assumption,
            "Confidence interval targets the population mean; the input locations and test difference are centered in exact rational arithmetic.",
        ],
    ))
}

fn two_vectors(
    fields: &Fields,
    test: &Test,
    dependent: bool,
) -> Checked<(Vec<Rational>, Vec<Rational>, usize)> {
    if dependent {
        paired(
            vector(fields.get("x")?, test.policy, MAX_ROWS)?,
            vector(fields.get("y")?, test.policy, MAX_ROWS)?,
        )
    } else {
        let (x, a) = test.vector(fields, "x")?;
        let (y, b) = test.vector(fields, "y")?;
        Ok((x, y, a + b))
    }
}

fn difference_test(fields: &Fields, test: &Test) -> Checked<Output> {
    fields.restrict(&["x", "y", "paired", "null_difference"])?;
    let dependent = fields
        .optional("paired")
        .map(decode::<bool>)
        .transpose()?
        .unwrap_or(false);
    let null = optional(fields, "null_difference")?;
    let (x, y, missing) = two_vectors(fields, test, dependent)?;
    let (n, m) = (x.len(), y.len());
    if n < 2 || m < 2 {
        return Err(MathError::Domain);
    }
    let (estimate, variance_of_mean, effect_variance, df, method, formula, assumption) =
        if dependent {
            let differences = x.iter().zip(&y).map(|(x, y)| x - y).collect::<Vec<_>>();
            let input = moments(&differences)?;
            let variance = sample_variance(&input, n)?;
            (
                input.mean,
                &variance / rational(n),
                variance,
                (n - 1) as f64,
                "paired_t",
                "t = (mean(x−y) − delta0) / (sd(x−y) / sqrt(n))",
                "Aligned, mutually independent pairs; paired differences approximately normal for exact small-sample inference.",
            )
        } else {
            let (a, b) = (moments(&x)?, moments(&y)?);
            let (v1, v2) = (sample_variance(&a, n)?, sample_variance(&b, m)?);
            let (s1, s2) = (&v1 / rational(n), &v2 / rational(m));
            let sum = &s1 + &s2;
            if sum.is_zero() {
                return Err(MathError::Domain);
            }
            let (w1, w2) = (float(&(s1 / &sum))?, float(&(s2 / &sum))?);
            let df = 1.0 / (w1 * w1 / (n - 1) as f64 + w2 * w2 / (m - 1) as f64);
            let pooled = (&v1 * rational(n - 1) + &v2 * rational(m - 1)) / rational(n + m - 2);
            (
                a.mean - b.mean,
                sum,
                pooled,
                df,
                "welch_t",
                "t = (mean(x)−mean(y)−delta0) / sqrt(sx²/nx + sy²/ny)",
                "Independent observations within and across groups; approximate normality or justified large-sample approximation. Equal variances are not assumed.",
            )
        };
    if variance_of_mean.is_zero() {
        return Err(MathError::Domain);
    }
    let difference = float(&(&estimate - &null))?;
    let estimate = float(&estimate)?;
    let se = float(&variance_of_mean)?.sqrt();
    let statistic = difference / se;
    let mut result = test.result(
        statistic,
        test.tail.student_p(df, statistic)?,
        json!(df),
        test.tail.id(),
    )?;
    result["confidence_interval"] = test.tail.interval_cutoff(
        student_critical(df, test.tail.alpha_tail(test.alpha))?,
        test.alpha,
        estimate,
        se,
    )?;
    result["effect_size"] = json!({"method":if dependent {"cohen_dz"} else {"pooled_cohen_d"},"value":difference/float(&effect_variance)?.sqrt()});
    result["estimate"] = json!(estimate);
    result["null_difference"] = json!(float(&null)?);
    result["counts"] = json!([n, m]);
    result["missing"] = json!(missing);
    Ok(output(
        result,
        method,
        formula,
        &[
            assumption,
            "The mean difference is x minus y. The confidence interval targets the actual difference. Effect size standardizes the departure from the input null difference.",
        ],
    ))
}

fn probability_ordered_binomial(k: u64, n: u64, p: f64, alternative: Alternative) -> Checked<f64> {
    if p == 0.0 || p == 1.0 {
        let mass_at = if p == 0.0 { 0 } else { n };
        return Ok(f64::from(match alternative {
            Alternative::Less => k >= mass_at,
            Alternative::Greater => k <= mass_at,
            Alternative::TwoSided => k == mass_at,
        }));
    }
    match alternative {
        Alternative::Less => Ok(binomial_tails(n, p, k)?.0),
        Alternative::Greater => Ok(if k == 0 {
            1.0
        } else {
            binomial_tails(n, p, k - 1)?.1
        }),
        Alternative::TwoSided => {
            let log_observed = log_binomial_mass(n, p, k);
            let threshold = (32.0 * f64::EPSILON * n as f64).max(2e-12);
            let acceptable = |i: u64| log_binomial_mass(n, p, i) <= log_observed + threshold;
            let pivot = (((n + 1) as f64 * p).floor() as u64).min(n);
            if acceptable(pivot) {
                return Ok(1.0);
            }
            // Each side is monotonic away from a binomial mode. Once the boundaries
            // are known, get each whole tail without summing tiny masses.
            let (mut lo, mut hi) = (0, pivot);
            while hi - lo > 1 {
                let mid = (hi + lo) / 2;
                if acceptable(mid) {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            let lower = if acceptable(lo) {
                binomial_tails(n, p, lo)?.0
            } else {
                0.0
            };
            let (mut lo, mut hi) = (pivot, n);
            while hi - lo > 1 {
                let mid = (hi + lo) / 2;
                if acceptable(mid) {
                    hi = mid;
                } else {
                    lo = mid;
                }
            }
            let upper = if acceptable(hi) {
                binomial_tails(n, p, hi - 1)?.1
            } else {
                0.0
            };
            Ok((lower + upper).min(1.0))
        }
    }
}

fn wilson(p: f64, n: f64, test: &Test) -> Value {
    let z = -normal().inverse_cdf(
        test.alpha
            / if matches!(test.tail, Alternative::TwoSided) {
                2.0
            } else {
                1.0
            },
    );
    let scale = 1.0 + z * z / n;
    let center = (p + z * z / (2.0 * n)) / scale;
    let half = z * (p * (1.0 - p) / n + z * z / (4.0 * n * n)).sqrt() / scale;
    json!({"level":1.0-test.alpha,"method":"wilson_score","lower":if matches!(test.tail,Alternative::Less) {0.0} else {(center-half).max(0.0)},
       "upper":if matches!(test.tail,Alternative::Greater) {1.0} else {(center+half).min(1.0)}})
}

fn proportion(fields: &Fields, test: &Test) -> Checked<Output> {
    fields.restrict(&["successes", "trials", "p0"])?;
    let (k, n) = (
        whole(fields.get("successes")?, 1_000_000)?,
        whole(fields.get("trials")?, 1_000_000)?,
    );
    let p = scalar(fields.get("p0")?)?;
    if n == 0 || k > n || p < Rational::zero() || p > Rational::one() {
        return Err(MathError::Domain);
    }
    let p_float = float(&p)?;
    if (p_float == 0.0 && !p.is_zero()) || (p_float == 1.0 && !p.is_one()) {
        return Err(MathError::Limit);
    }
    let estimate = k as f64 / n as f64;
    let cohen_h = 2.0 * (estimate.sqrt().asin() - p_float.sqrt().asin());
    let mut result = test.result(
        k as f64,
        probability_ordered_binomial(k, n, p_float, test.tail)?,
        Value::Null,
        test.tail.id(),
    )?;
    result["estimate"] = json!(estimate);
    result["trials"] = json!(n);
    result["null_proportion"] = json!(p_float);
    result["confidence_interval"] = wilson(estimate, n as f64, test);
    result["effect_size"] = json!({"method":"cohen_h","value":cohen_h});
    Ok(output(
        result,
        "exact_binomial_probability_ordering",
        "P = sum P(X=j) for outcomes at least as unlikely as the observation under H0",
        &[
            "Fixed number of independent Bernoulli trials with common success probability. Two-sided p uses probability ordering; one-sided p uses the corresponding inclusive binomial tail.",
            "The Wilson score interval is a separate approximate interval. Exact binomial means an exact distribution, evaluated numerically in binary64.",
        ],
    ))
}

fn chi_square(fields: &Fields, test: &Test, independent: bool) -> Checked<Output> {
    let (observed, expected, df, effect_divisor, shape) = if independent {
        fields.restrict(&["table"])?;
        let table: Vec<Raw> = decode(fields.get("table")?)?;
        if table.len() < 2 {
            return Err(MathError::Domain);
        }
        if table.len() > 16 {
            return Err(MathError::Limit);
        }
        let rows = table
            .iter()
            .map(|row| {
                vector(row, Missing::Reject, 16)
                    .map(|row| row.into_iter().flatten().collect::<Vec<_>>())
            })
            .collect::<Checked<Vec<_>>>()?;
        let (r, c) = (rows.len(), rows[0].len());
        if c < 2 || rows.iter().any(|row| row.len() != c) {
            return Err(MathError::Domain);
        }
        let margins = rows
            .iter()
            .map(|row| row.iter().sum::<Rational>())
            .collect::<Vec<_>>();
        let totals = (0..c)
            .map(|j| rows.iter().map(|row| &row[j]).sum::<Rational>())
            .collect::<Vec<_>>();
        let n = margins.iter().sum::<Rational>();
        if !n.is_positive() {
            return Err(MathError::Domain);
        }
        let mut expected = Vec::with_capacity(r * c);
        for margin in &margins {
            for total in &totals {
                expected.push(margin * total / &n);
            }
        }
        (
            rows.into_iter().flatten().collect(),
            expected,
            (r - 1) * (c - 1),
            n * rational((r - 1).min(c - 1)),
            json!([r, c]),
        )
    } else {
        fields.restrict(&["observed", "expected"])?;
        let observed = vector(fields.get("observed")?, Missing::Reject, 64)?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        let expected = vector(fields.get("expected")?, Missing::Reject, 64)?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        if observed.len() < 2 || observed.len() != expected.len() {
            return Err(MathError::Domain);
        }
        let total = observed.iter().sum::<Rational>();
        if total != expected.iter().sum::<Rational>() {
            return Err(MathError::Domain);
        }
        let df = observed.len() - 1;
        (observed, expected, df, total, Value::Null)
    };
    if observed.iter().any(|x| x.is_negative() || !x.is_integer())
        || expected.iter().any(|x| x < &rational(5))
    {
        return Err(MathError::Domain);
    }
    let statistic = observed
        .iter()
        .zip(&expected)
        .map(|(o, e)| (o - e).pow(2) / e)
        .sum::<Rational>();
    let stat = float(&statistic)?;
    let law = ChiSquared::new(df as f64).map_err(|_| MathError::Domain)?;
    let mut result = test.result(stat, law.sf(stat), json!(df), "upper_tail")?;
    result["effect_size"] = json!({"method":if independent {"cramers_v"} else {"cohen_w"},"value":float(&(statistic/effect_divisor))?.sqrt()});
    result["shape"] = shape;
    let (method, assumption) = if independent {
        (
            "pearson_chi_square_independence",
            "Independent observations cross-classified in mutually exclusive rows and columns. Expected counts use fitted independence margins.",
        )
    } else {
        (
            "pearson_chi_square_goodness_of_fit",
            "Independent counts in disjoint categories, with fixed expected counts and equal observed and expected totals. No parameters are estimated from these data.",
        )
    };
    Ok(output(
        result,
        method,
        "chi² = sum((observed − expected)² / expected)",
        &[
            assumption,
            "This asymptotic implementation requires every expected cell count to be at least 5. No continuity correction is applied.",
        ],
    ))
}

fn anova(fields: &Fields, test: &Test) -> Checked<Output> {
    fields.restrict(&["groups"])?;
    let groups: Vec<Raw> = decode(fields.get("groups")?)?;
    if groups.len() < 2 {
        return Err(MathError::Domain);
    }
    if groups.len() > 16 {
        return Err(MathError::Limit);
    }
    let (mut n, mut missing, mut within) = (0, 0, Rational::zero());
    let mut means = Vec::new();
    for raw in &groups {
        let (values, m) = stripped(vector(raw, test.policy, MAX_ROWS)?);
        if values.len() < 2 {
            return Err(MathError::Domain);
        }
        n += values.len();
        missing += m;
        if n > MAX_ROWS {
            return Err(MathError::Limit);
        }
        let group = moments(&values)?;
        within += group.sum_squares;
        means.push((group.mean, values.len()));
    }
    if within.is_zero() {
        return Err(MathError::Domain);
    }
    let overall = means
        .iter()
        .map(|(mean, n)| mean * rational(*n))
        .sum::<Rational>()
        / rational(n);
    let between = means
        .iter()
        .map(|(mean, n)| (mean - &overall).pow(2) * rational(*n))
        .sum::<Rational>();
    let (d1, d2) = (groups.len() - 1, n - groups.len());
    let error = &within / rational(d2);
    let stat = float(&(&between / rational(d1) / &error))?;
    let mut result = test.result(
        stat,
        fisher_tail(d1 as f64, d2 as f64, stat, true)?,
        json!([d1, d2]),
        "upper_tail",
    )?;
    let total = &between + &within;
    result["effect_size"] = json!({"method":"eta_squared","value":float(&(&between/&total))?,"omega_squared":float(&((&between-rational(d1)*&error)/(&total+&error)))?});
    result["count"] = json!(n);
    result["missing"] = json!(missing);
    Ok(output(
        result,
        "one_way_fixed_effects_anova",
        "F = MS_between / MS_within",
        &[
            "Independent observations, approximately normal group residuals, and common within-group variance. This is an omnibus test of equal means.",
            "Eta-squared and untruncated omega-squared quantify group-associated variance. Post-hoc comparisons and multiplicity adjustments are outside this operation.",
        ],
    ))
}

fn rank_test(fields: &Fields, test: &Test) -> Checked<Output> {
    fields.restrict(&["x", "y"])?;
    let (mut x, y, missing) = two_vectors(fields, test, false)?;
    let (n, m) = (x.len(), y.len());
    if n < 5 || m < 5 {
        return Err(MathError::Domain);
    }
    x.extend(y);
    let (rank, ties) = ranks(&x);
    let u = rank[..n].iter().sum::<Rational>() - rational(n * (n + 1) / 2);
    let u = float(&u)?;
    let nm = (n * m) as f64;
    let total = (n + m) as f64;
    let tie = ties
        .iter()
        .map(|&size| {
            let s = size as f64;
            s * s * s - s
        })
        .sum::<f64>();
    let variance = nm / 12.0 * (total + 1.0 - tie / (total * (total - 1.0)));
    if variance <= 0.0 {
        return Err(MathError::Domain);
    }
    let distance = u - nm / 2.0;
    let d = normal();
    let standard = variance.sqrt();
    let p = match test.tail {
        Alternative::TwoSided => 2.0 * d.sf((distance.abs() - 0.5).max(0.0) / standard),
        Alternative::Less => d.cdf((distance + 0.5) / standard),
        Alternative::Greater => d.sf((distance - 0.5) / standard),
    };
    let mut result = test.result(u, p, Value::Null, test.tail.id())?;
    result["effect_size"] = json!({"method":"rank_biserial","value":2.0*u/nm-1.0});
    result["counts"] = json!([n, m]);
    result["missing"] = json!(missing);
    Ok(output(
        result,
        "mann_whitney_u_asymptotic",
        "U_x = sum(ranks_x) − n_x(n_x+1)/2",
        &[
            "Independent groups of at least five observations, with exchangeable observations under the distributional null.",
            "Average ranks, tie-adjusted normal approximation and a 0.5 continuity correction. This tests distributional separation; a location/median interpretation needs additional shape assumptions.",
        ],
    ))
}

fn sign_test(fields: &Fields, test: &Test) -> Checked<Output> {
    fields.restrict(&["x", "y", "null_difference"])?;
    let (x, y, missing) = two_vectors(fields, test, true)?;
    let null = optional(fields, "null_difference")?;
    let (mut pos, mut neg, mut tied) = (0, 0, 0);
    for (x, y) in x.into_iter().zip(y) {
        match (x - y).cmp(&null) {
            std::cmp::Ordering::Greater => pos += 1,
            std::cmp::Ordering::Less => neg += 1,
            std::cmp::Ordering::Equal => tied += 1,
        }
    }
    let n = pos + neg;
    if n == 0 {
        return Err(MathError::Domain);
    }
    let mut result = test.result(
        pos as f64,
        probability_ordered_binomial(pos, n, 0.5, test.tail)?,
        Value::Null,
        test.tail.id(),
    )?;
    result["estimate"] = json!(pos as f64 / n as f64);
    result["effect_size"] =
        json!({"method":"paired_sign_balance","value":(pos as f64-neg as f64)/n as f64});
    result["counts"] = json!({"positive":pos,"negative":neg,"tied":tied,"missing":missing});
    Ok(output(
        result,
        "paired_exact_sign_test",
        "X = count(x−y > delta0); under H0 X ~ Binomial(n_nonzero, 1/2)",
        &[
            "Mutually independent aligned pairs. Differences exactly equal to the null are removed. The null asserts balanced positive and negative signs among nonzero differences.",
        ],
    ))
}

pub(super) fn evaluate(
    operation: &str,
    fields: &Fields,
    options: &Map<String, Value>,
) -> Checked<Output> {
    let output = match operation {
        "mean_test" => mean_test(fields, &Test::new(options, true, true)?)?,
        "difference_test" => difference_test(fields, &Test::new(options, true, true)?)?,
        "proportion_test" => proportion(fields, &Test::new(options, true, false)?)?,
        "chi_square" | "chi_square_independence" => chi_square(
            fields,
            &Test::new(options, false, false)?,
            operation == "chi_square_independence",
        )?,
        "anova" => anova(fields, &Test::new(options, false, true)?)?,
        "rank_test" => rank_test(fields, &Test::new(options, true, true)?)?,
        "sign_test" => sign_test(fields, &Test::new(options, true, true)?)?,
        _ => return Err(MathError::Unsupported),
    };
    Ok(output)
}
