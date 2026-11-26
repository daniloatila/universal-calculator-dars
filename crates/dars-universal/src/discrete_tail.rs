//! Bounded regularized beta ratios for scientific distributions and inference.

use crate::MathError;

// DLMF 5.11.1 and 5.5.1. Reduce small arguments with the recurrence first,
// then combine Stirling logs before subtraction. This preserves log beta for
// very different shape magnitudes where subtracting lgamma(b) from lgamma(a+b)
// can lose the full result.
fn log_beta(mut a: f64, mut b: f64) -> f64 {
    let mut recurrence = 0.0;
    while a < 8.0 {
        recurrence += (b / a).ln_1p();
        a += 1.0;
    }
    while b < 8.0 {
        recurrence += (a / b).ln_1p();
        b += 1.0;
    }
    let total = a + b;
    let correction = |x: f64| {
        let inverse = 1.0 / x;
        let sq = inverse * inverse;
        inverse
            * (1.0 / 12.0
                + sq * (-1.0 / 360.0
                    + sq * (1.0 / 1260.0
                        + sq * (-1.0 / 1680.0
                            + sq * (1.0 / 1188.0
                                + sq * (-691.0 / 360360.0 + sq * (7.0 / 1092.0)))))))
    };
    // log(a/(a+b)) = -log1p(b/a), even when a/(a+b) would round to one.
    recurrence - (a - 0.5) * (b / a).ln_1p() - (b - 0.5) * (a / b).ln_1p()
        + 0.5 * (std::f64::consts::TAU.ln() - total.ln())
        + correction(a)
        + correction(b)
        - correction(total)
}

// Modified Lentz evaluation of the incomplete beta continued fraction (DLMF
// 8.17.22). A finite cap gives the caller an explicit nonconvergence instead
// of returning a partially converged tail.
fn fraction(a: f64, b: f64, x: f64) -> Result<f64, MathError> {
    const FLOOR: f64 = 1e-292;
    const FACTOR_TOLERANCE: f64 = 8.0 * f64::EPSILON;
    let nonzero = |value: f64| {
        if value.abs() < FLOOR {
            FLOOR.copysign(value)
        } else {
            value
        }
    };
    let (ab, a1, a0) = (a + b, a + 1.0, a - 1.0);
    let mut c = 1.0;
    let mut d = 1.0 / nonzero(1.0 - ab * x / a1);
    let mut h = d;
    for m in 1..=4096 {
        let m = f64::from(m);
        let m2 = 2.0 * m;
        let even = (m / (a + m2)) * ((b - m) / (a0 + m2)) * x;
        d = 1.0 / nonzero(1.0 + even * d);
        c = nonzero(1.0 + even / c);
        h *= d * c;
        let odd = -((a + m) / (a + m2)) * ((ab + m) / (a1 + m2)) * x;
        d = 1.0 / nonzero(1.0 + odd * d);
        c = nonzero(1.0 + odd / c);
        let change = d * c;
        h *= change;
        if (change - 1.0).abs() <= FACTOR_TOLERANCE {
            if h > 0.0 && h.is_finite() {
                return Ok(h);
            }
            break;
        }
    }
    Err(MathError::NoConvergence)
}

/// Return (regularized lower, regularized upper). Pass the complementary
/// argument separately when it has a stable direct expression.
pub(super) fn beta_tails(a: f64, b: f64, x: f64, complement: f64) -> Result<(f64, f64), MathError> {
    if x == 0.0 {
        return Ok((0.0, 1.0));
    }
    if complement == 0.0 {
        return Ok((1.0, 0.0));
    }
    if !a.is_finite()
        || !b.is_finite()
        || !(0.0..=1.0).contains(&x)
        || !(0.0..=1.0).contains(&complement)
    {
        return Err(MathError::NoConvergence);
    }
    let stable_log = |p: f64, q: f64| if p > 0.5 { (-q).ln_1p() } else { p.ln() };
    let pivot = (a + 1.0) / (a + b + 2.0);
    let swap = if pivot > 0.5 {
        complement <= (b + 1.0) / (a + b + 2.0)
    } else {
        x >= pivot
    };
    let normalizer = a * stable_log(x, complement) + b * stable_log(complement, x) - log_beta(a, b);
    let (shape, alternate, arg) = if swap { (b, a, complement) } else { (a, b, x) };
    let direct_log = normalizer + fraction(shape, alternate, arg)?.ln() - shape.ln();
    if !direct_log.is_finite() || direct_log > 1e-8 {
        return Err(MathError::NoConvergence);
    }
    let direct_log = direct_log.min(0.0);
    let direct = direct_log.exp();
    let other = -direct_log.exp_m1();
    if swap {
        Ok((other, direct))
    } else {
        Ok((direct, other))
    }
}

pub(super) fn binomial_tails(n: u64, p: f64, k: u64) -> Result<(f64, f64), MathError> {
    if k >= n || p == 0.0 {
        return Ok((1.0, 0.0));
    }
    if p == 1.0 {
        return Ok((0.0, 1.0));
    }
    // Here both tails are exact binary64 dyadic sums. This makes quantiles on
    // exact CDF jumps select the correct side without any near-equality fudge.
    if p == 0.5 && n <= 52 {
        let mut coefficient = 1u64;
        let mut total = coefficient;
        for i in 0..k {
            coefficient = coefficient * (n - i) / (i + 1);
            total += coefficient;
        }
        let size = 1u64 << n;
        return Ok((
            total as f64 / size as f64,
            (size - total) as f64 / size as f64,
        ));
    }
    beta_tails(k as f64 + 1.0, (n - k) as f64, p, 1.0 - p).map(|(upper, lower)| (lower, upper))
}

#[cfg(feature = "statistics")]
pub(super) fn log_binomial_mass(n: u64, p: f64, k: u64) -> f64 {
    -((n + 1) as f64).ln() - log_beta(k as f64 + 1.0, (n - k) as f64 + 1.0)
        + k as f64 * p.ln()
        + (n - k) as f64 * (-p).ln_1p()
}

pub(super) fn student_tail(df: f64, x: f64, upper: bool) -> Result<f64, MathError> {
    if df == 1.0 && x.abs() > 1.0 {
        let tail = (1.0 / x.abs()).atan() / std::f64::consts::PI;
        return Ok(if (x > 0.0) == upper { tail } else { 1.0 - tail });
    }
    let scaled = x.abs() / df.sqrt();
    let square = scaled * scaled;
    if square <= 1.0 {
        let argument = square / (1.0 + square);
        let central = beta_tails(0.5, df / 2.0, argument, 1.0 / (1.0 + square))?.0;
        if (x > 0.0) == upper {
            Ok((1.0 - central) / 2.0)
        } else {
            Ok((1.0 + central) / 2.0)
        }
    } else {
        let inverse_square = (1.0 / scaled).powi(2);
        let argument = inverse_square / (1.0 + inverse_square);
        let tail = beta_tails(df / 2.0, 0.5, argument, 1.0 / (1.0 + inverse_square))?.0 / 2.0;
        if (x > 0.0) == upper {
            Ok(tail)
        } else {
            Ok(1.0 - tail)
        }
    }
}

pub(super) fn fisher_tail(df1: f64, df2: f64, x: f64, upper: bool) -> Result<f64, MathError> {
    let scaled = (df1 / df2) * x;
    let reciprocal = 1.0 / (1.0 + scaled);
    let argument = if scaled <= 1.0 {
        scaled / (1.0 + scaled)
    } else {
        1.0 - reciprocal
    };
    let (lower, higher) = beta_tails(df1 / 2.0, df2 / 2.0, argument, reciprocal)?;
    Ok(if upper { higher } else { lower })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binomial_center_converges_for_large_symmetric_shape() {
        let expected = 0.500_398_942_180_665;
        let (lower, upper) = binomial_tails(1_000_000, 0.5, 500_000).unwrap();
        assert!((lower - expected).abs() < 2e-8, "{lower}");
        assert!((lower + upper - 1.0).abs() <= f64::EPSILON);
        assert_eq!(binomial_tails(10, 0.5, 5), Ok((0.623046875, 0.376953125)));
    }
}
