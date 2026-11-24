use std::cmp::Ordering;

use num_bigint::BigInt;
use num_integer::Integer;
use num_rational::BigRational;
use num_traits::{One, Signed, ToPrimitive, Zero};

use crate::Error;

pub(crate) const MAX_BITS: u64 = 8192;
const MAX_POWER: u32 = 10_000;
const MAX_DEGREE: u32 = 64;
const WORKING_DIGITS: i32 = 52;
const DISPLAY_DIGITS: i32 = 24;

pub(crate) type Rational = BigRational;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Operator {
    Add,
    Subtract,
    Multiply,
    Divide,
    Power,
}

#[derive(Clone)]
pub(crate) enum Value {
    Exact(Rational),
    Interval { lower: Rational, upper: Rational },
}

impl Value {
    fn exact(value: Rational) -> Result<Self, Error> {
        check_size(&value)?;
        Ok(Self::Exact(value))
    }

    fn interval(lower: Rational, upper: Rational) -> Result<Self, Error> {
        if lower == upper {
            return Self::exact(lower);
        }
        let lower = quantize(&lower, WORKING_DIGITS, Rounding::Down).to_rational();
        let upper = quantize(&upper, WORKING_DIGITS, Rounding::Up).to_rational();
        check_size(&lower)?;
        check_size(&upper)?;
        Ok(Self::Interval { lower, upper })
    }

    fn bounds(&self) -> (&Rational, &Rational) {
        match self {
            Self::Exact(value) => (value, value),
            Self::Interval { lower, upper } => (lower, upper),
        }
    }

    pub(crate) fn negate(self) -> Self {
        match self {
            Self::Exact(value) => Self::Exact(-value),
            Self::Interval { lower, upper } => Self::Interval {
                lower: -upper,
                upper: -lower,
            },
        }
    }

    pub(crate) fn percent(self) -> Result<Self, Error> {
        self.apply(
            Operator::Divide,
            &Self::Exact(Rational::from_integer(100.into())),
        )
    }

    pub(crate) fn apply(&self, op: Operator, rhs: &Self) -> Result<Self, Error> {
        if matches!(op, Operator::Power) {
            return self.power(rhs);
        }
        if let (Self::Exact(a), Self::Exact(b)) = (self, rhs) {
            return Self::exact(match op {
                Operator::Add => a + b,
                Operator::Subtract => a - b,
                Operator::Multiply => a * b,
                Operator::Divide if b.is_zero() => return Err(Error::DivisionByZero),
                Operator::Divide => a / b,
                Operator::Power => unreachable!("exponentiation is dispatched above"),
            });
        }
        let (a, b) = self.bounds();
        let (c, d) = rhs.bounds();
        match op {
            Operator::Add => Self::interval(a + c, b + d),
            Operator::Subtract => Self::interval(a - d, b - c),
            Operator::Multiply => Self::extremes([a * c, a * d, b * c, b * d]),
            Operator::Divide if c.is_zero() && d.is_zero() => Err(Error::DivisionByZero),
            Operator::Divide if !c.is_positive() && !d.is_negative() => Err(Error::PrecisionLimit),
            Operator::Divide => Self::extremes([a / c, a / d, b / c, b / d]),
            Operator::Power => unreachable!("exponentiation is dispatched above"),
        }
    }

    fn extremes(mut points: [Rational; 4]) -> Result<Self, Error> {
        points.sort_unstable();
        let [lower, _, _, upper] = points;
        Self::interval(lower, upper)
    }

    fn power(&self, exponent: &Self) -> Result<Self, Error> {
        let Self::Exact(exponent) = exponent else {
            return Err(Error::UnsupportedExponent);
        };
        let (Some(degree), Some(numerator)) =
            (exponent.denom().to_u32(), exponent.numer().to_i32())
        else {
            return Err(Error::UnsupportedExponent);
        };
        if degree > MAX_DEGREE || numerator.unsigned_abs() > MAX_POWER {
            return Err(Error::UnsupportedExponent);
        }

        let identity = Self::Exact(Rational::one());
        let (lower, upper) = self.bounds();
        if numerator == 0 {
            if lower.is_zero() && upper.is_zero() {
                return Err(Error::DomainError);
            }
            if !lower.is_positive() && !upper.is_negative() {
                return Err(Error::PrecisionLimit);
            }
            return Ok(identity);
        }

        // Bound integer exponentiation through checked squaring. Taking the
        // rational exponent's root first avoids an unnecessarily large power.
        let mut base = if degree == 1 {
            self.clone()
        } else {
            self.root(degree)?
        };
        if numerator < 0 {
            base = identity.apply(Operator::Divide, &base)?;
        }
        let mut result = identity;
        let mut remaining = numerator.unsigned_abs();
        while remaining != 0 {
            if remaining & 1 == 1 {
                result = result.apply(Operator::Multiply, &base)?;
            }
            remaining >>= 1;
            if remaining != 0 {
                base = base.apply(Operator::Multiply, &base)?;
            }
        }
        Ok(result)
    }

    pub(crate) fn root_degree(&self) -> Result<u32, Error> {
        let Self::Exact(degree) = self else {
            return Err(Error::DomainError);
        };
        if !degree.is_integer() {
            return Err(Error::DomainError);
        }
        degree
            .numer()
            .to_u32()
            .filter(|degree| (2..=MAX_DEGREE).contains(degree))
            .ok_or(Error::DomainError)
    }

    pub(crate) fn root(&self, degree: u32) -> Result<Self, Error> {
        let (lower, upper) = self.bounds();
        if degree.is_multiple_of(2) {
            if upper.is_negative() {
                return Err(Error::DomainError);
            }
            if lower.is_negative() {
                return Err(Error::PrecisionLimit);
            }
        }
        let (lower_root, upper_root) = root_bounds(lower, degree);
        if lower == upper {
            return Self::interval(lower_root, upper_root);
        }
        let (_, upper_root) = root_bounds(upper, degree);
        Self::interval(lower_root, upper_root)
    }

    pub(crate) fn display(&self) -> Result<(Option<String>, String), Error> {
        let (lower, upper) = self.bounds();
        let approximation = quantize(lower, DISPLAY_DIGITS, Rounding::NearestEven).to_decimal();
        if lower != upper
            && approximation != quantize(upper, DISPLAY_DIGITS, Rounding::NearestEven).to_decimal()
        {
            return Err(Error::PrecisionLimit);
        }
        let exact = match self {
            Self::Exact(value) => Some(value.to_string()),
            Self::Interval { .. } => None,
        };
        Ok((exact, approximation))
    }
}

fn check_size(value: &Rational) -> Result<(), Error> {
    if value.numer().bits().max(value.denom().bits()) > MAX_BITS {
        return Err(Error::MagnitudeLimit);
    }
    Ok(())
}

pub(crate) fn power_of_ten(exponent: u32) -> BigInt {
    BigInt::from(10u8).pow(exponent)
}

fn root_bounds(value: &Rational, degree: u32) -> (Rational, Rational) {
    if value.is_zero() {
        return (Rational::zero(), Rational::zero());
    }
    let magnitude = value.numer().abs();
    let numerator_root = magnitude.nth_root(degree);
    let denominator_root = value.denom().nth_root(degree);
    if numerator_root.pow(degree) == magnitude && denominator_root.pow(degree) == *value.denom() {
        let exact = Rational::new(
            if value.is_negative() {
                -numerator_root
            } else {
                numerator_root
            },
            denominator_root,
        );
        return (exact.clone(), exact);
    }

    // For positive x, floor(root(x) * 10^places) is the integer root of
    // floor(x * 10^(degree * places)). Neighboring grid points enclose the root.
    let root_exponent = decimal_exponent(&magnitude, value.denom()).div_euclid(degree as i32);
    let places = WORKING_DIGITS - 1 - root_exponent;
    let shifted = scale_ten(&value.abs(), places * degree as i32);
    let floor = shifted.to_integer().nth_root(degree);
    let upper = scale_ten(&Rational::from_integer(&floor + 1u8), -places);
    let lower = scale_ten(&Rational::from_integer(floor), -places);
    if value.is_negative() {
        (-upper, -lower)
    } else {
        (lower, upper)
    }
}

fn decimal_exponent(numerator: &BigInt, denominator: &BigInt) -> i32 {
    debug_assert!(numerator.is_positive() && denominator.is_positive());
    let estimate =
        numerator.to_str_radix(10).len() as i32 - denominator.to_str_radix(10).len() as i32;
    let below_estimate = if estimate >= 0 {
        *numerator < denominator * power_of_ten(estimate as u32)
    } else {
        numerator * power_of_ten(estimate.unsigned_abs()) < *denominator
    };
    if below_estimate {
        estimate - 1
    } else {
        estimate
    }
}

fn scale_ten(value: &Rational, places: i32) -> Rational {
    if places == 0 {
        return value.clone();
    }
    let factor = power_of_ten(places.unsigned_abs());
    if places > 0 {
        value * factor
    } else {
        value / factor
    }
}

enum Rounding {
    Down,
    Up,
    NearestEven,
}

struct Decimal {
    coefficient: BigInt,
    places: i32,
}

fn quantize(value: &Rational, digits: i32, rounding: Rounding) -> Decimal {
    if value.is_zero() {
        return Decimal {
            coefficient: BigInt::zero(),
            places: 0,
        };
    }
    let places = digits - 1 - decimal_exponent(&value.numer().abs(), value.denom());
    let shifted = scale_ten(value, places);
    let numerator = shifted.numer();
    let denominator = shifted.denom();
    let coefficient = match rounding {
        Rounding::Down => numerator.div_floor(denominator),
        Rounding::Up => numerator.div_ceil(denominator),
        Rounding::NearestEven => {
            let (quotient, remainder) = numerator.abs().div_rem(denominator);
            let round_up = match (&remainder * 2u8).cmp(denominator) {
                Ordering::Greater => true,
                Ordering::Equal => quotient.is_odd(),
                Ordering::Less => false,
            };
            let rounded = quotient + u8::from(round_up);
            if numerator.is_negative() {
                -rounded
            } else {
                rounded
            }
        }
    };
    Decimal {
        coefficient,
        places,
    }
}

impl Decimal {
    fn to_rational(&self) -> Rational {
        scale_ten(
            &Rational::from_integer(self.coefficient.clone()),
            -self.places,
        )
    }

    fn to_decimal(&self) -> String {
        let magnitude = self.coefficient.abs().to_str_radix(10);
        let mut formatted = if self.coefficient.is_negative() {
            String::from("-")
        } else {
            String::new()
        };
        if self.places <= 0 {
            formatted.push_str(&magnitude);
            formatted.extend(std::iter::repeat_n(
                '0',
                self.places.unsigned_abs() as usize,
            ));
            return formatted;
        }
        let places = self.places as usize;
        if places < magnitude.len() {
            let (whole, fractional) = magnitude.split_at(magnitude.len() - places);
            formatted.push_str(whole);
            formatted.push('.');
            formatted.push_str(fractional);
        } else {
            formatted.push_str("0.");
            formatted.extend(std::iter::repeat_n('0', places - magnitude.len()));
            formatted.push_str(&magnitude);
        }
        formatted
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_owned()
    }
}
