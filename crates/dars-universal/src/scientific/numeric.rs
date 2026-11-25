use super::MathError;
use astro_float_num::{BigFloat, Consts, Radix, RoundingMode, Sign};
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::Zero;

const RM: RoundingMode = RoundingMode::ToEven;
const MAX_EXPONENT: u32 = 13_000;
const MAX_TRIG_EXPONENT: i32 = 128;
const MAX_EXP_ARGUMENT: i64 = 4096;
const MAX_CANCELLATION_BITS: i32 = 128;

#[derive(Clone)]
pub(super) struct Complex {
    pub(super) re: BigFloat,
    pub(super) im: BigFloat,
}

impl Complex {
    pub(super) fn is_zero(&self) -> bool {
        self.re.is_zero() && self.im.is_zero()
    }

    pub(super) fn negative(&self) -> Self {
        Self {
            re: self.re.neg(),
            im: self.im.neg(),
        }
    }
}

pub(super) struct Numeric {
    bits: usize,
    pub(super) constants: Consts,
}

impl Numeric {
    pub(super) fn new(decimal_digits: u32, extra_bits: usize) -> Result<Self, MathError> {
        Ok(Self {
            bits: (decimal_digits as usize * 3322).div_ceil(1000) + 192 + extra_bits,
            constants: Consts::new().map_err(|_| MathError::Limit)?,
        })
    }

    pub(super) fn integer(&self, value: i64) -> BigFloat {
        BigFloat::from_i64(value, self.bits)
    }

    pub(super) fn rational(&mut self, value: &BigRational) -> BigFloat {
        let numerator = self.big_integer(value.numer());
        let denominator = self.big_integer(value.denom());
        numerator.div(&denominator, self.bits, RM)
    }

    fn big_integer(&mut self, value: &BigInt) -> BigFloat {
        if value.is_zero() {
            return self.integer(0);
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
            self.bits,
            RM,
            &mut self.constants,
        )
    }

    pub(super) fn pi(&mut self) -> BigFloat {
        self.constants.pi(self.bits, RM)
    }

    pub(super) fn e(&mut self) -> BigFloat {
        self.constants.e(self.bits, RM)
    }

    pub(super) fn real(&self, value: BigFloat) -> Complex {
        Complex {
            re: value,
            im: self.integer(0),
        }
    }

    pub(super) fn pure_imaginary(&self, value: BigFloat) -> Complex {
        Complex {
            re: self.integer(0),
            im: value,
        }
    }

    pub(super) fn value(&self, value: i64) -> Complex {
        self.real(self.integer(value))
    }

    pub(super) fn checked(&self, value: Complex) -> Result<Complex, MathError> {
        for number in [&value.re, &value.im] {
            let Some(exponent) = number.exponent() else {
                return Err(MathError::NoConvergence);
            };
            if !number.is_zero() && exponent.unsigned_abs() > MAX_EXPONENT {
                return Err(MathError::Limit);
            }
        }
        Ok(value)
    }

    pub(super) fn scale(&self, value: &Complex, factor: &BigFloat) -> Complex {
        Complex {
            re: value.re.mul(factor, self.bits, RM),
            im: value.im.mul(factor, self.bits, RM),
        }
    }

    pub(super) fn scale_ratio(
        &self,
        value: &Complex,
        numerator: &BigFloat,
        denominator: &BigFloat,
    ) -> Complex {
        let factor = numerator.div(denominator, self.bits, RM);
        self.scale(value, &factor)
    }

    pub(super) fn add(&self, left: &Complex, right: &Complex) -> Complex {
        Complex {
            re: left.re.add(&right.re, self.bits, RM),
            im: left.im.add(&right.im, self.bits, RM),
        }
    }

    pub(super) fn sub(&self, left: &Complex, right: &Complex) -> Complex {
        Complex {
            re: left.re.sub(&right.re, self.bits, RM),
            im: left.im.sub(&right.im, self.bits, RM),
        }
    }

    pub(super) fn require_stable_sum(
        &self,
        left: &Complex,
        right: &Complex,
        result: &Complex,
    ) -> Result<(), MathError> {
        for (a, b, output) in [
            (&left.re, &right.re, &result.re),
            (&left.im, &right.im, &result.im),
        ] {
            if a.is_zero() || b.is_zero() {
                continue;
            }
            let before = a.exponent().zip(b.exponent()).map(|(a, b)| a.max(b));
            if let Some(before) = before
                && (output.is_zero()
                    || output
                        .exponent()
                        .is_some_and(|after| before - after > MAX_CANCELLATION_BITS))
            {
                return Err(MathError::NoConvergence);
            }
        }
        Ok(())
    }

    pub(super) fn mul(&self, left: &Complex, right: &Complex) -> Complex {
        let ac = left.re.mul(&right.re, self.bits, RM);
        let bd = left.im.mul(&right.im, self.bits, RM);
        let ad = left.re.mul(&right.im, self.bits, RM);
        let bc = left.im.mul(&right.re, self.bits, RM);
        Complex {
            re: ac.sub(&bd, self.bits, RM),
            im: ad.add(&bc, self.bits, RM),
        }
    }

    fn norm_squared(&self, value: &Complex) -> BigFloat {
        let real = value.re.mul(&value.re, self.bits, RM);
        let imaginary = value.im.mul(&value.im, self.bits, RM);
        real.add(&imaginary, self.bits, RM)
    }

    pub(super) fn absolute(&self, value: &Complex) -> BigFloat {
        self.norm_squared(value).sqrt(self.bits, RM)
    }

    pub(super) fn div(&self, left: &Complex, right: &Complex) -> Result<Complex, MathError> {
        if right.is_zero() {
            return Err(MathError::Domain);
        }
        if right.im.is_zero() {
            return Ok(Complex {
                re: left.re.div(&right.re, self.bits, RM),
                im: left.im.div(&right.re, self.bits, RM),
            });
        }
        let numerator = self.mul(
            left,
            &Complex {
                re: right.re.clone(),
                im: right.im.neg(),
            },
        );
        Ok(self.scale_ratio(&numerator, &self.integer(1), &self.norm_squared(right)))
    }

    pub(super) fn pow_integer(
        &self,
        mut base: Complex,
        exponent: i32,
    ) -> Result<Complex, MathError> {
        let mut result = self.value(1);
        let mut power = exponent.unsigned_abs();
        if exponent < 0 {
            base = self.checked(self.div(&result, &base)?)?;
        }
        while power > 0 {
            if power % 2 == 1 {
                result = self.checked(self.mul(&result, &base))?;
            }
            power /= 2;
            if power > 0 {
                base = self.checked(self.mul(&base, &base))?;
            }
        }
        Ok(result)
    }

    pub(super) fn sqrt(&self, value: &Complex, complex_mode: bool) -> Result<Complex, MathError> {
        if value.im.is_zero() {
            if value.re.is_negative() && !value.re.is_zero() {
                return if complex_mode {
                    Ok(self.pure_imaginary(value.re.neg().sqrt(self.bits, RM)))
                } else {
                    Err(MathError::Domain)
                };
            }
            return Ok(self.real(value.re.sqrt(self.bits, RM)));
        }

        // Divide the smaller component by the larger one to avoid cancellation on the real cut.
        let magnitude = self.absolute(value);
        let two = self.integer(2);
        let component = magnitude
            .add(&value.re.abs(), self.bits, RM)
            .div(&two, self.bits, RM)
            .sqrt(self.bits, RM);
        let divisor = component.mul(&two, self.bits, RM);
        if value.re.is_negative() {
            let rr = value.im.abs().div(&divisor, self.bits, RM);
            let ii = if value.im.is_negative() {
                component.neg()
            } else {
                component
            };
            Ok(Complex { re: rr, im: ii })
        } else {
            Ok(Complex {
                re: component,
                im: value.im.div(&divisor, self.bits, RM),
            })
        }
    }

    pub(super) fn log(
        &mut self,
        value: &Complex,
        complex_mode: bool,
    ) -> Result<Complex, MathError> {
        if value.is_zero() {
            return Err(MathError::Domain);
        }
        if value.im.is_zero() && value.re.is_positive() {
            let result = value.re.ln(self.bits, RM, &mut self.constants);
            return Ok(self.real(result));
        }
        if !complex_mode {
            return Err(MathError::Domain);
        }
        let magnitude = self.absolute(value);
        let re = magnitude.ln(self.bits, RM, &mut self.constants);
        let im = if value.re.is_zero() {
            let pi = self.pi();
            pi.div(
                &self.integer(if value.im.is_negative() { -2 } else { 2 }),
                self.bits,
                RM,
            )
        } else {
            let ratio = value.im.div(&value.re, self.bits, RM);
            let angle = ratio.atan(self.bits, RM, &mut self.constants);
            if value.re.is_negative() {
                let pi = self.pi();
                if value.im.is_negative() && !value.im.is_zero() {
                    angle.sub(&pi, self.bits, RM)
                } else {
                    angle.add(&pi, self.bits, RM)
                }
            } else {
                angle
            }
        };
        Ok(Complex { re, im })
    }

    fn guard_trig(value: &BigFloat) -> Result<(), MathError> {
        if value
            .exponent()
            .is_some_and(|power| power <= MAX_TRIG_EXPONENT)
        {
            Ok(())
        } else {
            Err(MathError::Limit)
        }
    }

    fn guard_exp(&self, value: &BigFloat) -> Result<(), MathError> {
        if value
            .abs()
            .cmp(&self.integer(MAX_EXP_ARGUMENT))
            .is_some_and(|order| order <= 0)
        {
            Ok(())
        } else {
            Err(MathError::Limit)
        }
    }

    pub(super) fn exp(&mut self, value: &Complex) -> Result<Complex, MathError> {
        self.guard_exp(&value.re)?;
        Self::guard_trig(&value.im)?;
        let modulus = value.re.exp(self.bits, RM, &mut self.constants);
        if value.im.is_zero() {
            return Ok(self.real(modulus));
        }
        let cosine = value.im.cos(self.bits, RM, &mut self.constants);
        let sine = value.im.sin(self.bits, RM, &mut self.constants);
        Ok(self.scale(
            &Complex {
                re: cosine,
                im: sine,
            },
            &modulus,
        ))
    }

    pub(super) fn trig(&mut self, name: &str, value: &Complex) -> Result<Complex, MathError> {
        Self::guard_trig(&value.re)?;
        if value.im.is_zero() {
            let real = match name {
                "sin" => value.re.sin(self.bits, RM, &mut self.constants),
                "cos" => value.re.cos(self.bits, RM, &mut self.constants),
                "tan" => value.re.tan(self.bits, RM, &mut self.constants),
                _ => return Err(MathError::Unsupported),
            };
            return Ok(self.real(real));
        }
        self.guard_exp(&value.im)?;
        let sine = value.re.sin(self.bits, RM, &mut self.constants);
        let cosine = value.re.cos(self.bits, RM, &mut self.constants);
        let ch = value.im.cosh(self.bits, RM, &mut self.constants);
        let sh = value.im.sinh(self.bits, RM, &mut self.constants);
        let sin = Complex {
            re: sine.mul(&ch, self.bits, RM),
            im: cosine.mul(&sh, self.bits, RM),
        };
        let cos = Complex {
            re: cosine.mul(&ch, self.bits, RM),
            im: sine.mul(&sh, self.bits, RM).neg(),
        };
        match name {
            "sin" => Ok(sin),
            "cos" => Ok(cos),
            "tan" => self.div(&sin, &cos),
            _ => Err(MathError::Unsupported),
        }
    }

    pub(super) fn hyperbolic(&mut self, name: &str, value: &Complex) -> Result<Complex, MathError> {
        self.guard_exp(&value.re)?;
        if value.im.is_zero() {
            let real = match name {
                "sinh" => value.re.sinh(self.bits, RM, &mut self.constants),
                "cosh" => value.re.cosh(self.bits, RM, &mut self.constants),
                "tanh" => value.re.tanh(self.bits, RM, &mut self.constants),
                _ => return Err(MathError::Unsupported),
            };
            return Ok(self.real(real));
        }
        Self::guard_trig(&value.im)?;
        let sine = value.im.sin(self.bits, RM, &mut self.constants);
        let cosine = value.im.cos(self.bits, RM, &mut self.constants);
        let ch = value.re.cosh(self.bits, RM, &mut self.constants);
        let sh = value.re.sinh(self.bits, RM, &mut self.constants);
        let sinh = Complex {
            re: sh.mul(&cosine, self.bits, RM),
            im: ch.mul(&sine, self.bits, RM),
        };
        let cosh = Complex {
            re: ch.mul(&cosine, self.bits, RM),
            im: sh.mul(&sine, self.bits, RM),
        };
        match name {
            "sinh" => Ok(sinh),
            "cosh" => Ok(cosh),
            "tanh" => self.div(&sinh, &cosh),
            _ => Err(MathError::Unsupported),
        }
    }

    fn inverse_real(&mut self, name: &str, x: &BigFloat) -> Option<BigFloat> {
        let magnitude_cmp = x.abs().cmp(&self.integer(1))?;
        let guarded = match name {
            "asin" | "acos" => magnitude_cmp <= 0,
            "atanh" => magnitude_cmp < 0,
            "acosh" => x.cmp(&self.integer(1)).is_some_and(|order| order >= 0),
            _ => true,
        };
        if !guarded {
            return None;
        }
        Some(match name {
            "asin" => x.asin(self.bits, RM, &mut self.constants),
            "acos" => x.acos(self.bits, RM, &mut self.constants),
            "atan" => x.atan(self.bits, RM, &mut self.constants),
            "asinh" => x.asinh(self.bits, RM, &mut self.constants),
            "acosh" => x.acosh(self.bits, RM, &mut self.constants),
            "atanh" => x.atanh(self.bits, RM, &mut self.constants),
            _ => return None,
        })
    }

    fn times_i(value: &Complex) -> Complex {
        Complex {
            re: value.im.neg(),
            im: value.re.clone(),
        }
    }

    pub(super) fn inverse(
        &mut self,
        name: &str,
        z: &Complex,
        complex_mode: bool,
    ) -> Result<Complex, MathError> {
        if z.im.is_zero() {
            if let Some(real) = self.inverse_real(name, &z.re) {
                return Ok(self.real(real));
            }
            if !complex_mode {
                return Err(MathError::Domain);
            }
            if name == "acosh"
                && z.re
                    .abs()
                    .cmp(&self.integer(1))
                    .is_some_and(|order| order <= 0)
            {
                // On the real cut segment [-1, 1], the principal value is purely imaginary.
                let angle = z.re.acos(self.bits, RM, &mut self.constants);
                return Ok(self.pure_imaginary(angle));
            }
        }

        let one = self.value(1);
        let half = self.integer(1).div(&self.integer(2), self.bits, RM);
        match name {
            "asin" | "acos" => {
                let root = self.sqrt(&self.sub(&one, &self.mul(z, z)), true)?;
                let ln = self.log(&self.add(&Self::times_i(z), &root), true)?;
                let asin = Self::times_i(&ln).negative();
                if name == "asin" {
                    return Ok(asin);
                }
                let pi_half = self.pi().mul(&half, self.bits, RM);
                Ok(self.sub(&self.real(pi_half), &asin))
            }
            "atan" => {
                let iz = Self::times_i(z);
                let a = self.log(&self.sub(&one, &iz), true)?;
                let b = self.log(&self.add(&one, &iz), true)?;
                Ok(self.scale(&Self::times_i(&self.sub(&a, &b)), &half))
            }
            "asinh" => {
                let root = self.sqrt(&self.add(&self.mul(z, z), &one), true)?;
                self.log(&self.add(z, &root), true)
            }
            "acosh" => {
                let plus = self.sqrt(&self.add(z, &one), true)?;
                let minus = self.sqrt(&self.sub(z, &one), true)?;
                self.log(&self.add(z, &self.mul(&plus, &minus)), true)
            }
            "atanh" => {
                let a = self.log(&self.add(&one, z), true)?;
                let b = self.log(&self.sub(&one, z), true)?;
                Ok(self.scale(&self.sub(&a, &b), &half))
            }
            _ => Err(MathError::Unsupported),
        }
    }
}
