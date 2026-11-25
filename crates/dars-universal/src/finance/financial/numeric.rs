use super::{MathError, Rational, number};
use astro_float_num::{BigFloat, Consts, Radix, RoundingMode, Sign};
use num_bigint::BigInt;
use num_traits::Zero;
#[cfg(feature = "financial")]
use num_traits::{One, Signed};
use std::cmp::Ordering;
use std::collections::BTreeMap;

const BITS: usize = 320;
const ROUNDING: RoundingMode = RoundingMode::ToEven;
const LIMIT: u64 = 16_384;

pub(in crate::finance) fn bounded(value: Rational) -> Result<Rational, MathError> {
    if value.numer().bits().max(value.denom().bits()) > LIMIT {
        return Err(MathError::Limit);
    }
    Ok(value)
}

pub(in crate::finance) fn power(base: &Rational, n: u32) -> Result<Rational, MathError> {
    // Bound work before exponentiation. Unit factors have no growing components.
    if base.numer().bits().saturating_mul(u64::from(n)) > LIMIT + u64::from(n)
        || base.denom().bits().saturating_mul(u64::from(n)) > LIMIT + u64::from(n)
    {
        return Err(MathError::Limit);
    }
    bounded(base.pow(n as i32))
}

pub(in crate::finance) struct Numeric(Consts);

pub(super) struct PreparedDiscounting {
    coefficients: Vec<(BigFloat, usize)>,
    steps: Vec<BigFloat>,
}

impl Numeric {
    pub(in crate::finance) fn new() -> Result<Self, MathError> {
        Ok(Self(Consts::new().map_err(|_| MathError::Limit)?))
    }

    fn integer(&mut self, value: &BigInt) -> BigFloat {
        if value.is_zero() {
            return BigFloat::from_i64(0, BITS);
        }
        let (sign, digits) = value.to_radix_be(2);
        let sign = if sign == num_bigint::Sign::Minus {
            Sign::Neg
        } else {
            Sign::Pos
        };
        BigFloat::convert_from_radix(
            sign,
            &digits,
            digits.len() as i32,
            Radix::Bin,
            BITS,
            ROUNDING,
            &mut self.0,
        )
    }

    fn float(&mut self, value: &Rational) -> BigFloat {
        let numerator = self.integer(value.numer());
        let denominator = self.integer(value.denom());
        numerator.div(&denominator, BITS, ROUNDING)
    }

    #[cfg(feature = "financial")]
    fn rational(&mut self, result: &BigFloat) -> Result<Rational, MathError> {
        if result.is_zero() {
            return Ok(number(0));
        }
        if result
            .exponent()
            .ok_or(MathError::NoConvergence)?
            .unsigned_abs()
            > 4096
        {
            return Err(MathError::Limit);
        }
        let (sign, digits, exponent) = result
            .convert_to_radix(Radix::Bin, RoundingMode::None, &mut self.0)
            .map_err(|_| MathError::NoConvergence)?;
        let sign = if sign == Sign::Neg {
            num_bigint::Sign::Minus
        } else {
            num_bigint::Sign::Plus
        };
        let integer = BigInt::from_radix_be(sign, &digits, 2).ok_or(MathError::NoConvergence)?;
        let shift = exponent - digits.len() as i32;
        Ok(if shift >= 0 {
            Rational::from_integer(integer << shift as u32)
        } else {
            Rational::new(integer, BigInt::one() << shift.unsigned_abs())
        })
    }

    #[cfg(feature = "financial")]
    pub(in crate::finance) fn fractional_power(
        &mut self,
        base: &Rational,
        exponent: &Rational,
    ) -> Result<Rational, MathError> {
        if !base.is_positive() {
            return Err(MathError::Domain);
        }
        let base = self.float(base);
        let exponent = self.float(exponent);
        let log = base.ln(BITS, ROUNDING, &mut self.0);
        let result = self.power_from_ln(&log, &exponent)?;
        self.rational(&result)
    }

    fn power_from_ln(
        &mut self,
        log: &BigFloat,
        exponent: &BigFloat,
    ) -> Result<BigFloat, MathError> {
        let argument = log.mul(exponent, BITS, ROUNDING);
        if argument
            .abs()
            .cmp(&BigFloat::from_i64(2_000, BITS))
            .is_none_or(|cmp| cmp > 0)
        {
            return Err(MathError::Limit);
        }
        Ok(argument.exp(BITS, ROUNDING, &mut self.0))
    }

    pub(super) fn prepare_discounting(
        &mut self,
        flows: &[(Rational, Rational)],
    ) -> PreparedDiscounting {
        let mut last = None;
        let mut indices = BTreeMap::new();
        let mut steps = Vec::new();
        let mut coefficients = Vec::new();
        for (time, cash) in flows.iter().rev().filter(|(_, cash)| !cash.is_zero()) {
            let exponent = last.map_or_else(|| number(0), |last| time - last);
            let index = *indices.entry(exponent.clone()).or_insert_with(|| {
                let index = steps.len();
                steps.push(self.float(&exponent));
                index
            });
            coefficients.push((self.float(cash), index));
            last = Some(time);
        }
        PreparedDiscounting {
            coefficients,
            steps,
        }
    }

    pub(super) fn discounted_sign(
        &mut self,
        prepared: &PreparedDiscounting,
        base: &Rational,
    ) -> Result<Ordering, MathError> {
        let log = self.float(base).ln(BITS, ROUNDING, &mut self.0);
        let zero = BigFloat::from_i64(0, BITS);
        let mut total = zero.clone();
        let factors = prepared
            .steps
            .iter()
            .map(|step| self.power_from_ln(&log, step))
            .collect::<Result<Vec<_>, _>>()?;
        // Horner recurrence in discount factors. A common initial time factor is
        // positive and cannot change the sign. Recurring monthly gaps share a factor.
        for (cash, index) in &prepared.coefficients {
            total = total
                .mul(&factors[*index], BITS, ROUNDING)
                .add(cash, BITS, ROUNDING);
        }
        total
            .cmp(&zero)
            .map(|order| order.cmp(&0))
            .ok_or(MathError::NoConvergence)
    }

    #[cfg(feature = "financial")]
    pub(in crate::finance) fn logarithm(
        &mut self,
        value: &Rational,
        base: &Rational,
    ) -> Result<Rational, MathError> {
        let numerator = self.float(value).ln(BITS, ROUNDING, &mut self.0);
        let denominator = self.float(base).ln(BITS, ROUNDING, &mut self.0);
        self.rational(&numerator.div(&denominator, BITS, ROUNDING))
    }
}

#[cfg(feature = "financial")]
pub(in crate::finance) fn nth_root(
    value: &Rational,
    n: u32,
) -> Result<(Rational, bool), MathError> {
    if !value.is_positive() || n == 0 {
        return Err(MathError::Domain);
    }
    let numerator = value.numer().nth_root(n);
    let denominator = value.denom().nth_root(n);
    if numerator.pow(n) == *value.numer() && denominator.pow(n) == *value.denom() {
        return Ok((Rational::new(numerator, denominator), true));
    }
    let exponent = number(1) / number(i64::from(n));
    Ok((Numeric::new()?.fractional_power(value, &exponent)?, false))
}
