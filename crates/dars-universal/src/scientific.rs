use crate::{Computation, Exactness, MathError};
use num_bigint::BigInt;
use num_integer::Integer;
use num_rational::BigRational;
use num_traits::{One, Signed, ToPrimitive, Zero};
use serde_json::Value;

mod decimal;
mod numeric;
mod syntax;

use decimal::Notation;
use numeric::{Complex, Numeric};
use syntax::{Binary, Expr};

const MAX_EXACT_BITS: u64 = 13_000;
const MAX_INTEGER_POWER: u32 = 4096;
const MAX_ROOT: u32 = 64;
const MAX_FACTORIAL: u32 = 512;
const MAX_EVALUATION_DEPTH: usize = 64;

#[derive(Clone, Copy)]
enum Angle {
    Radians,
    Degrees,
    Gradians,
}

impl Angle {
    fn half_turn(self) -> Option<i64> {
        match self {
            Self::Radians => None,
            Self::Degrees => Some(180),
            Self::Gradians => Some(200),
        }
    }
}

#[derive(Clone, Copy)]
struct Settings {
    angle: Angle,
    complex: bool,
    precision: u32,
    notation: Notation,
}

impl Settings {
    fn read(options: &Value) -> Result<Self, MathError> {
        if let Some(entries) = options.as_object() {
            if entries
                .keys()
                .any(|key| !matches!(key.as_str(), "angle" | "complex" | "precision" | "notation"))
            {
                return Err(MathError::InvalidInput);
            }
        } else if !options.is_null() {
            return Err(MathError::InvalidInput);
        }
        let angle = match optional_string(options, "angle")? {
            None | Some("rad") => Angle::Radians,
            Some("deg") => Angle::Degrees,
            Some("grad") => Angle::Gradians,
            _ => return Err(MathError::InvalidInput),
        };
        let complex = match options.get("complex") {
            Some(value) => value.as_bool().ok_or(MathError::InvalidInput)?,
            None => false,
        };
        let precision = match options.get("precision") {
            Some(value) => value.as_u64().ok_or(MathError::InvalidInput)?,
            None => 32,
        };
        if !(8..=80).contains(&precision) {
            return Err(MathError::Limit);
        }
        let notation = match optional_string(options, "notation")? {
            None | Some("auto") => Notation::Auto,
            Some("scientific") => Notation::Scientific,
            Some("engineering") => Notation::Engineering,
            _ => return Err(MathError::InvalidInput),
        };
        Ok(Self {
            angle,
            complex,
            precision: precision as u32,
            notation,
        })
    }
}

fn optional_string<'a>(options: &'a Value, key: &str) -> Result<Option<&'a str>, MathError> {
    options
        .get(key)
        .map(|value| value.as_str().ok_or(MathError::InvalidInput))
        .transpose()
}

fn ratio(numerator: i64, denominator: i64) -> BigRational {
    BigRational::new(numerator.into(), denominator.into())
}

#[derive(Clone)]
struct Gaussian {
    re: BigRational,
    im: BigRational,
}

impl Gaussian {
    fn real(re: BigRational) -> Self {
        Self {
            re,
            im: BigRational::zero(),
        }
    }

    fn imaginary(im: BigRational) -> Self {
        Self {
            re: BigRational::zero(),
            im,
        }
    }

    fn is_real(&self) -> bool {
        self.im.is_zero()
    }

    fn is_zero(&self) -> bool {
        self.is_real() && self.re.is_zero()
    }

    fn bits(&self) -> u64 {
        [
            self.re.numer(),
            self.re.denom(),
            self.im.numer(),
            self.im.denom(),
        ]
        .into_iter()
        .map(BigInt::bits)
        .max()
        .unwrap_or(0)
    }

    fn checked(self) -> Result<Self, MathError> {
        if self.bits() > MAX_EXACT_BITS {
            Err(MathError::Limit)
        } else {
            Ok(self)
        }
    }

    fn negative(self) -> Self {
        Self {
            re: -self.re,
            im: -self.im,
        }
    }

    fn add(self, other: Self) -> Self {
        Self {
            re: self.re + other.re,
            im: self.im + other.im,
        }
    }

    fn mul(&self, other: &Self) -> Self {
        Self {
            re: &self.re * &other.re - &self.im * &other.im,
            im: &self.re * &other.im + &self.im * &other.re,
        }
    }

    fn scale(self, scalar: &BigRational) -> Self {
        Self {
            re: self.re * scalar,
            im: self.im * scalar,
        }
    }

    fn norm_squared(&self) -> BigRational {
        &self.re * &self.re + &self.im * &self.im
    }

    fn div(&self, other: &Self) -> Result<Self, MathError> {
        if other.is_zero() {
            return Err(MathError::Domain);
        }
        if other.is_real() {
            return Ok(Self {
                re: &self.re / &other.re,
                im: &self.im / &other.re,
            });
        }
        let norm = other.norm_squared();
        let numerator = self.mul(&Self {
            re: other.re.clone(),
            im: -&other.im,
        });
        Ok(numerator.scale(&norm.recip()))
    }

    fn pow(mut self, exponent: i32) -> Result<Self, MathError> {
        let mut product = Self::real(BigRational::one());
        if exponent < 0 {
            self = product.div(&self)?.checked()?;
        }
        let mut power = exponent.unsigned_abs();
        while power > 0 {
            if power % 2 == 1 {
                product = product.mul(&self).checked()?;
            }
            power /= 2;
            if power > 0 {
                self = self.mul(&self).checked()?;
            }
        }
        Ok(product)
    }

    fn display(&self, notation: Notation) -> String {
        if self.is_real() {
            return decimal::exact(&self.re, notation);
        }
        let real = (!self.re.is_zero()).then(|| decimal::exact(&self.re, notation));
        let coefficient = self.im.abs();
        let imag = if coefficient.is_one() {
            String::from("i")
        } else {
            format!("{}*i", decimal::exact(&coefficient, notation))
        };
        combine_complex(real.as_deref(), self.im.is_negative(), &imag)
    }
}

fn combine_complex(real: Option<&str>, negative_imaginary: bool, imaginary: &str) -> String {
    match (real, negative_imaginary) {
        (Some(real), false) => format!("{real} + {imaginary}"),
        (Some(real), true) => format!("{real} - {imaginary}"),
        (None, false) => imaginary.to_owned(),
        (None, true) => format!("-{imaginary}"),
    }
}

#[derive(Clone)]
enum Number {
    Exact(Gaussian),
    Pi(Gaussian),
    Euler,
    Approximate(Box<Complex>),
}

impl Number {
    fn integer(value: i64) -> Self {
        Self::rational(ratio(value, 1))
    }

    fn rational(value: BigRational) -> Self {
        Self::Exact(Gaussian::real(value))
    }

    fn pi(coefficient: Gaussian) -> Self {
        if coefficient.is_zero() {
            Self::integer(0)
        } else {
            Self::Pi(coefficient)
        }
    }

    fn real_rational(&self) -> Option<&BigRational> {
        match self {
            Self::Exact(exact) if exact.is_real() => Some(&exact.re),
            _ => None,
        }
    }

    fn is_exact_integer(&self, value: i64) -> bool {
        self.real_rational()
            .is_some_and(|rational| rational.eq(&ratio(value, 1)))
    }

    fn is_zero(&self) -> bool {
        match self {
            Self::Exact(exact) | Self::Pi(exact) => exact.is_zero(),
            Self::Approximate(value) => value.is_zero(),
            Self::Euler => false,
        }
    }

    fn negative(self, numeric: &mut Numeric) -> Result<Self, MathError> {
        Ok(match self {
            Self::Exact(exact) => Self::Exact(exact.negative()),
            Self::Pi(exact) => Self::Pi(exact.negative()),
            Self::Approximate(value) => Self::Approximate(Box::new(value.negative())),
            Self::Euler => {
                let value = self.numeric(numeric)?.negative();
                Self::from_numeric(numeric, value)?
            }
        })
    }

    fn from_numeric(numeric: &Numeric, value: Complex) -> Result<Self, MathError> {
        Ok(Self::Approximate(Box::new(numeric.checked(value)?)))
    }

    fn numeric(&self, numeric: &mut Numeric) -> Result<Complex, MathError> {
        let result = match self {
            Self::Exact(exact) | Self::Pi(exact) => {
                let value = Complex {
                    re: numeric.rational(&exact.re),
                    im: numeric.rational(&exact.im),
                };
                if matches!(self, Self::Pi(_)) {
                    let pi = numeric.pi();
                    numeric.scale(&value, &pi)
                } else {
                    value
                }
            }
            Self::Euler => {
                let e = numeric.e();
                numeric.real(e)
            }
            Self::Approximate(value) => (**value).clone(),
        };
        numeric.checked(result)
    }

    fn classify(&self) -> (Exactness, &'static str) {
        match self {
            Self::Exact(_) => (
                Exactness::Exact,
                "exact rational and Gaussian computation with identity rules",
            ),
            Self::Pi(_) | Self::Euler => {
                (Exactness::Symbolic, "symbolic constant or exact multiple")
            }
            Self::Approximate(_) => (
                Exactness::Approximate,
                "multiple-precision numerical evaluation",
            ),
        }
    }
}

#[derive(Clone)]
struct TypedValue {
    number: Number,
    radians: bool,
}

impl TypedValue {
    fn scalar(number: Number) -> Self {
        Self {
            number,
            radians: false,
        }
    }

    fn into_scalar(self) -> Result<Number, MathError> {
        if self.radians {
            Err(MathError::Domain)
        } else {
            Ok(self.number)
        }
    }
}

fn real_root(value: &BigRational, n: u32) -> Option<BigRational> {
    if value.is_negative() && n.is_multiple_of(2) {
        return None;
    }
    let abs_numerator = value.numer().abs();
    let numerator = abs_numerator.nth_root(n);
    let denominator = value.denom().nth_root(n);
    (numerator.pow(n) == abs_numerator && denominator.pow(n) == *value.denom()).then(|| {
        BigRational::new(
            if value.is_negative() {
                -numerator
            } else {
                numerator
            },
            denominator,
        )
    })
}

fn gaussian_root(value: &Gaussian, complex: bool) -> Option<Gaussian> {
    if value.is_real() {
        return if value.re.is_negative() && complex {
            real_root(&value.re.abs(), 2).map(Gaussian::imaginary)
        } else {
            real_root(&value.re, 2).map(Gaussian::real)
        };
    }
    let norm = real_root(&value.norm_squared(), 2)?;
    let half = ratio(1, 2);
    let re = real_root(&((&norm + &value.re) * &half), 2)?;
    let im = real_root(&((&norm - &value.re) * half), 2)?;
    Some(Gaussian {
        re,
        im: if value.im.is_negative() { -im } else { im },
    })
}

fn exact_logarithm(value: &BigRational, base: &BigRational) -> Option<i64> {
    if value.is_one() {
        return Some(0);
    }
    let reciprocal_base = base < &BigRational::one();
    let reciprocal_value = value < &BigRational::one();
    let base = if reciprocal_base {
        base.recip()
    } else {
        base.clone()
    };
    let value = if reciprocal_value {
        value.recip()
    } else {
        value.clone()
    };
    if !base.is_integer() || !value.is_integer() {
        return None;
    }
    let base = base.to_integer();
    let mut value = value.to_integer();
    for exponent in 0..=MAX_INTEGER_POWER {
        if value.is_one() {
            let sign = if reciprocal_base == reciprocal_value {
                1
            } else {
                -1
            };
            return Some(sign * i64::from(exponent));
        }
        let (quotient, remainder) = value.div_rem(&base);
        if !remainder.is_zero() || quotient.is_zero() {
            return None;
        }
        value = quotient;
    }
    None
}

fn sine_exact(factor: &BigRational) -> Option<BigRational> {
    let step = factor * BigInt::from(6u8);
    if !step.is_integer() {
        return None;
    }
    let key = step.to_integer().mod_floor(&BigInt::from(12u8)).to_u8()?;
    Some(match key {
        0 | 6 => ratio(0, 1),
        1 | 5 => ratio(1, 2),
        3 => ratio(1, 1),
        7 | 11 => ratio(-1, 2),
        9 => ratio(-1, 1),
        _ => return None,
    })
}

fn exact_tangent(factor: &BigRational) -> Result<Option<BigRational>, MathError> {
    let quarters = factor * BigInt::from(4u8);
    if !quarters.is_integer() {
        return Ok(None);
    }
    let residue = quarters.to_integer().mod_floor(&BigInt::from(4u8));
    Ok(match residue.to_u8() {
        Some(0) => Some(ratio(0, 1)),
        Some(1) => Some(ratio(1, 1)),
        Some(2) => return Err(MathError::Domain),
        Some(3) => Some(ratio(-1, 1)),
        _ => None,
    })
}

struct Evaluation {
    settings: Settings,
    numeric: Numeric,
}

impl Evaluation {
    fn new(settings: Settings, extra_bits: usize) -> Result<Self, MathError> {
        Ok(Self {
            settings,
            numeric: Numeric::new(settings.precision, extra_bits)?,
        })
    }

    fn eval(&mut self, expr: &Expr<'_>, depth: usize) -> Result<TypedValue, MathError> {
        if depth > MAX_EVALUATION_DEPTH {
            return Err(MathError::Limit);
        }
        let value = match expr {
            Expr::Number(literal) => Number::rational(decimal::literal(literal)?),
            Expr::Name(name) => self.constant(name)?,
            Expr::Neg(arg) => {
                let mut value = self.eval(arg, depth + 1)?;
                value.number = value.number.negative(&mut self.numeric)?;
                return Ok(value);
            }
            Expr::Binary(op, left, right) => {
                let same_expression = matches!(op, Binary::Sub) && left == right;
                let left = self.eval(left, depth + 1)?;
                if same_expression {
                    return Ok(TypedValue {
                        number: Number::integer(0),
                        radians: left.radians,
                    });
                }
                let right = self.eval(right, depth + 1)?;
                let radians = match op {
                    Binary::Add | Binary::Sub if left.radians == right.radians => left.radians,
                    Binary::Mul if !left.radians || !right.radians => left.radians || right.radians,
                    Binary::Div if left.radians || !right.radians => left.radians && !right.radians,
                    Binary::Power if !left.radians && !right.radians => false,
                    _ => return Err(MathError::Domain),
                };
                let number = self.binary(*op, left.number, right.number)?;
                return Ok(TypedValue { number, radians });
            }
            Expr::Factorial(arg) => {
                let value = self.eval(arg, depth + 1)?.into_scalar()?;
                self.factorial(&value)?
            }
            Expr::Degrees(arg) => {
                let value = self.eval(arg, depth + 1)?.into_scalar()?;
                return Ok(TypedValue {
                    number: self.convert_radians(value, 180)?,
                    radians: true,
                });
            }
            Expr::Call(name, first, second) => {
                let left = self.eval(first, depth + 1)?;
                let right = second
                    .as_deref()
                    .map(|value| self.eval(value, depth + 1))
                    .transpose()?;
                self.call(name, left, right)?
            }
        };
        Ok(TypedValue::scalar(value))
    }

    fn constant(&self, name: &str) -> Result<Number, MathError> {
        Ok(match name.to_ascii_lowercase().as_str() {
            "pi" => Number::pi(Gaussian::real(ratio(1, 1))),
            "tau" => Number::pi(Gaussian::real(ratio(2, 1))),
            "e" => Number::Euler,
            "i" if self.settings.complex => Number::Exact(Gaussian::imaginary(ratio(1, 1))),
            "i" => return Err(MathError::Domain),
            _ => return Err(MathError::Unsupported),
        })
    }

    fn factorial(&self, value: &Number) -> Result<Number, MathError> {
        let rational = value.real_rational().ok_or(MathError::Domain)?;
        if !rational.is_integer() || rational.is_negative() {
            return Err(MathError::Domain);
        }
        let count = rational
            .to_integer()
            .to_u32()
            .filter(|value| *value <= MAX_FACTORIAL)
            .ok_or(MathError::Limit)?;
        let result = (2..=count).fold(BigInt::one(), |product, factor| product * factor);
        Ok(Number::rational(BigRational::from_integer(result)))
    }

    fn convert_radians(&mut self, number: Number, half_turn: i64) -> Result<Number, MathError> {
        match number {
            Number::Exact(exact) => Ok(Number::pi(exact.scale(&ratio(1, half_turn)).checked()?)),
            other => {
                let value = other.numeric(&mut self.numeric)?;
                let pi = self.numeric.pi();
                let factor = self.numeric.integer(half_turn);
                let converted = self.numeric.scale_ratio(&value, &pi, &factor);
                Number::from_numeric(&self.numeric, converted)
            }
        }
    }

    fn express_pi_angle(&self, coefficient: BigRational) -> Number {
        match self.settings.angle.half_turn() {
            Some(value) => Number::rational(coefficient * BigInt::from(value)),
            None => Number::pi(Gaussian::real(coefficient)),
        }
    }

    fn trig(&mut self, name: &str, mut arg: TypedValue) -> Result<Number, MathError> {
        if !arg.radians
            && let Some(half_turn) = self.settings.angle.half_turn()
        {
            arg.number = self.convert_radians(arg.number, half_turn)?;
        }
        if arg.number.is_exact_integer(0) {
            return Ok(Number::integer(i64::from(name == "cos")));
        }
        if let Number::Pi(factor) = &mut arg.number {
            // Reduce the real angle exactly before rounding π or applying range reduction.
            let period = factor.re.denom() * BigInt::from(2u8);
            factor.re = BigRational::new(
                factor.re.numer().mod_floor(&period),
                factor.re.denom().clone(),
            );
            if factor.is_real() {
                let exact = match name {
                    "sin" => sine_exact(&factor.re),
                    "cos" => sine_exact(&(&factor.re + ratio(1, 2))),
                    "tan" => exact_tangent(&factor.re)?,
                    _ => None,
                };
                if let Some(value) = exact {
                    return Ok(Number::rational(value));
                }
            }
        }
        let value = arg.number.numeric(&mut self.numeric)?;
        let result = self.numeric.trig(name, &value)?;
        Number::from_numeric(&self.numeric, result)
    }

    fn inverse(&mut self, name: &str, arg: &Number) -> Result<Number, MathError> {
        let zero = arg.is_exact_integer(0);
        let one = arg.is_exact_integer(1);
        let minus_one = arg.is_exact_integer(-1);
        let half = arg.real_rational().is_some_and(|r| r == &ratio(1, 2));
        let minus_half = arg.real_rational().is_some_and(|r| r == &ratio(-1, 2));
        let exact_angle = match name {
            "asin" if one => Some(ratio(1, 2)),
            "asin" if minus_one => Some(ratio(-1, 2)),
            "asin" if half => Some(ratio(1, 6)),
            "asin" if minus_half => Some(ratio(-1, 6)),
            "asin" | "atan" if zero => Some(ratio(0, 1)),
            "acos" if one => Some(ratio(0, 1)),
            "acos" if zero => Some(ratio(1, 2)),
            "acos" if minus_one => Some(ratio(1, 1)),
            "acos" if half => Some(ratio(1, 3)),
            "acos" if minus_half => Some(ratio(2, 3)),
            "atan" if one => Some(ratio(1, 4)),
            "atan" if minus_one => Some(ratio(-1, 4)),
            _ => None,
        };
        if let Some(angle) = exact_angle {
            return Ok(self.express_pi_angle(angle));
        }
        if (matches!(name, "asinh" | "atanh") && zero) || (name == "acosh" && one) {
            return Ok(Number::integer(0));
        }
        let exact = arg.real_rational();
        if let Some(value) = exact {
            let unit = BigRational::one();
            let abs = value.abs();
            if (name == "atanh" && abs.is_one())
                || (!self.settings.complex
                    && match name {
                        "asin" | "acos" | "atanh" => abs > unit,
                        "acosh" => value < &unit,
                        _ => false,
                    })
            {
                return Err(MathError::Domain);
            }
        }
        let input = arg.numeric(&mut self.numeric)?;
        if let Some(value) = exact {
            match name {
                "asin" | "acos" | "atanh" => {
                    self.require_distinct_endpoint(value, &input, -1)?;
                    self.require_distinct_endpoint(value, &input, 1)?;
                }
                "acosh" => self.require_distinct_endpoint(value, &input, 1)?,
                _ => {}
            }
        }
        let mut result = self.numeric.inverse(name, &input, self.settings.complex)?;
        if matches!(name, "asin" | "acos" | "atan")
            && let Some(half_turn) = self.settings.angle.half_turn()
        {
            let pi = self.numeric.pi();
            result = self
                .numeric
                .scale_ratio(&result, &self.numeric.integer(half_turn), &pi);
        }
        Number::from_numeric(&self.numeric, result)
    }

    fn require_distinct_endpoint(
        &self,
        exact: &BigRational,
        approximate: &Complex,
        endpoint: i64,
    ) -> Result<(), MathError> {
        if exact != &ratio(endpoint, 1)
            && approximate.re.cmp(&self.numeric.integer(endpoint)) == Some(0)
        {
            Err(MathError::NoConvergence)
        } else {
            Ok(())
        }
    }

    fn exp(&mut self, value: &Number) -> Result<Number, MathError> {
        if value.is_exact_integer(0) {
            return Ok(Number::integer(1));
        }
        if value.is_exact_integer(1) {
            return Ok(Number::Euler);
        }
        if let Number::Pi(p) = value
            && p.re.is_zero()
            && let (Some(im), Some(re)) = (sine_exact(&p.im), sine_exact(&(&p.im + ratio(1, 2))))
        {
            return Ok(Number::Exact(Gaussian { re, im }));
        }
        let value = value.numeric(&mut self.numeric)?;
        let result = self.numeric.exp(&value)?;
        Number::from_numeric(&self.numeric, result)
    }

    fn log(&mut self, value: &Number, base: Option<&Number>) -> Result<Number, MathError> {
        if value.is_zero() {
            return Err(MathError::Domain);
        }
        if let Some(base) = base {
            if base.is_zero() || base.is_exact_integer(1) {
                return Err(MathError::Domain);
            }
            if let Some(b) = base.real_rational() {
                if b.is_negative() {
                    return Err(MathError::Domain);
                }
                if let Some(x) = value.real_rational()
                    && x.is_positive()
                    && let Some(exponent) = exact_logarithm(x, b)
                {
                    return Ok(Number::integer(exponent));
                }
            }
        }
        if base.is_none() || base.is_some_and(|value| matches!(value, Number::Euler)) {
            if value.is_exact_integer(1) {
                return Ok(Number::integer(0));
            }
            if matches!(value, Number::Euler) {
                return Ok(Number::integer(1));
            }
            if value.is_exact_integer(-1) && self.settings.complex {
                return Ok(Number::pi(Gaussian::imaginary(ratio(1, 1))));
            }
        }
        let logarithm_base = if let Some(base) = base {
            let rounded_base = base.numeric(&mut self.numeric)?;
            if let Some(exact) = base.real_rational() {
                self.require_distinct_endpoint(exact, &rounded_base, 1)?;
            }
            if !rounded_base.im.is_zero()
                || rounded_base.re.is_zero()
                || rounded_base.re.is_negative()
                || rounded_base.re.cmp(&self.numeric.integer(1)) == Some(0)
            {
                return Err(MathError::Domain);
            }
            Some(self.numeric.log(&rounded_base, false)?)
        } else {
            None
        };
        let rounded_value = value.numeric(&mut self.numeric)?;
        if let Some(exact) = value.real_rational() {
            self.require_distinct_endpoint(exact, &rounded_value, 1)?;
        }
        let logarithm = self.numeric.log(&rounded_value, self.settings.complex)?;
        let result = if let Some(base) = logarithm_base {
            self.numeric.div(&logarithm, &base)?
        } else {
            logarithm
        };
        Number::from_numeric(&self.numeric, result)
    }

    fn sqrt(&mut self, value: &Number) -> Result<Number, MathError> {
        if let Number::Exact(exact) = value
            && let Some(result) = gaussian_root(exact, self.settings.complex)
        {
            return Ok(Number::Exact(result.checked()?));
        }
        let value = value.numeric(&mut self.numeric)?;
        let result = self.numeric.sqrt(&value, self.settings.complex)?;
        Number::from_numeric(&self.numeric, result)
    }

    fn absolute(&mut self, value: Number) -> Result<Number, MathError> {
        if let Number::Exact(exact) | Number::Pi(exact) = &value
            && let Some(magnitude) = real_root(&exact.norm_squared(), 2)
        {
            return Ok(if matches!(value, Number::Pi(_)) {
                Number::pi(Gaussian::real(magnitude))
            } else {
                Number::rational(magnitude)
            });
        }
        let value = value.numeric(&mut self.numeric)?;
        Number::from_numeric(
            &self.numeric,
            self.numeric.real(self.numeric.absolute(&value)),
        )
    }

    fn call(
        &mut self,
        name: &str,
        left: TypedValue,
        right: Option<TypedValue>,
    ) -> Result<Number, MathError> {
        let name = name.to_ascii_lowercase();
        let name = name.as_str();
        if matches!(name, "sin" | "cos" | "tan") && right.is_none() {
            return self.trig(name, left);
        }
        let left = left.into_scalar()?;
        let right = right.map(TypedValue::into_scalar).transpose()?;
        match (name, right) {
            ("log", second) => self.log(&left, second.as_ref().or(Some(&Number::integer(10)))),
            ("ln", None) => self.log(&left, None),
            ("log2", None) => self.log(&left, Some(&Number::integer(2))),
            ("log10", None) => self.log(&left, Some(&Number::integer(10))),
            ("exp", None) => self.exp(&left),
            ("sqrt", None) => self.sqrt(&left),
            ("cbrt", None) => self.pow(left, Number::rational(ratio(1, 3))),
            ("root", Some(index)) => {
                let index = index
                    .real_rational()
                    .filter(|r| r.is_integer())
                    .ok_or(MathError::Domain)?;
                if index.is_zero() {
                    return Err(MathError::Domain);
                }
                if index.numer().abs() > BigInt::from(MAX_ROOT) {
                    return Err(MathError::Limit);
                }
                self.pow(left, Number::rational(index.recip()))
            }
            ("pow", Some(exponent)) => self.pow(left, exponent),
            ("abs", None) => self.absolute(left),
            ("approx", None) => {
                let value = left.numeric(&mut self.numeric)?;
                Number::from_numeric(&self.numeric, value)
            }
            ("asin" | "acos" | "atan" | "asinh" | "acosh" | "atanh", None) => {
                self.inverse(name, &left)
            }
            ("sinh" | "cosh" | "tanh", None) => {
                if left.is_exact_integer(0) {
                    return Ok(Number::integer(i64::from(name == "cosh")));
                }
                if let Number::Pi(p) = &left
                    && p.re.is_zero()
                {
                    let angle = TypedValue {
                        number: Number::pi(Gaussian::real(p.im.clone())),
                        radians: true,
                    };
                    let counterpart = match name {
                        "sinh" => "sin",
                        "cosh" => "cos",
                        _ => "tan",
                    };
                    let result = self.trig(counterpart, angle)?;
                    return if name == "cosh" {
                        Ok(result)
                    } else {
                        self.binary(
                            Binary::Mul,
                            result,
                            Number::Exact(Gaussian::imaginary(ratio(1, 1))),
                        )
                    };
                }
                let value = left.numeric(&mut self.numeric)?;
                let result = self.numeric.hyperbolic(name, &value)?;
                Number::from_numeric(&self.numeric, result)
            }
            (
                "sin" | "cos" | "tan" | "ln" | "log2" | "log10" | "exp" | "sqrt" | "cbrt" | "root"
                | "pow" | "abs" | "approx" | "asin" | "acos" | "atan" | "asinh" | "acosh" | "atanh"
                | "sinh" | "cosh" | "tanh",
                _,
            ) => Err(MathError::InvalidInput),
            _ => Err(MathError::Unsupported),
        }
    }

    fn binary(&mut self, op: Binary, left: Number, right: Number) -> Result<Number, MathError> {
        if matches!(op, Binary::Power) {
            return self.pow(left, right);
        }
        if matches!(op, Binary::Div) && right.is_zero() {
            return Err(MathError::Domain);
        }
        if matches!(op, Binary::Add | Binary::Sub) && right.is_exact_integer(0) {
            return Ok(left);
        }
        if matches!(op, Binary::Add) && left.is_exact_integer(0) {
            return Ok(right);
        }
        Ok(match (op, left, right) {
            (Binary::Add, Number::Exact(a), Number::Exact(b)) => Number::Exact(a.add(b).checked()?),
            (Binary::Sub, Number::Exact(a), Number::Exact(b)) => {
                Number::Exact(a.add(b.negative()).checked()?)
            }
            (Binary::Mul, Number::Exact(a), Number::Exact(b)) => {
                Number::Exact(a.mul(&b).checked()?)
            }
            (Binary::Div, Number::Exact(a), Number::Exact(b)) => {
                Number::Exact(a.div(&b)?.checked()?)
            }
            (Binary::Add, Number::Pi(a), Number::Pi(b)) => Number::pi(a.add(b).checked()?),
            (Binary::Sub, Number::Pi(a), Number::Pi(b)) => {
                Number::pi(a.add(b.negative()).checked()?)
            }
            (Binary::Mul, Number::Pi(a), Number::Exact(b))
            | (Binary::Mul, Number::Exact(a), Number::Pi(b)) => Number::pi(a.mul(&b).checked()?),
            (Binary::Div, Number::Pi(a), Number::Exact(b)) => Number::pi(a.div(&b)?.checked()?),
            (Binary::Div, Number::Pi(a), Number::Pi(b)) => Number::Exact(a.div(&b)?.checked()?),
            (Binary::Sub, Number::Euler, Number::Euler) => Number::integer(0),
            (Binary::Div, Number::Euler, Number::Euler) => Number::integer(1),
            (op, a, b) => {
                let a = a.numeric(&mut self.numeric)?;
                let b = b.numeric(&mut self.numeric)?;
                let result = match op {
                    Binary::Add => self.numeric.add(&a, &b),
                    Binary::Sub => self.numeric.sub(&a, &b),
                    Binary::Mul => self.numeric.mul(&a, &b),
                    Binary::Div => self.numeric.div(&a, &b)?,
                    Binary::Power => return Err(MathError::Unsupported),
                };
                if matches!(op, Binary::Add | Binary::Sub) {
                    self.numeric.require_stable_sum(&a, &b, &result)?;
                }
                Number::from_numeric(&self.numeric, result)?
            }
        })
    }

    fn pow(&mut self, base: Number, exponent: Number) -> Result<Number, MathError> {
        if base.is_zero() {
            let positive = exponent.real_rational().is_some_and(Signed::is_positive);
            if positive {
                return if matches!(base, Number::Approximate(_)) {
                    Number::from_numeric(&self.numeric, self.numeric.value(0))
                } else {
                    Ok(Number::integer(0))
                };
            }
            let e = exponent.numeric(&mut self.numeric)?;
            if e.im.is_zero() && e.re.is_positive() && !e.re.is_zero() {
                return Number::from_numeric(&self.numeric, self.numeric.value(0));
            }
            return Err(MathError::Domain);
        }
        if matches!(base, Number::Euler) {
            return self.exp(&exponent);
        }
        if let Some(n) = exponent.real_rational().filter(|r| r.is_integer()) {
            let n = n
                .to_integer()
                .to_i32()
                .filter(|n| n.unsigned_abs() <= MAX_INTEGER_POWER)
                .ok_or(MathError::Limit)?;
            if n == 1 {
                return Ok(base);
            }
            if let Number::Exact(exact) = base {
                return Ok(Number::Exact(exact.pow(n)?));
            }
            if n == 0 && matches!(base, Number::Pi(_)) {
                return Ok(Number::integer(1));
            }
            let value = base.numeric(&mut self.numeric)?;
            return Number::from_numeric(&self.numeric, self.numeric.pow_integer(value, n)?);
        }
        if exponent.real_rational().is_some_and(|r| *r == ratio(1, 2)) {
            return self.sqrt(&base);
        }
        if let Some((x, n)) = base.real_rational().zip(exponent.real_rational())
            && let Some(denominator) = n
                .denom()
                .to_u32()
                .filter(|denominator| *denominator <= MAX_ROOT)
        {
            // Real odd roots keep their real value. Complex power uses a principal branch.
            if (!x.is_negative() || !self.settings.complex)
                && let Some(root) = real_root(x, denominator)
            {
                let power = n
                    .numer()
                    .to_i32()
                    .filter(|n| n.unsigned_abs() <= MAX_INTEGER_POWER)
                    .ok_or(MathError::Limit)?;
                return Ok(Number::Exact(Gaussian::real(root).pow(power)?));
            }
            if x.is_negative() && !self.settings.complex && denominator % 2 == 1 {
                let positive = Number::rational(x.abs()).numeric(&mut self.numeric)?;
                let exponent = exponent.numeric(&mut self.numeric)?;
                let log = self.numeric.log(&positive, false)?;
                let scale = self.numeric.mul(&exponent, &log);
                let result = self.numeric.exp(&scale)?;
                return Number::from_numeric(
                    &self.numeric,
                    if n.numer().is_odd() {
                        result.negative()
                    } else {
                        result
                    },
                );
            }
        }
        let base = base.numeric(&mut self.numeric)?;
        let exponent = exponent.numeric(&mut self.numeric)?;
        let log = self.numeric.log(&base, self.settings.complex)?;
        let argument = self.numeric.mul(&exponent, &log);
        let result = self.numeric.exp(&argument)?;
        Number::from_numeric(&self.numeric, result)
    }

    fn display(&mut self, value: &Number) -> Result<String, MathError> {
        let notation = self.settings.notation;
        let precision = self.settings.precision;
        Ok(match value {
            Number::Exact(exact) => exact.display(notation),
            Number::Pi(exact) if exact.is_real() && exact.re.is_one() => String::from("π"),
            Number::Pi(exact) if exact.is_real() && exact.re == ratio(-1, 1) => String::from("-π"),
            Number::Pi(exact) if exact.is_real() => format!("{}*π", exact.re),
            Number::Pi(exact) => format!("({})*π", exact.display(Notation::Auto)),
            Number::Euler => String::from("e"),
            Number::Approximate(value) => {
                let consts = &mut self.numeric.constants;
                let re = decimal::approximate(&value.re, precision, notation, consts)?;
                if value.im.is_zero() {
                    re
                } else {
                    let im = decimal::approximate(&value.im.abs(), precision, notation, consts)?;
                    let imaginary = if im == "1" {
                        String::from("i")
                    } else {
                        format!("{im}*i")
                    };
                    combine_complex(
                        (!value.re.is_zero()).then_some(re.as_str()),
                        value.im.is_negative(),
                        &imaginary,
                    )
                }
            }
        })
    }
}

pub(crate) fn evaluate(
    operation: &str,
    input: &str,
    options: &Value,
) -> Result<Computation, MathError> {
    if operation != "evaluate" {
        return Err(MathError::Unsupported);
    }
    let settings = Settings::read(options)?;
    let expression = syntax::parse(input)?;
    let mut evaluator = Evaluation::new(settings, 0)?;
    let value = evaluator.eval(&expression, 0)?.number;
    let result = evaluator.display(&value)?;
    let (exactness, method) = value.classify();
    let mut constraints = Vec::new();
    if settings.complex {
        constraints.push(String::from(
            "Complex logarithms and nonintegral powers use principal values.",
        ));
    }
    let precision = if matches!(value, Number::Approximate(_)) {
        let mut crosscheck = Evaluation::new(settings, 96)?;
        let repeated = crosscheck.eval(&expression, 0)?.number;
        if crosscheck.display(&repeated)? != result {
            return Err(MathError::NoConvergence);
        }
        constraints.push(String::from("The requested significant digits agree at two working precisions. No error bound is certified."));
        Some(settings.precision)
    } else {
        None
    };
    Ok(Computation {
        result,
        exactness,
        normalized: expression.normalized(),
        method,
        domain: if settings.complex { "complex" } else { "real" },
        formula: expression.formula(),
        precision,
        error_bound: None,
        constraints,
    })
}

#[cfg(test)]
mod tests {
    use super::{Exactness, MathError, evaluate};
    use serde_json::{Value, json};

    fn real(input: &str) -> String {
        evaluate("evaluate", input, &Value::Null).unwrap().result
    }

    fn error(input: &str, options: &Value) -> MathError {
        evaluate("evaluate", input, options).err().unwrap()
    }

    #[test]
    fn required_identities_preserve_exactness() {
        for (input, expected) in [
            ("sin(90°)", "1"),
            ("cos(180°)", "-1"),
            ("ln(1)", "0"),
            ("log₂(1024)", "10"),
            ("log(1024, 2)", "10"),
            ("20!", "2432902008176640000"),
        ] {
            let value = evaluate("evaluate", input, &Value::Null).unwrap();
            assert_eq!(
                (value.result.as_str(), value.exactness),
                (expected, Exactness::Exact)
            );
        }
        for (input, expected) in [
            ("sqrt(-1)", "i"),
            ("exp(iπ)+1", "0"),
            ("e^(iπ)+1", "0"),
            ("sqrt(3+4i)", "2 + i"),
            ("(1+i)/(1-i)", "i"),
            ("tanh(i*pi/4)", "i"),
        ] {
            let value = evaluate("evaluate", input, &json!({"complex":true})).unwrap();
            assert_eq!(
                (value.result.as_str(), value.exactness),
                (expected, Exactness::Exact)
            );
        }
    }

    #[test]
    fn rational_and_symbolic_fields_remain_distinct() {
        assert_eq!(real("0.1+0.2"), "3/10");
        assert_eq!(real("sqrt(16/81)"), "4/9");
        assert_eq!(real("root(-125,3)"), "-5");
        assert_eq!(real("(-8)^(2/3)"), "4");
        assert_eq!(real("log(1/1024, 1/2)"), "10");
        assert_eq!(real("tan(π/4)"), "1");
        assert_eq!(real("sin(π/6)"), "1/2");
        assert_eq!(real("e-e"), "0");
        let value = evaluate("evaluate", "asin(1)", &Value::Null).unwrap();
        assert_eq!(value.result, "1/2*π");
        assert_eq!(value.exactness, Exactness::Symbolic);
        assert!(value.precision.is_none());
    }

    #[test]
    fn decimal_settings_do_not_certify_precision_or_round_exact_fractions() {
        let eight = evaluate("evaluate", "sin(1)", &json!({"precision":8})).unwrap();
        assert_eq!(eight.result, "0.84147098");
        assert_eq!(eight.exactness, Exactness::Approximate);
        assert_eq!(eight.precision, Some(8));
        assert!(eight.error_bound.is_none());
        let sixty = evaluate("evaluate", "approx(pi)", &json!({"precision":60})).unwrap();
        assert_eq!(
            sixty.result,
            "3.14159265358979323846264338327950288419716939937510582097494"
        );
        let engineering = json!({"precision": 16, "notation": "engineering"});
        assert_eq!(
            evaluate("evaluate", "1000.5", &engineering).unwrap().result,
            "1.0005e+3"
        );
        assert_eq!(
            evaluate("evaluate", "0.00012", &engineering)
                .unwrap()
                .result,
            "120e-6"
        );
        assert_eq!(
            evaluate("evaluate", "1/3", &engineering).unwrap().result,
            "1/3"
        );
        let settings = json!({"precision":8, "notation":"scientific"});
        assert_eq!(
            evaluate("evaluate", "approx(99999999999)", &settings)
                .unwrap()
                .result,
            "1e+11"
        );
    }

    #[test]
    fn degree_suffix_overrides_mode_and_angle_arithmetic_preserves_units() {
        assert_eq!(
            evaluate("evaluate", "sin(100)", &json!({"angle":"grad"}))
                .unwrap()
                .result,
            "1"
        );
        assert_eq!(
            evaluate("evaluate", "asin(1)", &json!({"angle":"deg"}))
                .unwrap()
                .result,
            "90"
        );
        assert_eq!(
            evaluate("evaluate", "sin(45°+45°)", &json!({"angle":"grad"}))
                .unwrap()
                .result,
            "1"
        );
        assert_eq!(real("cos(2*90°)"), "-1");
        assert_eq!(real("90°/180°"), "1/2");
        assert_eq!(error("90°+1", &Value::Null), MathError::Domain);
        assert_eq!(error("1/90°", &Value::Null), MathError::Domain);
    }

    #[test]
    fn approved_domains_distinguish_singularities_and_valid_nearby_input() {
        for input in [
            "tan(90°)",
            "ln(0)",
            "sqrt(-1)",
            "log(2,1)",
            "log(2,-2)",
            "asin(2)",
            "acosh(0)",
            "atanh(-1)",
            "0^0",
            "0^-1",
            "(-1)!",
            "1.5!",
            "root(1,0)",
        ] {
            assert_eq!(error(input, &Value::Null), MathError::Domain, "{input}");
        }
        assert_eq!(
            error("atan(i)", &json!({"complex":true})),
            MathError::Domain
        );
        assert_eq!(
            error("tanh(i*pi/2)", &json!({"complex":true})),
            MathError::Domain
        );
        let near = real("tan(90°-0.00000000000000000001°)");
        assert!(
            near.starts_with("5.7295779513082320876798154814105"),
            "{near}"
        );
        assert!(real("cbrt(-2)").starts_with("-1.2599210498948731647672106072782"));
    }

    #[test]
    fn bounded_parsing_and_intermediate_growth_fail_explicitly() {
        for input in [
            "513!",
            "2^5000",
            "sin(1e500)",
            "1e99999",
            "exp(5000)",
            "root(2,65)",
            "(1e2048)^3",
        ] {
            assert_eq!(error(input, &Value::Null), MathError::Limit, "{input}");
        }
        assert_eq!(
            error(
                &format!("{}1{}", "(".repeat(80), ")".repeat(80)),
                &Value::Null
            ),
            MathError::Limit
        );
        assert_eq!(error("2", &json!({"precision":100})), MathError::Limit);
        assert_eq!(
            error("2", &json!({"mode":"custom"})),
            MathError::InvalidInput
        );
        for input in [
            ".",
            "2.3.4",
            "1 2",
            "3!!",
            "cos(1,2)",
            "sin(1,2,3)",
            "a[b]",
            "fn(){0}",
        ] {
            assert_eq!(
                error(input, &Value::Null),
                MathError::InvalidInput,
                "{input}"
            );
        }
        assert_eq!(error("unknown(1)", &Value::Null), MathError::Unsupported);
        assert_eq!(real("-2^2 + 2^3^2"), "508");
        assert_eq!(real("√(9)·2"), "6");
    }

    #[test]
    fn unresolved_rounding_boundaries_never_look_like_exact_endpoints() {
        for input in ["asin(1+1e-500)", "acos(-1-1e-500)", "acosh(1-1e-500)"] {
            assert_eq!(error(input, &Value::Null), MathError::Domain, "{input}");
        }
        for input in [
            "asin(1-1e-500)",
            "atanh(1-1e-500)",
            "ln(1+1e-500)",
            "log(2,1+1e-500)",
            "approx(1e500)+1-approx(1e500)",
        ] {
            assert_eq!(
                error(input, &Value::Null),
                MathError::NoConvergence,
                "{input}"
            );
        }
        assert_eq!(real("sin(1)-sin(1)"), "0");
        assert_eq!(real("1e500+1-1e500"), "1");
    }

    #[test]
    fn complex_principal_acosh_on_real_cut_has_no_spurious_real_component() {
        let result = evaluate("evaluate", "acosh(0.5)", &json!({"complex":true})).unwrap();
        assert_eq!(result.result, "1.0471975511965977461542144610932*i");
        assert_eq!(result.exactness, Exactness::Approximate);
        assert_eq!(real("acos(1/2)"), "1/3*π");
        assert_eq!(real("asin(-1/2)"), "-1/6*π");
    }
}
