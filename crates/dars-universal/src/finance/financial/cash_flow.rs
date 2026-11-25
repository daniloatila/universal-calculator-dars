#[path = "numeric.rs"]
mod numeric;

use super::{MathError, Rational, number};
use jiff::civil::Date;
use num_traits::{Signed, Zero};
#[cfg(feature = "financial")]
pub(super) use numeric::nth_root;
pub(super) use numeric::{Numeric, bounded, power};
use std::cmp::Ordering;

pub(super) fn calendar_days(start: Date, end: Date) -> i64 {
    end.duration_since(start).as_secs() / 86_400
}

pub(super) fn sign_variations<'a>(values: impl Iterator<Item = &'a Rational>) -> usize {
    let mut previous = None;
    let mut changes = 0;
    for value in values.filter(|value| !value.is_zero()) {
        let negative = value.is_negative();
        changes += usize::from(previous.is_some_and(|previous| previous != negative));
        previous = Some(negative);
    }
    changes
}

#[cfg(feature = "financial")]
pub(super) fn dated_factor(
    numeric: &mut Numeric,
    base: &Rational,
    exponent: &Rational,
) -> Result<Rational, MathError> {
    if base == &number(1) || exponent.is_zero() {
        return Ok(number(1));
    }
    if exponent.is_integer() {
        use num_traits::ToPrimitive;
        let periods = exponent.to_integer().to_i32().ok_or(MathError::Limit)?;
        let factor = power(base, periods.unsigned_abs());
        if let Ok(factor) = factor {
            return Ok(if periods < 0 { factor.recip() } else { factor });
        }
    }
    numeric.fractional_power(base, exponent)
}

pub(super) fn estimated_dated_rate(flows: &[(Rational, Rational)]) -> Result<Rational, MathError> {
    if sign_variations(flows.iter().map(|(_, cash)| cash)) != 1 {
        return Err(MathError::Domain);
    }
    let at_zero = flows.iter().map(|(_, cash)| cash).sum::<Rational>();
    if at_zero.is_zero() {
        return Ok(number(0));
    }
    let mut numeric = Numeric::new()?;
    let prepared = numeric.prepare_discounting(flows);
    let mut sign = |rate: &Rational| numeric.discounted_sign(&prepared, &(number(1) + rate));
    // Test the sign at zero and use cash-flow orientation to explore one side.
    let initial_negative = flows
        .iter()
        .find(|(_, cash)| !cash.is_zero())
        .ok_or(MathError::Domain)?
        .1
        .is_negative();
    let search_positive = at_zero.is_negative() != initial_negative;
    let initial_sign = at_zero.cmp(&number(0));
    let mut near = number(0);
    let mut far = if search_positive {
        number(1)
    } else {
        -number(1) / number(2)
    };
    let min_rate = -number(999_999_999_999) / number(1_000_000_000_000);
    let max_rate = number(10_000);
    loop {
        let at_far = sign(&far)?;
        if at_far == Ordering::Equal {
            return Ok(far);
        }
        if at_far != initial_sign {
            break;
        }
        if far == min_rate || far == max_rate {
            return Err(MathError::NoConvergence);
        }
        near = far.clone();
        far = if search_positive {
            (far * number(2)).min(max_rate.clone())
        } else {
            ((far - number(1)) / number(2)).max(min_rate.clone())
        };
    }
    let tolerance = number(1) / number(1_000_000_000_000);
    for _ in 0..80 {
        let middle = (&near + &far) / number(2);
        if (&near - &far).abs() <= tolerance {
            return Ok(middle);
        }
        let at_middle = sign(&middle)?;
        if at_middle == Ordering::Equal {
            return Ok(middle);
        }
        if at_middle == initial_sign {
            near = middle;
        } else {
            far = middle;
        }
    }
    Err(MathError::NoConvergence)
}
