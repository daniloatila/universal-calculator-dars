use crate::MathError;
use num_bigint::{BigInt, BigUint};
use num_integer::Integer;
use num_rational::BigRational;
use num_traits::{One, Signed, Zero};
use std::cmp::Ordering;

pub(super) type Rational = BigRational;
pub(super) type Checked<T> = Result<T, MathError>;

pub(super) fn checked(value: Rational) -> Checked<Rational> {
    if value.numer().bits().max(value.denom().bits()) <= 4096 {
        Ok(value)
    } else {
        Err(MathError::Limit)
    }
}

fn decimal(value: &str) -> Checked<Rational> {
    let (mantissa, exponent) = match value.split_once(['e', 'E']) {
        Some((mantissa, exponent)) => {
            let exponent = exponent
                .parse::<i32>()
                .map_err(|error| match error.kind() {
                    std::num::IntErrorKind::PosOverflow | std::num::IntErrorKind::NegOverflow => {
                        MathError::Limit
                    }
                    _ => MathError::InvalidInput,
                })?;
            (mantissa, exponent)
        }
        None => (value, 0),
    };
    let (negative, mantissa) = match mantissa.strip_prefix(['-', '−']) {
        Some(mantissa) => (true, mantissa),
        None => (false, mantissa.strip_prefix('+').unwrap_or(mantissa)),
    };
    let (whole, fractional) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    if whole.len() + fractional.len() > 128 || exponent.unsigned_abs() > 256 {
        return Err(MathError::Limit);
    }
    let digits = format!("{whole}{fractional}");
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(MathError::InvalidInput);
    }
    let value = BigInt::parse_bytes(digits.as_bytes(), 10).ok_or(MathError::InvalidInput)?;
    let value = if negative { -value } else { value };
    let scale = exponent - fractional.len() as i32;
    let factor = BigInt::from(10u8).pow(scale.unsigned_abs());
    checked(if scale >= 0 {
        Rational::from_integer(value * factor)
    } else {
        Rational::new(value, factor)
    })
}

pub(crate) fn parse(value: &str) -> Checked<Rational> {
    let value = value.trim();
    if value.len() > 256 {
        return Err(MathError::Limit);
    }
    if let Some((numerator, denominator)) = value.split_once('/') {
        let numerator = decimal(numerator.trim())?;
        let denominator = decimal(denominator.trim())?;
        if denominator.is_zero() {
            return Err(MathError::Domain);
        }
        checked(numerator / denominator)
    } else {
        decimal(value)
    }
}

pub(super) fn symbolic_pi(value: &Rational, power: i8) -> String {
    if power == 0 || value.is_zero() {
        return value.to_string();
    }
    let numerator = value.numer();
    let denominator = value.denom();
    if power > 0 {
        let scaled = if numerator.is_one() {
            "pi".to_owned()
        } else if numerator == &BigInt::from(-1) {
            "-pi".to_owned()
        } else {
            format!("{numerator}*pi")
        };
        if denominator.is_one() {
            scaled
        } else {
            format!("{scaled}/{denominator}")
        }
    } else if denominator.is_one() {
        format!("{numerator}/pi")
    } else {
        format!("{numerator}/({denominator}*pi)")
    }
}

pub(crate) fn significant_decimal(value: &Rational, digits: u32) -> String {
    if value.is_zero() {
        return "0".to_owned();
    }
    let numerator = value.numer().magnitude();
    let denominator = value.denom().magnitude();
    let ten = BigUint::from(10u8);
    let mut exponent = numerator.to_string().len() as i32 - denominator.to_string().len() as i32;
    let below_estimate = if exponent >= 0 {
        *numerator < denominator * ten.pow(exponent.unsigned_abs())
    } else {
        numerator * ten.pow(exponent.unsigned_abs()) < *denominator
    };
    if below_estimate {
        exponent -= 1;
    }
    let places = digits as i32 - 1 - exponent;
    let (top, bottom) = if places >= 0 {
        (
            numerator * ten.pow(places.unsigned_abs()),
            denominator.clone(),
        )
    } else {
        (
            numerator.clone(),
            denominator * ten.pow(places.unsigned_abs()),
        )
    };
    let (mut rounded, remainder) = top.div_rem(&bottom);
    let compare_half = (remainder << 1usize).cmp(&bottom);
    if compare_half == Ordering::Greater || (compare_half == Ordering::Equal && rounded.is_odd()) {
        rounded += 1u8;
    }
    let mut digits = rounded.to_string();
    if places <= 0 {
        digits.push_str(&"0".repeat(places.unsigned_abs() as usize));
    } else {
        let places = places as usize;
        if digits.len() <= places {
            digits = format!("{}{}", "0".repeat(places + 1 - digits.len()), digits);
        }
        digits.insert(digits.len() - places, '.');
        digits.truncate(digits.trim_end_matches('0').trim_end_matches('.').len());
    }
    if value.is_negative() {
        digits.insert(0, '-');
    }
    digits
}
