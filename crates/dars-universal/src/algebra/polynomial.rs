use super::MathError;
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, Zero};
use std::cmp::Ordering;
use std::collections::BTreeMap;

pub(super) const MAX_DEGREE: u8 = 24;
const MAX_TERMS: usize = 256;
const MAX_PRODUCTS: usize = 8192;
const MAX_COEFFICIENT_BITS: u64 = 4096;
const MAX_RESTRICTIONS: usize = 16;
pub(super) const NAMES: [&str; 3] = ["x", "y", "z"];
pub(super) type Coefficient = BigRational;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) struct Powers(pub(super) [u8; 3]);

impl Powers {
    const ONE: Self = Self([0; 3]);

    fn degree(self) -> u16 {
        self.0.into_iter().map(u16::from).sum()
    }

    fn product(self, other: Self) -> Result<Self, MathError> {
        let result = Self(std::array::from_fn(|i| self.0[i] + other.0[i]));
        if result.degree() > u16::from(MAX_DEGREE) {
            Err(MathError::Limit)
        } else {
            Ok(result)
        }
    }

    fn quotient(self, divisor: Self) -> Option<Self> {
        let [x, y, z] = self.0;
        Some(Self([
            x.checked_sub(divisor.0[0])?,
            y.checked_sub(divisor.0[1])?,
            z.checked_sub(divisor.0[2])?,
        ]))
    }

    fn common(self, other: Self) -> Self {
        Self(std::array::from_fn(|i| self.0[i].min(other.0[i])))
    }
}

impl Ord for Powers {
    fn cmp(&self, other: &Self) -> Ordering {
        (self.degree(), self.0).cmp(&(other.degree(), other.0))
    }
}

impl PartialOrd for Powers {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct Poly(pub(super) BTreeMap<Powers, Coefficient>);

pub(super) fn coefficient(value: i64) -> Coefficient {
    Coefficient::from_integer(BigInt::from(value))
}

pub(super) fn checked_coefficient(value: Coefficient) -> Result<Coefficient, MathError> {
    if value.numer().bits().max(value.denom().bits()) > MAX_COEFFICIENT_BITS {
        Err(MathError::Limit)
    } else {
        Ok(value)
    }
}

impl Poly {
    pub(super) fn value(value: Coefficient) -> Self {
        Self::monomial(Powers::ONE, value)
    }

    pub(super) fn one() -> Self {
        Self::value(Coefficient::one())
    }

    pub(super) fn variable(index: usize) -> Self {
        let mut powers = Powers::ONE;
        powers.0[index] = 1;
        Self::monomial(powers, Coefficient::one())
    }

    pub(super) fn monomial(powers: Powers, coefficient: Coefficient) -> Self {
        if coefficient.is_zero() {
            Self::default()
        } else {
            Self(BTreeMap::from([(powers, coefficient)]))
        }
    }

    pub(super) fn is_zero(&self) -> bool {
        self.0.is_empty()
    }

    pub(super) fn degree(&self) -> u16 {
        self.0
            .last_key_value()
            .map_or(0, |(powers, _)| powers.degree())
    }

    pub(super) fn constant(&self) -> Option<Coefficient> {
        if self.degree() > 0 {
            None
        } else {
            Some(self.0.get(&Powers::ONE).cloned().unwrap_or_default())
        }
    }

    pub(super) fn variables(&self) -> u8 {
        self.0.keys().fold(0, |used, powers| {
            let mut used = used;
            for (index, exponent) in powers.0.into_iter().enumerate() {
                if exponent != 0 {
                    used |= 1 << index;
                }
            }
            used
        })
    }

    pub(super) fn leading(&self) -> Option<(Powers, &Coefficient)> {
        self.0
            .last_key_value()
            .map(|(powers, coefficient)| (*powers, coefficient))
    }

    pub(super) fn integrate_term(
        &mut self,
        powers: Powers,
        value: Coefficient,
    ) -> Result<(), MathError> {
        let existing = self.0.remove(&powers).unwrap_or_default();
        let next = checked_coefficient(existing + value)?;
        if !next.is_zero() {
            if self.0.len() == MAX_TERMS {
                return Err(MathError::Limit);
            }
            self.0.insert(powers, next);
        }
        Ok(())
    }

    pub(super) fn add(mut self, right: &Self) -> Result<Self, MathError> {
        for (powers, value) in &right.0 {
            self.integrate_term(*powers, value.clone())?;
        }
        Ok(self)
    }

    pub(super) fn sub(mut self, right: &Self) -> Result<Self, MathError> {
        for (powers, value) in &right.0 {
            self.integrate_term(*powers, -value)?;
        }
        Ok(self)
    }

    pub(super) fn neg(mut self) -> Self {
        for value in self.0.values_mut() {
            *value = -&*value;
        }
        self
    }

    pub(super) fn scale(mut self, factor: &Coefficient) -> Result<Self, MathError> {
        if factor.is_zero() {
            return Ok(Self::default());
        }
        for value in self.0.values_mut() {
            *value = checked_coefficient(&*value * factor)?;
        }
        Ok(self)
    }

    pub(super) fn mul(&self, right: &Self) -> Result<Self, MathError> {
        if self.0.len() * right.0.len() > MAX_PRODUCTS {
            return Err(MathError::Limit);
        }
        let mut result = Self::default();
        for (a, x) in &self.0 {
            for (b, y) in &right.0 {
                result.integrate_term(a.product(*b)?, x * y)?;
            }
        }
        Ok(result)
    }

    pub(super) fn pow(mut self, mut exponent: u8) -> Result<Self, MathError> {
        let mut result = Self::one();
        while exponent != 0 {
            if exponent % 2 == 1 {
                result = result.mul(&self)?;
            }
            exponent /= 2;
            if exponent != 0 {
                self = self.mul(&self)?;
            }
        }
        Ok(result)
    }

    pub(super) fn monic(self) -> Result<Self, MathError> {
        match self.leading() {
            None => Ok(self),
            Some((_, value)) => {
                let reciprocal = value.recip();
                self.scale(&reciprocal)
            }
        }
    }

    pub(super) fn long_division(mut self, divisor: &Self) -> Result<(Self, Self), MathError> {
        let (divisor_powers, divisor_lead) = divisor.leading().ok_or(MathError::Domain)?;
        let mut remainder = Self::default();
        let mut quotient = Self::default();
        while let Some((powers, coefficient)) = self.leading() {
            if let Some(quotient_powers) = powers.quotient(divisor_powers) {
                let coefficient = checked_coefficient(coefficient / divisor_lead)?;
                let term = Self::monomial(quotient_powers, coefficient);
                self = self.sub(&divisor.mul(&term)?)?;
                quotient = quotient.add(&term)?;
            } else {
                let term = self.0.remove(&powers).expect("leading term is present");
                remainder.integrate_term(powers, term)?;
            }
        }
        Ok((quotient, remainder))
    }

    pub(super) fn gcd(mut self, mut right: Self) -> Result<Self, MathError> {
        while !right.is_zero() {
            let (_, remainder) = self.long_division(&right)?;
            self = right;
            right = remainder;
        }
        self.monic()
    }

    pub(super) fn common_monomial(&self) -> Powers {
        self.0
            .keys()
            .copied()
            .reduce(Powers::common)
            .unwrap_or(Powers::ONE)
    }

    pub(super) fn divide_by_monomial(self, divisor: Powers) -> Self {
        Self(
            self.0
                .into_iter()
                .map(|(powers, value)| {
                    (
                        powers
                            .quotient(divisor)
                            .expect("common monomial divides term"),
                        value,
                    )
                })
                .collect(),
        )
    }

    pub(super) fn substitute(&self, values: &[Option<Coefficient>; 3]) -> Result<Self, MathError> {
        let mut result = Self::default();
        for (key, value) in &self.0 {
            let mut value = value.clone();
            let mut powers = *key;
            for (index, substitution) in values.iter().enumerate() {
                if let Some(substitution) = substitution
                    && powers.0[index] > 0
                {
                    value =
                        checked_coefficient(value * substitution.pow(i32::from(powers.0[index])))?;
                    powers.0[index] = 0;
                }
            }
            result.integrate_term(powers, value)?;
        }
        Ok(result)
    }

    pub(super) fn coefficient_for(&self, index: usize, degree: u8) -> Coefficient {
        let mut p = Powers::ONE;
        p.0[index] = degree;
        self.0.get(&p).cloned().unwrap_or_default()
    }

    pub(super) fn render(&self, variables: [&str; 3]) -> String {
        if self.is_zero() {
            return String::from("0");
        }
        let mut output = String::new();
        for (powers, value) in self.0.iter().rev() {
            if value.is_negative() {
                output.push('-');
            } else if !output.is_empty() {
                output.push('+');
            }
            if powers.degree() == 0 || !value.abs().is_one() {
                output.push_str(&value.abs().to_string());
                if powers.degree() != 0 {
                    output.push('*');
                }
            }
            let factors = powers
                .0
                .into_iter()
                .zip(variables)
                .filter_map(|(n, name)| match n {
                    0 => None,
                    1 => Some(name.to_owned()),
                    _ => Some(format!("{name}^{n}")),
                });
            output.push_str(&factors.collect::<Vec<_>>().join("*"));
        }
        output
    }

    pub(super) fn text(&self) -> String {
        self.render(NAMES)
    }
}

#[derive(Clone, Debug)]
pub(super) struct Rational {
    pub(super) numerator: Poly,
    pub(super) denominator: Poly,
    pub(super) restrictions: Vec<Poly>,
    pub(super) used: u8,
}

impl Rational {
    pub(super) fn polynomial(numerator: Poly) -> Self {
        let used = numerator.variables();
        Self {
            numerator,
            denominator: Poly::one(),
            restrictions: Vec::new(),
            used,
        }
    }

    pub(super) fn value(value: Coefficient) -> Self {
        Self::polynomial(Poly::value(value))
    }

    pub(super) fn restrict(&mut self, restriction: Poly) -> Result<(), MathError> {
        if restriction.is_zero() {
            return Err(MathError::Domain);
        }
        if restriction.constant().is_some() {
            return Ok(());
        }
        let normalized = restriction.monic()?;
        if !self.restrictions.contains(&normalized) {
            if self.restrictions.len() == MAX_RESTRICTIONS {
                return Err(MathError::Limit);
            }
            self.restrictions.push(normalized);
        }
        Ok(())
    }

    fn inherit(&mut self, mut right: Self) -> Result<(Poly, Poly), MathError> {
        self.used |= right.used;
        for restriction in right.restrictions.drain(..) {
            self.restrict(restriction)?;
        }
        Ok((right.numerator, right.denominator))
    }

    pub(super) fn neg(mut self) -> Self {
        self.numerator = self.numerator.neg();
        self
    }

    pub(super) fn sum(mut self, right: Self, subtract: bool) -> Result<Self, MathError> {
        let (numerator, denominator) = self.inherit(right)?;
        let base = self.numerator.mul(&denominator)?;
        let term = numerator.mul(&self.denominator)?;
        self.numerator = if subtract {
            base.sub(&term)?
        } else {
            base.add(&term)?
        };
        self.denominator = self.denominator.mul(&denominator)?;
        self.simplify()
    }

    pub(super) fn mul(mut self, right: Self) -> Result<Self, MathError> {
        let (numerator, denominator) = self.inherit(right)?;
        self.numerator = self.numerator.mul(&numerator)?;
        self.denominator = self.denominator.mul(&denominator)?;
        self.simplify()
    }

    pub(super) fn div(mut self, right: Self) -> Result<Self, MathError> {
        let (numerator, denominator) = self.inherit(right)?;
        self.restrict(numerator.clone())?;
        self.numerator = self.numerator.mul(&denominator)?;
        self.denominator = self.denominator.mul(&numerator)?;
        self.simplify()
    }

    pub(super) fn pow(mut self, right: Self, exponent: i8) -> Result<Self, MathError> {
        self.inherit(right)?;
        if exponent <= 0 {
            self.restrict(self.numerator.clone())?;
        }
        if exponent < 0 {
            std::mem::swap(&mut self.numerator, &mut self.denominator);
        }
        self.numerator = self.numerator.pow(exponent.unsigned_abs())?;
        self.denominator = self.denominator.pow(exponent.unsigned_abs())?;
        self.simplify()
    }

    pub(super) fn simplify(mut self) -> Result<Self, MathError> {
        if self.denominator.is_zero() {
            return Err(MathError::Domain);
        }
        if self.numerator.is_zero() {
            self.denominator = Poly::one();
            return Ok(self);
        }
        if self.denominator.degree() != 0 {
            let common = self
                .numerator
                .common_monomial()
                .common(self.denominator.common_monomial());
            self.numerator = self.numerator.divide_by_monomial(common);
            self.denominator = self.denominator.divide_by_monomial(common);
            let involved = self.numerator.variables() | self.denominator.variables();
            if involved.count_ones() <= 1 && self.denominator.degree() != 0 {
                let gcd = self.numerator.clone().gcd(self.denominator.clone())?;
                if gcd.degree() > 0 {
                    self.numerator = self.numerator.long_division(&gcd)?.0;
                    self.denominator = self.denominator.long_division(&gcd)?.0;
                }
            } else if self.denominator.degree() != 0
                && self.numerator.degree() >= self.denominator.degree()
            {
                let (quotient, remainder) =
                    self.numerator.clone().long_division(&self.denominator)?;
                if remainder.is_zero() {
                    self.numerator = quotient;
                    self.denominator = Poly::one();
                }
            }
        }
        let factor = self
            .denominator
            .leading()
            .ok_or(MathError::Domain)?
            .1
            .recip();
        self.numerator = self.numerator.scale(&factor)?;
        self.denominator = self.denominator.scale(&factor)?;
        Ok(self)
    }

    pub(super) fn substitute(
        mut self,
        values: &[Option<Coefficient>; 3],
    ) -> Result<Self, MathError> {
        let previous = std::mem::take(&mut self.restrictions);
        for restriction in previous {
            self.restrict(restriction.substitute(values)?)?;
        }
        self.numerator = self.numerator.substitute(values)?;
        self.denominator = self.denominator.substitute(values)?;
        self.simplify()
    }

    pub(super) fn constant(&self) -> Option<Coefficient> {
        match (self.numerator.constant(), self.denominator.constant()) {
            (Some(numerator), Some(denominator)) if !denominator.is_zero() => {
                Some(numerator / denominator)
            }
            _ => None,
        }
    }

    pub(super) fn text(&self) -> String {
        if self.denominator == Poly::one() {
            self.numerator.text()
        } else {
            format!("({})/({})", self.numerator.text(), self.denominator.text())
        }
    }
}
