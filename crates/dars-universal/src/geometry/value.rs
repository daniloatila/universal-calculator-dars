use crate::MathError;
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, Zero};
use std::collections::BTreeMap;

pub(super) type Rational = BigRational;
pub(super) type Checked<T> = Result<T, MathError>;

pub(super) fn rational(value: i64) -> Rational {
    Rational::from_integer(value.into())
}

pub(super) fn checked(value: Rational) -> Checked<Rational> {
    if value.numer().bits().max(value.denom().bits()) <= 4096 {
        Ok(value)
    } else {
        Err(MathError::Limit)
    }
}

pub(super) fn power(value: &Rational, exponent: i32) -> Checked<Rational> {
    checked(value.pow(exponent))
}

fn decimal(input: &str) -> Checked<Rational> {
    let (mantissa, exponent) = match input.split_once(['e', 'E']) {
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
        None => (input, 0),
    };
    let (negative, mantissa) = match mantissa.strip_prefix(['-', '−']) {
        Some(mantissa) => (true, mantissa),
        None => (false, mantissa.strip_prefix('+').unwrap_or(mantissa)),
    };
    let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    if whole.len() + fraction.len() > 128 || exponent.unsigned_abs() > 256 {
        return Err(MathError::Limit);
    }
    let digits = format!("{whole}{fraction}");
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(MathError::InvalidInput);
    }
    let numerator = BigInt::parse_bytes(digits.as_bytes(), 10).ok_or(MathError::InvalidInput)?;
    let numerator = if negative { -numerator } else { numerator };
    let scale = exponent - fraction.len() as i32;
    let factor = BigInt::from(10u8).pow(scale.unsigned_abs());
    checked(if scale >= 0 {
        Rational::from_integer(numerator * factor)
    } else {
        Rational::new(numerator, factor)
    })
}

pub(super) fn parse(input: &str) -> Checked<Rational> {
    if input.len() > 256 {
        return Err(MathError::Limit);
    }
    if let Some((numerator, denominator)) = input.split_once('/') {
        let numerator = decimal(numerator)?;
        let denominator = decimal(denominator)?;
        if denominator.is_zero() {
            return Err(MathError::Domain);
        }
        checked(numerator / denominator)
    } else {
        decimal(input)
    }
}

pub(super) fn dimensions<const N: usize>(input: &str) -> Checked<[Rational; N]> {
    let parts: Vec<_> = input.split_whitespace().take(N + 1).collect();
    if parts.len() != N {
        return Err(MathError::InvalidInput);
    }
    let values: Vec<_> = parts.into_iter().map(parse).collect::<Checked<_>>()?;
    if values.iter().any(|value| !value.is_positive()) {
        return Err(MathError::Domain);
    }
    values.try_into().map_err(|_| MathError::InvalidInput)
}

#[derive(Default)]
pub(super) struct RadicalSum {
    rational: Rational,
    terms: BTreeMap<Rational, Rational>,
}

impl RadicalSum {
    pub(super) fn constant(value: Rational) -> Self {
        Self {
            rational: value,
            terms: BTreeMap::new(),
        }
    }

    pub(super) fn sqrt(value: Rational) -> Checked<Self> {
        if value.is_negative() {
            return Err(MathError::Domain);
        }
        let numerator_root = value.numer().sqrt();
        let denominator_root = value.denom().sqrt();
        if &numerator_root * &numerator_root == *value.numer()
            && &denominator_root * &denominator_root == *value.denom()
        {
            Ok(Self::constant(Rational::new(
                numerator_root,
                denominator_root,
            )))
        } else {
            Ok(Self {
                rational: rational(0),
                terms: BTreeMap::from([(value, rational(1))]),
            })
        }
    }

    pub(super) fn symbolic(&self) -> bool {
        !self.terms.is_empty()
    }

    pub(super) fn add(mut self, other: Self) -> Checked<Self> {
        self.rational = checked(self.rational + other.rational)?;
        for (radicand, factor) in other.terms {
            let entry = self.terms.entry(radicand).or_default();
            *entry = checked(&*entry + factor)?;
        }
        Ok(self)
    }

    pub(super) fn scale(mut self, factor: &Rational) -> Checked<Self> {
        self.rational = checked(self.rational * factor)?;
        for coefficient in self.terms.values_mut() {
            *coefficient = checked(&*coefficient * factor)?;
        }
        Ok(self)
    }

    pub(super) fn text(&self) -> String {
        let mut result = Vec::new();
        if !self.rational.is_zero() || self.terms.is_empty() {
            result.push(self.rational.to_string());
        }
        for (radicand, coefficient) in &self.terms {
            if coefficient.is_one() {
                result.push(format!("sqrt({radicand})"));
            } else {
                result.push(format!("{coefficient}*sqrt({radicand})"));
            }
        }
        result.join("+")
    }

    pub(super) fn times_pi(&self) -> String {
        if self.symbolic() {
            return format!("pi*({})", self.text());
        }
        pi_coefficient(&self.rational)
    }
}

pub(super) fn pi_coefficient(coefficient: &Rational) -> String {
    if coefficient.is_zero() {
        return "0".to_owned();
    }
    let numerator = if coefficient.numer().is_one() {
        "pi".to_owned()
    } else {
        format!("{}*pi", coefficient.numer())
    };
    if coefficient.denom().is_one() {
        numerator
    } else {
        format!("{numerator}/{}", coefficient.denom())
    }
}
